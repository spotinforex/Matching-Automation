import React, { useState, useRef, useEffect } from "react";
import {
  Check,
  ChevronDown,
  Shield,
  ShieldOff,
  Plus,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { AdminRole, ValidPermissionScope } from "../types";

interface RoleDropdownWithCheckboxProps {
  selectedRoleId: string;
  roles: AdminRole[];
  onChange: (roleId: string) => void;
  userName?: string;
  userEmail?: string;
  userDepartment?: string;
  onCreateRoleWithExistingDetails?: (
    name: string,
    department: string,
    permissions: ValidPermissionScope[],
  ) => Promise<void>;
  disabled?: boolean;
}

const PERMISSION_OPTIONS: { scope: ValidPermissionScope; label: string }[] = [
  { scope: "run_match", label: "Run Matching" },
  { scope: "evaluate", label: "Evaluate & Drift" },
  { scope: "audit_logs", label: "Audit Trail Logs" },
  { scope: "endpoints_list", label: "Endpoints Catalog" },
];

export function getDerivedUserName(name?: string, email?: string): string {
  if (name && name.trim()) return name.trim();
  if (email && email.trim()) {
    const prefix = email.split("@")[0];
    const parts = prefix.split(/[._-]+/).filter(Boolean);
    if (parts.length > 0) {
      return parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
    }
    return prefix;
  }
  return "Team Operator";
}

export const RoleDropdownWithCheckbox: React.FC<
  RoleDropdownWithCheckboxProps
> = ({
  selectedRoleId,
  roles,
  onChange,
  userName,
  userEmail,
  userDepartment,
  onCreateRoleWithExistingDetails,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showInlineCreator, setShowInlineCreator] = useState(false);
  const [inlinePermissions, setInlinePermissions] = useState<
    ValidPermissionScope[]
  >(["run_match", "evaluate"]);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowInlineCreator(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const currentRole = roles.find((r) => String(r.id) === selectedRoleId);
  const derivedName = getDerivedUserName(userName, userEmail);
  const derivedDept = userDepartment?.trim() || "Operations";

  const handleToggleRole = (roleIdStr: string) => {
    if (selectedRoleId === roleIdStr) {
      // User clicked the currently checked role -> uncheck to remove access
      onChange("");
    } else {
      // User checked this role to grant access
      onChange(roleIdStr);
    }
  };

  const handleToggleInlinePermission = (scope: ValidPermissionScope) => {
    if (inlinePermissions.includes(scope)) {
      setInlinePermissions(inlinePermissions.filter((s) => s !== scope));
    } else {
      setInlinePermissions([...inlinePermissions, scope]);
    }
  };

  const handleCreateRoleUsingExistingInfo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onCreateRoleWithExistingDetails) return;
    if (inlinePermissions.length === 0) {
      setCreationError("Select at least one permission scope to assign.");
      return;
    }

    setIsCreatingRole(true);
    setCreationError(null);
    try {
      await onCreateRoleWithExistingDetails(
        derivedName,
        derivedDept,
        inlinePermissions,
      );
      setShowInlineCreator(false);
    } catch (err: any) {
      setCreationError(err.message || "Failed to create role");
    } finally {
      setIsCreatingRole(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full text-left bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
          isOpen
            ? "border-orange-500 ring-2 ring-orange-500/20 bg-white"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-100/50"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
              currentRole
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {currentRole ? (
              <Shield className="w-3.5 h-3.5" />
            ) : (
              <ShieldOff className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="min-w-0 truncate">
            {currentRole ? (
              <div className="flex items-center space-x-2 truncate">
                <span className="font-semibold text-slate-900 truncate">
                  {currentRole.name}
                </span>
                <span className="text-[10px] text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded font-medium truncate">
                  {currentRole.department}
                </span>
              </div>
            ) : (
              <span className="text-slate-500 italic">
                No Role Assigned (Access Removed)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {currentRole && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              Access Granted
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
              isOpen ? "rotate-180 text-orange-500" : ""
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden animate-in fade-in duration-150">
          {/* Helper instructions & Quick actions */}
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-600 flex items-center justify-between gap-2">
            <span className="leading-tight">
              Click checkbox with role name to assign. Click again to uncheck
              &amp; remove access.
            </span>
            <div className="flex items-center space-x-2 flex-shrink-0">
              {selectedRoleId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                  className="text-rose-600 hover:text-rose-700 font-semibold hover:underline text-[10px] cursor-pointer"
                >
                  Revoke Access
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-1">
            {/* Option: No Role / Remove Access */}
            <div
              onClick={() => onChange("")}
              className={`p-2.5 rounded-lg flex items-start space-x-3 transition-colors cursor-pointer ${
                !selectedRoleId
                  ? "bg-amber-50/70 text-slate-900 font-medium"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={!selectedRoleId}
                onChange={() => onChange("")}
                className="mt-0.5 w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer"
              />
              <div className="min-w-0 text-xs flex-1">
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-slate-800">
                    No Role Assigned
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                    Access Revoked
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Uncheck all role access for this user account.
                </p>
              </div>
            </div>

            {/* List of Available Roles in System */}
            {roles.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 italic">
                No roles defined in the system yet.
              </div>
            ) : (
              roles.map((r) => {
                const isChecked = selectedRoleId === String(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => handleToggleRole(String(r.id))}
                    className={`p-2.5 rounded-lg flex items-start space-x-3 transition-colors cursor-pointer ${
                      isChecked
                        ? "bg-orange-50/80 text-slate-900 border border-orange-200/70"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleRole(String(r.id))}
                      className="mt-0.5 w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer"
                    />

                    <div className="min-w-0 text-xs flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span className="font-bold text-slate-900 truncate">
                            {r.name}
                          </span>
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
                            {r.department}
                          </span>
                        </div>

                        {isChecked && (
                          <span className="text-[10px] font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded flex items-center space-x-0.5 flex-shrink-0">
                            <Check className="w-3 h-3" />
                            <span>Assigned (Click checkbox to remove)</span>
                          </span>
                        )}
                      </div>

                      {/* Permission Scopes Badges */}
                      {Array.isArray(r.permissions) &&
                        r.permissions.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {r.permissions.map((perm, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600"
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Inline Creator: Use Existing Name of User and Department (NO NEW NAME INPUT!) */}
          {onCreateRoleWithExistingDetails && (
            <div className="p-3 bg-slate-50 border-t border-slate-200">
              {!showInlineCreator ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInlineCreator(true);
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-white hover:bg-orange-50/70 border border-dashed border-orange-300 rounded-lg text-xs font-semibold text-orange-700 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                  <span>
                    Create role using this user&apos;s name (&quot;{derivedName}
                    &quot;) &amp; department ({derivedDept})
                  </span>
                </button>
              ) : (
                <div className="space-y-2.5 bg-white p-3 rounded-lg border border-orange-200 shadow-xs animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Create Role from User &amp; Department
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowInlineCreator(false);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg text-[11px] text-slate-700 border border-slate-200/80 space-y-0.5">
                    <div>
                      <span className="text-slate-500">Role Name:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {derivedName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Department:</span>{" "}
                      <span className="font-semibold text-slate-800">
                        {derivedDept}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                      Select Permission Scopes to include in this role:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PERMISSION_OPTIONS.map(({ scope, label }) => {
                        const isChecked = inlinePermissions.includes(scope);
                        return (
                          <label
                            key={scope}
                            onClick={(e) => e.stopPropagation()}
                            className={`flex items-center space-x-1.5 p-1.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                              isChecked
                                ? "bg-orange-50 border-orange-200 text-orange-900"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                handleToggleInlinePermission(scope)
                              }
                              className="w-3.5 h-3.5 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {creationError && (
                    <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-md flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{creationError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isCreatingRole || inlinePermissions.length === 0}
                    onClick={handleCreateRoleUsingExistingInfo}
                    className="w-full py-1.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-60 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    {isCreatingRole ? (
                      <span>Creating &amp; Assigning Role...</span>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          Create &amp; Assign &quot;{derivedName}&quot;
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
