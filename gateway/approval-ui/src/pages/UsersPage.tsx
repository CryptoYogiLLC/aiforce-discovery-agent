import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type {
  User,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
} from "../types";
import { RoleBadge, StatusBadge } from "../components/users/UserBadges";
import { UserModal } from "../components/users/UserModal";
import { ResetPasswordModal } from "../components/users/ResetPasswordModal";
import { ConfirmModal } from "../components/users/ConfirmModal";

export default function UsersPage() {
  const { user: currentUser, csrfToken, hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [activeFilter, setActiveFilter] = useState<boolean | "">("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<User | null>(null);
  const [reactivateUser, setReactivateUser] = useState<User | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const limit = 20;

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await api.users.list({
        page,
        limit,
        role: roleFilter || undefined,
        is_active: activeFilter === "" ? undefined : activeFilter,
      });
      setUsers(result.users);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, [page, roleFilter, activeFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (data: CreateUserInput | UpdateUserInput) => {
    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.users.create(data as CreateUserInput, csrfToken || "");
      setShowAddModal(false);
      loadUsers();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to create user",
      );
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async (data: CreateUserInput | UpdateUserInput) => {
    if (!editingUser) return;
    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.users.update(
        editingUser.id,
        data as UpdateUserInput,
        csrfToken || "",
      );
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to update user",
      );
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return { recovery_code: "", expires_at: "" };
    return api.users.resetPassword(resetPasswordUser.id, csrfToken || "");
  };

  const handleDeactivate = async () => {
    if (!deactivateUser) return;
    await api.users.deactivate(deactivateUser.id, csrfToken || "");
    setDeactivateUser(null);
    loadUsers();
  };

  const handleReactivate = async () => {
    if (!reactivateUser) return;
    await api.users.reactivate(reactivateUser.id, csrfToken || "");
    setReactivateUser(null);
    loadUsers();
  };

  const canCreate = hasPermission("user:create");
  const canEdit = hasPermission("user:edit");
  const canDelete = hasPermission("user:delete");

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  if (!hasPermission("user:view")) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          You do not have permission to view user management.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h2>User Management</h2>
        {canCreate && (
          <button
            onClick={() => {
              setModalError(null);
              setShowAddModal(true);
            }}
            className="btn btn-primary"
          >
            + Add User
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.25rem",
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
              }}
            >
              Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as UserRole | "");
                setPage(1);
              }}
              style={{
                padding: "0.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                minWidth: "150px",
              }}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.25rem",
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
              }}
            >
              Status
            </label>
            <select
              value={activeFilter === "" ? "" : String(activeFilter)}
              onChange={(e) => {
                setActiveFilter(
                  e.target.value === "" ? "" : e.target.value === "true",
                );
                setPage(1);
              }}
              style={{
                padding: "0.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                minWidth: "150px",
              }}
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#dc2626",
            borderRadius: "6px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          Loading users...
        </div>
      ) : (
        <>
          {/* Users Table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    Username
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    Email
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    Role
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    Last Login
                  </th>
                  <th
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "right",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <tr
                        key={user.id}
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                        }}
                      >
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            {user.username}
                            {isSelf && (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.125rem 0.375rem",
                                  backgroundColor: "#e0f2fe",
                                  color: "#0369a1",
                                  borderRadius: "4px",
                                }}
                              >
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {user.email}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <RoleBadge role={user.role} />
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <StatusBadge isActive={user.is_active} />
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {formatDate(user.last_login_at)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "right",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              justifyContent: "flex-end",
                            }}
                          >
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setModalError(null);
                                  setEditingUser(user);
                                }}
                                style={{
                                  padding: "0.375rem 0.75rem",
                                  fontSize: "0.875rem",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "4px",
                                  backgroundColor: "white",
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => setResetPasswordUser(user)}
                                style={{
                                  padding: "0.375rem 0.75rem",
                                  fontSize: "0.875rem",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "4px",
                                  backgroundColor: "white",
                                  cursor: "pointer",
                                }}
                              >
                                Reset Password
                              </button>
                            )}
                            {canDelete &&
                              !isSelf &&
                              (user.is_active ? (
                                <button
                                  onClick={() => setDeactivateUser(user)}
                                  style={{
                                    padding: "0.375rem 0.75rem",
                                    fontSize: "0.875rem",
                                    border: "1px solid #fecaca",
                                    borderRadius: "4px",
                                    backgroundColor: "#fef2f2",
                                    color: "#dc2626",
                                    cursor: "pointer",
                                  }}
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => setReactivateUser(user)}
                                  style={{
                                    padding: "0.375rem 0.75rem",
                                    fontSize: "0.875rem",
                                    border: "1px solid #bbf7d0",
                                    borderRadius: "4px",
                                    backgroundColor: "#f0fdf4",
                                    color: "#166534",
                                    cursor: "pointer",
                                  }}
                                >
                                  Reactivate
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "1rem",
              }}
            >
              <span
                style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}
              >
                Showing {(page - 1) * limit + 1} -{" "}
                {Math.min(page * limit, total)} of {total} users
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    opacity: page === totalPages ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddModal && (
        <UserModal
          onSave={handleCreateUser}
          onClose={() => setShowAddModal(false)}
          isSubmitting={isSubmitting}
          error={modalError}
        />
      )}

      {editingUser && (
        <UserModal
          user={editingUser}
          onSave={handleUpdateUser}
          onClose={() => setEditingUser(null)}
          isSubmitting={isSubmitting}
          error={modalError}
        />
      )}

      {resetPasswordUser && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onReset={handleResetPassword}
        />
      )}

      {deactivateUser && (
        <ConfirmModal
          title="Deactivate User"
          message={`Are you sure you want to deactivate "${deactivateUser.username}"? They will no longer be able to log in.`}
          confirmLabel="Deactivate"
          confirmStyle="danger"
          onConfirm={handleDeactivate}
          onClose={() => setDeactivateUser(null)}
        />
      )}

      {reactivateUser && (
        <ConfirmModal
          title="Reactivate User"
          message={`Are you sure you want to reactivate "${reactivateUser.username}"? They will be able to log in again.`}
          confirmLabel="Reactivate"
          confirmStyle="primary"
          onConfirm={handleReactivate}
          onClose={() => setReactivateUser(null)}
        />
      )}
    </div>
  );
}
