"""
data_loader.py

Reads the two program Excel exports and returns lists of the canonical
YoungProfessional / MCP pydantic models (schemas.py) that the rest of the
app (matcher.py, distance_service.py, main.py) works with.

All column names, trade-matching rules, and the per-MCP hard cap live in
column_config.json (not in this file) — if the source spreadsheets change
column headers, edit that JSON file, not this script.
"""

import logging
from functools import lru_cache
import json
import re

import pandas as pd

from configs.schemas import YoungProfessional, MCP
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path.cwd() / "configs" / "column_config.json"


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

@lru_cache(maxsize=8)
def load_config(config_path: str = DEFAULT_CONFIG_PATH) -> dict:
    with open(config_path, "r") as f:
        config = json.load(f)

    for required_key in ("yp_columns", "mcp_columns"):
        if required_key not in config:
            raise ValueError(f"'{required_key}' missing from {config_path}")

    config.setdefault("hard_cap_per_mcp", 5)
    config.setdefault("trade_canonical_map", {})
    return config


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def _clean_str(value) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def _clean_optional_str(value):
    """Like _clean_str, but returns None instead of '' for missing values —
    for fields typed Optional[str] in schemas.py (e.g. phone_number), so a
    genuinely absent phone number stays None rather than an empty string."""
    cleaned = _clean_str(value)
    return cleaned or None


def _normalize_landmark(value) -> str:
    return _clean_str(value).lower()


def _normalize_trade(value, trade_canonical_map: dict) -> str:
    text = _clean_str(value).lower()
    for canonical, substrings in trade_canonical_map.items():
        if any(sub in text for sub in substrings):
            return canonical
    return "unknown"


def _get_column(row, cols: dict, key: str):
    column_name = cols.get(key)
    if column_name is None:
        return None
    return row.get(column_name)


def _validate_columns(df: pd.DataFrame, cols: dict, source_label: str) -> None:
    required_keys = {"id", "name", "address", "landmark", "trade"}
    missing = [
        f"{key} -> '{cols[key]}'"
        for key in required_keys
        if key in cols and cols[key] not in df.columns
    ]
    if missing:
        raise ValueError(
            f"{source_label}: configured column(s) not found in spreadsheet: "
            f"{', '.join(missing)}. Check column_config.json against the actual headers: "
            f"{list(df.columns)}"
        )


def _unique_fallback_id(prefix: str, row_index: int, seen_ids: set) -> str:
    """
    Generates an ID for a row whose id column is blank. Uses a prefix that
    real IDs are very unlikely to collide with (real IDs seen so far are
    "YP_0004"-style; this generates "YP_GEN_0004"-style), then falls back
    further with a numeric suffix in the rare case even that collides —
    guaranteeing uniqueness rather than trusting the format never overlaps
    with real data, which is what silently caused two different people to
    share the ID "YP_0001" before this fix.
    """
    base = f"{prefix}_GEN_{row_index:04d}"
    candidate = base
    n = 1
    while candidate in seen_ids:
        candidate = f"{base}_{n}"
        n += 1
    return candidate


def _register_id(entity_id: str, seen_ids: set, source_label: str) -> None:
    if entity_id in seen_ids:
        logger.warning(
            "%s: duplicate id %r encountered — a later row with this exact id "
            "was found. This can cause the two records to be treated as the "
            "same entity downstream (e.g. in matching). Check the source file.",
            source_label, entity_id,
        )
    seen_ids.add(entity_id)


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_yps(path: str, only_proceeding: bool = True, config_path: str = DEFAULT_CONFIG_PATH) -> list[YoungProfessional]:
    config = load_config(config_path)
    cols = config["yp_columns"]
    trade_map = config["trade_canonical_map"]

    # dtype=str prevents pandas from inferring numeric columns (IDs, phone
    # numbers) as int/float, which silently mangles values like a phone
    # number "08031234567" into "8031234567.0" (leading zero lost, ".0"
    # gained). Every field is cleaned/parsed explicitly below regardless, so
    # reading everything as string up front is strictly safer than letting
    # pandas guess per-column types.
    df = pd.read_excel(path, dtype=str)
    _validate_columns(df, cols, source_label=f"YP file ({path})")

    if only_proceeding and cols.get("proceed_flag") in df.columns:
        proceed = df[cols["proceed_flag"]].astype(str).str.strip().str.lower()
        df = df[proceed == "yes"]

    seen_ids: set = set()
    yps: list[YoungProfessional] = []

    for i, row in df.iterrows():
        yp_id = _clean_str(_get_column(row, cols, "id"))
        if not yp_id:
            yp_id = _unique_fallback_id("YP", i, seen_ids)
            logger.debug("load_yps() row %d: blank id, generated fallback %r", i, yp_id)
        _register_id(yp_id, seen_ids, source_label="YP file")

        name = _clean_str(_get_column(row, cols, "name"))
        if not name:
            logger.warning(
                "load_yps() row %d (id=%r): blank name, falling back to id as display name",
                i, yp_id,
            )
            name = yp_id

        yps.append(
            YoungProfessional(
                id=yp_id,
                name=name,
                skill=_normalize_trade(_get_column(row, cols, "trade"), trade_map),
                address=_clean_str(_get_column(row, cols, "address")),
                landmark=_normalize_landmark(_get_column(row, cols, "landmark")),
                phone_number=_clean_optional_str(_get_column(row, cols, "phone_number")),
            )
        )

    logger.info("load_yps() loaded %d YP(s) from %r", len(yps), path)
    return yps


def load_mcps(path: str, config_path: str = DEFAULT_CONFIG_PATH) -> list[MCP]:
    config = load_config(config_path)
    cols = config["mcp_columns"]
    trade_map = config["trade_canonical_map"]
    hard_cap = config["hard_cap_per_mcp"]

    df = pd.read_excel(path, dtype=str)
    _validate_columns(df, cols, source_label=f"MCP file ({path})")

    id_column = cols["id"]
    before = len(df)
    df = df.drop_duplicates(subset=[id_column], keep="first")
    if len(df) < before:
        logger.warning(
            "load_mcps(): dropped %d duplicate-id row(s) from %r (kept first occurrence of each id)",
            before - len(df), path,
        )

    seen_ids: set = set()
    mcps: list[MCP] = []

    for i, row in df.iterrows():
        mcp_id = _clean_str(_get_column(row, cols, "id"))
        if not mcp_id:
            logger.debug("load_mcps() row %d: blank id, skipping row", i)
            continue
        _register_id(mcp_id, seen_ids, source_label="MCP file")

        name = _clean_str(_get_column(row, cols, "name"))
        if not name:
            logger.warning(
                "load_mcps() row %d (id=%r): blank name, falling back to id as display name",
                i, mcp_id,
            )
            name = mcp_id

        recommended = _get_column(row, cols, "recommended_capacity")
        recommended = int(recommended) if pd.notna(recommended) else hard_cap
        capacity = max(0, min(hard_cap, recommended))

        # NOTE: "mcp_requested_capacity" (MCP Choice) is configured in
        # column_config.json but intentionally NOT used here — capacity is
        # decided by recommended_capacity (MERL Recommendation) alone, per
        # explicit decision. Left unread on purpose; not a bug/oversight.

        mcps.append(
            MCP(
                id=mcp_id,
                name=name,
                skill=_normalize_trade(_get_column(row, cols, "trade"), trade_map),
                address=_clean_str(_get_column(row, cols, "address")),
                landmark=_normalize_landmark(_get_column(row, cols, "landmark")),
                capacity=capacity,
            )
        )

    logger.info("load_mcps() loaded %d MCP(s) from %r", len(mcps), path)
    return mcps