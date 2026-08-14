import React, { useState } from 'react';
import { X, Server, CheckCircle2, AlertCircle, RefreshCw, Code, Globe } from 'lucide-react';
import { DEFAULT_BACKEND_URL } from '../services/api';

interface BackendSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  healthStatus: { ok: boolean; statusText: string } | null;
  onSaveUrl: (url: string) => void;
  onCheckHealth: () => void;
  isCheckingHealth: boolean;
}

export const BackendSettingsModal: React.FC<BackendSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUrl,
  healthStatus,
  onSaveUrl,
  onCheckHealth,
  isCheckingHealth,
}) => {
  const [urlInput, setUrlInput] = useState(currentUrl);

  if (!isOpen) return null;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveUrl(urlInput);
    onCheckHealth();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl text-slate-800 shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-md">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Backend FastAPI Connection Settings</h3>
              <p className="text-xs text-slate-500">Configure matching pipeline backend host & endpoints</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-x-0 space-y-6">
          {/* Backend URL Input Form */}
          <form onSubmit={handleApply} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
              FastAPI Host Base URL
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setUrlInput(DEFAULT_BACKEND_URL);
                  onSaveUrl(DEFAULT_BACKEND_URL);
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg transition-colors"
              >
                Reset Default
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs"
              >
                Apply Host
              </button>
            </div>
          </form>

          {/* Health Status Box */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Endpoint Health Status</span>
              <button
                onClick={onCheckHealth}
                disabled={isCheckingHealth}
                className="flex items-center space-x-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                <span>Ping GET /health</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 text-sm">
              {healthStatus?.ok ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-emerald-800 text-xs font-semibold">{healthStatus.statusText}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span className="text-rose-800 text-xs font-semibold">
                    {healthStatus?.statusText || 'Not verified'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* FastAPI Endpoints Shape Reference */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Code className="w-3.5 h-3.5 text-indigo-600" />
              <span>Registered Endpoints Reference</span>
            </div>
            <div className="space-y-1.5 font-mono text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-emerald-700 font-bold">POST /upload/yp</span>
                <span className="text-slate-500">Multipart .xlsx → &#123;"loaded": number&#125;</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-700 font-bold">POST /upload/mcp</span>
                <span className="text-slate-500">Multipart .xlsx → &#123;"loaded": number&#125;</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-700 font-bold">POST /match/run</span>
                <span className="text-slate-500">?HOP_LIMIT=10&MATCH_CAP=...&SHORTLIST_SIZE=10</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-700 font-bold">GET /match/export</span>
                <span className="text-slate-500">Download formatted .xlsx workbook</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-700 font-bold">POST /evaluation/compare</span>
                <span className="text-slate-500">Compare manual match → drift report JSON</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-700 font-bold">GET /evaluation/export</span>
                <span className="text-slate-500">Download evaluation report .xlsx</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-700 font-bold">GET /health</span>
                <span className="text-slate-500">Liveness check → &#123;"status": "ok"&#125;</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg transition-colors"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};

