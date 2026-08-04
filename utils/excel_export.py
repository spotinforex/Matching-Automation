"""
excel_export.py

Builds a formatted .xlsx workbook from a match run's results:
    - "Matches" sheet: one row per YP<->MCP match
    - "Waitlist" sheet: one row per unmatched YP + reason
    - "Summary" sheet: counts by round, so it's obvious at a glance how many
      matches came from the same-landmark pass vs. each fallback hop

No formulas here — this is a static results export, not a model — so nothing
needs recalculation before it's handed to the user.
"""

from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

from schemas import MatchRunResponse

HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
BODY_FONT = Font(name="Arial")
TITLE_FONT = Font(name="Arial", bold=True, size=14)


def _write_table(ws, headers: list[str], rows: list[list], start_row: int = 1):
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=start_row, column=col_idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")

    for r, row in enumerate(rows, start=start_row + 1):
        for c, value in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=value)
            cell.font = BODY_FONT

    ws.freeze_panes = ws.cell(row=start_row + 1, column=1)

    # auto-width, capped so one long address doesn't blow out the sheet
    for col_idx, header in enumerate(headers, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = len(str(header))
        for row in rows:
            val = row[col_idx - 1]
            max_len = max(max_len, len(str(val)) if val is not None else 0)
        ws.column_dimensions[col_letter].width = min(max_len + 3, 45)


def build_results_workbook(result: MatchRunResponse, output_path: str) -> str:
    """
    Write `result` (matches + waitlist) to output_path as a formatted .xlsx.
    Returns output_path for convenience.
    """
    wb = Workbook()

    # -- Matches sheet -----------------------------------------------------
    ws_matches = wb.active
    ws_matches.title = "Matches"
    match_headers = ["YP ID", "MCP ID", "Landmark", "Travel Time (min)", "Round"]
    match_rows = [
        [m.yp_id, m.mcp_id, m.landmark, round(m.travel_time, 1), m.round]
        for m in result.matches
    ]
    _write_table(ws_matches, match_headers, match_rows)

    # -- Waitlist sheet -----------------------------------------------------
    ws_waitlist = wb.create_sheet("Waitlist")
    waitlist_headers = ["YP ID", "Reason"]
    waitlist_rows = [[w.yp_id, w.reason] for w in result.waitlist]
    _write_table(ws_waitlist, waitlist_headers, waitlist_rows)

    # -- Summary sheet -----------------------------------------------------
    ws_summary = wb.create_sheet("Summary")
    ws_summary["A1"] = "YP <-> MCP Matching Results"
    ws_summary["A1"].font = TITLE_FONT
    ws_summary["A2"] = f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    ws_summary["A2"].font = BODY_FONT

    rounds_seen = sorted(set(m.round for m in result.matches))
    summary_rows = [["Total matched", result.matched_count]]
    summary_rows += [
        [f"Matched in round {r}" + (" (same landmark)" if r == 1 else " (fallback hop)"),
         sum(1 for m in result.matches if m.round == r)]
        for r in rounds_seen
    ]
    summary_rows.append(["Waitlisted", result.waitlisted_count])

    _write_table(ws_summary, ["Metric", "Count"], summary_rows, start_row=4)

    wb.save(output_path)
    return output_path