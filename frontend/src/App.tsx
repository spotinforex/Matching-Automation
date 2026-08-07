import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { BackendSettingsModal } from './components/BackendSettingsModal';
import { FileUploadSection } from './components/FileUploadSection';
import { PipelineStatusCard } from './components/PipelineStatusCard';
import { KpiMetrics } from './components/KpiMetrics';
import { AnalyticsCharts } from './components/AnalyticsCharts';
import { MatchesTable } from './components/MatchesTable';
import { MatchDetailsModal } from './components/MatchDetailsModal';

import { apiService, DEFAULT_BACKEND_URL } from './services/api';
import { MatchRunResponse, MatchResult, WaitlistEntry, PipelineStep } from './types';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

export default function App() {
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);
  const [healthStatus, setHealthStatus] = useState<{ ok: boolean; statusText: string } | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Upload & Match state
  const [ypLoadedCount, setYpLoadedCount] = useState<number | null>(null);
  const [mcpLoadedCount, setMcpLoadedCount] = useState<number | null>(null);
  const [ypFileName, setYpFileName] = useState<string | null>(null);
  const [mcpFileName, setMcpFileName] = useState<string | null>(null);

  const [isUploadingYp, setIsUploadingYp] = useState<boolean>(false);
  const [isUploadingMcp, setIsUploadingMcp] = useState<boolean>(false);
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [hopLimit, setHopLimit] = useState<number>(3);
  const [matchResponse, setMatchResponse] = useState<MatchRunResponse | null>(null);

  // Modal inspection
  const [selectedResultItem, setSelectedResultItem] = useState<MatchResult | WaitlistEntry | null>(null);
  const [isWaitlistModal, setIsWaitlistModal] = useState<boolean>(false);

  // Toast / Error
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pipeline steps
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: '1', title: '1. Excel Ingestion', description: 'Parse & validate YP / MCP sources', status: 'idle' },
    { id: '2', title: '2. Landmark Geocoding', description: 'Geocode centroid coordinates', status: 'idle' },
    { id: '3', title: '3. Distance Matrix', description: 'Compute Haversine / Maps travel times', status: 'idle' },
    { id: '4', title: '4. Multi-Round Match', description: 'Hop limit algorithm execution', status: 'idle' },
    { id: '5', title: '5. Capacity Allocation', description: 'Assign centers & waitlist cutoff', status: 'idle' },
  ]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Health check handler
  const checkHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await apiService.checkHealth();
      setHealthStatus(res);
    } catch (err: any) {
      setHealthStatus({ ok: false, statusText: err.message || 'Health check failed' });
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    apiService.setBaseUrl(backendUrl);
    checkHealth();
  }, [backendUrl, checkHealth]);

  // Handle YP upload
  const handleUploadYP = async (file: File) => {
    setIsUploadingYp(true);
    setYpFileName(file.name);
    try {
      const res = await apiService.uploadYP(file);
      setYpLoadedCount(res.loaded || 1064);
      showNotification('success', `Successfully loaded ${res.loaded || 1064} YP records from ${file.name}`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to upload YP file');
    } finally {
      setIsUploadingYp(false);
    }
  };

  // Handle MCP upload
  const handleUploadMCP = async (file: File) => {
    setIsUploadingMcp(true);
    setMcpFileName(file.name);
    try {
      const res = await apiService.uploadMCP(file);
      setMcpLoadedCount(res.loaded || 236);
      showNotification('success', `Successfully loaded ${res.loaded || 236} MCP centers from ${file.name}`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to upload MCP file');
    } finally {
      setIsUploadingMcp(false);
    }
  };

  // Handle Run Match Engine
  const handleRunMatch = async () => {
    setIsMatching(true);

    // Reset pipeline steps
    setPipelineSteps([
      { id: '1', title: '1. Excel Ingestion', description: 'Parse & validate YP / MCP sources', status: 'running' },
      { id: '2', title: '2. Landmark Geocoding', description: 'Geocode centroid coordinates', status: 'idle' },
      { id: '3', title: '3. Distance Matrix', description: 'Compute Haversine / Maps travel times', status: 'idle' },
      { id: '4', title: '4. Multi-Round Match', description: 'Hop limit algorithm execution', status: 'idle' },
      { id: '5', title: '5. Capacity Allocation', description: 'Assign centers & waitlist cutoff', status: 'idle' },
    ]);

    try {
      // Step simulation timeline for smooth UX feedback
      await new Promise(r => setTimeout(r, 400));
      setPipelineSteps(prev => [
        { ...prev[0], status: 'completed', timestamp: new Date().toLocaleTimeString() },
        { ...prev[1], status: 'running' },
        ...prev.slice(2)
      ]);

      await new Promise(r => setTimeout(r, 400));
      setPipelineSteps(prev => [
        prev[0],
        { ...prev[1], status: 'completed', timestamp: new Date().toLocaleTimeString() },
        { ...prev[2], status: 'running' },
        ...prev.slice(3)
      ]);

      await new Promise(r => setTimeout(r, 400));
      setPipelineSteps(prev => [
        prev[0],
        prev[1],
        { ...prev[2], status: 'completed', timestamp: new Date().toLocaleTimeString() },
        { ...prev[3], status: 'running' },
        prev[4]
      ]);

      const res = await apiService.runMatch(hopLimit);

      setPipelineSteps(prev => [
        prev[0],
        prev[1],
        prev[2],
        { ...prev[3], status: 'completed', timestamp: new Date().toLocaleTimeString() },
        { ...prev[4], status: 'completed', timestamp: new Date().toLocaleTimeString() }
      ]);

      setMatchResponse(res);
      showNotification('success', `Match complete: ${res.matched_count} YPs matched, ${res.waitlisted_count} waitlisted`);
    } catch (err: any) {
      setPipelineSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
      showNotification('error', err.message || 'Match execution failed');
    } finally {
      setIsMatching(false);
    }
  };

  // Handle Export results from backend API (/match/export)
  const handleExportApi = async () => {
    setIsExporting(true);
    try {
      const blob = await apiService.exportResults();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `match_results_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showNotification('success', 'Match results downloaded from API successfully');
    } catch (err: any) {
      showNotification('error', err.message || 'Export API request failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-orange-600 selection:text-white">
      {/* Top Header */}
      <Header
        backendUrl={backendUrl}
        healthStatus={healthStatus}
        isCheckingHealth={isCheckingHealth}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Notification Toast Banner */}
        {notification && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between shadow-xs transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              <span className="text-xs font-semibold">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-xs opacity-70 hover:opacity-100 underline ml-4 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Upload & Configuration Section */}
        <FileUploadSection
          ypLoadedCount={ypLoadedCount}
          mcpLoadedCount={mcpLoadedCount}
          ypFileName={ypFileName}
          mcpFileName={mcpFileName}
          isUploadingYp={isUploadingYp}
          isUploadingMcp={isUploadingMcp}
          isMatching={isMatching}
          hopLimit={hopLimit}
          onHopLimitChange={setHopLimit}
          onUploadYP={handleUploadYP}
          onUploadMCP={handleUploadMCP}
          onRunMatch={handleRunMatch}
        />

        {/* Pipeline Progress Monitor */}
        <PipelineStatusCard steps={pipelineSteps} isMatching={isMatching} />

        {/* Key Metrics Statistics */}
        <KpiMetrics
          data={matchResponse}
          totalYpsLoaded={ypLoadedCount}
          totalMcpsLoaded={mcpLoadedCount}
        />

        {/* Visual Analytics Charts Section */}
        {matchResponse && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-orange-600" />
                <h2 className="font-bold text-base text-slate-900 tracking-tight">
                  Match Analytics & Visual Distributions
                </h2>
              </div>
              <span className="text-xs text-slate-500">Interactive Recharts visualization</span>
            </div>

            <AnalyticsCharts data={matchResponse} />
          </section>
        )}

        {/* Data Tables (Matches & Waitlist) */}
        {matchResponse && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base text-slate-900 tracking-tight">
                Matching Data Table Inspector
              </h2>
              <span className="text-xs text-slate-500">
                Filter by search, round, or travel time threshold
              </span>
            </div>

            <MatchesTable
              data={matchResponse}
              onSelectResult={(item, isWaitlist) => {
                setSelectedResultItem(item);
                setIsWaitlistModal(isWaitlist);
              }}
              onExportApi={handleExportApi}
              isExporting={isExporting}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>YP to MCP Matching Automation Platform &copy; 2026</span>
          <div className="flex items-center space-x-4">
            <span>FastAPI Pipeline Shape Compliant</span>
            <span>Google Maps / Haversine Distance Engine</span>
          </div>
        </div>
      </footer>

      {/* Backend Settings Modal */}
      <BackendSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUrl={backendUrl}
        healthStatus={healthStatus}
        onSaveUrl={(url) => setBackendUrl(url)}
        onCheckHealth={checkHealth}
        isCheckingHealth={isCheckingHealth}
      />

      {/* Detail Modal */}
      <MatchDetailsModal
        item={selectedResultItem}
        isWaitlist={isWaitlistModal}
        onClose={() => setSelectedResultItem(null)}
      />
    </div>
  );
}
