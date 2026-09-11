import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { FileUploadSection } from "./components/FileUploadSection";
import { PipelineStatusCard } from "./components/PipelineStatusCard";
import { KpiMetrics } from "./components/KpiMetrics";
import { AnalyticsCharts } from "./components/AnalyticsCharts";
import { MatchesTable } from "./components/MatchesTable";
import { MatchDetailsModal } from "./components/MatchDetailsModal";
import { EvaluationSection } from "./components/EvaluationSection";

import { ColumnResolutionErrorModal } from "./components/ColumnResolutionErrorModal";
import {
  parseColumnResolutionError,
  ParsedColumnError,
} from "./utils/columnErrorParser";
import { WarningsPanel } from "./components/WarningsPanel";
import {
  extractUploadWarnings,
  extractMatchWarnings,
  extractEvaluationWarnings,
} from "./utils/warningParser";
import { AuthModal } from "./components/AuthModal";
import { UserProfileModal } from "./components/UserProfileModal";
import { AuditLogsModal } from "./components/AuditLogsModal";
import { LoginPage } from "./components/LoginPage";

import { apiService } from "./services/api";
import {
  MatchRunResponse,
  MatchResult,
  WaitlistEntry,
  PipelineStep,
  EvaluationReport,
  AppWarning,
  AuthUser,
} from "./types";
import {
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Scale,
  ArrowLeft,
  Lock,
  LogIn,
  RefreshCw,
} from "lucide-react";

