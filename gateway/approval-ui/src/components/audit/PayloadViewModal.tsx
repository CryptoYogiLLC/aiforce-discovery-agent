import { useState, useEffect } from "react";
import { api } from "../../services/api";

interface PayloadViewModalProps {
  itemId: string;
  onClose: () => void;
}

export default function PayloadViewModal({
  itemId,
  onClose,
}: PayloadViewModalProps) {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (acknowledged) {
      loadPayload();
    }
  }, [acknowledged, itemId]);

  const loadPayload = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.auditTrail.getItemPayload(itemId, reason);
      setPayload(data.payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payload");
    } finally {
      setIsLoading(false);
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
        style={{
          width: "100%",
          maxWidth: "700px",
          maxHeight: "80vh",
          margin: "1rem",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1rem" }}>View Payload</h2>

        {!acknowledged ? (
          <div>
            <div
              style={{
                padding: "1rem",
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#92400e", marginBottom: "1rem" }}>
                <strong>Access Warning:</strong> Viewing this payload will be
                logged for audit purposes. This data may contain sensitive
                information.
              </p>
              <p
                style={{
                  color: "#92400e",
                  fontSize: "0.875rem",
                  marginBottom: "1rem",
                }}
              >
                Please provide a reason for accessing this data:
              </p>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                }}
              >
                Access Reason
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Compliance review, debugging issue #123"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
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
                onClick={() => setAcknowledged(true)}
                disabled={!reason.trim()}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: !reason.trim() ? 0.5 : 1,
                }}
              >
                Acknowledge & View
              </button>
            </div>
          </div>
        ) : (
          <>
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

            {isLoading ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "var(--text-secondary)",
                }}
              >
                Loading payload...
              </div>
            ) : payload ? (
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  marginBottom: "1rem",
                }}
              >
                <pre
                  style={{
                    padding: "1rem",
                    backgroundColor: "#f9fafb",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    overflow: "auto",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                className="btn btn-primary"
                style={{ padding: "0.75rem 1.5rem" }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
