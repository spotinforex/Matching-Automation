"""
make_test_data.py

Writes test_yp.xlsx and test_mcp.xlsx for exercising the matcher end to end.

Headers default to the ones in your column_config.json (baked in below), and
are overridden by --config if you pass a different/updated file, so the sheets
always resolve through the loader's "configured" path.

    python make_test_data.py
    python make_test_data.py --config configs/column_config.json --out ./test_data

To move the data to another place, edit the PLACE block (clusters + street
names) — nothing else depends on it. Keep the second-state rows (Lagos) in a
*different* state from the main place so STATE=<main> / STATE=Lagos / STATE=any
give visibly different results.
"""

import argparse
import json
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# PLACE — main state + its three clusters (landmarks) and streets.
# ---------------------------------------------------------------------------
MAIN_STATE = "Enugu"
C1, C2, C3 = "Ogbete", "Abakpa", "Emene"            # cluster names (the "landmark" column)
OTHER_CLUSTER = "Ikeja"                              # second state: Lagos

# ---------------------------------------------------------------------------
# Headers — from your column_config.json
# ---------------------------------------------------------------------------
YP_HEADERS = {
    "id": "participant_code", "name": "full_name", "address": "residential_address",
    "landmark": "Which_cluster_is_nearest_to_you", "trade": "Trade_Area",
    "phone_number": "What_is_your_number_sms", "proceed_flag": "should_participant_proceed",
    "gender": "Gender", "pwd": "PWD Status",
    "garment_subtype": "garment_specialization", "footwear_subtype": "If_footwear_production",
    "leather_bag_flag": "If_leather_bag_production", "leather_belt_flag": "if_leather_belt",
    "leather_wallet_flag": "if_leather_waller",
}
MCP_HEADERS = {
    "id": "MCP_Code", "name": "Full_Name", "address": "Business_address", "landmark": "Cluster",
    "trade": "Trade_area", "mcp_requested_capacity": "MCP_Choice",
    "recommended_capacity": "MERL_Recommendation", "gender": "Gender",
    # garment and footwear MCPs answer the same question, so both fields share one column
    "garment_subtype": "What_kind_of products_do_you_make?",
    "footwear_subtype": "What_kind_of products_do_you_make?",
    "leather_subtype": "Who_are_your_products_specifically_made_for?",
}

TRADE_TEXT = {
    "garment": "Garment Making",
    "footwear": "Footwear Making",
    "leather": "Leather Works",
    "unknown": "Catering",   # matches none of the trade_canonical_map substrings -> "unknown"
}

# ---------------------------------------------------------------------------
# Data. `scope` is for expected-result bookkeeping only; it is NOT written out.
# YP subtype: garment/footwear -> Male/Female/Both; leather -> bag/wallet/belt or ""
# (blank = unspecified leather subtype = leather_any).
# ---------------------------------------------------------------------------

def yp(id_, name, phone, gender, pwd, address, cluster, trade, subtype, scope, proceed="Yes"):
    return dict(id=id_, name=name, phone=phone, gender=gender, pwd=pwd, address=address,
                cluster=cluster, trade=trade, subtype=subtype, scope=scope, proceed=proceed)


def mcp(id_, name, gender, address, cluster, trade, subtype, capacity, scope):
    return dict(id=id_, name=name, gender=gender, address=address, cluster=cluster,
                trade=trade, subtype=subtype, capacity=capacity, scope=scope)


