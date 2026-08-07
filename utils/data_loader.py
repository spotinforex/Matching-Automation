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

# Candidate header names used ONLY when a column isn't declared in
# column_config.json (or the declared name isn't actually present in the
# sheet). The configured name always wins when it's usable — see
# _resolve_flag_column().
_GENDER_CANDIDATES = ["gender", "sex", "gender_of_yp", "gender_of_participant"]
_PWD_CANDIDATES = ["pwd", "person_with_disability", "disability", "is_pwd"]

# Below this fraction of shared landmark/cluster values between the YP and
# MCP files, geographic matching will fail for most people, so we warn
# loudly rather than let it fail silently downstream. Tune as needed.
_LANDMARK_OVERLAP_WARN_THRESHOLD = 0.5


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


def _normalize_trade_broad(value, trade_canonical_map: dict) -> str:
    """
    Classifies the main trade-registration text into a broad bucket:
    "garment", "footwear", "leather", or "unknown". trade_canonical_map
    (from column_config.json) is the primary source of truth — it maps a
    canonical bucket name to a list of substrings to match against the
    lowercased text, e.g. {"footwear": ["footwear", "shoe"]}. A small
    built-in keyword fallback covers the common cases if the config doesn't
    define a bucket at all.
    """
    text = _clean_str(value).lower()
    if not text:
        return "unknown"

    for canonical, substrings in trade_canonical_map.items():
        if any(sub in text for sub in substrings):
            return canonical

    if "garment" in text:
        return "garment"
    if "footwear" in text or "shoe" in text:
        return "footwear"
    if "leather" in text:
        return "leather"

    return "unknown"


def _normalize_gender_subtype(value) -> str | None:
    """Parses a 'who is this for' style answer into male/female/both."""
    text = _clean_str(value).lower()
    if not text:
        return None
    if "both" in text or "unisex" in text:
        return "both"
    if "female" in text or "woman" in text or "lady" in text:
        return "female"
    if "male" in text:
        return "male"
    return None


def _normalize_leather_subtype(row, cols: dict, prefix: str) -> str | None:
    """
    Determines which leather product a row is about: bag / wallet / belt.
    Two strategies, tried in order:
    1. Dedicated flag columns (e.g. the YP file's branching survey columns
       "If_leather_bag_production4" / "if_leather_belt3" /
       "if_leather_waller4" — populated only for whichever subtype was
       actually selected). Configure these as f"{prefix}_bag_flag",
       f"{prefix}_belt_flag", f"{prefix}_wallet_flag" in column_config.json.
    2. A single free-text subtype column (f"{prefix}_subtype"), scanned for
       "bag"/"wallet"/"belt" keywords — used when a source (e.g. an MCP
       export) only has one generic follow-up question instead of three
       separate branching columns.
    Returns None if no subtype could be determined (caller falls back to
    "leather_any").
    """
    if _clean_str(_get_column(row, cols, f"{prefix}_bag_flag")):
        return "bag"
    if _clean_str(_get_column(row, cols, f"{prefix}_belt_flag")):
        return "belt"
    if _clean_str(_get_column(row, cols, f"{prefix}_wallet_flag")):
        return "wallet"

    text = _clean_str(_get_column(row, cols, f"{prefix}_subtype")).lower()
    if "bag" in text:
        return "bag"
    if "wallet" in text:
        return "wallet"
    if "belt" in text:
        return "belt"

    return None


def _resolve_trade(row, cols: dict, trade_canonical_map: dict, source_label: str) -> tuple[str, str]:
    """
    Resolves a row's full trade classification in two stages:
      1. broad bucket from the main trade-registration column ("trade" key)
      2. bucket-specific subtype from whichever secondary column applies:
         - garment  -> gender subtype from "garment_subtype" column
         - footwear -> gender subtype from "footwear_subtype" column
         - leather  -> product subtype (bag/wallet/belt) via
           _normalize_leather_subtype(prefix="leather")

    Returns (canonical_skill, raw_trade_text). canonical_skill is one of:
    garment_male / garment_female / garment_both,
    footwear_male / footwear_female / footwear_both,
    leather_bag / leather_wallet / leather_belt / leather_any,
    or "unknown".

    A missing/unresolvable subtype degrades to the "_both" / "_any" variant
    rather than raising, but logs a debug note so it's traceable — a
    trade registered as garment/footwear/leather with no readable subtype
    is a data-completeness issue worth knowing about, not a hard error.
    """
    raw_text = _clean_str(_get_column(row, cols, "trade"))
    broad = _normalize_trade_broad(raw_text, trade_canonical_map)

    if broad == "garment":
        subtype = _normalize_gender_subtype(_get_column(row, cols, "garment_subtype"))
        if subtype is None:
            logger.debug(
                "%s: garment trade with no readable gender subtype (raw=%r); defaulting to 'both'",
                source_label, raw_text,
            )
            subtype = "both"
        return f"garment_{subtype}", raw_text

    if broad == "footwear":
        subtype = _normalize_gender_subtype(_get_column(row, cols, "footwear_subtype"))
        if subtype is None:
            logger.debug(
                "%s: footwear trade with no readable gender subtype (raw=%r); defaulting to 'both'",
                source_label, raw_text,
            )
            subtype = "both"
        return f"footwear_{subtype}", raw_text

    if broad == "leather":
        subtype = _normalize_leather_subtype(row, cols, prefix="leather")
        if subtype is None:
            logger.debug(
                "%s: leather trade with no readable product subtype (raw=%r); defaulting to 'any'",
                source_label, raw_text,
            )
            return "leather_any", raw_text
        return f"leather_{subtype}", raw_text

    return "unknown", raw_text


