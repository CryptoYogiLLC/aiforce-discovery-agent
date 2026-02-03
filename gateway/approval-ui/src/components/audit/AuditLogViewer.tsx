import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import type { AuditLog } from "../../types";

interface AuditLogViewerProps {
  isAdmin?: boolean;
}

export default function AuditLogViewer({ isAdmin }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const limit = 50;

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.auditTrail.queryLogs({
        action: actionFilter || undefined,
        actor: actorFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit,
        offset,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setIsLoading(false);
    }
  }, [offset, actionFilter, actorFilter, startDate, endDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleExport = async () => {
    if (!startDate || !endDate) {
      setError("Please select both start and end dates for export");
      return;
    }

    try {
      setIsExporting(true);
      const blob = await api.auditTrail.export({
        start_date: startDate,
        end_date: endDate,
        format: "csv",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${startDate}-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
            }}
          >
            Action
          </label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
            style={{
              padding: "0.5rem",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              minWidth: "150px",
            }}
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="transmit">Transmit</option>
            <option value="view_payload">View Payload</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
            }}
          >
            Actor
          </label>
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value);
              setOffset(0);
            }}
            placeholder="Username"
            style={{
              padding: "0.5rem",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              width: "150px",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
            }}
          >
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setOffset(0);
            }}
            style={{
              padding: "0.5rem",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
            }}
          >
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setOffset(0);
            }}
            style={{
              padding: "0.5rem",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
            }}
          />
        </div>

        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={isExporting || !startDate || !endDate}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              backgroundColor: "white",
              cursor:
                isExporting || !startDate || !endDate
                  ? "not-allowed"
                  : "pointer",
              opacity: isExporting || !startDate || !endDate ? 0.5 : 1,
            }}
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        )}
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
        <div style={{ textAlign: "center", padding: "2rem" }}>
          Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
          }}
        >
          No audit logs found
        </div>
      ) : (
        <>
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
                  Timestamp
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Action
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Actor
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Resource
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  style={{ borderBottom: "1px solid var(--border-color)" }}
                >
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(log.timestamp)}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span
                      style={{
                        padding: "0.125rem 0.375rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        backgroundColor:
                          log.action === "login" || log.action === "approve"
                            ? "#dcfce7"
                            : log.action === "reject" || log.action === "delete"
                              ? "#fee2e2"
                              : "#f3f4f6",
                        color:
                          log.action === "login" || log.action === "approve"
                            ? "#166534"
                            : log.action === "reject" || log.action === "delete"
                              ? "#991b1b"
                              : "#374151",
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>
                    {log.actor}
                  </td>
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {log.resource_type}:
                    </span>{" "}
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                      }}
                    >
                      {log.resource_id.substring(0, 8)}...
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={JSON.stringify(log.details)}
                  >
                    {log.details && Object.keys(log.details).length > 0
                      ? JSON.stringify(log.details).substring(0, 50) + "..."
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
                Showing {offset + 1} - {Math.min(offset + limit, total)} of{" "}
                {total} logs
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    opacity: currentPage === 1 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor:
                      currentPage === totalPages ? "not-allowed" : "pointer",
                    opacity: currentPage === totalPages ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
