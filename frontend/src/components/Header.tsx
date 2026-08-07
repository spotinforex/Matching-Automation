import React from 'react';
import { Network, Settings, RefreshCw, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';

interface HeaderProps {
  backendUrl: string;
  healthStatus: { ok: boolean; statusText: string } | null;
  isCheckingHealth: boolean;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  backendUrl,
  healthStatus,
  isCheckingHealth,
  onOpenSettings,
}) => {
  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 text-slate-900 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
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
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-orange-50 text-orange-700 border border-orange-200/80 px-2 py-0.5 rounded-md flex-shrink-0">
                <Activity className="w-3 h-3 text-orange-500" />
                Pipeline v2.4
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate hidden md:block">
              Geocoding, Landmark Centroiding & Multi-Round Travel Time Matching Engine
            </p>
          </div>
        </div>

        {/* Backend Host & Settings Action */}
        <div className="flex items-center space-x-3 flex-shrink-0">
          <button
            onClick={onOpenSettings}
            type="button"
            className={`flex items-center space-x-2 text-xs px-3 py-1.5 rounded-lg border transition-all shadow-2xs ${
              healthStatus?.ok
                ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200 hover:bg-emerald-100/90 hover:border-emerald-300'
                : 'bg-rose-50/90 text-rose-800 border-rose-200 hover:bg-rose-100/90 hover:border-rose-300'
            }`}
          >
            {isCheckingHealth ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
            ) : healthStatus?.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            )}

            <div className="text-left font-mono text-[11px] font-medium">
              <span className="block truncate max-w-[110px] sm:max-w-[180px] md:max-w-[220px]">
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




