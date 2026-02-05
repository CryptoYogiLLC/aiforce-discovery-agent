import { useState } from "react";
import type { User } from "../../types";

export interface ResetPasswordModalProps {
  user: User;
  onClose: () => void;
  onReset: () => Promise<{ recovery_code: string; expires_at: string }>;
}

export function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: ResetPasswordModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    recovery_code: string;
    expires_at: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const response = await onReset();
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (result?.recovery_code) {
      await navigator.clipboard.writeText(result.recovery_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        style={{ width: "100%", maxWidth: "450px", margin: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1rem" }}>Reset Password</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Reset password for: <strong>{user.username}</strong>
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

        {result ? (
          <>
            <div
              style={{
                padding: "1rem",
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            >
              <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>
                Recovery Code:
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <code
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {result.recovery_code}
                </code>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "pointer",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#92400e",
                }}
              >
                Expires: {new Date(result.expires_at).toLocaleString()}
              </p>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginBottom: "1rem",
              }}
            >
              Share this recovery code securely with the user. They can use it
              on the login page to set a new password.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                className="btn btn-primary"
                style={{ padding: "0.75rem 1.5rem" }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: "1rem",
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            >
              <p style={{ color: "#92400e" }}>
                This will generate a recovery code that the user can use to set
                a new password. The code expires in 1 hour.
              </p>
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
                onClick={handleReset}
                disabled={isSubmitting}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Generating..." : "Generate Recovery Code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
