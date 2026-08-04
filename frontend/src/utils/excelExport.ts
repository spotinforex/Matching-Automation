import * as XLSX from 'xlsx';
import { MatchRunResponse } from '../types';

export function downloadResultsExcel(data: MatchRunResponse, filename?: string) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Matches
  const matchesData = data.matches.map(m => ({
    'YP ID': m.yp_id,
    'MCP ID': m.mcp_id,
    'Landmark Centroid': m.landmark,
    'Travel Time (mins)': parseFloat(m.travel_time.toFixed(2)),
    'Match Round': m.round,
    'Status': 'Matched'
  }));
  const wsMatches = XLSX.utils.json_to_sheet(matchesData);
  XLSX.utils.book_append_sheet(wb, wsMatches, 'Matches');

  // Sheet 2: Waitlist
  const waitlistData = data.waitlist.map(w => ({
    'YP ID': w.yp_id,
    'Reason': w.reason,
    'Landmark': w.landmark || 'N/A',
    'Status': 'Waitlisted'
  }));
  const wsWaitlist = XLSX.utils.json_to_sheet(waitlistData);
  XLSX.utils.book_append_sheet(wb, wsWaitlist, 'Waitlist');

  // Sheet 3: Summary
  const avgTravelTime = data.matches.length > 0
    ? (data.matches.reduce((acc, curr) => acc + curr.travel_time, 0) / data.matches.length).toFixed(2)
    : '0';

  const round1Count = data.matches.filter(m => m.round === 1).length;
  const round2Count = data.matches.filter(m => m.round === 2).length;
  const round3Count = data.matches.filter(m => m.round === 3).length;

  const summaryData = [
    { Metric: 'Total YP Records', Value: data.matched_count + data.waitlisted_count },
    { Metric: 'Successfully Matched YPs', Value: data.matched_count },
    { Metric: 'Waitlisted YPs', Value: data.waitlisted_count },
    { Metric: 'Match Rate (%)', Value: `${(((data.matched_count) / (data.matched_count + data.waitlisted_count || 1)) * 100).toFixed(1)}%` },
    { Metric: 'Average Travel Time (minutes)', Value: `${avgTravelTime} mins` },
    { Metric: 'Round 1 Matches (Direct)', Value: round1Count },
    { Metric: 'Round 2 Matches (Hop 1)', Value: round2Count },
    { Metric: 'Round 3 Matches (Hop 2)', Value: round3Count },
    { Metric: 'Export Timestamp', Value: new Date().toLocaleString() }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const defaultName = filename || `match_results_${dateStr}_${timeStr}.xlsx`;

  XLSX.writeFile(wb, defaultName);
}
