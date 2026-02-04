import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { Discovery, AuditLogEntry } from "../types";
import StatusBadge from "../components/StatusBadge";
import RejectModal from "../components/RejectModal";

export default function DiscoveryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const disc = await api.discoveries.get(id);
        setDiscovery(disc);

        // Load audit log separately so it doesn't block discovery display
        try {
          const audit = await api.audit.getForDiscovery(id);
          setAuditLog(audit);
        } catch {
          // Audit log may not be available yet
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load discovery",
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  const handleApprove = async () => {
    if (!id || !confirm("Approve this discovery for transmission?")) return;

    try {
      setActionLoading(true);
      const updated = await api.discoveries.approve(id);
      setDiscovery(updated);
      const audit = await api.audit.getForDiscovery(id);
      setAuditLog(audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!id) return;

    try {
      setActionLoading(true);
      const updated = await api.discoveries.reject(id, reason);
      setDiscovery(updated);
      setShowRejectModal(false);
      const audit = await api.audit.getForDiscovery(id);
      setAuditLog(audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading discovery...</div>;
  }

  if (!discovery) {
    return <div className="error">Discovery not found</div>;
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <button
        className="btn btn-outline"
        onClick={() => navigate(-1)}
        style={{ marginBottom: "1rem" }}
      >
        &larr; Back
      </button>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <h2 style={{ marginBottom: "0.5rem" }}>{discovery.event_type}</h2>
            <p style={{ color: "var(--text-secondary)" }}>ID: {discovery.id}</p>
          </div>
          <StatusBadge status={discovery.status} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <strong>Source Service</strong>
            <p>{discovery.source_service}</p>
          </div>
          <div>
            <strong>Created</strong>
            <p>{formatDate(discovery.created_at)}</p>
          </div>
          {discovery.reviewed_by && (
            <>
              <div>
                <strong>Reviewed By</strong>
                <p>{discovery.reviewed_by}</p>
              </div>
              <div>
                <strong>Reviewed At</strong>
                <p>{formatDate(discovery.reviewed_at)}</p>
              </div>
            </>
          )}
          {discovery.review_notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <strong>Review Notes</strong>
              <p style={{ color: "var(--danger-color)" }}>
                {discovery.review_notes}
              </p>
            </div>
          )}
        </div>

        {discovery.status === "pending" && (
          <div
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}
          >
            <button
              className="btn btn-success"
              onClick={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading ? "Processing..." : "Approve"}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setShowRejectModal(true)}
              disabled={actionLoading}
            >
              Reject
            </button>
          </div>
        )}

        <div>
          <h3 style={{ marginBottom: "0.5rem" }}>Payload</h3>
          <pre className="json-view">
            {JSON.stringify(discovery.payload, null, 2)}
          </pre>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Audit History</h3>
        {auditLog.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>No audit entries</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Details</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span style={{ textTransform: "capitalize" }}>
                      {entry.action}
                    </span>
                  </td>
                  <td>{entry.actor || "-"}</td>
                  <td>
                    {entry.details ? (
                      <code style={{ fontSize: "0.75rem" }}>
                        {JSON.stringify(entry.details)}
                      </code>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{formatDate(entry.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showRejectModal && (
        <RejectModal
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