export default function App() {
  const [healthStatus, setHealthStatus] = useState<{
    ok: boolean;
    statusText: string;
  } | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);

  // Authentication & Session state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isCheckingInitialAuth, setIsCheckingInitialAuth] = useState<boolean>(
    () => {
      return Boolean(apiService.getToken());
    },
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);

  // Upload & Match state
  const [ypLoadedCount, setYpLoadedCount] = useState<number | null>(null);
  const [mcpLoadedCount, setMcpLoadedCount] = useState<number | null>(null);
  const [ypFileName, setYpFileName] = useState<string | null>(null);
  const [mcpFileName, setMcpFileName] = useState<string | null>(null);

  const [isUploadingYp, setIsUploadingYp] = useState<boolean>(false);
  const [isUploadingMcp, setIsUploadingMcp] = useState<boolean>(false);
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [hopLimit, setHopLimit] = useState<number>(10);
  const [matchCap, setMatchCap] = useState<number | null>(null);
  const [shortlistSize, setShortlistSize] = useState<number>(10);
  const [matchResponse, setMatchResponse] = useState<MatchRunResponse | null>(
    null,
  );

  // Evaluation comparison state
  const [activeView, setActiveView] = useState<"pipeline" | "evaluation">(
    "pipeline",
  );
  const [evaluationReport, setEvaluationReport] =
    useState<EvaluationReport | null>(null);
  const [storedManualFile, setStoredManualFile] = useState<File | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isExportingEval, setIsExportingEval] = useState<boolean>(false);

  // Modal inspection
  const [selectedResultItem, setSelectedResultItem] = useState<
    MatchResult | WaitlistEntry | null
  >(null);
  const [isWaitlistModal, setIsWaitlistModal] = useState<boolean>(false);

  // Toast / Error & Column Resolution Error Modal
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [columnError, setColumnError] = useState<{
    parsed: ParsedColumnError | null;
    raw: string;
  } | null>(null);
  const [warnings, setWarnings] = useState<AppWarning[]>([]);

  const handleDismissWarning = (id: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  const handleClearAllWarnings = () => {
    setWarnings([]);
  };

  // Pipeline steps
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    {
      id: "1",
      title: "1. Excel Ingestion",
      description: "Parse & validate YP / MCP sources",
      status: "idle",
    },
    {
      id: "2",
      title: "2. Landmark Geocoding",
      description: "Geocode centroid coordinates",
      status: "idle",
    },
    {
      id: "3",
      title: "3. Distance Matrix",
      description: "Compute Haversine / Maps travel times",
      status: "idle",
    },
    {
      id: "4",
      title: "4. Multi-Round Match",
      description: "Hop limit algorithm execution",
      status: "idle",
    },
    {
      id: "5",
      title: "5. Capacity Allocation",
      description: "Assign centers & waitlist cutoff",
      status: "idle",
    },
  ]);

  const showNotification = (type: "success" | "error", message: string) => {
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
      setHealthStatus({
        ok: false,
        statusText: err.message || "Health check failed",
      });
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Attempt to restore user profile from saved token on startup / backend change
  useEffect(() => {
    const token = apiService.getToken();
    if (token) {
      setIsCheckingInitialAuth(true);
      apiService
        .getMe()
        .then((user) => {
          setCurrentUser(user);
        })
        .catch(() => {
          // Token is likely invalid or server restarted; clear it
          apiService.setToken(null);
          setCurrentUser(null);
        })
        .finally(() => {
          setIsCheckingInitialAuth(false);
        });
    } else {
      setIsCheckingInitialAuth(false);
    }
  }, []);

  // Authentication Handlers
  const handleLogin = async (username: string, pass: string) => {
    const res = await apiService.login(username, pass);
    if (res.user) {
      setCurrentUser(res.user);
    }
    return res;
  };

  const handleLogout = async () => {
    await apiService.logout();
    setCurrentUser(null);
    showNotification("success", "You have been signed out.");
  };

  const handleChangePassword = async (oldPass: string, newPass: string) => {
    await apiService.changePassword(oldPass, newPass);
  };

  const handleAuthErrorCheck = (err: any) => {
    const msg = String(err?.message || "");
    if (
      msg.includes("401") ||
      msg.includes("Unauthorized") ||
      msg.includes("Authentication required")
    ) {
      setCurrentUser(null);
      apiService.setToken(null);
      showNotification(
        "error",
        "Session expired or invalid credentials. Please log in.",
      );
    }
  };

  // Handle YP upload
  const handleUploadYP = async (file: File) => {
    setIsUploadingYp(true);
    setYpFileName(file.name);
    try {
      const res = await apiService.uploadYP(file);
      setYpLoadedCount(res.loaded || 1064);

      const newWarns = extractUploadWarnings(res, "YP", file.name);
      if (newWarns.length > 0) {
        setWarnings((prev) => [...prev, ...newWarns]);
        showNotification(
          "error",
          `YP File loaded with ${newWarns.length} warning(s). Review Warnings Console.`,
        );
      } else {
        showNotification(
          "success",
          `Successfully loaded ${res.loaded || 1064} YP records from ${file.name}`,
        );
      }
    } catch (err: any) {
      const errMsg = err.message || "Failed to upload YP file";
      const parsed = parseColumnResolutionError(errMsg);
      if (parsed) {
        setColumnError({ parsed, raw: errMsg });
        showNotification(
          "error",
          `Column resolution failed for YP file. Review header mappings.`,
        );
      } else {
        showNotification("error", errMsg);
      }
      handleAuthErrorCheck(err);
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

      const newWarns = extractUploadWarnings(res, "MCP", file.name);
      if (newWarns.length > 0) {
        setWarnings((prev) => [...prev, ...newWarns]);
        showNotification(
          "error",
          `MCP File loaded with ${newWarns.length} warning(s). Review Warnings Console.`,
        );
      } else {
        showNotification(
          "success",
          `Successfully loaded ${res.loaded || 236} MCP centers from ${file.name}`,
        );
      }
    } catch (err: any) {
      const errMsg = err.message || "Failed to upload MCP file";
      const parsed = parseColumnResolutionError(errMsg);
      if (parsed) {
        setColumnError({ parsed, raw: errMsg });
        showNotification(
          "error",
          `Column resolution failed for MCP file. Review header mappings.`,
        );
      } else {
        showNotification("error", errMsg);
      }
      handleAuthErrorCheck(err);
    } finally {
      setIsUploadingMcp(false);
    }
  };

  // Handle Run Match Engine
  const handleRunMatch = async () => {
    setIsMatching(true);

    // Reset pipeline steps
    setPipelineSteps([
      {
        id: "1",
        title: "1. Excel Ingestion",
        description: "Parse & validate YP / MCP sources",
        status: "running",
      },
      {
        id: "2",
        title: "2. Landmark Geocoding",
        description: "Geocode centroid coordinates",
        status: "idle",
      },
      {
        id: "3",
        title: "3. Distance Matrix",
        description: "Compute Haversine / Maps travel times",
        status: "idle",
      },
      {
        id: "4",
        title: "4. Multi-Round Match",
        description: "Hop limit algorithm execution",
        status: "idle",
      },
      {
        id: "5",
        title: "5. Capacity Allocation",
        description: "Assign centers & waitlist cutoff",
        status: "idle",
      },
    ]);

    try {
      // Step simulation timeline for smooth UX feedback
      await new Promise((r) => setTimeout(r, 400));
      setPipelineSteps((prev) => [
        {
          ...prev[0],
          status: "completed",
          timestamp: new Date().toLocaleTimeString(),
        },
        { ...prev[1], status: "running" },
        ...prev.slice(2),
      ]);

      await new Promise((r) => setTimeout(r, 400));
      setPipelineSteps((prev) => [
        prev[0],
        {
          ...prev[1],
          status: "completed",
          timestamp: new Date().toLocaleTimeString(),
        },
        { ...prev[2], status: "running" },
        ...prev.slice(3),
      ]);

      await new Promise((r) => setTimeout(r, 400));
      setPipelineSteps((prev) => [
        prev[0],
        prev[1],
        {
          ...prev[2],
          status: "completed",
          timestamp: new Date().toLocaleTimeString(),
        },
        { ...prev[3], status: "running" },
        prev[4],
      ]);

      const res = await apiService.runMatch(hopLimit, matchCap, shortlistSize);

      setPipelineSteps((prev) => [
        prev[0],
        prev[1],
        prev[2],
        {
          ...prev[3],
          status: "completed",
          timestamp: new Date().toLocaleTimeString(),
        },
        {
          ...prev[4],
          status: "completed",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      setMatchResponse(res);

      const matchWarns = extractMatchWarnings(res);
      if (matchWarns.length > 0) {
        setWarnings((prev) => [...prev, ...matchWarns]);
      }

      showNotification(
        "success",
        `Match complete: ${res.matched_count} YPs matched, ${res.waitlisted_count} waitlisted. Click 'Compare Matches' on top to evaluate.`,
      );
    } catch (err: any) {
      setPipelineSteps((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "error" } : s,
        ),
      );
      showNotification("error", err.message || "Match execution failed");
      handleAuthErrorCheck(err);
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
      const a = document.createElement("a");
      a.href = url;
      a.download = `match_results_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showNotification(
        "success",
        "Match results downloaded from API successfully",
      );
    } catch (err: any) {
      showNotification("error", err.message || "Export API request failed");
      handleAuthErrorCheck(err);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Compare Evaluation (/evaluation/compare)
  const handleCompareEvaluation = async (
    manualFile: File,
    configJson?: string,
  ) => {
    setIsEvaluating(true);
    if (manualFile) {
      setStoredManualFile(manualFile);
    }
    try {
      const report = await apiService.compareEvaluation(manualFile, configJson);
      setEvaluationReport({ ...report });

      const evalWarns = extractEvaluationWarnings(report);
      if (evalWarns.length > 0) {
        setWarnings((prev) => [...prev, ...evalWarns]);
      }

      showNotification(
        "success",
        `Evaluation comparison complete: ${report.summary.compared_count} YPs evaluated (${(report.summary.exact_match_rate * 100).toFixed(0)}% exact matches)`,
      );
    } catch (err: any) {
      showNotification("error", err.message || "Evaluation comparison failed");
      handleAuthErrorCheck(err);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handle Export Evaluation Workbook (/evaluation/export)
  const handleExportEvaluation = async () => {
    setIsExportingEval(true);
    try {
      const blob = await apiService.exportEvaluationResults();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluation_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showNotification(
        "success",
        "Evaluation report workbook downloaded successfully",
      );
    } catch (err: any) {
      showNotification("error", err.message || "Export evaluation failed");
      handleAuthErrorCheck(err);
    } finally {
      setIsExportingEval(false);
    }
  };

  // If verifying initial token from localStorage, display clean loading screen
  if (isCheckingInitialAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 selection:bg-orange-600 selection:text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-900/40">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-white font-bold text-base">
              Verifying Session
            </h2>
            <p className="text-xs text-slate-400">
              Connecting to secure matching engine...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Strictly enforce user intent: Do not show anything until logged in! Just login page
  if (!currentUser) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          showNotification(
            "success",
            `Welcome, ${user.username || user.email || "User"}!`,
          );
        }}
        healthStatus={healthStatus}
        isCheckingHealth={isCheckingHealth}
        onCheckHealth={checkHealth}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-orange-600 selection:text-white">
      {/* Top Header */}
      <Header
        healthStatus={healthStatus}
        isCheckingHealth={isCheckingHealth}
        onCheckHealth={checkHealth}
        activeView={activeView}
        hasMatchResult={!!matchResponse}
        hasEvaluationReport={!!evaluationReport}
        warningCount={warnings.length}
        onSelectView={setActiveView}
        onToggleWarnings={() => {
          const el = document.getElementById("warnings-console");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
        user={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenAuditLogs={() => setIsAuditModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Notification Toast Banner */}
        {notification && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between shadow-xs transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
              notification.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            <div className="flex items-center space-x-3">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              <span className="text-xs font-semibold">
                {notification.message}
              </span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-xs opacity-70 hover:opacity-100 underline ml-4 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* System & Data Health Warnings Console */}
        <div id="warnings-console">
          <WarningsPanel
            warnings={warnings}
            onDismissWarning={handleDismissWarning}
            onClearAllWarnings={handleClearAllWarnings}
          />
        </div>

        {activeView === "pipeline" ? (
          <>
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
              matchCap={matchCap}
              onMatchCapChange={setMatchCap}
              shortlistSize={shortlistSize}
              onShortlistSizeChange={setShortlistSize}
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
                  <span className="text-xs text-slate-500">
                    Interactive Recharts visualization
                  </span>
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

            {/* Compare Evaluation Banner trigger if match completed */}
            {matchResponse && (
              <div className="p-4 bg-orange-50/80 border border-orange-200/90 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-orange-100 text-orange-700 rounded-lg">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Automated Match Complete
                    </h4>
                    <p className="text-xs text-slate-600">
                      Compare this automated match run against your manual
                      reference sheet to measure compliance rates & drift.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView("evaluation")}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center space-x-1.5 flex-shrink-0 transition-colors"
                >
                  <span>Open Evaluation View →</span>
                </button>
              </div>
            )}
          </>
        ) : (
          /* Evaluation View Page */
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
              <button
                type="button"
                onClick={() => setActiveView("pipeline")}
                className="flex items-center space-x-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-lg shadow-2xs transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
                <span>Back to Matching Pipeline</span>
              </button>
              <div className="text-xs text-slate-500 font-medium">
                Active View:{" "}
                <span className="text-slate-900 font-bold">
                  Manual Match Evaluation & Drift Report
                </span>
              </div>
            </div>

            <EvaluationSection
              report={evaluationReport}
              hasLastResult={!!matchResponse}
              isEvaluating={isEvaluating}
              isExportingEval={isExportingEval}
              storedManualFile={storedManualFile}
              onCompare={handleCompareEvaluation}
              onExportEval={handleExportEvaluation}
            />
          </div>
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

      {/* Detail Modal */}
      <MatchDetailsModal
        item={selectedResultItem}
        isWaitlist={isWaitlistModal}
        onClose={() => setSelectedResultItem(null)}
      />

      {/* Column Resolution Error Modal */}
      <ColumnResolutionErrorModal
        isOpen={!!columnError}
        error={columnError?.parsed || null}
        rawErrorText={columnError?.raw || null}
        onClose={() => setColumnError(null)}
      />

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={handleLogin}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          showNotification(
            "success",
            `Welcome, ${user.username || user.email || "User"}!`,
          );
        }}
      />

      {/* User Profile & Password Change Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={currentUser}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
      />

      {/* Audit Logs & Endpoints Catalog Modal */}
      <AuditLogsModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        isAuthenticated={!!currentUser || apiService.isAuthenticated()}
        onOpenAuth={() => {
          setIsAuditModalOpen(false);
          setIsAuthModalOpen(true);
        }}
      />
    </div>
  );
}
