import React from 'react';
import { Network, Settings, RefreshCw, CheckCircle2, AlertTriangle, Activity, Scale, Cpu, Sparkles } from 'lucide-react';

interface HeaderProps {
  backendUrl: string;
  healthStatus: { ok: boolean; statusText: string } | null;
  isCheckingHealth: boolean;
  onOpenSettings: () => void;
  activeView: 'pipeline' | 'evaluation';
  hasMatchResult: boolean;
  hasEvaluationReport?: boolean;
  warningCount?: number;
  onSelectView: (view: 'pipeline' | 'evaluation') => void;
  onToggleWarnings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  backendUrl,
  healthStatus,
  isCheckingHealth,
  onOpenSettings,
  activeView,
  hasMatchResult,
  hasEvaluationReport,
  warningCount = 0,
  onSelectView,
  onToggleWarnings,
}) => {
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
            onClick={() => onSelectView('pipeline')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'pipeline'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Matching</span> Pipeline
          </button>

          {!hasMatchResult ? (
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
              onClick={() => onSelectView('evaluation')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ml-1 ${
                activeView === 'evaluation'
                  ? 'bg-orange-600 text-white shadow-2xs'
                  : 'bg-orange-50 text-orange-800 border border-orange-200/90 hover:bg-orange-100 shadow-2xs'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-orange-600 activeView === 'evaluation' ? 'text-white' : ''" />
              <span>Compare Matches</span>
              {hasEvaluationReport ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Report evaluated" />
              ) : (
                <span className="flex h-2 w-2 relative flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                </span>
              )}
            </button>
          )}
        </div>

        {/* Backend Host, Warnings Badge & Settings Action */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {warningCount > 0 && (
            <button
              type="button"
              onClick={onToggleWarnings}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shadow-2xs animate-pulse"
              title="Click to view health & data warnings console"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>Warnings ({warningCount})</span>
            </button>
          )}

          <button
            onClick={onOpenSettings}
            type="button"
            className={`flex items-center space-x-2 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shadow-2xs ${
              healthStatus?.ok
                ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200 hover:bg-emerald-100/90'
                : 'bg-rose-50/90 text-rose-800 border-rose-200 hover:bg-rose-100/90'
            }`}
          >
            {isCheckingHealth ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
            ) : healthStatus?.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            )}

            <div className="text-left font-mono text-[11px] font-medium hidden sm:block">
              <span className="block truncate max-w-[90px] md:max-w-[160px]">
                {backendUrl}
              </span>
            </div>
            <Settings className="w-3.5 h-3.5 opacity-60 ml-0.5 text-slate-600 hover:opacity-100" />
          </button>
        </div>
      </div>
    </header>
  );
};





