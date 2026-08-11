"""
column_resolver.py

Resolves the actual dataframe column name for each logical field
(id, name, address, ...) with a layered strategy, so small changes in the
source Excel's headers don't require editing column_config.json by hand
every time:

    1. Signature cache — if this exact set of column headers has been
       resolved before (auto or person-confirmed), reuse that mapping
       instantly. No re-resolution at all.
    2. Configured name (column_config.json) — always wins if present and
       actually exists in this file's headers.
    3. Alias list (column_aliases.json) — known synonyms/variants for each
       field, checked by normalized exact match.
    4. Fuzzy match — closest header by string similarity, only trusted
       above FUZZY_MATCH_THRESHOLD.

Nothing here is silent: every resolution below "configured"/"cache" is
logged, and callers can call resolve_all() to get a full preview (field,
column, method, confidence) to show a person before trusting the result —
the "confirm before run" safety net — rather than editing JSON by hand
every time a header drifts. Once confirmed, save_confirmed_mapping() caches
it AND learns the resolved names as new aliases, so the next file with a
similar-but-not-identical header set has a better shot at an exact alias
hit instead of falling through to fuzzy matching again.
"""

import difflib
import hashlib
import json
import logging
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = PROJECT_ROOT / "configs"
ALIASES_PATH = CONFIGS_DIR / "column_aliases.json"
CACHE_PATH = CONFIGS_DIR / ".column_mapping_cache.json"

FUZZY_MATCH_THRESHOLD = 0.72  # difflib ratio; below this a guess isn't trusted automatically


@dataclass
class ColumnResolution:
    field: str
    column: Optional[str]
    method: str          # "cache" | "configured" | "alias" | "fuzzy" | "none"
    confidence: float    # 1.0 for cache/configured/alias, similarity ratio for fuzzy, 0.0 for none


# ---------------------------------------------------------------------------
# Built-in aliases (extended by configs/column_aliases.json if present)
# ---------------------------------------------------------------------------

_DEFAULT_ALIASES: dict[str, list[str]] = {
    "id": ["id", "code", "participant_code", "yp_code", "mcp_code", "participant id"],
    "name": ["name", "full_name", "full name", "yp_name", "participant_name"],
    "address": ["address", "residential_address", "business_address", "home_address", "residence"],
    "landmark": ["landmark", "cluster", "nearest_landmark", "nearest_cluster", "zone", "area"],
    "trade": ["trade", "trade_area", "skill", "trade area", "which_area", "trade_area_registered"],
    "phone_number": ["phone", "phone_number", "mobile", "mobile_number", "contact_number", "sms"],
    "proceed_flag": ["proceed", "should_proceed", "should_participant_proceed", "eligible", "eligibility", "ready_to_proceed"],
    "gender": ["gender", "sex"],
    "pwd": ["pwd", "disability", "person_with_disability", "pwd_status", "is_pwd"],
    "garment_subtype": ["garment_subtype", "garment_specialization", "garment_for", "products_for"],
    "footwear_subtype": ["footwear_subtype", "footwear_for", "footwear_products", "products_for"],
    "leather_subtype": ["leather_subtype", "leather_for", "leather_products_for"],
    "leather_bag_flag": ["leather_bag", "bag_production", "if_leather_bag"],
    "leather_belt_flag": ["leather_belt", "belt_production", "if_leather_belt"],
    "leather_wallet_flag": ["leather_wallet", "wallet_production", "if_leather_wallet", "if_leather_waller"],
    "mcp_requested_capacity": ["mcp_choice", "requested_capacity", "quota_requested"],
    "recommended_capacity": ["merl_recommendation", "recommended_capacity", "recommendation"],
}


def _load_aliases() -> dict[str, list[str]]:
    aliases = {k: list(v) for k, v in _DEFAULT_ALIASES.items()}
    if ALIASES_PATH.exists():
        try:
            custom = json.loads(ALIASES_PATH.read_text())
            for field, extra in custom.items():
                aliases.setdefault(field, [])
                for a in extra:
                    if a not in aliases[field]:
                        aliases[field].append(a)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Could not read %s (%s); using built-in aliases only", ALIASES_PATH, e)
    return aliases


