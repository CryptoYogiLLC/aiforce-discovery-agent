import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../services/api";
import type { DryrunSession, DryrunDiscovery, DryrunContainer } from "../types";

const statusBadgeStyles: Record<string, { bg: string; color: string }> = {
  completed: { bg: "#dcfce7", color: "#166534" },
  running: { bg: "#dbeafe", color: "#1e40af" },
  generating: { bg: "#fef3c7", color: "#92400e" },
  pending: { bg: "#f3f4f6", color: "#374151" },
  failed: { bg: "#fee2e2", color: "#991b1b" },
  cleaning_up: { bg: "#fef3c7", color: "#92400e" },
  cleaned: { bg: "#f3f4f6", color: "#6b7280" },
};

const discoveryStatusStyles: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#f3f4f6", color: "#374151" },
  approved: { bg: "#dcfce7", color: "#166534" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
};

export default function DryRunSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<DryrunSession | null>(null);
  const [discoveries, setDiscoveries] = useState<DryrunDiscovery[]>([]);
  const [containers, setContainers] = useState<DryrunContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"discoveries" | "containers">(
    "discoveries",
  );

  const loadData = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);

      const [sessionData, discoveriesData, containersData] = await Promise.all([
        api.dryrun.getSession(sessionId),
        api.dryrun.getDiscoveries(sessionId, { limit: 100 }),
        api.dryrun.getContainers(sessionId),
      ]);

      setSession(sessionData);
      setDiscoveries(discoveriesData.discoveries);
      setContainers(containersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReviewDiscovery = async (
    discoveryId: string,
    status: "approved" | "rejected",
  ) => {
    try {
      await api.dryrun.reviewDiscovery(discoveryId, status);
      // Reload discoveries
      const discoveriesData = await api.dryrun.getDiscoveries(sessionId!, {
        limit: 100,
      });
      setDiscoveries(discoveriesData.discoveries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to review discovery",
      );
    }
  };

  const handleExport = async () => {
    if (!sessionId) return;

    try {
      const exportData = await api.dryrun.exportSession(sessionId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dryrun-session-${sessionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export session");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading session...</div>;
  }

  if (!session) {
    return (
      <div className="card">
        <p>Session not found.</p>
        <Link to="/dryrun" className="btn btn-primary">
          Back to Dry-Run
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/dryrun"
          style={{
            color: "var(--primary-color)",
            textDecoration: "none",
          }}
        >
          ← Back to Dry-Run
        </Link>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Session Header */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2 style={{ margin: 0, marginBottom: "0.5rem" }}>
              Dry-Run Session
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                fontFamily: "monospace",
                fontSize: "0.875rem",
              }}
            >
              ID: {session.id}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span
              className="badge"
              style={{
                backgroundColor:
                  statusBadgeStyles[session.status]?.bg || "#f3f4f6",
                color: statusBadgeStyles[session.status]?.color || "#374151",
              }}
            >
              {session.status}
            </span>
            <button className="btn btn-outline" onClick={handleExport}>
              📥 Export
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          <div>
            <div
              style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}
            >
              Started At
            </div>
            <div style={{ fontWeight: 500 }}>
              {formatDate(session.started_at)}
            </div>
          </div>
          <div>
            <div
              style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}
            >
              Completed At
            </div>
            <div style={{ fontWeight: 500 }}>
              {formatDate(session.completed_at)}
            </div>
          </div>
          <div>
            <div
              style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}
            >
              Containers
            </div>
            <div style={{ fontWeight: 500 }}>{session.container_count}</div>
          </div>
          <div>
            <div
              style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}
            >
              Discoveries
            </div>
            <div style={{ fontWeight: 500 }}>{discoveries.length}</div>
          </div>
        </div>

        {session.error_message && (
          <div className="error" style={{ marginTop: "1rem", marginBottom: 0 }}>
            <strong>Error:</strong> {session.error_message}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          marginBottom: "1rem",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <button
          className="btn"
          onClick={() => setActiveTab("discoveries")}
          style={{
            borderRadius: "6px 6px 0 0",
            borderBottom: "none",
            backgroundColor:
              activeTab === "discoveries"
                ? "var(--surface)"
                : "var(--background)",
            borderBottomColor:
              activeTab === "discoveries" ? "var(--surface)" : "transparent",
            marginBottom: "-1px",
          }}
        >
          Discoveries ({discoveries.length})
        </button>
        <button
          className="btn"
          onClick={() => setActiveTab("containers")}
          style={{
            borderRadius: "6px 6px 0 0",
            borderBottom: "none",
            backgroundColor:
              activeTab === "containers"
                ? "var(--surface)"
                : "var(--background)",
            borderBottomColor:
              activeTab === "containers" ? "var(--surface)" : "transparent",
            marginBottom: "-1px",
          }}
        >
          Containers ({containers.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === "discoveries" && (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Data</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {discoveries.map((discovery) => (
                <tr key={discovery.id}>
                  <td>{discovery.source}</td>
                  <td>{discovery.discovery_type}</td>
                  <td>
                    <code
                      style={{
                        fontSize: "0.75rem",
                        backgroundColor: "var(--background)",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                      }}
                    >
                      {JSON.stringify(discovery.data).slice(0, 50)}...
                    </code>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        backgroundColor:
                          discoveryStatusStyles[discovery.status]?.bg ||
                          "#f3f4f6",
                        color:
                          discoveryStatusStyles[discovery.status]?.color ||
                          "#374151",
                      }}
                    >
                      {discovery.status}
                    </span>
                  </td>
                  <td>
                    {discovery.status === "pending" && (
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          className="btn btn-success"
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                          }}
                          onClick={() =>
                            handleReviewDiscovery(discovery.id, "approved")
                          }
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                          }}
                          onClick={() =>
                            handleReviewDiscovery(discovery.id, "rejected")
                          }
                        >
                          ✗
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {discoveries.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    No discoveries in this session
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === "containers" && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Image</th>
                <th>Ports</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => (
                <tr key={container.id}>
                  <td>
                    <code style={{ fontSize: "0.875rem" }}>
                      {container.container_name}
                    </code>
                  </td>
                  <td>{container.service_type}</td>
                  <td>
                    <code
                      style={{
                        fontSize: "0.75rem",
                        backgroundColor: "var(--background)",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                      }}
                    >
                      {container.image}
                    </code>
                  </td>
                  <td>
                    {container.port_mappings.map((pm, idx) => (
                      <span
                        key={idx}
                        className="badge"
                        style={{
                          backgroundColor: "var(--background)",
                          color: "var(--text-primary)",
                          marginRight: "0.25rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        {pm.host}:{pm.container}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        backgroundColor:
                          container.status === "running"
                            ? "#dcfce7"
                            : "#f3f4f6",
                        color:
                          container.status === "running"
                            ? "#166534"
                            : "#374151",
                      }}
                    >
                      {container.status}
                    </span>
                  </td>
                </tr>
              ))}
              {containers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    No containers in this session
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
