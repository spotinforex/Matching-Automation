import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, Play, Sliders, AlertCircle, RefreshCw, Database } from 'lucide-react';

interface FileUploadSectionProps {
  ypLoadedCount: number | null;
  mcpLoadedCount: number | null;
  ypFileName: string | null;
  mcpFileName: string | null;
  isUploadingYp: boolean;
  isUploadingMcp: boolean;
  isMatching: boolean;
  hopLimit: number;
  onHopLimitChange: (limit: number) => void;
  matchCap: number | null;
  onMatchCapChange: (cap: number | null) => void;
  shortlistSize: number;
  onShortlistSizeChange: (size: number) => void;
  onUploadYP: (file: File) => void;
  onUploadMCP: (file: File) => void;
  onRunMatch: () => void;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  ypLoadedCount,
  mcpLoadedCount,
  ypFileName,
  mcpFileName,
  isUploadingYp,
  isUploadingMcp,
  isMatching,
  hopLimit,
  onHopLimitChange,
  matchCap,
  onMatchCapChange,
  shortlistSize,
  onShortlistSizeChange,
  onUploadYP,
  onUploadMCP,
  onRunMatch,
}) => {
  const ypInputRef = useRef<HTMLInputElement>(null);
  const mcpInputRef = useRef<HTMLInputElement>(null);

  const [ypDragOver, setYpDragOver] = useState(false);
  const [mcpDragOver, setMcpDragOver] = useState(false);

  const handleYpDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setYpDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadYP(e.dataTransfer.files[0]);
    }
  };

  const handleMcpDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setMcpDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadMCP(e.dataTransfer.files[0]);
    }
  };

  const canRunMatch = (ypLoadedCount !== null && ypLoadedCount > 0) && (mcpLoadedCount !== null && mcpLoadedCount > 0);

  return (
    <section className="space-y-6">
      {/* Upload Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* YP Upload Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-orange-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
                <FileSpreadsheet className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">YP Source Excel Data</h3>
                <p className="text-xs text-slate-500">Youth Participant records (.xlsx)</p>
              </div>
            </div>

            {ypLoadedCount !== null && ypLoadedCount > 0 && (
              <span className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                <CheckCircle className="w-3.5 h-3.5 text-orange-600" />
                <span>{ypLoadedCount.toLocaleString()} Loaded</span>
              </span>
            )}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setYpDragOver(true); }}
            onDragLeave={() => setYpDragOver(false)}
            onDrop={handleYpDrop}
            onClick={() => ypInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[130px] ${
              ypDragOver
                ? 'border-orange-500 bg-orange-50/60'
                : ypLoadedCount !== null && ypLoadedCount > 0
                ? 'border-orange-300 bg-orange-50/20 hover:border-orange-400'
                : 'border-slate-200 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/30'
            }`}
          >
            <input
              type="file"
              ref={ypInputRef}
              onChange={(e) => e.target.files?.[0] && onUploadYP(e.target.files[0])}
              accept=".xlsx,.xls"
              className="hidden"
            />

            {isUploadingYp ? (
              <div className="flex flex-col items-center space-y-2 py-2">
                <RefreshCw className="w-6 h-6 text-orange-600 animate-spin" />
                <span className="text-xs text-orange-700 font-medium">Parsing YP Excel File...</span>
              </div>
            ) : ypFileName ? (
              <div className="flex flex-col items-center space-y-1">
                <div className="text-sm font-medium text-slate-800 truncate max-w-[280px]">
                  {ypFileName}
                </div>
                {ypLoadedCount !== null && ypLoadedCount > 0 && (
                  <span className="text-xs text-orange-700 font-medium">
                    {ypLoadedCount} YP records registered
                  </span>
                )}
                <span className="text-[11px] text-slate-400 underline pt-1">Click or drag to replace</span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-orange-600 transition-colors" />
                <div className="text-xs text-slate-600 font-medium">
                  Drag & drop YP `.xlsx` or <span className="text-orange-600 underline">browse</span>
                </div>
                <span className="text-[11px] text-slate-400">POST /upload/yp (loads into memory)</span>
              </div>
            )}
          </div>
        </div>

        {/* MCP Upload Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-orange-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
                <Database className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">MCP Source Excel Data</h3>
                <p className="text-xs text-slate-500">Master Center Points (.xlsx)</p>
              </div>
            </div>

            {mcpLoadedCount !== null && mcpLoadedCount > 0 && (
              <span className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                <CheckCircle className="w-3.5 h-3.5 text-orange-600" />
                <span>{mcpLoadedCount.toLocaleString()} Loaded</span>
              </span>
            )}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setMcpDragOver(true); }}
            onDragLeave={() => setMcpDragOver(false)}
            onDrop={handleMcpDrop}
            onClick={() => mcpInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[130px] ${
              mcpDragOver
                ? 'border-orange-500 bg-orange-50/60'
                : mcpLoadedCount !== null && mcpLoadedCount > 0
                ? 'border-orange-300 bg-orange-50/20 hover:border-orange-400'
                : 'border-slate-200 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/30'
            }`}
          >
            <input
              type="file"
              ref={mcpInputRef}
              onChange={(e) => e.target.files?.[0] && onUploadMCP(e.target.files[0])}
              accept=".xlsx,.xls"
              className="hidden"
            />

            {isUploadingMcp ? (
              <div className="flex flex-col items-center space-y-2 py-2">
                <RefreshCw className="w-6 h-6 text-orange-600 animate-spin" />
                <span className="text-xs text-orange-700 font-medium">Parsing MCP Excel File...</span>
              </div>
            ) : mcpFileName ? (
              <div className="flex flex-col items-center space-y-1">
                <div className="text-sm font-medium text-slate-800 truncate max-w-[280px]">
                  {mcpFileName}
                </div>
                {mcpLoadedCount !== null && mcpLoadedCount > 0 && (
                  <span className="text-xs text-orange-700 font-medium">
                    {mcpLoadedCount} MCP centers registered
                  </span>
                )}
                <span className="text-[11px] text-slate-400 underline pt-1">Click or drag to replace</span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-orange-600 transition-colors" />
                <div className="text-xs text-slate-600 font-medium">
                  Drag & drop MCP `.xlsx` or <span className="text-orange-600 underline">browse</span>
                </div>
                <span className="text-[11px] text-slate-400">POST /upload/mcp (loads into memory)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Matching Controls & Execution Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-orange-50 rounded-lg text-orange-700 border border-orange-200">
              <Sliders className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Algorithm Tuning Parameters</h4>
              <p className="text-[11px] text-slate-500">Configure parameters passed to POST /match/run</p>
            </div>
          </div>
          {!canRunMatch && (
            <div className="hidden lg:flex items-center space-x-1.5 text-xs text-orange-800 bg-orange-50 border border-orange-200 px-3 py-1 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
              <span>Upload YP & MCP files to execute</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Hop Limit Parameter */}
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Hop Limit <span className="text-orange-600">({hopLimit} rounds)</span>
              </label>
            </div>
            <p className="text-[10px] text-slate-500">Fallback landmark search depth</p>
            <div className="flex items-center space-x-1 bg-white p-1 rounded-md border border-slate-200 pt-1">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onHopLimitChange(lvl)}
                  className={`flex-1 h-7 text-xs font-medium rounded transition-all ${
                    hopLimit === lvl
                      ? 'bg-orange-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Match Cap Parameter */}
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Match Cap <span className="text-slate-400 font-normal">(MATCH_CAP)</span>
              </label>
              {matchCap !== null && (
                <button
                  type="button"
                  onClick={() => onMatchCapChange(null)}
                  className="text-[10px] text-orange-600 hover:underline font-medium"
                >
                  Clear (Uncapped)
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500">
              Max YPs to match {ypLoadedCount ? `(max ${ypLoadedCount})` : ''}
            </p>
            <input
              type="number"
              min="1"
              max={ypLoadedCount || undefined}
              placeholder={ypLoadedCount ? `No limit (all ${ypLoadedCount})` : 'Optional cap (e.g. 100)'}
              value={matchCap ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  onMatchCapChange(null);
                } else {
                  const parsed = parseInt(val, 10);
                  if (!isNaN(parsed) && parsed > 0) {
                    if (ypLoadedCount && parsed > ypLoadedCount) {
                      onMatchCapChange(ypLoadedCount);
                    } else {
                      onMatchCapChange(parsed);
                    }
                  }
                }
              }}
              className="w-full bg-white border border-slate-200 focus:border-orange-500 rounded-md px-2.5 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 h-8"
            />
          </div>

          {/* Shortlist Size Parameter */}
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Round 2 Shortlist <span className="text-orange-600">({shortlistSize})</span>
              </label>
              <span className="text-[10px] text-slate-400">1 - 20 max</span>
            </div>
            <p className="text-[10px] text-slate-500">MCP candidates shortlisted in round 2</p>
            <div className="flex items-center space-x-2 pt-0.5">
              <input
                type="range"
                min="1"
                max="20"
                value={shortlistSize}
                onChange={(e) => onShortlistSizeChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
              />
              <input
                type="number"
                min="1"
                max="20"
                value={shortlistSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    onShortlistSizeChange(Math.min(20, Math.max(1, val)));
                  }
                }}
                className="w-14 bg-white border border-slate-200 rounded-md px-2 py-0.5 text-xs text-center text-slate-900 focus:outline-none focus:border-orange-500 h-8 font-mono font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Action Button Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onRunMatch}
            disabled={isMatching || !canRunMatch}
            className={`w-full md:w-auto flex items-center justify-center space-x-2 px-8 py-2.5 rounded-lg font-semibold text-xs transition-all shadow-xs ${
              isMatching
                ? 'bg-orange-500 text-white cursor-wait opacity-90'
                : canRunMatch
                ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-xs transform active:scale-98'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {isMatching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Running Match Pipeline (POST /match/run)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-white" />
                <span>Run Match Engine</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};


