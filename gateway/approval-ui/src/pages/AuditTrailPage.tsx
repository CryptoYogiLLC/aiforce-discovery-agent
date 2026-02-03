import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  TransmissionBatchList,
  PayloadViewModal,
  AuditLogViewer,
} from "../components/audit";

type TabType = "transmissions" | "logs";

export default function AuditTrailPage() {
  const { hasPermission, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("transmissions");
  const [viewPayloadItemId, setViewPayloadItemId] = useState<string | null>(
    null,
  );

  const isAdmin = hasRole("admin");

  if (!hasPermission("audit:view")) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          You do not have permission to view the audit trail.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2>Audit Trail</h2>
        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
          Review transmission history and audit logs for compliance
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <button
          onClick={() => setActiveTab("transmissions")}
          style={{
            padding: "0.75rem 1.5rem",
            border: "none",
            backgroundColor: "transparent",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: activeTab === "transmissions" ? 600 : 400,
            color:
              activeTab === "transmissions"
                ? "var(--primary-color)"
                : "var(--text-secondary)",
            borderBottom:
              activeTab === "transmissions"
                ? "2px solid var(--primary-color)"
                : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Transmissions
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          style={{
            padding: "0.75rem 1.5rem",
            border: "none",
            backgroundColor: "transparent",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: activeTab === "logs" ? 600 : 400,
            color:
              activeTab === "logs"
                ? "var(--primary-color)"
                : "var(--text-secondary)",
            borderBottom:
              activeTab === "logs"
                ? "2px solid var(--primary-color)"
                : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Audit Logs
        </button>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === "transmissions" && (
          <TransmissionBatchList
            onViewPayload={(itemId) => setViewPayloadItemId(itemId)}
            isAdmin={isAdmin}
          />
        )}

        {activeTab === "logs" && <AuditLogViewer isAdmin={isAdmin} />}
      </div>

      {/* Payload View Modal */}
      {viewPayloadItemId && (
        <PayloadViewModal
          itemId={viewPayloadItemId}
          onClose={() => setViewPayloadItemId(null)}
        />
      )}
    </div>
  );
}
