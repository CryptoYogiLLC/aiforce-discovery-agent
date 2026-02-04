import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import type { TransmissionBatch } from "../../types";
import BatchItemsList from "./BatchItemsList";

interface TransmissionBatchListProps {
  onViewPayload?: (itemId: string) => void;
  isAdmin?: boolean;
}

const statusBadgeStyles: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#f3f4f6", color: "#374151" },
  transmitting: { bg: "#dbeafe", color: "#1e40af" },
  completed: { bg: "#dcfce7", color: "#166534" },
  failed: { bg: "#fee2e2", color: "#991b1b" },
};

export default function TransmissionBatchList({
  onViewPayload,
  isAdmin,
}: TransmissionBatchListProps) {
  const [batches, setBatches] = useState<TransmissionBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const limit = 20;

  const loadBatches = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.auditTrail.listTransmissions({
        status: statusFilter || undefined,
        limit,
        offset,
      });
      setBatches(data.batches || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batches");
    } finally {
      setIsLoading(false);
    }
  }, [offset, statusFilter]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      {/* Filters */}
      <div style={{ marginBottom: "1rem" }}>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          style={{
            padding: "0.5rem",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            minWidth: "150px",
          }}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="transmitting">Transmitting</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
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
          Loading transmission batches...
        </div>
      ) : batches.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
          }}
        >
          No transmission batches found
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
                    width: "40px",
                  }}
                />
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Batch #
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
                    textAlign: "right",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Items
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Transmitted At
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Response
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                const statusStyle =
                  statusBadgeStyles[batch.status] || statusBadgeStyles.pending;

                return (
                  <>
                    <tr
                      key={batch.id}
                      style={{
                        borderBottom: isExpanded
                          ? "none"
                          : "1px solid var(--border-color)",
                        cursor: "pointer",
                        backgroundColor: isExpanded ? "#f9fafb" : "transparent",
                      }}
                      onClick={() =>
                        setExpandedBatchId(isExpanded ? null : batch.id)
                      }
                    >
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            transition: "transform 0.2s",
                            transform: isExpanded
                              ? "rotate(90deg)"
                              : "rotate(0)",
                          }}
                        >
                          ▶
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 500 }}>
                        #{batch.batch_number}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                          }}
                        >
                          {batch.status}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {batch.item_count}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontSize: "0.875rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {formatDate(batch.transmitted_at)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {batch.response_code ? (
                          <span
                            style={{
                              color:
                                batch.response_code >= 200 &&
                                batch.response_code < 300
                                  ? "#166534"
                                  : "#991b1b",
                            }}
                          >
                            {batch.response_code}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>
                            -
                          </span>
                        )}
                        {batch.error_message && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#dc2626",
                              marginTop: "0.25rem",
                            }}
                          >
                            {batch.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${batch.id}-items`}>
                        <td
                          colSpan={6}
                          style={{
                            padding: "0 1rem 1rem 1rem",
                            backgroundColor: "#f9fafb",
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          <BatchItemsList
                            batchId={batch.id}
                            onViewPayload={onViewPayload}
                            isAdmin={isAdmin}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
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
                {total} batches
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