YPS = [
    # C1: three garment_both YPs compete for MCP_002's 2 slots (priority decides)
    yp("YP_001", "Chinelo Okeke",    "08031230001", "Female", "No",  "Ogui Road, Enugu",                  C1, "garment", "Both",   "main"),
    yp("YP_002", "Emeka Nwosu",      "08031230002", "Male",   "No",  "Okpara Avenue, Enugu",              C1, "garment", "Both",   "main"),
    yp("YP_003", "Ifeoma Eze",       "08031230003", "Female", "Yes", "Ogbete Main Market, Enugu",         C1, "garment", "Both",   "main"),
    # C1: two footwear_male YPs compete for MCP_003's single slot (PWD wins)
    yp("YP_004", "Chukwuma Obi",     "08031230004", "Male",   "Yes", "Zik Avenue, Enugu",                  C1, "footwear", "Male",  "main"),
    yp("YP_005", "Obinna Agu",       "08031230005", "Male",   "No",  "Edinburgh Road, Enugu",              C1, "footwear", "Male",  "main"),
    # C1: unknown trade
    yp("YP_014", "Chidiebere Nwafor","08031230014", "Male",   "No",  "Ogui Road, Enugu",                  C1, "unknown", "",       "main"),
    # C2
    yp("YP_006", "Ikenna Okoro",     "08031230006", "Male",   "No",  "Abakpa Nike Road, Enugu",           C2, "garment", "Male",   "main"),
    yp("YP_007", "Adaeze Nnadi",     "08031230007", "Female", "No",  "Nike Lake Road, Enugu",             C2, "garment", "Female", "main"),
    yp("YP_012", "Amarachi Kalu",    "08031230012", "Female", "No",  "Garden Avenue, Enugu",              C2, "footwear", "Both",  "main"),
    yp("YP_013", "Nneka Anyanwu",    "08031230013", "Female", "No",  "Agbani Road, Enugu",                C2, "footwear", "Female","main"),
    # C2: proceed flag = No -> filtered out by the loader, never reaches matching or the waitlist
    yp("YP_018", "Tochukwu Madu",    "08031230018", "Male",   "No",  "Abakpa Nike Road, Enugu",           C2, "garment", "Male",   "main", proceed="No"),
    # C3
    yp("YP_008", "Uchenna Ibe",      "08031230008", "Female", "No",  "Enugu-Port Harcourt Expressway, Emene", C3, "leather", "bag",    "main"),
    yp("YP_009", "Kelechi Ogbu",     "08031230009", "Male",   "No",  "Emene Industrial Layout, Enugu",    C3, "leather", "",       "main"),
    yp("YP_010", "Blessing Onu",     "08031230010", "Female", "No",  "Presidential Road, Enugu",          C3, "leather", "wallet", "main"),
    yp("YP_011", "Ngozi Uche",       "08031230011", "Female", "No",  "Chime Avenue, Enugu",               C3, "garment", "Female", "main"),
    # Second state (Lagos)
    yp("YP_015", "Folake Adeyemi",   "08031230015", "Female", "No",  "Allen Avenue, Ikeja",               OTHER_CLUSTER, "garment", "Female", "other"),
    yp("YP_016", "Tunde Balogun",    "08031230016", "Male",   "No",  "Opebi Road, Ikeja",                 OTHER_CLUSTER, "garment", "Male",   "other"),
    yp("YP_017", "Segun Alabi",      "08031230017", "Female", "No",  "Adeniyi Jones Avenue, Ikeja",       OTHER_CLUSTER, "garment", "Both",   "other"),
]

MCPS = [
    mcp("MCP_002", "Madam Ada Fashion House", "Female", "Ogui Road, Enugu",                       C1, "garment",  "Both",        2, "main"),
    mcp("MCP_003", "Okey Footwear Works",     "Male",   "Zik Avenue, Enugu",                      C1, "footwear", "Male",        1, "main"),
    mcp("MCP_004", "Nnamdi Tailoring",        "Male",   "Abakpa Nike Road, Enugu",                C2, "garment",  "Male",        2, "main"),
    mcp("MCP_005", "Chioma Shoes",            "Female", "Nike Lake Road, Enugu",                  C2, "footwear", "Female",      2, "main"),
    mcp("MCP_006", "Ugo Leather Hub",         "Male",   "Enugu-Port Harcourt Expressway, Emene",  C3, "leather",  "Leather Bag", 2, "main"),
    mcp("MCP_007", "Stitch & Style Emene",    "Female", "Emene Industrial Layout, Enugu",         C3, "garment",  "Both",        1, "main"),
    mcp("MCP_010", "Mama Joy Catering",       "Female", "Garden Avenue, Enugu",                   C1, "unknown",  "",            2, "main"),
    mcp("MCP_008", "Lagos Fashion Studio",    "Female", "Obafemi Awolowo Way, Ikeja",             OTHER_CLUSTER, "garment", "Both",   3, "other"),
    mcp("MCP_009", "Toyin Couture",           "Female", "Toyin Street, Ikeja",                    OTHER_CLUSTER, "garment", "Female", 1, "other"),
]


