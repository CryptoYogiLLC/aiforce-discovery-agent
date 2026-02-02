import { useState } from "react";

interface RejectModalProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function RejectModal({
  onConfirm,
  onCancel,
  loading = false,
}: RejectModalProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim()) {
      onConfirm(reason.trim());
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reject Discovery</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="reason" style={{ display: "block", marginBottom: "0.5rem" }}>
              Rejection Reason <span style={{ color: "var(--danger-color)" }}>*</span>
            </label>
            <textarea
              id="reason"
              className="input"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a reason for rejection..."
              required
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={loading || !reason.trim()}
            >
              {loading ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
