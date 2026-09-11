import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Users,
  User,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  UserCheck,
  UserX,
  Building,
  Mail,
  Edit2,
  Trash2,
  X,
  Search,
  Shield,
} from "lucide-react";
import {
  AuthUser,
  AdminUser,
  AdminRole,
  AdminUserCreateRequest,
  AdminUserUpdateRequest,
  AdminRoleCreateRequest,
  ValidPermissionScope,
} from "../types";
import { apiService } from "../services/api";
import { RoleDropdownWithCheckbox } from "./RoleDropdownWithCheckbox";

interface AdminSectionProps {
  currentUser: AuthUser | null;
}

export const AdminSection: React.FC<AdminSectionProps> = ({ currentUser }) => {
  const isSuperAdmin = Boolean(
    currentUser?.is_super_admin || currentUser?.is_superuser,
  );

  // Data state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Filter/search
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] =
    useState<AdminUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Form states - Create User
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserDept, setNewUserDept] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState<string>("");
  const [newUserIsSuperAdmin, setNewUserIsSuperAdmin] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Form states - Edit User
  const [editUserName, setEditUserName] = useState("");
  const [editUserDept, setEditUserDept] = useState("");
  const [editUserRoleId, setEditUserRoleId] = useState<string>("");
  const [editUserIsSuperAdmin, setEditUserIsSuperAdmin] = useState(false);
  const [editUserIsActive, setEditUserIsActive] = useState(true);
  const [isSubmittingEditUser, setIsSubmittingEditUser] = useState(false);

  const fetchAdminData = useCallback(async () => {
    if (!isSuperAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedRoles, fetchedUsers] = await Promise.all([
        apiService.getAdminRoles().catch((e) => {
          console.warn("Failed to load roles", e);
          return [] as AdminRole[];
        }),
        apiService.getAdminUsers().catch((e) => {
          throw e;
        }),
      ]);
      setRoles(fetchedRoles);
      setUsers(fetchedUsers);
    } catch (err: any) {
      setError(err.message || "Failed to fetch admin data from backend.");
    } finally {
      setIsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAdminData();
    }
  }, [isSuperAdmin, fetchAdminData]);

  const showBanner = (
    type: "success" | "warning" | "error",
    message: string,
  ) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  // Strictly guard non-super-admin access
  if (!isSuperAdmin) {
    return (
      <div className="max-w-4xl mx-auto my-12 p-8 bg-white border border-rose-200 rounded-2xl shadow-sm text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">
            Access Restricted: Super Admin Only
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            The{" "}
            <code className="px-1.5 py-0.5 bg-slate-100 font-mono text-xs rounded text-slate-800">
              /admin
            </code>{" "}
            route and management tools are strictly reserved for Super
            Administrators. Your current account role does not have
            administrative clearance.
          </p>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-sm mx-auto text-xs text-slate-500 text-left space-y-1">
          <div className="font-semibold text-slate-700">
            Account Credentials:
          </div>
          <div>
            User:{" "}
            <span className="font-mono text-slate-800">
              {currentUser?.email || currentUser?.username}
            </span>
          </div>
          <div>
            Role:{" "}
            <span className="font-mono text-slate-800">
              {currentUser?.role || "Standard Operator"}
            </span>
          </div>
          <div>
            Super Admin:{" "}
            <span className="font-mono text-rose-600 font-bold">false</span>
          </div>
        </div>
      </div>
    );
  }

  // Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserDept.trim()) {
      showBanner(
        "error",
        "Full Name, Email Address, and Department are required.",
      );
      return;
    }

    setIsSubmittingUser(true);
    try {
      const payload: AdminUserCreateRequest = {
        email: newUserEmail.trim(),
        full_name: newUserName.trim(),
        department: newUserDept.trim(),
        role_id: newUserRoleId ? parseInt(newUserRoleId, 10) : null,
        is_super_admin: newUserIsSuperAdmin,
      };

      const res = await apiService.createAdminUser(payload);
      if (res.warning) {
        showBanner("warning", res.warning);
      } else {
        showBanner(
          "success",
          `User ${payload.email} created. A temporary password was emailed.`,
        );
      }

      setIsCreateUserModalOpen(false);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserDept("");
      setNewUserRoleId("");
      setNewUserIsSuperAdmin(false);
      await fetchAdminData();
    } catch (err: any) {
      showBanner("error", err.message || "Failed to create user");
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Open Edit User
  const handleOpenEditUser = (user: AdminUser) => {
    setSelectedUserForEdit(user);
    setEditUserName(user.full_name || user.name || "");
    setEditUserDept(user.department || "");
    setEditUserRoleId(user.role_id ? String(user.role_id) : "");
    setEditUserIsSuperAdmin(user.is_super_admin);
    setEditUserIsActive(user.is_active);
    setIsEditUserModalOpen(true);
  };

  // Submit Edit User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;

    setIsSubmittingEditUser(true);
    try {
      // Body has only the fields being changed
      const payload: AdminUserUpdateRequest = {};

      const currentName =
        selectedUserForEdit.full_name || selectedUserForEdit.name || "";
      const trimmedName = editUserName.trim();
      if (trimmedName !== currentName) {
        payload.full_name = trimmedName || null;
      }

      if (
        editUserDept.trim() &&
        editUserDept.trim() !== selectedUserForEdit.department
      ) {
        payload.department = editUserDept.trim();
      }

      const newRoleId = editUserRoleId ? parseInt(editUserRoleId, 10) : null;
      if (newRoleId !== selectedUserForEdit.role_id) {
        payload.role_id = newRoleId;
      }

      if (editUserIsSuperAdmin !== selectedUserForEdit.is_super_admin) {
        payload.is_super_admin = editUserIsSuperAdmin;
      }

      if (editUserIsActive !== selectedUserForEdit.is_active) {
        payload.is_active = editUserIsActive;
      }

      if (Object.keys(payload).length === 0) {
        showBanner("warning", "No changes detected to update.");
        setIsEditUserModalOpen(false);
        setSelectedUserForEdit(null);
        setEditUserName("");
        return;
      }

      await apiService.updateAdminUser(selectedUserForEdit.id, payload);
      showBanner(
        "success",
        `User ${selectedUserForEdit.email} updated successfully.`,
      );
      setIsEditUserModalOpen(false);
      setSelectedUserForEdit(null);
      setEditUserName("");
      await fetchAdminData();
    } catch (err: any) {
      showBanner("error", err.message || "Failed to update user");
    } finally {
      setIsSubmittingEditUser(false);
    }
  };

  // Helper checks for deletion safety rules
  const isSelfUser = (u: AdminUser): boolean => {
    if (currentUser?.id != null && u.id === currentUser.id) return true;
    if (
      currentUser?.email &&
      u.email &&
      currentUser.email.toLowerCase() === u.email.toLowerCase()
    )
      return true;
    if (
      currentUser?.username &&
      u.email &&
      currentUser.username.toLowerCase() === u.email.toLowerCase()
    )
      return true;
    return false;
  };

  const isLastActiveSuperAdmin = (u: AdminUser): boolean => {
    if (!u.is_super_admin || !u.is_active) return false;
    const activeSuperAdmins = users.filter(
      (x) => x.is_super_admin && x.is_active,
    );
    return activeSuperAdmins.length <= 1;
  };

  // Delete User Handler
  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    if (isSelfUser(userToDelete)) {
      showBanner("error", "You can't delete your own account.");
      return;
    }

    if (isLastActiveSuperAdmin(userToDelete)) {
      showBanner("error", "Can't delete the last active super admin.");
      return;
    }

    setIsDeletingUser(true);
    try {
      await apiService.deleteAdminUser(userToDelete.id);
      showBanner(
        "success",
        `User ${userToDelete.email} was deleted successfully.`,
      );
      setUserToDelete(null);
      if (selectedUserForEdit?.id === userToDelete.id) {
        setIsEditUserModalOpen(false);
        setSelectedUserForEdit(null);
      }
      await fetchAdminData();
    } catch (err: any) {
      showBanner("error", err.message || "Failed to delete user");
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Create Role using Existing User and Department (No new name prompt)
  const handleCreateRoleWithExistingDetails = async (
    name: string,
    dept: string,
    permissions: ValidPermissionScope[],
    context: "create" | "edit",
  ) => {
    try {
      const payload: AdminRoleCreateRequest = {
        name: name.trim(),
        department: dept.trim(),
        permissions,
      };

      const created = await apiService.createAdminRole(payload);
      showBanner(
        "success",
        `Role "${payload.name}" (${payload.department}) created and assigned.`,
      );
      await fetchAdminData();
      if (created && created.id) {
        if (context === "create") {
          setNewUserRoleId(String(created.id));
        } else {
          setEditUserRoleId(String(created.id));
        }
      }
    } catch (err: any) {
      showBanner("error", err.message || "Failed to create role");
      throw err;
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const roleName = roles.find((r) => r.id === u.role_id)?.name || "";
    const userName = (u.name || u.full_name || "").toLowerCase();
    return (
      userName.includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q) ||
      roleName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Super Admin status */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 sm:p-7 shadow-lg border border-slate-700/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-orange-600/90 text-white flex items-center justify-center shadow-md shadow-orange-900/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold tracking-tight">
                  Super Admin Administration
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  Restricted Route (/admin)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Manage organization users, department assignments, and
                permission bundles (Roles).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={fetchAdminData}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreateUserModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white rounded-xl text-xs font-semibold shadow-md shadow-orange-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          </div>
        </div>

        {/* User Search & Stats Bar */}
        <div className="mt-6 pt-5 border-t border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 text-xs">
            <div className="flex items-center space-x-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
              <Users className="w-3.5 h-3.5 text-orange-400" />
              <span className="font-semibold text-white">{users.length}</span>
              <span className="text-slate-400">Total Accounts</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-white">
                {users.filter((u) => u.is_active).length}
              </span>
              <span className="text-slate-400">Active</span>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by email, dept, or role..."
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center space-x-2.5 text-xs animate-in fade-in duration-150 ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : notification.type === "warning"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* USERS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              System Accounts
            </h3>
            <p className="text-xs text-slate-500">
              Accounts registered under the organization. Assign or remove roles
              directly via the user actions.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Showing {filteredUsers.length} of {users.length} users
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Super Admin</th>
                <th className="px-4 py-3">Password Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-orange-600" />
                      <span>Loading users from /admin/users...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-500">
                    No users match your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const assignedRole = roles.find((r) => r.id === u.role_id);
                  const displayName = u.name?.trim() || u.full_name?.trim();
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {u.id}
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {displayName ? (
                          <div className="flex items-center space-x-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="font-semibold text-slate-900">
                              {displayName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            No name set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="flex items-center space-x-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>{u.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        <div className="flex items-center space-x-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{u.department}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {assignedRole ? (
                          <span className="px-2 py-0.5 rounded-md font-medium text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            {assignedRole.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            No Role
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <UserCheck className="w-3 h-3 text-emerald-600" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <UserX className="w-3 h-3 text-rose-600" />
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_super_admin ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                            <ShieldCheck className="w-3 h-3 text-orange-600" />
                            <span>Super Admin</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.must_change_password ? (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                            title="User must change password upon next login"
                          >
                            <Lock className="w-3 h-3 text-amber-600" />
                            <span>Temp Password</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditUser(u)}
                            className="inline-flex items-center space-x-1 px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit user settings"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUserToDelete(u)}
                            className={`inline-flex items-center space-x-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                              isSelfUser(u) || isLastActiveSuperAdmin(u)
                                ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                : "text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                            }`}
                            title={
                              isSelfUser(u)
                                ? "You can't delete your own account"
                                : isLastActiveSuperAdmin(u)
                                  ? "Can't delete the last active super admin"
                                  : `Delete ${u.email}`
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {isCreateUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  Create New User
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateUser}
              className="flex flex-col flex-1 overflow-hidden min-h-0"
            >
              <div className="p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    User Email Address *
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="operator@organization.gov"
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="e.g. Sarah Connor"
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department / Sector *
                  </label>
                  <input
                    type="text"
                    value={newUserDept}
                    onChange={(e) => setNewUserDept(e.target.value)}
                    placeholder="e.g. Operations, Field Logistics, Audit"
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assign Role
                  </label>
                  <RoleDropdownWithCheckbox
                    selectedRoleId={newUserRoleId}
                    roles={roles}
                    onChange={(id) => setNewUserRoleId(id)}
                    userName={newUserName}
                    userEmail={newUserEmail}
                    userDepartment={newUserDept}
                    onCreateRoleWithExistingDetails={(name, dept, perms) =>
                      handleCreateRoleWithExistingDetails(
                        name,
                        dept,
                        perms,
                        "create",
                      )
                    }
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Click the checkbox with the role name to assign. Want to
                    remove access? Click the checkbox to uncheck.
                  </p>
                </div>

                <div className="pt-2">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUserIsSuperAdmin}
                      onChange={(e) => setNewUserIsSuperAdmin(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-800">
                        Grant Super Admin Rights
                      </span>
                      <p className="text-slate-500 text-[11px]">
                        Enables access to this /admin route and user management.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Password notice */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start space-x-2">
                  <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>
                    The system will generate a temporary password and dispatch
                    it to the email address. The user must change it upon their
                    first sign-in.
                  </span>
                </div>
              </div>

              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end space-x-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {isSubmittingUser ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create User</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {isEditUserModalOpen && selectedUserForEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  Edit User
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleUpdateUser}
              className="flex flex-col flex-1 overflow-hidden min-h-0"
            >
              <div className="p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-0.5">
                    Email
                  </label>
                  <p className="text-xs font-mono font-medium text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg">
                    {selectedUserForEdit.email}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name{" "}
                    <span className="text-slate-400 font-normal">
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    placeholder="e.g. Sarah Connor (Optional)"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Optional. Fill in name for accounts created without a name.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editUserDept}
                    onChange={(e) => setEditUserDept(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assign Role
                  </label>
                  <RoleDropdownWithCheckbox
                    selectedRoleId={editUserRoleId}
                    roles={roles}
                    onChange={(id) => setEditUserRoleId(id)}
                    userName={
                      editUserName ||
                      selectedUserForEdit.name ||
                      selectedUserForEdit.full_name ||
                      undefined
                    }
                    userEmail={selectedUserForEdit.email}
                    userDepartment={editUserDept}
                    onCreateRoleWithExistingDetails={(name, dept, perms) =>
                      handleCreateRoleWithExistingDetails(
                        name,
                        dept,
                        perms,
                        "edit",
                      )
                    }
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Click the checkbox with role name to assign. Want to remove
                    access? Click the checkbox to uncheck.
                  </p>
                </div>

                <div className="pt-1 space-y-3">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editUserIsActive}
                      onChange={(e) => setEditUserIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-800">
                        Account Active
                      </span>
                      <p className="text-slate-500 text-[11px]">
                        Allow user to sign in and execute actions.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editUserIsSuperAdmin}
                      onChange={(e) =>
                        setEditUserIsSuperAdmin(e.target.checked)
                      }
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-800">
                        Super Administrator Privileges
                      </span>
                      <p className="text-slate-500 text-[11px]">
                        Grants full /admin route access.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedUserForEdit;
                    setIsEditUserModalOpen(false);
                    setUserToDelete(target);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1.5 rounded-lg hover:bg-rose-50 inline-flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete User</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditUserModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEditUser}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    {isSubmittingEditUser ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRMATION MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/60">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900">
                  Delete User Account
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Check restriction 1: Self Account */}
              {isSelfUser(userToDelete) ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2.5 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Action Forbidden</span>
                    <span>
                      You cannot delete your own account while signed in.
                    </span>
                  </div>
                </div>
              ) : isLastActiveSuperAdmin(userToDelete) ? (
                /* Check restriction 2: Last active super admin */
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2.5 text-xs text-rose-900">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Protected Account</span>
                    <span>
                      Can&apos;t delete the last active super admin. At least
                      one active super administrator must remain in the system.
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to permanently delete the user account
                  for{" "}
                  <strong className="text-slate-900">
                    {userToDelete.email}
                  </strong>
                  ? This action is irreversible and immediately revokes all
                  authentication credentials and permissions.
                </p>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">User ID:</span>
                  <span className="font-mono text-slate-900 font-semibold">
                    {userToDelete.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-medium text-slate-900">
                    {userToDelete.email}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department:</span>
                  <span className="font-medium text-slate-900">
                    {userToDelete.department}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Role:</span>
                  <span className="font-medium text-slate-900">
                    {roles.find((r) => r.id === userToDelete.role_id)?.name ||
                      "No Role"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Super Admin:</span>
                  <span className="font-semibold text-slate-900">
                    {userToDelete.is_super_admin ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  disabled={isDeletingUser}
                  onClick={() => setUserToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    isDeletingUser ||
                    isSelfUser(userToDelete) ||
                    isLastActiveSuperAdmin(userToDelete)
                  }
                  onClick={handleDeleteUser}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer ${
                    isSelfUser(userToDelete) ||
                    isLastActiveSuperAdmin(userToDelete)
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-rose-600 hover:bg-rose-700 text-white"
                  }`}
                >
                  {isDeletingUser ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Account</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
