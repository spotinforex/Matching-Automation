import React, { useState } from "react";
import {
  X,
  User,
  Shield,
  Key,
  LogOut,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { AuthUser } from "../types";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onLogout: () => void;
  onChangePassword: (oldPass: string, newPass: string) => Promise<void>;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
  onChangePassword,
}) => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      setPassError("Please fill in both current and new passwords.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPassError("New password should be at least 6 characters long.");
      return;
    }

    setIsChangingPass(true);
    setPassError(null);
    setPassSuccess(null);

    try {
      await onChangePassword(oldPassword, newPassword);
      setPassSuccess("Password updated successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPassError(err.message || "Failed to change password");
    } finally {
      setIsChangingPass(false);
    }
  };

  const permissions = user?.permissions ||
    user?.scopes || ["run_match", "evaluate", "audit_logs", "endpoints_list"];
  const userRole =
    user?.role ||
    (user?.is_superuser || user?.is_admin ? "Super Admin" : "Operator");

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg text-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                User Profile & Permissions
              </h3>
              <p className="text-xs text-slate-500">
                Authenticated user account and active backend scopes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* User card info */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center shadow-xs text-sm uppercase">
                  {(user?.username || user?.email || "U")[0]}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    {user?.full_name ||
                      user?.name ||
                      user?.username ||
                      "Authenticated Operator"}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {user?.email || user?.username || "user@system.local"}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                {userRole}
              </span>
            </div>

            {/* Permissions pill list */}
            <div className="pt-2 border-t border-slate-200/80">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 mb-2">
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                <span>Active Permission Scopes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.isArray(permissions) && permissions.length > 0 ? (
                  permissions.map((p, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-white border border-slate-200 text-slate-700"
                    >
                      ✓ {String(p)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    No specific scopes defined
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Change Password form */}
          <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Key className="w-3.5 h-3.5 text-orange-600" />
              <span>Change Account Password (/auth/change-password)</span>
            </div>

            {passError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            {passSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Current password"
                className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isChangingPass}
              className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
            >
              {isChangingPass ? (
                <span>Updating Password...</span>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
