import React, { useState, useEffect } from 'react';
import { EvaluationReport, EvaluationCriteriaConfig, EvaluationRow, SpecializationBreakdownItem } from '../types';
import {
  FileSpreadsheet,
  Upload,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
  Layers,
  MapPin,
  RefreshCw,
  Scale,
  X,
  Info,
  BarChart3,
} from 'lucide-react';

interface EvaluationSectionProps {
  report: EvaluationReport | null;
  hasLastResult: boolean;
  isEvaluating: boolean;
  isExportingEval: boolean;
  storedManualFile?: File | null;
  onCompare: (manualFile: File, configJson?: string) => void;
  onExportEval: () => void;
}

export const EvaluationSection: React.FC<EvaluationSectionProps> = ({
  report,
  hasLastResult,
  isEvaluating,
  isExportingEval,
  storedManualFile,
  onCompare,
  onExportEval,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Active file resolved from local drop or parent state
  const activeFile = selectedFile || storedManualFile || null;

  // Criteria config controls
  const [distanceTolerance, setDistanceTolerance] = useState<number>(1.0);
  const [pwdThreshold, setPwdThreshold] = useState<number>(3.0);

  // Reset page when new report arrives
  useEffect(() => {
    if (report) {
      setCurrentPage(1);
    }
  }, [report]);

  // Rows table state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [verdictFilter, setVerdictFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 10;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleRunComparison = () => {
    if (!activeFile) return;

    const configObj: EvaluationCriteriaConfig = {
      distance_tolerance_km: distanceTolerance,
      pwd_proximity_threshold_km: pwdThreshold,
    };

    onCompare(activeFile, JSON.stringify(configObj));
  };

  // Filter evaluation rows
  const filteredRows = report ? report.rows.filter((row) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      searchTerm === '' ||
      row.yp_id.toLowerCase().includes(term) ||
      (row.manual_mcp_id && row.manual_mcp_id.toLowerCase().includes(term)) ||
      (row.automated_mcp_id && row.automated_mcp_id.toLowerCase().includes(term)) ||
      (row.yp_skill && row.yp_skill.toLowerCase().includes(term)) ||
      (row.manual_mcp_skill && row.manual_mcp_skill.toLowerCase().includes(term)) ||
      (row.automated_mcp_skill && row.automated_mcp_skill.toLowerCase().includes(term)) ||
      (row.manual_specialization_class && row.manual_specialization_class.toLowerCase().includes(term)) ||
      (row.automated_specialization_class && row.automated_specialization_class.toLowerCase().includes(term)) ||
      (row.verdict && row.verdict.toLowerCase().includes(term));

    const matchesVerdict =
      verdictFilter === 'ALL' ||
      (verdictFilter === 'EXACT_MATCH' && (row.verdict === 'EXACT_MATCH' || row.exact_match)) ||
      (verdictFilter === 'EQUIVALENT_MATCH' && row.verdict === 'EQUIVALENT_MATCH') ||
      (verdictFilter === 'DIVERGENT_MATCH' && row.verdict === 'DIVERGENT_MATCH');

    return matchesSearch && matchesVerdict;
  }) : [];

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
  const paginatedRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'EXACT_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Exact Match
          </span>
        );
      case 'EQUIVALENT_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Zap className="w-3 h-3 text-blue-600" /> Equivalent Match
          </span>
        );
      case 'DIVERGENT_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertTriangle className="w-3 h-3 text-rose-600" /> Divergent Match
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {verdict}
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl border border-orange-200/80 shadow-2xs">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Manual Match Evaluation & Algorithm Drift Comparison
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-md">
                POST /evaluation/compare
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Audit automated pipeline matches against a manual benchmark Excel workbook to measure drift & criterion compliance.
            </p>
          </div>
        </div>

        {/* Action Button if report exists */}
        {report && (
          <button
            type="button"
            onClick={onExportEval}
            disabled={isExportingEval}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50 flex-shrink-0"
            title="Download Evaluation Workbook via GET /evaluation/export"
          >
            {isExportingEval ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-orange-400" />
            )}
            <span>{isExportingEval ? 'Exporting...' : 'Export Evaluation Workbook (.xlsx)'}</span>
          </button>
        )}
      </div>

      {!hasLastResult && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-3 text-amber-800 text-xs font-medium">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span>
            No automated match run found yet. Please click <strong>"Execute Matching Engine"</strong> above to generate an automated match run before performing an evaluation comparison.
          </span>
        </div>
      )}

      {/* Upload & Options Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* File Dropzone */}
        <div className="lg:col-span-2 space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
            <span>Manual Match Reference Workbook (.xlsx)</span>
            {activeFile && (
              <span className="text-[11px] font-normal text-slate-500 font-mono">{activeFile.name}</span>
            )}
          </label>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center space-y-2 relative ${
              isDragging
                ? 'border-orange-500 bg-orange-50/50'
                : activeFile
                ? 'border-emerald-300 bg-emerald-50/30'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className={`p-2.5 rounded-full ${activeFile ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
              {activeFile ? <FileSpreadsheet className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
            </div>

            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-800">
                {activeFile ? activeFile.name : 'Click to select or drag & drop Manual Match sheet'}
              </p>
              <p className="text-[11px] text-slate-500">
                {activeFile
                  ? `${(activeFile.size / 1024).toFixed(1)} KB — Ready for evaluation comparison`
                  : 'Supports Excel file containing YP and Manual MCP pairs'}
              </p>
            </div>
          </div>
        </div>

        {/* Criteria Config Box */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-orange-600" />
                Criteria Parameters
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="text-[11px] text-orange-600 hover:underline font-medium"
              >
                {showConfig ? 'Hide Details' : 'Configure'}
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Distance Tolerance:</span>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={distanceTolerance}
                    onChange={(e) => setDistanceTolerance(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono font-semibold"
                  />
                  <span className="text-[10px] text-slate-500">km</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">PWD Proximity Max:</span>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={pwdThreshold}
                    onChange={(e) => setPwdThreshold(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono font-semibold"
                  />
                  <span className="text-[10px] text-slate-500">km</span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunComparison}
            disabled={!activeFile || !hasLastResult || isEvaluating}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-semibold text-xs transition-all shadow-2xs ${
              isEvaluating
                ? 'bg-orange-500 text-white cursor-wait'
                : activeFile && hasLastResult
                ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-xs'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isEvaluating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Comparing Matches...</span>
              </>
            ) : (
              <>
                <Scale className="w-4 h-4" />
                <span>Run Evaluation Comparison</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Report Dashboard */}
      {report && (
        <div className="space-y-6 pt-4 border-t border-slate-100">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xs space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                Total YPs Evaluated
              </span>
              <div className="text-2xl font-black text-white">
                {report.summary.total_yps_evaluated}
              </div>
              <p className="text-[11px] text-orange-400 font-medium">
                {report.summary.compared_count} compared successfully
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200/80 p-4 rounded-xl shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                Exact Match Rate
              </span>
              <div className="text-2xl font-black text-emerald-950">
                {(report.summary.exact_match_rate * 100).toFixed(1)}%
              </div>
              <p className="text-[11px] text-emerald-700 font-medium">
                {report.summary.exact_match_count} exact MCP matches
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200/80 p-4 rounded-xl shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider block">
                Equivalent / Better Rate
              </span>
              <div className="text-2xl font-black text-blue-950">
                {(report.summary.equivalent_or_better_rate * 100).toFixed(1)}%
              </div>
              <p className="text-[11px] text-blue-700 font-medium">
                {report.summary.equivalent_match_count} equivalent matches
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200/80 p-4 rounded-xl shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-purple-800 uppercase tracking-wider block">
                Avg Distance Delta
              </span>
              <div className="text-2xl font-black text-purple-950">
                {report.summary.avg_distance_delta_km !== null
                  ? `${report.summary.avg_distance_delta_km.toFixed(2)} km`
                  : '0.00 km'}
              </div>
              <p className="text-[11px] text-purple-700 font-medium">
                Metric: {report.summary.distance_metric || 'haversine_km'}
              </p>
            </div>
          </div>

          {/* Compliance Comparison Matrix */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              <span>Criterion Compliance Breakdown (Automated vs Manual)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Trade Compliance */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold block">Trade Compatibility Rate</span>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Automated</span>
                    <span className="text-sm font-bold text-slate-900">
                      {report.summary.automated_trade_compliance_rate !== null
                        ? `${(report.summary.automated_trade_compliance_rate * 100).toFixed(0)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Manual</span>
                    <span className="text-sm font-bold text-slate-600">
                      {report.summary.manual_trade_compliance_rate !== null
                        ? `${(report.summary.manual_trade_compliance_rate * 100).toFixed(0)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* PWD Proximity */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold block">PWD Proximity Compliance</span>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Automated</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {report.summary.automated_pwd_proximity_rate !== null
                        ? `${(report.summary.automated_pwd_proximity_rate * 100).toFixed(0)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Manual</span>
                    <span className="text-sm font-bold text-slate-600">
                      {report.summary.manual_pwd_proximity_rate !== null
                        ? `${(report.summary.manual_pwd_proximity_rate * 100).toFixed(0)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Closer or Equal Distance */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold block">Closer or Equal Distance Rate</span>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Automated</span>
                    <span className="text-sm font-bold text-slate-900">
                      {report.summary.automated_closer_or_equal_rate !== null && report.summary.automated_closer_or_equal_rate !== undefined
                        ? `${(report.summary.automated_closer_or_equal_rate * 100).toFixed(0)}%`
                        : '100%'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Distance Metric</span>
                    <span className="text-xs font-mono font-bold text-slate-600">
                      {report.summary.distance_metric || 'haversine_km'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Unresolved IDs warning */}
            {report.summary.unresolved_yp_ids && report.summary.unresolved_yp_ids.length > 0 && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
                <span className="font-medium">
                  {report.summary.unresolved_yp_ids.length} YPs in manual reference could not be matched to loaded dataset.
                </span>
                <span className="font-mono text-[11px] text-amber-700 truncate max-w-[200px]">
                  {report.summary.unresolved_yp_ids.slice(0, 3).join(', ')}...
                </span>
              </div>
            )}
          </div>

          {/* Distance Distribution Statistics */}
          {(report.summary.automated_distance_stats || report.summary.manual_distance_stats) && (
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                <span>Distance Distribution Statistics</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Automated Distance Stats */}
                {report.summary.automated_distance_stats && (
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-[11px] font-bold text-slate-800">Automated Match Distances</span>
                      <span className="text-[10px] font-mono text-slate-500">n = {report.summary.automated_distance_stats.n ?? 0}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Mean</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.automated_distance_stats.mean_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Median</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.automated_distance_stats.median_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Max</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.automated_distance_stats.max_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">P90</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.automated_distance_stats.p90_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded col-span-2">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Std Dev</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.automated_distance_stats.stdev_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual Distance Stats */}
                {report.summary.manual_distance_stats && (
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-[11px] font-bold text-slate-800">Manual Match Distances</span>
                      <span className="text-[10px] font-mono text-slate-500">n = {report.summary.manual_distance_stats.n ?? 0}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Mean</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.manual_distance_stats.mean_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Median</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.manual_distance_stats.median_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded">
                        <span className="text-[9px] text-slate-400 block font-sans font-semibold uppercase">Max</span>
                        <span className="text-xs font-bold text-slate-900">{report.summary.manual_distance_stats.max_km?.toFixed(2) ?? '-'} km</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Specialization Breakdown by Skill */}
          {report.summary.specialization_breakdown && Object.keys(report.summary.specialization_breakdown).length > 0 && (
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-orange-600" />
                <span>Specialization Breakdown by Skill</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(report.summary.specialization_breakdown).map(([skill, itemVal]) => {
                  const item = itemVal as SpecializationBreakdownItem;
                  return (
                    <div key={skill} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-xs font-bold text-slate-900 font-mono">{skill}</span>
                        <span className="text-[10px] font-semibold bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded font-mono">
                          n={item.n ?? 0}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        {item.automated && (
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase block font-sans">Automated Classes</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {Object.entries(item.automated).map(([cls, cnt]) => (
                                <span key={cls} className="bg-orange-50 text-orange-800 border border-orange-200/60 font-mono text-[10px] px-1.5 py-0.2 rounded">
                                  {cls}: {cnt}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {item.manual && (
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase block font-sans">Manual Classes</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {Object.entries(item.manual).map(([cls, cnt]) => (
                                <span key={cls} className="bg-slate-100 text-slate-700 font-mono text-[10px] px-1.5 py-0.2 rounded">
                                  {cls}: {cnt}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit Trail Table */}
          <div className="space-y-3">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Per-YP Audit Trail ({filteredRows.length})
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                {/* Search input */}
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search YP ID, MCP, Skill..."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      type="button"
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Verdict Filters */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  {['ALL', 'EXACT_MATCH', 'EQUIVALENT_MATCH', 'DIVERGENT_MATCH'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setVerdictFilter(tab);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                        verdictFilter === tab
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab === 'ALL' ? 'All' : tab.replace('_MATCH', '')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">YP Profile</th>
                      <th className="py-3 px-4">Manual MCP</th>
                      <th className="py-3 px-4">Automated MCP</th>
                      <th className="py-3 px-4">Distances (Auto vs Manual)</th>
                      <th className="py-3 px-4">PWD Check</th>
                      <th className="py-3 px-4 text-right">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                          No audit trail records found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row) => (
                        <tr key={row.yp_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-sans">
                            <div className="font-bold text-slate-900">{row.yp_id}</div>
                            <div className="flex items-center space-x-1.5 mt-0.5 text-[10px]">
                              {row.yp_skill && (
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                                  {row.yp_skill}
                                </span>
                              )}
                              {row.yp_gender && (
                                <span className="text-slate-500 uppercase">{row.yp_gender}</span>
                              )}
                              {row.yp_is_pwd && (
                                <span className="bg-purple-100 text-purple-800 font-bold px-1 py-0.2 rounded text-[9px]">
                                  PWD
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{row.manual_mcp_id || 'N/A'}</div>
                            {row.manual_mcp_skill && (
                              <div className="text-[10px] text-slate-500 font-mono">{row.manual_mcp_skill}</div>
                            )}
                            {row.manual_specialization_class && (
                              <div className="mt-0.5">
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono">
                                  {row.manual_specialization_class}
                                </span>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {row.manual_distance_km !== null && row.manual_distance_km !== undefined
                                ? `${row.manual_distance_km.toFixed(2)} km`
                                : '-'}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{row.automated_mcp_id || 'N/A'}</div>
                            {row.automated_mcp_skill && (
                              <div className="text-[10px] text-orange-700 font-mono">{row.automated_mcp_skill}</div>
                            )}
                            {row.automated_specialization_class && (
                              <div className="mt-0.5">
                                <span className="text-[9px] bg-orange-100 text-orange-800 font-medium px-1 py-0.2 rounded font-mono">
                                  {row.automated_specialization_class}
                                </span>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                              {row.automated_travel_time_reported !== null && row.automated_travel_time_reported !== undefined
                                ? `${row.automated_travel_time_reported.toFixed(1)} mins travel`
                                : '-'}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-slate-800">
                              Auto: {row.automated_distance_km !== null && row.automated_distance_km !== undefined ? `${row.automated_distance_km.toFixed(2)} km` : '-'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Delta: {row.distance_delta_km !== null && row.distance_delta_km !== undefined ? `${row.distance_delta_km > 0 ? '+' : ''}${row.distance_delta_km.toFixed(2)} km` : '-'}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-sans">
                            {row.yp_is_pwd ? (
                              row.automated_pwd_proximity_ok ? (
                                <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> OK (&lt;{report?.config_used?.pwd_proximity_threshold_km ?? pwdThreshold}km)
                                </span>
                              ) : (
                                <span className="text-rose-600 font-bold text-[10px] flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Exceeded
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 text-[10px]">N/A</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right font-sans">
                            {getVerdictBadge(row.verdict)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredRows.length)} of {filteredRows.length} audit entries
                  </span>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
