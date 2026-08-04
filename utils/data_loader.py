"""
data_loader.py

Reads the two program Excel exports and returns lists of the canonical
YoungProfessional / MCP pydantic models (schemas.py) that the rest of the
app (matcher.py, distance_service.py, main.py) works with.

All column names, trade-matching rules, and the per-MCP hard cap live in
column_config.json (not in this file) — if the source spreadsheets change
column headers, edit that JSON file, not this script.
"""

from functools import lru_cache
import json
import re

import pandas as pd

from schemas import YoungProfessional, MCP
from pathlib import Path

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


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_yps(path: str, only_proceeding: bool = True, config_path: str = DEFAULT_CONFIG_PATH) -> list[YoungProfessional]:
    config = load_config(config_path)
    cols = config["yp_columns"]
    trade_map = config["trade_canonical_map"]

    df = pd.read_excel(path)
    _validate_columns(df, cols, source_label=f"YP file ({path})")

    if only_proceeding and cols.get("proceed_flag") in df.columns:
        proceed = df[cols["proceed_flag"]].astype(str).str.strip().str.lower()
        df = df[proceed == "yes"]

    yps: list[YoungProfessional] = []
    for i, row in df.iterrows():
        yp_id = _clean_str(_get_column(row, cols, "id"))
        if not yp_id:
            # id column can be entirely blank in some exports;
            # fall back to a stable generated id rather than dropping the row
            yp_id = f"YP_{i:04d}"
        yps.append(
            YoungProfessional(
                id=yp_id,
                skill=_normalize_trade(_get_column(row, cols, "trade"), trade_map),
                address=_clean_str(_get_column(row, cols, "address")),
                landmark=_normalize_landmark(_get_column(row, cols, "landmark")),
            )
        )
    return yps


def load_mcps(path: str, config_path: str = DEFAULT_CONFIG_PATH) -> list[MCP]:
    config = load_config(config_path)
    cols = config["mcp_columns"]
    trade_map = config["trade_canonical_map"]
    hard_cap = config["hard_cap_per_mcp"]

    df = pd.read_excel(path)
    _validate_columns(df, cols, source_label=f"MCP file ({path})")

    id_column = cols["id"]
    df = df.drop_duplicates(subset=[id_column], keep="first")

    mcps: list[MCP] = []
    for _, row in df.iterrows():
        mcp_id = _clean_str(_get_column(row, cols, "id"))
        if not mcp_id:
            continue

        recommended = _get_column(row, cols, "recommended_capacity")
        recommended = int(recommended) if pd.notna(recommended) else hard_cap
        capacity = max(0, min(hard_cap, recommended))

        mcps.append(
            MCP(
                id=mcp_id,
                skill=_normalize_trade(_get_column(row, cols, "trade"), trade_map),
                address=_clean_str(_get_column(row, cols, "address")),
                landmark=_normalize_landmark(_get_column(row, cols, "landmark")),
                capacity=capacity,
            )
        )
    return mcps