import React, { useState, useMemo } from 'react';
import { MatchResult, WaitlistEntry, MatchRunResponse } from '../types';
import {
  Search,
  Eye,
  Clock,
  MapPin,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  UserX,
  UserCheck,
  RefreshCw,
  X,
} from 'lucide-react';

interface MatchesTableProps {
  data: MatchRunResponse | null;
  onSelectResult: (item: MatchResult | WaitlistEntry, isWaitlist: boolean) => void;
  onExportApi?: () => void;
  isExporting?: boolean;
}

export const MatchesTable: React.FC<MatchesTableProps> = ({
  data,
  onSelectResult,
  onExportApi,
  isExporting = false,
}) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'waitlist'>('matches');
  const [searchTerm, setSearchTerm] = useState('');
  const [roundFilter, setRoundFilter] = useState<number | 'all'>('all');
  const [maxTravelTime, setMaxTravelTime] = useState<number>(120);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [copiedJson, setCopiedJson] = useState(false);

  if (!data) return null;

  // Filtered matches
  const filteredMatches = useMemo(() => {
    return data.matches.filter((m) => {
      const matchesSearch =
        m.yp_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.mcp_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.landmark.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRound = roundFilter === 'all' || m.round === roundFilter;
      const matchesTime = m.travel_time <= maxTravelTime;

      return matchesSearch && matchesRound && matchesTime;
    });
  }, [data.matches, searchTerm, roundFilter, maxTravelTime]);

  // Filtered waitlist
  const filteredWaitlist = useMemo(() => {
    return data.waitlist.filter((w) => {
      return (
        w.yp_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.landmark && w.landmark.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });
  }, [data.waitlist, searchTerm]);

  const activeListLength = activeTab === 'matches' ? filteredMatches.length : filteredWaitlist.length;
  const totalPages = Math.ceil(activeListLength / pageSize) || 1;

  const paginatedMatches = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMatches.slice(start, start + pageSize);
  }, [filteredMatches, currentPage, pageSize]);

  const paginatedWaitlist = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredWaitlist.slice(start, start + pageSize);
  }, [filteredWaitlist, currentPage, pageSize]);

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(activeTab === 'matches' ? filteredMatches : filteredWaitlist, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-0">
      {/* Table Controls & Header */}
      <div className="p-5 border-b border-slate-200 space-y-4">
        {/* Top Row: Tabs & Main Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Tab Switcher */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setActiveTab('matches');
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'matches'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-current" />
              <span>Matched YPs ({data.matched_count.toLocaleString()})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('waitlist');
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'waitlist'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserX className="w-3.5 h-3.5 text-current" />
              <span>Waitlist ({data.waitlisted_count.toLocaleString()})</span>
            </button>
          </div>

          {/* Export Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyJson}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors"
            >
              {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={onExportApi}
              disabled={isExporting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50"
              title="Export results from backend API (/match/export)"
            >
              {isExporting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isExporting ? 'Exporting...' : 'Export Results'}</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Search Field */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={activeTab === 'matches' ? "Search YP ID, MCP ID, Landmark..." : "Search YP ID, reason..."}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                type="button"
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Round Filter (For Matches) */}
          {activeTab === 'matches' && (
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500 whitespace-nowrap">Round:</span>
              <select
                value={roundFilter}
                onChange={(e) => {
                  setRoundFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs text-slate-800 focus:outline-none w-full cursor-pointer"
              >
                <option value="all">All Rounds</option>
                <option value={1}>Round 1 (Direct)</option>
                <option value={2}>Round 2 (Hop 1)</option>
                <option value={3}>Round 3 (Hop 2)</option>
              </select>
            </div>
          )}

          {/* Travel Time Max Slider (For Matches) */}
          {activeTab === 'matches' && (
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500 whitespace-nowrap">Max:</span>
              <input
                type="range"
                min={5}
                max={120}
                value={maxTravelTime}
                onChange={(e) => setMaxTravelTime(Number(e.target.value))}
                className="w-full accent-orange-600 cursor-pointer"
              />
              <span className="text-xs font-mono text-orange-600 font-bold min-w-[40px]">
                {maxTravelTime}m
              </span>
            </div>
          )}

          {/* Page Size Selector */}
          <div className="flex items-center justify-end space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Data View */}
      <div className="overflow-x-auto">
        {activeTab === 'matches' ? (
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">YP ID</th>
                <th className="py-3 px-4">Assigned MCP ID</th>
                <th className="py-3 px-4">Landmark Centroid</th>
                <th className="py-3 px-4">Travel Time</th>
                <th className="py-3 px-4">Hop Round</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedMatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No matching YP records found for filter options
                  </td>
                </tr>
              ) : (
                paginatedMatches.map((item, idx) => {
                  const isHighTime = item.travel_time > 30;

                  return (
                    <tr key={`${item.yp_id}-${idx}`} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-orange-600" />
                        <span>{item.yp_id}</span>
                      </td>

                      <td className="py-3 px-4 font-mono text-orange-600 font-semibold">
                        {item.mcp_id}
                      </td>

                      <td className="py-3 px-4 capitalize font-medium text-slate-700">
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.landmark}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold inline-flex items-center space-x-1 ${
                            isHighTime
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{item.travel_time.toFixed(2)} mins</span>
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase tracking-wider ${
                            item.round === 1
                              ? 'bg-orange-50 text-orange-700 border border-orange-200'
                              : item.round === 2
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          Round {item.round}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onSelectResult(item, false)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md transition-colors inline-flex items-center space-x-1 text-[11px]"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Waitlist YP ID</th>
                <th className="py-3 px-4">Landmark</th>
                <th className="py-3 px-4">Waitlist Reason</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedWaitlist.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No waitlisted entries found
                  </td>
                </tr>
              ) : (
                paginatedWaitlist.map((item, idx) => (
                  <tr key={`${item.yp_id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-amber-700 flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>{item.yp_id}</span>
                    </td>

                    <td className="py-3 px-4 capitalize text-slate-700 font-medium">
                      {item.landmark || 'N/A'}
                    </td>

                    <td className="py-3 px-4 text-slate-700">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium text-[11px]">
                        {item.reason}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onSelectResult(item, true)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md transition-colors inline-flex items-center space-x-1 text-[11px]"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing{' '}
          <strong className="text-slate-800">
            {activeListLength === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </strong>{' '}
          to{' '}
          <strong className="text-slate-800">
            {Math.min(currentPage * pageSize, activeListLength)}
          </strong>{' '}
          of <strong className="text-slate-800">{activeListLength}</strong> records
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-slate-700 font-medium">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