def learn_alias(field: str, column_name: str) -> None:
    """Persist a newly-confirmed column name as an alias so future files
    using this exact header resolve via the fast alias path next time."""
    aliases: dict = {}
    if ALIASES_PATH.exists():
        try:
            aliases = json.loads(ALIASES_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            aliases = {}
    aliases.setdefault(field, [])
    existing_normalized = {_normalize_header(a) for a in aliases[field]}
    if _normalize_header(column_name) not in existing_normalized:
        aliases[field].append(column_name)
        ALIASES_PATH.write_text(json.dumps(aliases, indent=2))
        logger.info("Learned new alias for field '%s': %r", field, column_name)


# ---------------------------------------------------------------------------
# Header normalization + fuzzy matching
# ---------------------------------------------------------------------------

def _normalize_header(header: str) -> str:
    text = str(header).strip().lower()
    text = re.sub(r"[\s_\-]+", " ", text)
    text = re.sub(r"[^\w\s]", "", text)
    return text.strip()


def _fuzzy_best_match(target_terms: list[str], candidate_columns: list[str]) -> tuple[Optional[str], float]:
    """
    Scores each candidate column against each target term. The containment
    boost only fires on whole-word/token matches (e.g. "id" matching the
    "id" token in "participant id") — NOT raw substring containment, which
    previously let a 2-letter term like "id" match anywhere it happened to
    appear inside another word (e.g. inside "valid", "paid", "void" —
    "comment_of_validator" scored 0.9 against "id" this way, silently
    corrupting every downstream row). Whole-token matching is the fix.
    """
    normalized_candidates = {col: _normalize_header(col) for col in candidate_columns}
    best_col, best_score = None, 0.0
    for term in target_terms:
        if not term:
            continue
        norm_term = _normalize_header(term)
        term_tokens = set(norm_term.split())
        for col, norm_col in normalized_candidates.items():
            col_tokens = set(norm_col.split())
            if term_tokens and term_tokens.issubset(col_tokens) and len(term_tokens) == len(col_tokens):
                # every token matches, in both directions — effectively an exact match
                # after normalization (e.g. "mcp code" vs "mcp_code")
                score = 0.95
            elif term_tokens and term_tokens.issubset(col_tokens) and len(norm_term) >= 4:
                # whole term appears as a subset of the column's tokens, e.g.
                # "full_name" -> tokens {"full","name"} inside "full name of applicant"
                score = 0.85
            else:
                score = difflib.SequenceMatcher(None, norm_term, norm_col).ratio()
            if score > best_score:
                best_col, best_score = col, score
    return best_col, best_score


# ---------------------------------------------------------------------------
# Signature caching — "learn once per header set, reuse forever"
# ---------------------------------------------------------------------------

def compute_signature(columns: list[str]) -> str:
    """A hash of the *set* of column headers (order-independent, case/
    whitespace-insensitive). Two files with the exact same header set get
    the exact same signature, regardless of column order or minor casing."""
    normalized = sorted(_normalize_header(c) for c in columns)
    raw = "|".join(normalized)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=2))


def get_cached_mapping(signature: str) -> Optional[dict]:
    return _load_cache().get(signature)


def save_confirmed_mapping(signature: str, mapping: dict[str, Optional[str]], learn_aliases: bool = True) -> None:
    """Call this once a mapping is trusted (auto-resolved with high
    confidence, or confirmed by a person via the preview). Future files
    with this exact header signature skip resolution entirely."""
    cache = _load_cache()
    cache[signature] = mapping
    _save_cache(cache)
    if learn_aliases:
        for field, column in mapping.items():
            if column:
                learn_alias(field, column)
    logger.info("Cached column mapping for signature %s (%d fields)", signature, len(mapping))


# ---------------------------------------------------------------------------
# Main resolution entry point
# ---------------------------------------------------------------------------

def resolve_all(
    df_columns: list[str],
    configured_cols: dict[str, str],
    field_keys: list[str],
    source_label: str = "",
) -> list[ColumnResolution]:
    """
    Resolves every field in field_keys to an actual column in df_columns,
    trying in order: signature cache -> configured name -> alias -> fuzzy
    match. Returns one ColumnResolution per field. Callers decide what
    confidence is good enough to trust automatically (data_loader.py treats
    cache/configured/alias/fuzzy-above-threshold as usable) vs. what should
    be surfaced to a person for confirmation (fuzzy hits, and "none").
    """
    signature = compute_signature(df_columns)
    cached = get_cached_mapping(signature)
    aliases = _load_aliases()

    resolutions: list[ColumnResolution] = []
    for field in field_keys:
        if cached and cached.get(field) and cached[field] in df_columns:
            resolutions.append(ColumnResolution(field, cached[field], "cache", 1.0))
            continue

        configured_name = configured_cols.get(field)
        if configured_name and configured_name in df_columns:
            resolutions.append(ColumnResolution(field, configured_name, "configured", 1.0))
            continue

        alias_terms = aliases.get(field, [])
        alias_norms = {_normalize_header(a) for a in alias_terms}
        alias_hit = next((c for c in df_columns if _normalize_header(c) in alias_norms), None)
        if alias_hit:
            resolutions.append(ColumnResolution(field, alias_hit, "alias", 1.0))
            continue

        fuzzy_terms = ([configured_name] if configured_name else []) + alias_terms + [field]
        best_col, score = _fuzzy_best_match(fuzzy_terms, list(df_columns))
        if best_col and score >= FUZZY_MATCH_THRESHOLD:
            resolutions.append(ColumnResolution(field, best_col, "fuzzy", round(score, 2)))
            logger.info(
                "%s: field '%s' fuzzy-matched to column %r (confidence %.2f) — no exact/alias/cache hit. "
                "Worth confirming via the mapping preview so it's cached and learned as an alias.",
                source_label, field, best_col, score,
            )
            continue

        resolutions.append(ColumnResolution(field, None, "none", 0.0))
        logger.warning(
            "%s: field '%s' could not be resolved to any column (tried cache/configured/alias/fuzzy)",
            source_label, field,
        )

    return resolutions


def resolutions_to_mapping(resolutions: list[ColumnResolution]) -> dict[str, Optional[str]]:
    return {r.field: r.column for r in resolutions}


def resolutions_to_preview(resolutions: list[ColumnResolution]) -> list[dict]:
    """JSON-serializable preview for a 'confirm before running' UI step."""
    return [asdict(r) for r in resolutions]