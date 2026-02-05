import { useState, FormEvent } from "react";
import type {
  User,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
} from "../../types";
import { ROLE_CONFIG } from "./UserBadges";

export interface UserModalProps {
  user?: User;
  onSave: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function UserModal({
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
