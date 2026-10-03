import React, { useState, useEffect, useMemo } from "react";
import {
  History,
  X,
  Search,
  RefreshCw,
  Download,
  FolderOpen,
  Calendar,
  User,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  AlertCircle,
  FileSpreadsheet,
  Cpu,
} from "lucide-react";
import { apiService } from "../services/api";
import { MatchRunSummary, MatchRunDetail, AuthUser } from "../types";
import { isSuperAdmin } from "../utils/auth";

interface MatchRunsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onSelectRun: (runDetail: MatchRunDetail) => void;
  currentLoadedRunId?: number | string | null;
}

export const MatchRunsHistoryModal: React.FC<MatchRunsHistoryModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectRun,
  currentLoadedRunId,
}) => {
  const [runs, setRuns] = useState<MatchRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loadingRunId, setLoadingRunId] = useState<number | string | null>(
    null,
  );
  const [exportingRunId, setExportingRunId] = useState<number | string | null>(
    null,
  );
  const [downloadSuccessRunId, setDownloadSuccessRunId] = useState<
    number | string | null
  >(null);

  const isSuper = isSuperAdmin(currentUser);

  const fetchRuns = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiService.getMatchRuns();
      // Sort newest first
      const sorted = [...data].sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });
      setRuns(sorted);
    } catch (err: any) {
      setError(err.message || "Failed to load past match runs from server");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRuns();
    }
  }, [isOpen]);

  const filteredRuns = useMemo(() => {
    if (!searchTerm.trim()) return runs;
    const term = searchTerm.toLowerCase().trim();
    return runs.filter((run) => {
      const idMatch = String(run.id).toLowerCase().includes(term);
      const emailMatch = (run.actor_email || run.user_email || "")
        .toLowerCase()
        .includes(term);
      const nameMatch = (run.actor_name || run.user_name || "")
        .toLowerCase()
        .includes(term);
      const dateMatch = (run.created_at || "").toLowerCase().includes(term);
      return idMatch || emailMatch || nameMatch || dateMatch;
    });
  }, [runs, searchTerm]);

  // High-level aggregate statistics
  const totalMatchesCount = useMemo(() => {
    return runs.reduce(
      (acc, curr) => acc + (Number(curr.matched_count) || 0),
      0,
    );
  }, [runs]);

  const totalWaitlistCount = useMemo(() => {
    return runs.reduce(
      (acc, curr) => acc + (Number(curr.waitlisted_count) || 0),
      0,
    );
  }, [runs]);

  const handleLoadRun = async (runSummary: MatchRunSummary) => {
    setLoadingRunId(runSummary.id);
    try {
      const detail = await apiService.getMatchRun(runSummary.id);
      onSelectRun(detail);
      onClose();
    } catch (err: any) {
      setError(`Failed to retrieve run #${runSummary.id}: ${err.message}`);
    } finally {
      setLoadingRunId(null);
    }
  };

  const handleExportRun = async (runId: number | string) => {
    setExportingRunId(runId);
    try {
      const blob = await apiService.exportMatchRun(runId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `match_run_${runId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setDownloadSuccessRunId(runId);
      setTimeout(() => setDownloadSuccessRunId(null), 3000);
    } catch (err: any) {
      setError(`Export failed for run #${runId}: ${err.message}`);
    } finally {
      setExportingRunId(null);
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return "Unknown date";
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  const getActorDisplay = (run: MatchRunSummary) => {
    const name = run.actor_name || run.user_name;
    const email = run.actor_email || run.user_email;

    const isMe =
      (currentUser?.email &&
        email &&
        currentUser.email.toLowerCase() === email.toLowerCase()) ||
      (currentUser?.id &&
        run.actor_id &&
        String(currentUser.id) === String(run.actor_id)) ||
      (currentUser?.id &&
        run.user_id &&
        String(currentUser.id) === String(run.user_id));

    if (name && email) {
      return { primary: name, secondary: email, isMe };
    }
    if (name) {
      return { primary: name, secondary: null, isMe };
    }
    if (email) {
      return { primary: email, secondary: null, isMe };
    }
    return { primary: "Automated System", secondary: null, isMe: false };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shadow-2xs">
              <History className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  Past Match Runs History
                </h3>
                <span className="text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full">
                  GET /match/runs
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Browse, load into active inspection, or redownload past
                automated match results.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isSuper ? (
              <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200/80 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                <span>Super Admin (All Users)</span>
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Your Runs</span>
              </span>
            )}

            <button
              type="button"
              onClick={fetchRuns}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh past runs"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin text-orange-600" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Aggregated Quick Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-white border-b border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-500 block">
              Total Runs
            </span>
            <span className="text-lg font-bold text-slate-900">
              {runs.length}
            </span>
          </div>
          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/70">
            <span className="text-[11px] font-medium text-emerald-700 block">
              Matched YPs
            </span>
            <span className="text-lg font-bold text-emerald-900">
              {totalMatchesCount.toLocaleString()}
            </span>
          </div>
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/70">
            <span className="text-[11px] font-medium text-amber-700 block">
              Waitlisted YPs
            </span>
            <span className="text-lg font-bold text-amber-900">
              {totalWaitlistCount.toLocaleString()}
            </span>
          </div>
          <div className="p-3 bg-orange-50/70 rounded-xl border border-orange-200/70">
            <span className="text-[11px] font-medium text-orange-700 block">
              Latest Run
            </span>
            <span className="text-xs font-semibold text-orange-950 truncate block mt-1">
              {runs.length > 0 ? formatTimestamp(runs[0].created_at) : "None"}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search past runs by Run ID, actor name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-600 hover:underline font-bold text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Runs List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isLoading && runs.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">
                Retrieving past match runs from server...
              </p>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="py-16 text-center space-y-2 max-w-sm mx-auto">
              <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">
                {searchTerm
                  ? "No matching runs found"
                  : "No past match runs recorded"}
              </h4>
              <p className="text-xs text-slate-500">
                {searchTerm
                  ? "Try clearing the search query or search by another keyword."
                  : "Execute a match run from the Matching Pipeline to produce your first persistent match run in the database."}
              </p>
            </div>
          ) : (
            filteredRuns.map((run) => {
              const actor = getActorDisplay(run);
              const isCurrentlyLoaded =
                currentLoadedRunId != null &&
                String(currentLoadedRunId) === String(run.id);

              return (
                <div
                  key={run.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrentlyLoaded
                      ? "bg-orange-50/50 border-orange-300 ring-1 ring-orange-400/50"
                      : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: ID & Actor Info */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-md">
                          Run #{run.id}
                        </span>

                        {isCurrentlyLoaded && (
                          <span className="text-[10px] font-semibold bg-orange-600 text-white px-2 py-0.5 rounded-full flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Currently Active in Dashboard</span>
                          </span>
                        )}

                        <span className="text-xs text-slate-500 flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{formatTimestamp(run.created_at)}</span>
                        </span>
                      </div>

                      {/* Actor details */}
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-500">Performed by:</span>
                        <span className="font-semibold text-slate-900">
                          {actor.primary}
                        </span>
                        {actor.secondary && (
                          <span className="text-slate-400 text-[11px]">
                            ({actor.secondary})
                          </span>
                        )}
                        {actor.isMe && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                            You
                          </span>
                        )}
                      </div>

                      {/* Parameter Badges */}
                      <div className="flex items-center space-x-2 text-[11px] text-slate-600 flex-wrap gap-y-1 pt-0.5">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 font-medium">
                          Hop Limit:{" "}
                          <strong className="text-slate-900">
                            {run.hop_limit ?? "N/A"}
                          </strong>
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 font-medium">
                          Match Cap:{" "}
                          <strong className="text-slate-900">
                            {run.match_cap ? run.match_cap : "None (Auto)"}
                          </strong>
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 font-medium">
                          Shortlist:{" "}
                          <strong className="text-slate-900">
                            {run.shortlist_size ?? 10}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Right: Metrics & Actions */}
                    <div className="flex flex-col sm:items-end justify-between space-y-2.5 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {/* Metric Badges */}
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <span className="text-[11px] text-slate-500 block">
                            Matches
                          </span>
                          <span className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            {run.matched_count} YPs
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-slate-500 block">
                            Waitlist
                          </span>
                          <span className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            {run.waitlisted_count} YPs
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleLoadRun(run)}
                          disabled={loadingRunId === run.id}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          title="Load this run into the active dashboard and tables (GET /match/runs/{id})"
                        >
                          {loadingRunId === run.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FolderOpen className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isCurrentlyLoaded ? "Reload Run" : "Load Run"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportRun(run.id)}
                          disabled={exportingRunId === run.id}
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          title="Download formatted Excel workbook for this past run (GET /match/runs/{id}/export)"
                        >
                          {exportingRunId === run.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
                          ) : downloadSuccessRunId === run.id ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Download className="w-3.5 h-3.5 text-slate-600" />
                          )}
                          <span>
                            {downloadSuccessRunId === run.id
                              ? "Downloaded"
                              : "Excel (.xlsx)"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>
            {isSuper
              ? "Super admin access active: Viewing runs across all system users."
              : "Standard access active: Viewing your personal match runs."}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
