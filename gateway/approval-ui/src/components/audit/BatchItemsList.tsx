import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import type { TransmissionItem } from "../../types";

interface BatchItemsListProps {
  batchId: string;
  onViewPayload?: (itemId: string) => void;
  isAdmin?: boolean;
}

export default function BatchItemsList({
  batchId,
  onViewPayload,
  isAdmin,
}: BatchItemsListProps) {
  const [items, setItems] = useState<TransmissionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<
    Record<string, { verified: boolean; hash_match: boolean }>
  >({});

  const limit = 10;

  const loadItems = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.auditTrail.getBatchItems(batchId, {
        limit,
        offset,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setIsLoading(false);
    }
  }, [batchId, offset]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleVerify = async (itemId: string) => {
    try {
      setVerifyingId(itemId);
      const result = await api.auditTrail.verifyItem(itemId);
      setVerifyResults((prev) => ({ ...prev, [itemId]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (isLoading) {
    return (
      <div
        style={{
          padding: "1rem",
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        Loading items...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "1rem",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          color: "#dc2626",
          borderRadius: "6px",
        }}
      >
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "1rem",
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        No items in this batch
      </div>
    );
  }

  return (
    <div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                padding: "0.5rem",
                textAlign: "left",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              Event Type
            </th>
            <th
              style={{
                padding: "0.5rem",
                textAlign: "left",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              Source
            </th>
            <th
              style={{
                padding: "0.5rem",
                textAlign: "left",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              Hash
            </th>
            <th
              style={{
                padding: "0.5rem",
                textAlign: "left",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              Transmitted
            </th>
            <th
              style={{
                padding: "0.5rem",
                textAlign: "right",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const verifyResult = verifyResults[item.id];
            return (
              <tr
                key={item.id}
                style={{ borderBottom: "1px solid var(--border-color)" }}
              >
                <td style={{ padding: "0.5rem" }}>{item.event_type}</td>
                <td
                  style={{ padding: "0.5rem", color: "var(--text-secondary)" }}
                >
                  {item.source_service}
                </td>
                <td
                  style={{
                    padding: "0.5rem",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  {item.payload_hash
                    ? `${item.payload_hash.substring(0, 16)}...`
                    : "-"}
                </td>
                <td
                  style={{ padding: "0.5rem", color: "var(--text-secondary)" }}
                >
                  {formatDate(item.transmitted_at)}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.25rem",
                      justifyContent: "flex-end",
                      alignItems: "center",
                    }}
                  >
                    {verifyResult && (
                      <span
                        style={{
                          padding: "0.125rem 0.375rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          backgroundColor: verifyResult.hash_match
                            ? "#dcfce7"
                            : "#fee2e2",
                          color: verifyResult.hash_match
                            ? "#166534"
                            : "#991b1b",
                        }}
                      >
                        {verifyResult.hash_match ? "Valid" : "Mismatch"}
                      </span>
                    )}
                    <button
                      onClick={() => handleVerify(item.id)}
                      disabled={verifyingId === item.id}
                      style={{
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        backgroundColor: "white",
                        cursor: "pointer",
                        opacity: verifyingId === item.id ? 0.7 : 1,
                      }}
                    >
                      {verifyingId === item.id ? "..." : "Verify"}
                    </button>
                    {isAdmin && onViewPayload && (
                      <button
                        onClick={() => onViewPayload(item.id)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.75rem",
                          border: "1px solid var(--border-color)",
                          borderRadius: "4px",
                          backgroundColor: "white",
                          cursor: "pointer",
                        }}
                      >
                        View Payload
                      </button>
                    )}
                  </div>
                </td>
              </tr>
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
            marginTop: "0.5rem",
            fontSize: "0.75rem",
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>
            {offset + 1} - {Math.min(offset + limit, total)} of {total}
          </span>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={currentPage === 1}
              style={{
                padding: "0.25rem 0.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                backgroundColor: "white",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.5 : 1,
                fontSize: "0.75rem",
              }}
            >
              Prev
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={currentPage === totalPages}
              style={{
                padding: "0.25rem 0.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                backgroundColor: "white",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.5 : 1,
                fontSize: "0.75rem",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
