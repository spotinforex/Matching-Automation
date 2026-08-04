import React from 'react';
import { Network, Settings, RefreshCw, Zap, CheckCircle2, AlertTriangle } from 'lucide-react';

interface HeaderProps {
  backendUrl: string;
  isMockMode: boolean;
  healthStatus: { ok: boolean; statusText: string } | null;
  isCheckingHealth: boolean;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  backendUrl,
  isMockMode,
  healthStatus,
  isCheckingHealth,
  onOpenSettings,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Title */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-xs">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-base text-slate-900 tracking-tight">YP to MCP Automation</h1>
              <span className="text-[10px] uppercase tracking-wider font-semibold bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-md">
                Pipeline v2.4
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Geocoding, Landmark Centroiding & Multi-Round Travel Time Matching
            </p>
          </div>
        </div>

        {/* Backend & Actions */}
        <div className="flex items-center space-x-3">
          {/* Connection Status Badge */}
          <button
            onClick={onOpenSettings}
            className={`flex items-center space-x-2 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              isMockMode
                ? 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100/80'
                : healthStatus?.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80'
                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/80'
            }`}
          >
            {isCheckingHealth ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
            ) : isMockMode ? (
              <Zap className="w-3.5 h-3.5 text-orange-600" />
            ) : healthStatus?.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            )}

            <div className="text-left font-medium">
              <span className="block truncate max-w-[140px] sm:max-w-[200px]">
                {isMockMode ? 'Simulation Mode' : backendUrl}
              </span>
            </div>
            <Settings className="w-3.5 h-3.5 opacity-60 ml-1" />
          </button>
        </div>
      </div>
    </header>
  );
};


