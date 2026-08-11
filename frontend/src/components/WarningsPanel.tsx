import React, { useState } from 'react';
import { AppWarning } from '../types';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface WarningsPanelProps {
  warnings: AppWarning[];
  onDismissWarning: (id: string) => void;
  onClearAllWarnings: () => void;
}

export const WarningsPanel: React.FC<WarningsPanelProps> = ({
  warnings,
  onDismissWarning,
  onClearAllWarnings,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  if (!warnings || warnings.length === 0) return null;

  const toggleDetails = (id: string) => {
    setExpandedDetails(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredWarnings = warnings.filter(w => {
    if (selectedCategory !== 'all' && w.category !== selectedCategory) return false;
    if (selectedSeverity !== 'all' && w.severity !== selectedSeverity) return false;
    return true;
  });

  const highSeverityCount = warnings.filter(w => w.severity === 'high').length;
  const mediumSeverityCount = warnings.filter(w => w.severity === 'medium').length;

  const handleCopySummary = () => {
    const text = warnings
      .map(
        (w, i) =>
          `[${i + 1}] [${w.severity.toUpperCase()}] [${w.source}/${w.category || 'general'}] ${w.title}: ${w.message}${
            w.details ? `\n   Details: ${w.details}` : ''
          }`
      )
      .join('\n\n');

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const getSeverityBadge = (severity: AppWarning['severity']) => {
    switch (severity) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            HIGH PRIORITY
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            MEDIUM
          </span>
        );
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Info className="w-3 h-3 text-blue-600" />
            NOTICE
          </span>
        );
    }
  };

  return (
    <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-5 shadow-xs transition-all space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs flex-shrink-0 animate-pulse">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-amber-950 tracking-tight">
                System & Data Health Warnings Console
              </h3>
              <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full font-bold text-[11px]">
                {warnings.length} Active {warnings.length === 1 ? 'Warning' : 'Warnings'}
              </span>
            </div>
            <p className="text-xs text-amber-800/90">
              {highSeverityCount > 0
                ? `${highSeverityCount} high severity issue(s) require attention for optimal matching accuracy.`
                : `${mediumSeverityCount} data quality notice(s) detected during ingestion/execution.`}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopySummary}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
            title="Copy all warnings to clipboard"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-700" />}
            <span>{copiedAll ? 'Copied' : 'Copy Log'}</span>
          </button>

          <button
            type="button"
            onClick={onClearAllWarnings}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 hover:border-rose-300 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Clear All</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 bg-white hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-colors"
            title={isCollapsed ? 'Expand Warnings' : 'Collapse Warnings'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-amber-900 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5 text-amber-700" />
                Category:
              </span>
              {['all', 'columns', 'geographic', 'capacity', 'duplicates', 'general'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    selectedCategory === cat
                      ? 'bg-amber-900 text-white shadow-2xs'
                      : 'bg-white/80 text-amber-800 border border-amber-200 hover:bg-white'
                  }`}
                >
                  {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-1 text-[11px]">
              <span className="font-semibold text-amber-800">Severity:</span>
              <select
                value={selectedSeverity}
                onChange={e => setSelectedSeverity(e.target.value)}
                className="bg-white border border-amber-300 rounded-md px-2 py-0.5 text-amber-900 font-semibold focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="high">High Only</option>
                <option value="medium">Medium Only</option>
                <option value="info">Info Only</option>
              </select>
            </div>
          </div>

          {/* Warnings List */}
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {filteredWarnings.length === 0 ? (
              <div className="p-4 text-center bg-white/60 rounded-xl border border-amber-200 text-amber-800 italic text-xs">
                No warnings match the active category filter.
              </div>
            ) : (
              filteredWarnings.map(warning => (
                <div
                  key={warning.id}
                  className={`p-3.5 rounded-xl border bg-white shadow-2xs transition-all space-y-2 ${
                    warning.severity === 'high'
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : warning.severity === 'medium'
                      ? 'border-amber-300'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getSeverityBadge(warning.severity)}
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] font-bold rounded border border-slate-200">
                          {warning.source.toUpperCase()}
                        </span>
                        {warning.category && (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-800 text-[10px] font-semibold rounded border border-orange-200">
                            #{warning.category}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">{warning.timestamp}</span>
                      </div>

                      <h4 className="font-bold text-slate-900 text-xs tracking-tight">{warning.title}</h4>
                      <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-wrap">
                        {warning.message}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDismissWarning(warning.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
                      title="Dismiss warning"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expandable Technical Details */}
                  {warning.details && (
                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleDetails(warning.id)}
                        className="flex items-center space-x-1 text-[10px] font-semibold text-amber-800 hover:text-amber-950"
                      >
                        {expandedDetails[warning.id] ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        <span>
                          {expandedDetails[warning.id] ? 'Hide technical logs & context' : 'View technical details'}
                        </span>
                      </button>

                      {expandedDetails[warning.id] && (
                        <pre className="mt-2 p-2.5 bg-slate-900 text-amber-200 text-[10px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap border border-slate-800">
                          {warning.details}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
