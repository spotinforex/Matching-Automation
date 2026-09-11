import React from "react";
import {
  Network,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Scale,
  Cpu,
  User,
  LogIn,
  Database,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { AuthUser } from "../types";
import { canAccessEvaluate, canAccessAudit, isSuperAdmin } from "../utils/auth";

interface HeaderProps {
  healthStatus: { ok: boolean; statusText: string } | null;
  isCheckingHealth: boolean;
  onCheckHealth?: () => void;
  activeView: "pipeline" | "evaluation" | "admin";
  hasMatchResult: boolean;
  hasEvaluationReport?: boolean;
  warningCount?: number;
  onSelectView: (view: "pipeline" | "evaluation" | "admin") => void;
  onToggleWarnings?: () => void;
  user: AuthUser | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenAuditLogs: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  healthStatus,
  isCheckingHealth,
  onCheckHealth,
  activeView,
  hasMatchResult,
  hasEvaluationReport,
  warningCount = 0,
  onSelectView,
  onToggleWarnings,
  user,
  onOpenAuth,
  onOpenProfile,
  onOpenAuditLogs,
  onLogout,
}) => {
  const hasEvaluateAccess = canAccessEvaluate(user);
  const hasAuditAccess = canAccessAudit(user);
  const hasAdminAccess = isSuperAdmin(user);

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 text-slate-900 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand & Title */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm ring-1 ring-orange-400/30 flex-shrink-0">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                YP to MCP Automation
              </h1>
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-orange-50 text-orange-700 border border-orange-200/80 px-2 py-0.5 rounded-md flex-shrink-0">
                <Activity className="w-3 h-3 text-orange-500" />
                v2.4
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate hidden lg:block">
              Geocoding, Landmark Centroiding & Travel Time Matching
            </p>
          </div>
        </div>

        {/* View Switcher Navigation Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => onSelectView("pipeline")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === "pipeline"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Matching</span> Pipeline
          </button>

          {/* Evaluate Navigation Tab - Strictly for assigned 'evaluate' role or Super Admin */}
          {hasEvaluateAccess &&
            (!hasMatchResult ? (
              <button
                type="button"
                disabled
                title="Run automated matching engine first to enable evaluation"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200/60 cursor-not-allowed opacity-70 ml-1"
              >
                <Scale className="w-3.5 h-3.5 text-slate-400" />
                <span>Evaluate</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectView("evaluation")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ml-1 ${
                  activeView === "evaluation"
                    ? "bg-orange-600 text-white shadow-2xs"
                    : "bg-orange-50 text-orange-800 border border-orange-200/90 hover:bg-orange-100 shadow-2xs"
                }`}
              >
                <Scale className="w-3.5 h-3.5 text-orange-600 activeView === 'evaluation' ? 'text-white' : ''" />
                <span>Compare Matches</span>
                {hasEvaluationReport ? (
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"
                    title="Report evaluated"
                  />
                ) : (
                  <span className="flex h-2 w-2 relative flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                  </span>
                )}
              </button>
            ))}

          {/* Audit Logs button - Strictly for assigned 'audit_logs' role or Super Admin */}
          {hasAuditAccess && (
            <button
              type="button"
              onClick={onOpenAuditLogs}
              className="flex items-center space-x-1 px-2.5 py-1.5 ml-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Inspect audit trail and registered endpoints"
            >
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Audit Trail</span>
            </button>
          )}

          {/* Admin Route - STRICTLY FOR SUPER ADMIN ONLY */}
          {hasAdminAccess && (
            <button
              type="button"
              onClick={() => onSelectView("admin")}
              className={`flex items-center space-x-1 px-2.5 py-1.5 ml-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeView === "admin"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200"
              }`}
              title="Manage users and roles (/admin - Super Admin only)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
              <span>Admin</span>
              <span className="text-[9px] uppercase tracking-wider font-bold bg-orange-200/80 text-orange-900 px-1 rounded ml-0.5">
                Super
              </span>
            </button>
          )}
        </div>

        {/* Backend Host, Auth Status, Warnings Badge & Settings Action */}
        <div className="flex items-center space-x-2 sm:space-x-2.5 flex-shrink-0">
          {/* User Auth Badge & Logout */}
          {user && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 transition-colors"
                title="Click to view permissions & change password"
              >
                <div className="w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center uppercase">
                  {(user.username || user.email || "U")[0]}
                </div>
                <span className="max-w-[80px] truncate hidden sm:inline">
                  {user.username || user.email || "User"}
                </span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 ml-0.5" />
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {warningCount > 0 && (
            <button
              type="button"
              onClick={onToggleWarnings}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shadow-2xs animate-pulse"
              title="Click to view health & data warnings console"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden sm:inline">Warnings</span> ({warningCount}
              )
            </button>
          )}

          <button
            type="button"
            onClick={onCheckHealth}
            disabled={isCheckingHealth}
            className={`flex items-center space-x-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shadow-2xs ${
              healthStatus?.ok
                ? "bg-emerald-50/90 text-emerald-800 border-emerald-200 hover:bg-emerald-100/90"
                : "bg-rose-50/90 text-rose-800 border-rose-200 hover:bg-rose-100/90"
            }`}
            title={
              healthStatus?.ok
                ? "Backend operational (click to refresh status)"
                : "Backend connection issue (click to refresh)"
            }
          >
            {isCheckingHealth ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
            ) : healthStatus?.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            )}
            <span className="text-[11px] font-medium hidden sm:inline">
              {healthStatus?.ok ? "Connected" : "Offline"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
