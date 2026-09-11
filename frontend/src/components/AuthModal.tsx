import React, { useState } from "react";
import {
  X,
  Lock,
  LogIn,
  AlertCircle,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { AuthUser } from "../types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser, token: string) => void;
  onLogin: (
    email: string,
    pass: string,
  ) => Promise<{ token: string; user?: AuthUser }>;
  onSetManualToken?: (token: string) => Promise<AuthUser>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onLogin,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
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
      const resolvedUser: AuthUser = res.user || { email: email.trim() };
      setSuccessMessage(
        `Authenticated as ${resolvedUser.username || resolvedUser.email || "User"}`,
      );
      setTimeout(() => {
        onLoginSuccess(resolvedUser, res.token);
        onClose();
      }, 400);
    } catch (err: any) {
      setErrorMessage(
        err.message || "Login failed. Verify credentials and backend URL.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md text-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900">
                Account Sign In
              </h3>
              <p className="text-[11px] text-slate-500">
                Sign in to unlock protected matching & evaluation routes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Container */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-800">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@organization.com"
                autoFocus
                required
                className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl px-3.5 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
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
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-60 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Scopes hint info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
              <span>Permission Scopes Enforced by Backend</span>
            </div>
            <div className="grid grid-cols-2 gap-1 font-mono text-[10px] text-slate-600 pt-0.5">
              <span>
                • <strong className="text-slate-800">run_match</strong>:
                Matching & Export
              </span>
              <span>
                • <strong className="text-slate-800">evaluate</strong>: Drift &
                Compare
              </span>
              <span>
                • <strong className="text-slate-800">audit_logs</strong>: Audit
                Event Logs
              </span>
              <span>
                • <strong className="text-slate-800">endpoints_list</strong>:
                Route Catalog
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
