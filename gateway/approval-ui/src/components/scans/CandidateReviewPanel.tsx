/**
 * Panel for reviewing and selecting database candidates for deep inspection.
 *
 * Reference: ADR-007 Discovery Acquisition Model
 */
import { useState, useEffect } from "react";
import type {
  DatabaseCandidate,
  InspectionTarget,
  DatabaseCandidateMetadata,
} from "../../types";
import { api } from "../../services/api";

interface CandidateReviewPanelProps {
  scanId: string;
  onSelectionChange: (targets: InspectionTarget[]) => void;
  disabled?: boolean;
}

const dbTypeIcons: Record<string, string> = {
  mysql: "🐬",
  postgresql: "🐘",
  mongodb: "🍃",
  redis: "🔴",
  mssql: "🗄️",
  oracle: "🔶",
  couchdb: "🛋️",
  cassandra: "👁️",
  elasticsearch: "🔍",
};

const confidenceColors: Record<string, string> = {
  high: "var(--success-color)",
  medium: "var(--warning-color)",
  low: "var(--text-secondary)",
};

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

export default function CandidateReviewPanel({
  scanId,
  onSelectionChange,
  disabled = false,
}: CandidateReviewPanelProps) {
  const [candidates, setCandidates] = useState<DatabaseCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load database candidates
  useEffect(() => {
    const loadCandidates = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.scans.getDiscoveries(scanId, {
          candidate: true,
          limit: 100,
        });
        // Filter to only include database candidates with metadata
        const dbCandidates = response.discoveries.filter(
          (d): d is DatabaseCandidate => {
            const metadata = d.payload?.metadata as
              | DatabaseCandidateMetadata
              | undefined;
            return metadata?.database_candidate === true;
          },
        );
        setCandidates(dbCandidates);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load candidates",
        );
      } finally {
        setLoading(false);
      }
    };

    loadCandidates();
  }, [scanId]);

  // Update parent when selection changes
  useEffect(() => {
    const targets: InspectionTarget[] = candidates
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({
        host: c.payload.ip_address || c.payload.host || "",
        port: c.payload.port || 0,
        db_type: c.payload.metadata?.candidate_type || "unknown",
        credentials: {
          username: "",
          password: "",
        },
      }));
    onSelectionChange(targets);
  }, [selectedIds, candidates, onSelectionChange]);

  const toggleCandidate = (id: string) => {
    if (disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (disabled) return;
    setSelectedIds(new Set(candidates.map((c) => c.id)));
  };

  const deselectAll = () => {
    if (disabled) return;
    setSelectedIds(new Set());
  };

  if (loading) {
    return (
      <div className="card">
        <h3>Database Candidates</h3>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          Loading candidates...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h3>Database Candidates</h3>
        <div className="error">{error}</div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="card">
        <h3>Database Candidates</h3>
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--text-secondary)",
          }}
        >
          No database candidates detected in this scan.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0 }}>Database Candidates ({candidates.length})</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-outline"
            onClick={selectAll}
            disabled={disabled}
          >
            Select All
          </button>
          <button
            className="btn btn-outline"
            onClick={deselectAll}
            disabled={disabled}
          >
            Deselect All
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {candidates.map((candidate) => {
          const metadata = candidate.payload.metadata || {};
          const confidence = metadata.candidate_confidence || 0;
          const confidenceLevel = getConfidenceLevel(confidence);
          const isSelected = selectedIds.has(candidate.id);

          return (
            <div
              key={candidate.id}
              onClick={() => toggleCandidate(candidate.id)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.75rem",
                border: isSelected
                  ? "2px solid var(--primary-color)"
                  : "1px solid var(--border-color)",
                borderRadius: "8px",
                cursor: disabled ? "not-allowed" : "pointer",
                backgroundColor: isSelected
                  ? "rgba(var(--primary-rgb), 0.05)"
                  : "transparent",
                opacity: disabled ? 0.7 : 1,
              }}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleCandidate(candidate.id)}
                disabled={disabled}
                style={{ marginRight: "0.75rem" }}
              />

              {/* Icon */}
              <span style={{ fontSize: "1.5rem", marginRight: "0.75rem" }}>
                {dbTypeIcons[metadata.candidate_type || ""] || "🗄️"}
              </span>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>
                  {candidate.payload.ip_address || candidate.payload.host}:
                  {candidate.payload.port}
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {metadata.candidate_type || "Unknown"} -{" "}
                  {metadata.candidate_reason || "Port match"}
                </div>
              </div>

              {/* Confidence badge */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <span
                  className="badge"
                  style={{
                    backgroundColor: confidenceColors[confidenceLevel],
                    color: "white",
                  }}
                >
                  {Math.round(confidence * 100)}% confidence
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    marginTop: "0.25rem",
                  }}
                >
                  {metadata.validation_method === "port_and_banner"
                    ? "Banner verified"
                    : "Port only"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            backgroundColor: "var(--background)",
            borderRadius: "6px",
            textAlign: "center",
          }}
        >
          <strong>{selectedIds.size}</strong> candidate(s) selected for
          inspection
        </div>
      )}
    </div>
  );
}
