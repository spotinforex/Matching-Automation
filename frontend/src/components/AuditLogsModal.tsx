import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  FileText,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ChevronRight,
  Code,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
  Database,
  User,
} from "lucide-react";
import { AuditLogItem, BackendEndpoint } from "../types";
import { apiService } from "../services/api";

/**
 * Resolves the "Performed by" display string:
 * 1. Shows person's name if available
 * 2. Falls back to person's email if available
 * 3. Falls back to "System" for legacy / actorless log entries
 */
function getPerformedBy(log: AuditLogItem): {
  label: string;
  isFallback: boolean;
} {
  // 1. Check for person's name
  const nameCandidate =
    (typeof log.name === "string" && log.name.trim()) ||
    (typeof log.full_name === "string" && log.full_name.trim()) ||
    (typeof log.user_name === "string" && log.user_name.trim()) ||
    (typeof log.actor_name === "string" && log.actor_name.trim()) ||
    (typeof log.performed_by_name === "string" &&
      log.performed_by_name.trim()) ||
    (typeof log.performed_by === "object" &&
      log.performed_by &&
      ((typeof log.performed_by.name === "string" &&
        log.performed_by.name.trim()) ||
        (typeof log.performed_by.full_name === "string" &&
          log.performed_by.full_name.trim()))) ||
    (typeof log.actor === "object" &&
      log.actor &&
      ((typeof log.actor.name === "string" && log.actor.name.trim()) ||
        (typeof log.actor.full_name === "string" &&
          log.actor.full_name.trim()))) ||
    (typeof log.user === "object" &&
      log.user &&
      ((typeof log.user.name === "string" && log.user.name.trim()) ||
        (typeof log.user.full_name === "string" &&
          log.user.full_name.trim()))) ||
    (log.metadata &&
      typeof log.metadata === "object" &&
      ((typeof log.metadata.name === "string" && log.metadata.name.trim()) ||
        (typeof log.metadata.full_name === "string" &&
          log.metadata.full_name.trim()) ||
        (typeof log.metadata.user_name === "string" &&
          log.metadata.user_name.trim()) ||
        (typeof log.metadata.actor_name === "string" &&
          log.metadata.actor_name.trim()) ||
        (typeof log.metadata.performed_by_name === "string" &&
          log.metadata.performed_by_name.trim()) ||
        (typeof log.metadata.user === "object" &&
          log.metadata.user &&
          ((typeof log.metadata.user.name === "string" &&
            log.metadata.user.name.trim()) ||
            (typeof log.metadata.user.full_name === "string" &&
              log.metadata.user.full_name.trim()))) ||
        (typeof log.metadata.actor === "object" &&
          log.metadata.actor &&
          ((typeof log.metadata.actor.name === "string" &&
            log.metadata.actor.name.trim()) ||
            (typeof log.metadata.actor.full_name === "string" &&
              log.metadata.actor.full_name.trim())))));

  if (nameCandidate) {
    return { label: nameCandidate, isFallback: false };
  }

  // 2. Fall back to email
  const emailCandidate =
    (typeof log.email === "string" && log.email.trim()) ||
    (typeof log.user_email === "string" && log.user_email.trim()) ||
    (typeof log.actor_email === "string" && log.actor_email.trim()) ||
    (typeof log.performed_by === "object" &&
      log.performed_by &&
      typeof log.performed_by.email === "string" &&
      log.performed_by.email.trim()) ||
    (typeof log.actor === "object" &&
      log.actor &&
      typeof log.actor.email === "string" &&
      log.actor.email.trim()) ||
    (typeof log.user === "object" &&
      log.user &&
      typeof log.user.email === "string" &&
      log.user.email.trim()) ||
    (typeof log.performed_by === "string" && log.performed_by.trim()) ||
    (typeof log.actor === "string" && log.actor.trim()) ||
    (typeof log.user === "string" && log.user.trim()) ||
    (typeof log.username === "string" && log.username.trim()) ||
    (log.metadata &&
      typeof log.metadata === "object" &&
      ((typeof log.metadata.email === "string" && log.metadata.email.trim()) ||
        (typeof log.metadata.user_email === "string" &&
          log.metadata.user_email.trim()) ||
        (typeof log.metadata.actor_email === "string" &&
          log.metadata.actor_email.trim()) ||
        (typeof log.metadata.performed_by === "string" &&
          log.metadata.performed_by.trim()) ||
        (typeof log.metadata.actor === "string" && log.metadata.actor.trim()) ||
        (typeof log.metadata.user === "string" && log.metadata.user.trim()) ||
        (typeof log.metadata.username === "string" &&
          log.metadata.username.trim()) ||
        (typeof log.metadata.user === "object" &&
          log.metadata.user &&
          typeof log.metadata.user.email === "string" &&
          log.metadata.user.email.trim()) ||
        (typeof log.metadata.actor === "object" &&
          log.metadata.actor &&
          typeof log.metadata.actor.email === "string" &&
          log.metadata.actor.email.trim())));

  if (emailCandidate) {
    return { label: emailCandidate, isFallback: false };
  }

  // 3. Fall back to System for actorless legacy entries
  return { label: "System", isFallback: true };
}

