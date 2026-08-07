import pandas as pd

from utils.data_loader import load_mcps, load_yps


def test_load_yps_keeps_rows_with_blank_ids_and_skips_true_duplicates(tmp_path):
    path = tmp_path / "yps.xlsx"
    df = pd.DataFrame(
        [
            {
                "YP CODE (Tech & Data)": "",
                "YP Name2": "First blank",
                "residential_address": "Address 1",
                "Which_cluster_is_nearest_to_you_2": "Cluster A",
                "which_area_of_the_fashion_industry_did_you_register_for2": "garment",
                "What_is_your_number_sms": "08012345678",
                "should_participant_proceed": "yes",
                "Gender": "female",
                "PWD": "yes",
            },
            {
                "YP CODE (Tech & Data)": "",
                "YP Name2": "Second blank",
                "residential_address": "Address 2",
                "Which_cluster_is_nearest_to_you_2": "Cluster B",
                "which_area_of_the_fashion_industry_did_you_register_for2": "footwear",
                "What_is_your_number_sms": "08012345679",
                "should_participant_proceed": "yes",
                "Gender": "male",
                "PWD": "no",
            },
            {
                "YP CODE (Tech & Data)": "YP_001",
                "YP Name2": "Duplicate id",
                "residential_address": "Address 3",
                "Which_cluster_is_nearest_to_you_2": "Cluster C",
                "which_area_of_the_fashion_industry_did_you_register_for2": "leather",
                "What_is_your_number_sms": "08012345670",
                "should_participant_proceed": "yes",
                "Gender": "female",
                "PWD": "no",
            },
            {
                "YP CODE (Tech & Data)": "YP_001",
                "YP Name2": "Should be skipped",
                "residential_address": "Address 4",
                "Which_cluster_is_nearest_to_you_2": "Cluster D",
                "which_area_of_the_fashion_industry_did_you_register_for2": "garment",
                "What_is_your_number_sms": "08012345671",
                "should_participant_proceed": "yes",
                "Gender": "male",
                "PWD": "yes",
            },
        ]
    )
    df.to_excel(path, index=False)

    yps = load_yps(str(path))

    assert len(yps) == 3
    assert {yp.name for yp in yps} == {"First blank", "Second blank", "Duplicate id"}


def test_loader_populates_gender_and_trade_type_fields(tmp_path):
    yp_path = tmp_path / "yps.xlsx"
    mcp_path = tmp_path / "mcps.xlsx"

    yp_df = pd.DataFrame(
        [
            {
                "YP CODE (Tech & Data)": "YP_001",
                "YP Name2": "Ayo",
                "residential_address": "Address 1",
                "Which_cluster_is_nearest_to_you_2": "Cluster A",
                "which_area_of_the_fashion_industry_did_you_register_for2": "Female Garment Making",
                "What_is_your_number_sms": "08012345678",
                "should_participant_proceed": "yes",
                "Gender": "female",
                "PWD": "yes",
            }
        ]
    )
    yp_df.to_excel(yp_path, index=False)

    mcp_df = pd.DataFrame(
        [
            {
                "MCP Code": "MCP_001",
                "Full Name": "Shop Owner",
                "Business address": "Address 2",
                "Cluster": "Cluster B",
                "Trade area": "Male Footwear Production",
                "MCP Choice": 2,
                "MERL Recommendation": 2,
                "Gender": "male",
            }
        ]
    )
    mcp_df.to_excel(mcp_path, index=False)

    yps = load_yps(str(yp_path))
    mcps = load_mcps(str(mcp_path))

    assert yps[0].gender == "female"
    assert yps[0].trade_type == "Female Garment Making"
    assert mcps[0].gender == "male"
    assert mcps[0].trade_type == "Male Footwear Production"


# ---------------------------------------------------------------------------
# Quick manual check when run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    yp_path = r"C:\Users\VOSTRO 3590\Documents\projects\yp_matcher\MCP.xlsx"
    mcp_path = r"C:\Users\VOSTRO 3590\Documents\projects\yp_matcher\YPPP.xlsx"

    yps = load_yps(yp_path)
    mcps = load_mcps(mcp_path)

    print(f"Loaded {len(yps)} eligible YPs and {len(mcps)} MCPs")
    print("Sample YP:", yps[0] if yps else None)
    print("Sample MCP:", mcps[0] if mcps else None)
    print("YP trades found:", sorted(set(y.trade for y in yps)))
    print("MCP trades found:", sorted(set(m.trade for m in mcps)))
    print("Total MCP capacity:", sum(m.capacity for m in mcps))