/**
 * Historical scan detail view showing full scan results.
 *
 * Extracted from ScanPage.tsx during modularization - CC
 */
import type { ScanRun, ScanCollector, ScanDiscovery } from "../../types";
import { formatDuration } from "./ScanConstants";
import PhaseBreakdown from "./PhaseBreakdown";
import CollectorList from "./CollectorList";

interface ScanDetailViewProps {
  detailScan: ScanRun | null;
  detailCollectors: ScanCollector[];
  detailDiscoveries: ScanDiscovery[];
  detailLoading: boolean;
  onBack: () => void;
}

export default function ScanDetailView({
  detailScan,
  detailCollectors,
  detailDiscoveries,
  detailLoading,
  onBack,
}: ScanDetailViewProps) {
  return (
    <div>
      <button
        className="btn btn-outline"
        onClick={onBack}
        style={{ marginBottom: "1rem" }}
      >
        &larr; Back to Scans
      </button>

      {detailLoading ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          Loading scan details...
        </div>
      ) : detailScan ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <h1 style={{ margin: 0 }}>Scan Details</h1>
            <span
              className="badge"
              style={{
                backgroundColor:
                  detailScan.status === "completed"
                    ? "var(--success-color)"
                    : "var(--danger-color)",
                color: "white",
              }}
            >
              {detailScan.status}
            </span>
          </div>

          {/* Stats card */}
          <div
            className="card"
            style={{
              marginBottom: "1rem",
              display: "flex",
              gap: "2rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: "0.25rem",
                }}
              >
                Total Discoveries
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {detailScan.total_discoveries}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: "0.25rem",
                }}
              >
                Duration
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {formatDuration(detailScan.started_at, detailScan.completed_at)}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: "0.25rem",
                }}
              >
                Started
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {detailScan.started_at
                  ? new Date(detailScan.started_at).toLocaleString()
                  : "--"}
              </div>
            </div>
          </div>

          <PhaseBreakdown phases={detailScan.phases} />
          <CollectorList collectors={detailCollectors} />

          {/* Discoveries list */}
          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>
              Discoveries ({detailDiscoveries.length})
            </h3>
            {detailDiscoveries.length === 0 ? (
              <div
                style={{
                  color: "var(--text-secondary)",
                  textAlign: "center",
                  padding: "1rem",
                }}
              >
                No discoveries recorded
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {detailDiscoveries.map((discovery) => {
                  const p = discovery.payload || {};
                  const title =
                    p.ip || p.host || p.name || discovery.event_type;
                  const details = [
                    p.port ? `port ${p.port}` : null,
                    p.service && p.service !== "Unknown"
                      ? String(p.service)
                      : null,
                    p.protocol ? String(p.protocol).toUpperCase() : null,
                  ]
                    .filter(Boolean)
                    .join(" / ");
                  return (
                    <div
                      key={discovery.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem 0",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{String(title)}</div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {details || discovery.source_service}
                        </div>
                      </div>
                      <span
                        className="badge"
                        style={{
                          backgroundColor:
                            discovery.status === "approved"
                              ? "var(--success-color)"
                              : discovery.status === "rejected"
                                ? "var(--danger-color)"
                                : "var(--background)",
                          color:
                            discovery.status === "pending"
                              ? "var(--text-secondary)"
                              : "white",
                        }}
                      >
                        {discovery.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
