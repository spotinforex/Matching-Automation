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