interface AuditLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onOpenAuth: () => void;
}

export const AuditLogsModal: React.FC<AuditLogsModalProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState<"logs" | "endpoints">("logs");

  // Logs state
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actorEmailFilter, setActorEmailFilter] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);
  const [expandedLogId, setExpandedLogId] = useState<string | number | null>(
    null,
  );

  // Endpoints state
  const [endpoints, setEndpoints] = useState<BackendEndpoint[]>([]);
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState<boolean>(false);
  const [endpointsError, setEndpointsError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    setLogsError(null);
    try {
      const res = await apiService.getAuditLogs({
        action: actionFilter || null,
        status: statusFilter || null,
        actor_email: actorEmailFilter.trim() || null,
        limit,
      });
      setLogs(res.items || []);
      setTotalLogs(res.total ?? (res.items?.length || 0));
    } catch (err: any) {
      setLogsError(err.message || "Failed to fetch audit logs");
    } finally {
      setIsLoadingLogs(false);
    }
  }, [actionFilter, statusFilter, actorEmailFilter, limit]);

  const fetchEndpoints = useCallback(async () => {
    setIsLoadingEndpoints(true);
    setEndpointsError(null);
    try {
      const res = await apiService.getEndpoints();
      setEndpoints(res || []);
    } catch (err: any) {
      setEndpointsError(err.message || "Failed to fetch registered endpoints");
    } finally {
      setIsLoadingEndpoints(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === "logs") {
        fetchLogs();
      } else {
        fetchEndpoints();
      }
    }
  }, [isOpen, activeTab, fetchLogs, fetchEndpoints]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl text-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                System Audit Logs & Endpoints
              </h3>
              <p className="text-xs text-slate-500">
                Postgres-backed audit tracking for pipeline operations & route
                permissions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/40 flex-shrink-0 items-center justify-between">
          <div className="flex space-x-6">
            <button
              type="button"
              onClick={() => setActiveTab("logs")}
              className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 ${
                activeTab === "logs"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Audit Trail Logs ({totalLogs})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("endpoints")}
              className={`py-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 ${
                activeTab === "endpoints"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <Code className="w-4 h-4" />
              <span>API Routes Catalog ({endpoints.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={activeTab === "logs" ? fetchLogs : fetchEndpoints}
            disabled={isLoadingLogs || isLoadingEndpoints}
            className="flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg transition-colors shadow-2xs font-medium"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoadingLogs || isLoadingEndpoints ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!isAuthenticated && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  You are not authenticated. Protected routes like{" "}
                  <code className="font-mono font-bold">/audit/logs</code>{" "}
                  require a valid token with{" "}
                  <code className="font-mono font-bold">[audit_logs]</code>{" "}
                  permission.
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs transition-colors flex-shrink-0 ml-2"
              >
                Sign In
              </button>
            </div>
          )}

          {activeTab === "logs" ? (
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-600 font-semibold">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span>Filters:</span>
                </div>

                {/* Action dropdown */}
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                >
                  <option value="">All Actions</option>
                  <option value="upload_yp">upload_yp</option>
                  <option value="upload_mcp">upload_mcp</option>
                  <option value="run_match">run_match</option>
                  <option value="export_matches">export_matches</option>
                  <option value="compare_evaluation">compare_evaluation</option>
                  <option value="export_evaluation">export_evaluation</option>
                </select>

                {/* Status dropdown */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>

                {/* Actor Email filter */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={actorEmailFilter}
                    onChange={(e) => setActorEmailFilter(e.target.value)}
                    placeholder="Filter by actor email..."
                    className="bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 font-medium w-48"
                  />
                </div>

                {/* Limit dropdown */}
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                >
                  <option value={25}>25 logs</option>
                  <option value={50}>50 logs</option>
                  <option value={100}>100 logs</option>
                  <option value={250}>250 logs</option>
                </select>
              </div>

              {logsError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">{logsError}</p>
                    <p className="text-[11px] text-rose-600">
                      Ensure your user has the <code>audit_logs</code> scope or
                      the database URL is active.
                    </p>
                  </div>
                </div>
              )}

              {/* Logs Table */}
              {isLoadingLogs ? (
                <div className="py-16 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-orange-600 mx-auto" />
                  <p className="text-xs text-slate-500">
                    Querying Postgres audit events...
                  </p>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  No audit log entries matching filters. Run uploads or matches
                  to generate audit events.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Performed by</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">Endpoint</th>
                        <th className="py-2.5 px-3">Client IP</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Metadata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {logs.map((log, idx) => {
                        const isExpanded = expandedLogId === (log.id || idx);
                        const timeStr = log.timestamp || log.created_at || "";
                        const actorInfo = getPerformedBy(log);
                        return (
                          <React.Fragment key={log.id || idx}>
                            <tr
                              onClick={() =>
                                setExpandedLogId(
                                  isExpanded ? null : log.id || idx,
                                )
                              }
                              className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                            >
                              <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                {timeStr
                                  ? new Date(timeStr).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap font-sans">
                                {actorInfo.isFallback ? (
                                  <span className="text-slate-400 italic text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                                    {actorInfo.label}
                                  </span>
                                ) : (
                                  <div className="flex items-center space-x-1.5">
                                    <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                    <span className="font-medium text-slate-800 text-xs">
                                      {actorInfo.label}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded text-[10px]">
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {log.endpoint || "—"}
                              </td>
                              <td className="py-2 px-3 text-slate-500">
                                {log.actor_ip || "127.0.0.1"}
                              </td>
                              <td className="py-2 px-3">
                                {log.status === "error" ? (
                                  <span className="text-rose-700 font-bold">
                                    Failed
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-bold">
                                    OK
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-400">
                                <span className="text-[10px] text-slate-600 underline">
                                  {isExpanded ? "Hide" : "Inspect"}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50/90 font-sans">
                                <td
                                  colSpan={7}
                                  className="p-3 border-t border-slate-200"
                                >
                                  <div className="space-y-1.5 text-xs">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                      Payload Metadata & User Agent
                                    </div>
                                    {log.user_agent && (
                                      <p className="text-slate-600 text-[11px] font-mono">
                                        <strong className="font-sans">
                                          User Agent:
                                        </strong>{" "}
                                        {log.user_agent}
                                      </p>
                                    )}
                                    <pre className="p-2.5 bg-white border border-slate-200 rounded-lg text-[10px] font-mono text-slate-800 overflow-x-auto">
                                      {JSON.stringify(
                                        log.metadata || log,
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* Endpoints Tab */
            <div className="space-y-4">
              {endpointsError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{endpointsError}</span>
                </div>
              )}

              {isLoadingEndpoints ? (
                <div className="py-16 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-orange-600 mx-auto" />
                  <p className="text-xs text-slate-500">
                    Querying GET /endpoints catalog...
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Route Path</th>
                        <th className="py-2.5 px-3">Allowed Methods</th>
                        <th className="py-2.5 px-3">Required Scope</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {endpoints.map((ep, idx) => {
                        let scope = "Public / Authenticated";
                        if (
                          ep.path === "/match/run" ||
                          ep.path === "/match/export"
                        ) {
                          scope = "run_match";
                        } else if (ep.path.startsWith("/evaluation")) {
                          scope = "evaluate";
                        } else if (ep.path.startsWith("/audit")) {
                          scope = "audit_logs";
                        } else if (ep.path === "/endpoints") {
                          scope = "endpoints_list";
                        } else if (ep.path.startsWith("/admin")) {
                          scope = "super-admin";
                        }

                        return (
                          <tr
                            key={idx}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-2 px-3 font-bold text-slate-900">
                              {ep.path}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex gap-1">
                                {ep.methods.map((m) => (
                                  <span
                                    key={m}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      m === "GET"
                                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                                        : m === "POST"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : "bg-amber-50 text-amber-700 border border-amber-200"
                                    }`}
                                  >
                                    {m}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  scope === "Public / Authenticated"
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-orange-50 text-orange-700 border border-orange-200"
                                }`}
                              >
                                {scope}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