def _get_column(row, cols: dict, key: str):
    column_name = cols.get(key)
    if column_name is None:
        return None
    return row.get(column_name)


def _find_column_name(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    normalized = {str(col).strip().lower(): col for col in df.columns}
    for candidate in candidates:
        for col_name, original_name in normalized.items():
            if col_name == candidate.strip().lower():
                return original_name
    return None


def _resolve_flag_column(
    df: pd.DataFrame, cols: dict, key: str, candidates: list[str], source_label: str
) -> str | None:
    """
    Resolves the actual dataframe column to use for an optional flag field
    (gender, pwd, ...). The name declared in column_config.json is always
    tried first; the hardcoded candidate list is only a fallback for when
    the config doesn't declare a name (or declares one that isn't actually
    present in this sheet).

    Previously the configured name (cols[key]) was never consulted at all —
    the loader always guessed from a hardcoded, exact-match-only candidate
    list, silently producing None whenever the real header didn't happen to
    match one of those guesses (e.g. "what_is_your_sex" not matching
    "sex"). That made the config value dead weight and gender/PWD fields
    None more often than not.
    """
    configured_name = cols.get(key)
    if configured_name and configured_name in df.columns:
        return configured_name

    fallback = _find_column_name(df, candidates)
    if fallback is not None:
        if configured_name:
            logger.warning(
                "%s: configured '%s' column %r not found; falling back to "
                "guessed column %r. Update column_config.json to avoid relying "
                "on the guess.",
                source_label, key, configured_name, fallback,
            )
        return fallback

    if configured_name:
        logger.warning(
            "%s: configured '%s' column %r not found in spreadsheet, and no "
            "fallback candidate matched either. This field will be blank/None "
            "for every row. Check column_config.json against the actual "
            "headers: %s",
            source_label, key, configured_name, list(df.columns),
        )
    return None


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


def _register_id(entity_id: str, seen_ids: set, source_label: str) -> bool:
    if entity_id in seen_ids:
        logger.warning(
            "%s: duplicate id %r encountered — a later row with this exact id "
            "was found. This can cause the two records to be treated as the "
            "same entity downstream (e.g. in matching). Check the source file.",
            source_label, entity_id,
        )
        return False
    seen_ids.add(entity_id)
    return True


# ---------------------------------------------------------------------------
# Cross-file sanity checks
# ---------------------------------------------------------------------------

def warn_on_landmark_mismatch(
    yps: list[YoungProfessional], mcps: list[MCP]
) -> float:
    """
    Logs a warning if the YP and MCP files use largely non-overlapping
    landmark/cluster vocabularies, since landmark matching is an exact
    (lowercased) string match with no fuzzy logic — a low overlap here
    means most YPs will fail to match any MCP on location, silently,
    unless someone happens to notice downstream. Call this once both
    load_yps() and load_mcps() have run (e.g. from main.py), since each
    loader only sees one file on its own.

    Returns the overlap ratio (intersection / union of distinct landmark
    values) for callers that want to act on it programmatically too.
    """
    yp_landmarks = {yp.landmark for yp in yps if yp.landmark}
    mcp_landmarks = {mcp.landmark for mcp in mcps if mcp.landmark}

    if not yp_landmarks or not mcp_landmarks:
        logger.warning(
            "warn_on_landmark_mismatch(): one or both files produced no "
            "landmark values (yp=%d distinct, mcp=%d distinct) — landmark "
            "matching cannot work at all.",
            len(yp_landmarks), len(mcp_landmarks),
        )
        return 0.0

    shared = yp_landmarks & mcp_landmarks
    union = yp_landmarks | mcp_landmarks
    overlap_ratio = len(shared) / len(union) if union else 0.0

    if overlap_ratio < _LANDMARK_OVERLAP_WARN_THRESHOLD:
        logger.warning(
            "warn_on_landmark_mismatch(): only %d/%d distinct landmark values "
            "are shared between the YP and MCP files (overlap=%.0f%%). "
            "YP-only landmarks: %s | MCP-only landmarks: %s. Most YPs likely "
            "won't match any MCP on landmark — verify the two files are using "
            "the same location taxonomy before trusting match results.",
            len(shared), len(union), overlap_ratio * 100,
            sorted(yp_landmarks - mcp_landmarks),
            sorted(mcp_landmarks - yp_landmarks),
        )
    else:
        logger.info(
            "warn_on_landmark_mismatch(): %d/%d distinct landmark values "
            "shared between YP and MCP files (overlap=%.0f%%).",
            len(shared), len(union), overlap_ratio * 100,
        )

    return overlap_ratio


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

    # Resolved once per file, not per row: config's declared column wins if
    # present, otherwise fall back to guessing from the header list.
    gender_column = _resolve_flag_column(df, cols, "gender", _GENDER_CANDIDATES, source_label="YP file")
    pwd_column = _resolve_flag_column(df, cols, "pwd", _PWD_CANDIDATES, source_label="YP file")

    seen_ids: set = set()
    yps: list[YoungProfessional] = []
    seen_rows: set[tuple] = set()

    for i, row in df.iterrows():
        raw_id = _clean_str(_get_column(row, cols, "id"))
        name = _clean_str(_get_column(row, cols, "name"))
        address = _clean_str(_get_column(row, cols, "address"))

        # Duplicate-row detection MUST happen on the raw (possibly blank) id,
        # before any fallback id is generated. Previously the fallback id was
        # generated first, using the row index — which is unique per row by
        # construction — so two genuinely duplicate rows that both had a
        # blank id column got different generated ids and therefore
        # different row_keys, meaning this check could never actually catch
        # them. Keying on raw_id here means two blank-id rows with the same
        # name/address correctly collide and get caught.
        row_key = (raw_id, name, address)
        if row_key in seen_rows:
            logger.warning(
                "load_yps(): skipping duplicate YP row (id=%r, name=%r, address=%r)",
                raw_id, name, address,
            )
            continue
        seen_rows.add(row_key)

        yp_id = raw_id
        if not yp_id:
            yp_id = _unique_fallback_id("YP", i, seen_ids)
            logger.debug("load_yps() row %d: blank id, generated fallback %r", i, yp_id)

        if not _register_id(yp_id, seen_ids, source_label="YP file"):
            continue

        if not name:
            logger.warning(
                "load_yps() row %d (id=%r): blank name, falling back to id as display name",
                i, yp_id,
            )
            name = yp_id

        gender = _clean_str(row.get(gender_column)) if gender_column else ""
        is_pwd = False

        pwd_value = _clean_str(row.get(pwd_column)) if pwd_column else ""
        if pwd_value.lower() in {"yes", "true", "y", "1"}:
            is_pwd = True

        skill, trade_value = _resolve_trade(row, cols, trade_map, source_label="YP file")
        yps.append(
            YoungProfessional(
                id=yp_id,
                name=name,
                skill=skill,
                address=address,
                landmark=_normalize_landmark(_get_column(row, cols, "landmark")),
                phone_number=_clean_optional_str(_get_column(row, cols, "phone_number")),
                gender=gender.lower() if gender else None,
                is_pwd=is_pwd,
                trade_type=trade_value or None,
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

    # Same fix as load_yps(): honor the configured column name first, only
    # guess as a fallback.
    gender_column = _resolve_flag_column(df, cols, "gender", _GENDER_CANDIDATES, source_label="MCP file")

    seen_ids: set = set()
    mcps: list[MCP] = []

    for i, row in df.iterrows():
        mcp_id = _clean_str(_get_column(row, cols, "id"))
        if not mcp_id:
            logger.debug("load_mcps() row %d: blank id, skipping row", i)
            continue
        if not _register_id(mcp_id, seen_ids, source_label="MCP file"):
            continue

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

        skill, trade_value = _resolve_trade(row, cols, trade_map, source_label="MCP file")
        gender = _clean_str(row.get(gender_column)) if gender_column else ""

        mcps.append(
            MCP(
                id=mcp_id,
                name=name,
                skill=skill,
                address=_clean_str(_get_column(row, cols, "address")),
                landmark=_normalize_landmark(_get_column(row, cols, "landmark")),
                gender=gender.lower() if gender else None,
                trade_type=trade_value or None,
                capacity=capacity,
            )
        )

    logger.info("load_mcps() loaded %d MCP(s) from %r", len(mcps), path)
    return mcps