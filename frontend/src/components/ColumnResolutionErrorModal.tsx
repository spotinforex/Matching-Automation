import React, { useState } from 'react';
import { ParsedColumnError } from '../utils/columnErrorParser';
import {
  AlertTriangle,
  X,
  Search,
  Check,
  Copy,
  FileSpreadsheet,
  HelpCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ColumnResolutionErrorModalProps {
  isOpen: boolean;
  error: ParsedColumnError | null;
  rawErrorText: string | null;
  onClose: () => void;
}

export const ColumnResolutionErrorModal: React.FC<ColumnResolutionErrorModalProps> = ({
  isOpen,
  error,
  rawErrorText,
  onClose,
}) => {
  const [headerSearch, setHeaderSearch] = useState<string>('');
  const [copiedHeader, setCopiedHeader] = useState<string | null>(null);
  const [showRawDetails, setShowRawDetails] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopyHeader = (header: string) => {
    navigator.clipboard.writeText(header);
    setCopiedHeader(header);
    setTimeout(() => setCopiedHeader(null), 2000);
  };

  const filteredHeaders = error
    ? error.actualHeaders.filter(h => h.toLowerCase().includes(headerSearch.toLowerCase()))
    : [];

  const getMethodBadge = (method: string, confidence: number) => {
    switch (method) {
      case 'configured':
      case 'alias':
      case 'cache':
      case 'exact':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {method.toUpperCase()} ({(confidence * 100).toFixed(0)}%)
          </span>
        );
      case 'fuzzy':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            UNCONFIRMED FUZZY ({(confidence * 100).toFixed(0)}%)
          </span>
        );
      case 'none':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            NOT FOUND
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-rose-900 text-white flex items-center justify-between border-b border-rose-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-800/90 text-rose-200 rounded-xl border border-rose-700/60">
              <AlertTriangle className="w-6 h-6 text-rose-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-white">Column Resolution & Header Verification Alert</h3>
                <span className="bg-rose-800 text-rose-200 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded">
                  Data Safety Guard
                </span>
              </div>
              <p className="text-xs text-rose-200/90">
                {error?.fileSource || 'Excel Data Ingestion Verification Error'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-rose-300 hover:text-white p-1 rounded-lg hover:bg-rose-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 text-xs">
          {/* Main Context Explanation */}
          <div className="p-4 bg-amber-50 border border-amber-200/90 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 font-bold text-amber-900 text-xs uppercase tracking-wide">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>Required Columns Unconfirmed or Missing</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              To guarantee zero data corruption or misaligned participant IDs during matching, required canonical fields (<strong>id, name, address, landmark, trade</strong>) are never automatically trusted from a fuzzy match alone.
            </p>
            {error && error.requiredColumns.length > 0 && (
              <div className="flex items-center space-x-2 pt-1">
                <span className="font-semibold text-amber-900">Flagged Fields:</span>
                <div className="flex flex-wrap gap-1.5">
                  {error.requiredColumns.map(col => (
                    <span
                      key={col}
                      className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[11px]"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resolution Attempt Table */}
          {error && error.resolutionAttempt.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-orange-600" />
                  <span>Column Resolution Inspection Matrix ({error.resolutionAttempt.length} fields)</span>
                </h4>
                <span className="text-[11px] text-slate-500">Confidence threshold = 1.0 (or alias hit)</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Canonical Field</th>
                      <th className="py-2.5 px-3">Matched Excel Column Header</th>
                      <th className="py-2.5 px-3">Resolution Method</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {error.resolutionAttempt.map((res, idx) => {
                      const isRequired = error.requiredColumns.includes(res.field);
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isRequired ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold font-sans">
                            <span className="text-slate-900">{res.field}</span>
                            {isRequired && (
                              <span className="ml-1.5 px-1.5 py-0.2 bg-rose-100 text-rose-800 text-[9px] font-bold rounded">
                                REQUIRED
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {res.column ? (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 border border-slate-200">
                                {res.column}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">None (Unmapped)</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-sans">
                            {getMethodBadge(res.method, res.confidence)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-sans">
                            {res.method === 'configured' || res.method === 'alias' || res.method === 'cache' ? (
                              <span className="text-emerald-700 font-bold text-[10px]">Verified</span>
                            ) : res.method === 'fuzzy' ? (
                              <span className="text-amber-700 font-bold text-[10px]">Needs Confirmation</span>
                            ) : (
                              <span className="text-rose-600 font-bold text-[10px]">Missing</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actual Headers in Uploaded Excel File */}
          {error && error.actualHeaders.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-orange-600" />
                    <span>Headers Detected in Uploaded Excel File ({error.actualHeaders.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Click any header to copy its exact name for your configuration or spreadsheet editing.
                  </p>
                </div>

                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={headerSearch}
                    onChange={(e) => setHeaderSearch(e.target.value)}
                    placeholder="Search Excel headers..."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-1.5 font-mono text-[11px]">
                {filteredHeaders.length === 0 ? (
                  <span className="text-slate-400 italic text-xs font-sans py-2">No matching headers found.</span>
                ) : (
                  filteredHeaders.map((header) => (
                    <button
                      key={header}
                      type="button"
                      onClick={() => handleCopyHeader(header)}
                      className="group flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-slate-800 transition-all shadow-2xs"
                      title="Click to copy exact header text"
                    >
                      <span className="truncate max-w-[220px]">{header}</span>
                      {copiedHeader === header ? (
                        <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400 group-hover:text-orange-600 flex-shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Actionable Guidance Steps */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <h5 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
              <HelpCircle className="w-4 h-4 text-orange-600" />
              <span>How to Resolve Column Mapping Issues</span>
            </h5>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 text-xs pl-1">
              <li>
                <strong>Option A (Recommended):</strong> Rename column headers in your Excel spreadsheet to match standard aliases (e.g. <code>YP CODE</code> → <code>id</code>, <code>Which_cluster...</code> → <code>landmark</code>).
              </li>
              <li>
                <strong>Option B:</strong> Add the exact column header names from above into <code>configs/column_config.json</code> under <code>yp_columns</code> or <code>mcp_columns</code> on the server.
              </li>
              <li>
                Re-upload your spreadsheet after saving changes.
              </li>
            </ol>
          </div>

          {/* Collapsible Raw Error Text */}
          <div className="border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setShowRawDetails(!showRawDetails)}
              className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              {showRawDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showRawDetails ? 'Hide raw backend exception details' : 'Show raw backend exception details'}</span>
            </button>

            {showRawDetails && (
              <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-40 border border-slate-800">
                {error?.rawMessage || rawErrorText}
              </pre>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Strict resolution protects against unintended participant record dropping
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
