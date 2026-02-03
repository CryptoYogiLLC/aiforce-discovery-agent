import { useState, useEffect, useCallback, FormEvent } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type {
  User,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
} from "../types";

// Role display configuration
const ROLE_CONFIG: Record<
  UserRole,
  { label: string; color: string; description: string }
> = {
  admin: {
    label: "Admin",
    color: "#dc2626",
    description: "Full access to all features including user management",
  },
  operator: {
    label: "Operator",
    color: "#2563eb",
    description: "Can run scans, approve/reject discoveries, manage dry-runs",
  },
  viewer: {
    label: "Viewer",
    color: "#6b7280",
    description: "Read-only access to view discoveries and reports",
  },
};

function RoleBadge({ role }: { role: UserRole }) {
  const config = ROLE_CONFIG[role];
  return (
    <span
      style={{
        padding: "0.25rem 0.5rem",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: 500,
        backgroundColor: `${config.color}20`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      style={{
        padding: "0.25rem 0.5rem",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: 500,
        backgroundColor: isActive ? "#dcfce7" : "#fee2e2",
        color: isActive ? "#166534" : "#991b1b",
      }}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

interface UserModalProps {
  user?: User;
  onSave: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
}

function UserModal({
  user,
  onSave,
  onClose,
  isSubmitting,
  error,
}: UserModalProps) {
  const isEdit = Boolean(user);
  const [formData, setFormData] = useState({
    username: user?.username || "",
    email: user?.email || "",
    password: "",
    role: user?.role || ("viewer" as UserRole),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      const updates: UpdateUserInput = {};
      if (formData.email !== user?.email) updates.email = formData.email;
      if (formData.role !== user?.role) updates.role = formData.role;
      await onSave(updates);
    } else {
      await onSave({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "450px", margin: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1.5rem" }}>
          {isEdit ? "Edit User" : "Add New User"}
        </h2>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#dc2626",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="username"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Username {!isEdit && "*"}
            </label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              required={!isEdit}
              disabled={isEdit}
              pattern="^[a-zA-Z0-9_-]+$"
              minLength={3}
              maxLength={100}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
                backgroundColor: isEdit ? "#f3f4f6" : "white",
              }}
            />
            {!isEdit && (
              <small style={{ color: "var(--text-secondary)" }}>
                3-100 characters, alphanumeric, underscores, or hyphens
              </small>
            )}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Email *
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          {!isEdit && (
            <div style={{ marginBottom: "1rem" }}>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                Password *
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                minLength={12}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
              <small style={{ color: "var(--text-secondary)" }}>
                Minimum 12 characters
              </small>
            </div>
          )}

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Role *
            </label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {(Object.keys(ROLE_CONFIG) as UserRole[]).map((role) => (
                <label
                  key={role}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    border: `2px solid ${
                      formData.role === role
                        ? ROLE_CONFIG[role].color
                        : "var(--border-color)"
                    }`,
                    borderRadius: "6px",
                    cursor: "pointer",
                    backgroundColor:
                      formData.role === role
                        ? `${ROLE_CONFIG[role].color}10`
                        : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={formData.role === role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        role: e.target.value as UserRole,
                      })
                    }
                    style={{ marginTop: "0.25rem" }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 500,
                        color: ROLE_CONFIG[role].color,
                      }}
                    >
                      {ROLE_CONFIG[role].label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {ROLE_CONFIG[role].description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.75rem 1.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{
                padding: "0.75rem 1.5rem",
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ResetPasswordModalProps {
  user: User;
  onClose: () => void;
  onReset: () => Promise<{ recovery_code: string; expires_at: string }>;
}

function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: ResetPasswordModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    recovery_code: string;
    expires_at: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const response = await onReset();
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (result?.recovery_code) {
      await navigator.clipboard.writeText(result.recovery_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "450px", margin: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1rem" }}>Reset Password</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Reset password for: <strong>{user.username}</strong>
        </p>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#dc2626",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        {result ? (
          <>
            <div
              style={{
                padding: "1rem",
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            >
              <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>
                Recovery Code:
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <code
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {result.recovery_code}
                </code>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "pointer",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#92400e",
                }}
              >
                Expires: {new Date(result.expires_at).toLocaleString()}
              </p>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginBottom: "1rem",
              }}
            >
              Share this recovery code securely with the user. They can use it
              on the login page to set a new password.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                className="btn btn-primary"
                style={{ padding: "0.75rem 1.5rem" }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: "1rem",
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#92400e" }}>
                This will generate a recovery code that the user can use to set
                a new password. The code expires in 1 hour.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: "0.75rem 1.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={isSubmitting}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Generating..." : "Generate Recovery Code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmStyle?: "danger" | "primary";
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmStyle = "primary",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "400px", margin: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1rem" }}>{title}</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {message}
        </p>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#dc2626",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
        >
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: "0.75rem 1.5rem",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            style={{
              padding: "0.75rem 1.5rem",
              border: "none",
              borderRadius: "6px",
              backgroundColor:
                confirmStyle === "danger" ? "#dc2626" : "var(--primary-color)",
              color: "white",
              cursor: "pointer",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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
