import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import type { DryrunSessionSummary } from "../../types";

interface DryRunHistoryProps {
  onViewSession?: (sessionId: string) => void;
  refreshTrigger?: number;
}

const statusBadgeStyles: Record<string, { bg: string; color: string }> = {
  completed: { bg: "#dcfce7", color: "#166534" },
  running: { bg: "#dbeafe", color: "#1e40af" },
  generating: { bg: "#fef3c7", color: "#92400e" },
  pending: { bg: "#f3f4f6", color: "#374151" },
  failed: { bg: "#fee2e2", color: "#991b1b" },
  cleaning_up: { bg: "#fef3c7", color: "#92400e" },
  cleaned: { bg: "#f3f4f6", color: "#6b7280" },
};

export default function DryRunHistory({
  onViewSession,
  refreshTrigger,
}: DryRunHistoryProps) {
  const [sessions, setSessions] = useState<DryrunSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.dryrun.listSessions({ limit: 10 });
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshTrigger]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Recent Sessions</h3>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem" }}>Recent Sessions</h3>

      {error && <div className="error">{error}</div>}

      {sessions.length === 0 ? (
        <div
          style={{
            color: "var(--text-secondary)",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          No previous sessions found. Start a dry-run to see results here.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Profile</th>
              <th>Discoveries</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {formatDate(session.started_at || session.created_at)}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      backgroundColor:
                        statusBadgeStyles[session.status]?.bg || "#f3f4f6",
                      color:
                        statusBadgeStyles[session.status]?.color || "#374151",
                    }}
                  >
                    {session.status}
                  </span>
                </td>
                <td>{session.profile_name || "Default"}</td>
                <td>
                  <span title="Total discoveries">
                    {session.discovery_count}
                  </span>
                  {session.approved_count > 0 && (
                    <span
                      style={{
                        color: "var(--success-color)",
                        marginLeft: "0.5rem",
                      }}
                      title="Approved"
                    >
                      ✓{session.approved_count}
                    </span>
                  )}
                  {session.rejected_count > 0 && (
                    <span
                      style={{
                        color: "var(--danger-color)",
                        marginLeft: "0.5rem",
                      }}
                      title="Rejected"
                    >
                      ✗{session.rejected_count}
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="btn btn-outline"
                    onClick={() => onViewSession?.(session.id)}
                  >
                    {session.status === "failed" ? "Details" : "View"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
