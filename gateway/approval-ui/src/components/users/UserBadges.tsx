import type { UserRole } from "../../types";

// Role display configuration
export const ROLE_CONFIG: Record<
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

export function RoleBadge({ role }: { role: UserRole }) {
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

export function StatusBadge({ isActive }: { isActive: boolean }) {
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