# ---------------------------------------------------------------------------
# Frame building
# ---------------------------------------------------------------------------

def _merge(row: dict, header: str, value: str) -> None:
    """Write value under header, but never let a blank overwrite a real value
    (garment/footwear MCP fields share one column)."""
    if value != "" or header not in row:
        row[header] = value


def yp_row(r: dict, h: dict) -> dict:
    rec = {
        "id": r["id"], "name": r["name"], "address": r["address"], "landmark": r["cluster"],
        "trade": TRADE_TEXT[r["trade"]], "phone_number": r["phone"], "proceed_flag": r["proceed"],
        "gender": r["gender"], "pwd": r["pwd"],
        "garment_subtype": "", "footwear_subtype": "",
        "leather_bag_flag": "", "leather_belt_flag": "", "leather_wallet_flag": "",
    }
    if r["trade"] == "garment":
        rec["garment_subtype"] = r["subtype"]
    elif r["trade"] == "footwear":
        rec["footwear_subtype"] = r["subtype"]
    elif r["trade"] == "leather" and r["subtype"]:
        rec[f"leather_{r['subtype']}_flag"] = "Yes"   # branching survey flag, only set for the chosen product

    row: dict = {}
    for field, value in rec.items():
        _merge(row, h[field], value)
    return row


def mcp_row(r: dict, h: dict) -> dict:
    rec = {
        "id": r["id"], "name": r["name"], "address": r["address"], "landmark": r["cluster"],
        "trade": TRADE_TEXT[r["trade"]], "gender": r["gender"],
        "mcp_requested_capacity": str(r["capacity"]), "recommended_capacity": str(r["capacity"]),
        "garment_subtype": "", "footwear_subtype": "", "leather_subtype": "",
    }
    if r["trade"] in ("garment", "footwear"):
        rec[f"{r['trade']}_subtype"] = r["subtype"]
    elif r["trade"] == "leather":
        rec["leather_subtype"] = r["subtype"]

    row: dict = {}
    for field, value in rec.items():
        _merge(row, h[field], value)
    return row


def build_frames(yp_headers: dict, mcp_headers: dict):
    return (
        pd.DataFrame([yp_row(r, yp_headers) for r in YPS]),
        pd.DataFrame([mcp_row(r, mcp_headers) for r in MCPS]),
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None, help="column_config.json to take headers from (optional)")
    parser.add_argument("--out", default=".")
    args = parser.parse_args()

    yp_h, mcp_h = dict(YP_HEADERS), dict(MCP_HEADERS)
    if args.config:
        cfg = json.loads(Path(args.config).read_text())
        yp_h.update({k: v for k, v in cfg.get("yp_columns", {}).items() if isinstance(v, str)})
        mcp_h.update({k: v for k, v in cfg.get("mcp_columns", {}).items() if isinstance(v, str)})
        print(f"Headers taken from {args.config}")

    yp_df, mcp_df = build_frames(yp_h, mcp_h)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    yp_df.to_excel(out / "test_yp.xlsx", index=False)
    mcp_df.to_excel(out / "test_mcp.xlsx", index=False)
    print(f"Wrote {len(yp_df)} YPs -> {out / 'test_yp.xlsx'}")
    print(f"Wrote {len(mcp_df)} MCPs -> {out / 'test_mcp.xlsx'}")


if __name__ == "__main__":
    main()