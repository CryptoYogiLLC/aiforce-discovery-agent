import { useState } from "react";

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmStyle?: "danger" | "primary";
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmStyle = "primary",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
      setIsSubmitting(false);
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
        style={{ width: "100%", maxWidth: "400px", margin: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1rem" }}>{title}</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {message}
        </p>

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

        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
        >
          <button
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
            onClick={handleConfirm}
            disabled={isSubmitting}
            style={{
              padding: "0.75rem 1.5rem",
              border: "none",
              borderRadius: "6px",
              backgroundColor:
                confirmStyle === "danger" ? "#dc2626" : "var(--primary-color)",
              color: "white",
              cursor: "pointer",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
