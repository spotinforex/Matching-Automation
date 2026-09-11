import React, { useState } from "react";
import {
  LogIn,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Network,
} from "lucide-react";
import { AuthUser } from "../types";

interface LoginPageProps {
  onLogin: (
    email: string,
    pass: string,
  ) => Promise<{ token: string; user?: AuthUser }>;
  onLoginSuccess: (user: AuthUser, token: string) => void;
  healthStatus: { ok: boolean; statusText?: string } | null;
  isCheckingHealth?: boolean;
  onCheckHealth?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  onLoginSuccess,
  healthStatus,
  isCheckingHealth,
  onCheckHealth,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await onLogin(email.trim(), password.trim());
      const resolvedUser: AuthUser = res.user || {
        email: email.trim(),
      };
      setSuccessMessage(
        `Authenticated as ${resolvedUser.username || resolvedUser.email || "User"}`,
      );
      setTimeout(() => {
        onLoginSuccess(resolvedUser, res.token);
      }, 350);
    } catch (err: any) {
      setErrorMessage(
        err.message ||
          "Invalid credentials or unable to reach the backend server.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-orange-600 selection:text-white">
      {/* Background subtle geometric accents */}
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-900/30 mb-2">
            <Network className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            YP to MCP Automation
          </h1>
          <p className="text-sm text-slate-400">
            Sign in to access the matching pipeline and evaluation dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-7 sm:p-8 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Sign In to Your Account
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your email and password
            </p>
          </div>

          {/* Feedback alerts */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2.5 text-xs text-rose-800 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <span className="font-semibold block">
                  Authentication Error
                </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-800 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@organization.com or username"
                autoFocus
                required
                disabled={isLoading}
                className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  disabled={isLoading}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-60 text-white font-semibold text-sm rounded-xl shadow-md shadow-orange-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security note */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-[11px] text-slate-600">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
              <span>Secure Authentication</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Sign in with your assigned account to unlock matching, evaluation,
              and pipeline controls.
            </p>
          </div>
        </div>

        {/* Backend Connectivity Status */}
        <div className="flex items-center justify-center space-x-2 text-xs text-slate-400">
          <span
            className={`w-2 h-2 rounded-full ${
              healthStatus?.ok ? "bg-emerald-400" : "bg-rose-400"
            }`}
          />
          <span className="text-[11px]">
            {healthStatus?.ok
              ? "Matching Server Online"
              : "Matching Server Offline"}
          </span>
          {onCheckHealth && (
            <button
              type="button"
              onClick={onCheckHealth}
              disabled={isCheckingHealth}
              title="Refresh connection status"
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${isCheckingHealth ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
