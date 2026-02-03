/**
 * Real-time inspection progress display using SSE.
 *
 * Reference: ADR-007 Discovery Acquisition Model
 */
import { useState, useEffect, useCallback } from "react";
import type { ScanRun, ScanCollector } from "../../types";
import {
  useScanEvents,
  type ScanProgressEvent,
  type ScanCollectorEvent,
} from "../../hooks/useScanEvents";
import { api } from "../../services/api";

interface InspectionProgressProps {
  scan: ScanRun;
  onScanUpdate: (scan: Partial<ScanRun>) => void;
  onComplete: () => void;
}

const collectorIcons: Record<string, string> = {
  "network-scanner": "🔍",
  "code-analyzer": "📁",
  "db-inspector": "🗄️",
};

const collectorLabels: Record<string, string> = {
  "network-scanner": "Network Scanner",
  "code-analyzer": "Code Analyzer",
  "db-inspector": "DB Inspector",
};

const phaseLabels: Record<string, string> = {
  enumeration: "Enumeration",
  identification: "Identification",
  inspection: "Deep Inspection",
  correlation: "Correlation",
};

const statusColors: Record<string, string> = {
  pending: "var(--text-secondary)",
  starting: "var(--primary-color)",
  running: "var(--primary-color)",
  completed: "var(--success-color)",
  failed: "var(--danger-color)",
  timeout: "var(--warning-color)",
};

export default function InspectionProgress({
  scan,
  onScanUpdate,
  onComplete,
}: InspectionProgressProps) {
  const [collectors, setCollectors] = useState<ScanCollector[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("initializing");
  const [overallProgress, setOverallProgress] = useState(0);
  const [discoveryCount, setDiscoveryCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Load initial collector status
  useEffect(() => {
    const loadCollectors = async () => {
      try {
        const data = await api.scans.getCollectors(scan.id);
        setCollectors(data);
      } catch (err) {
        console.error("Failed to load collectors:", err);
      }
    };
    loadCollectors();
  }, [scan.id]);

  // Timer for elapsed time
  useEffect(() => {
    const startTime = scan.started_at
      ? new Date(scan.started_at).getTime()
      : Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [scan.started_at]);

  // SSE event handlers
  const handleProgress = useCallback((event: ScanProgressEvent) => {
    setCurrentPhase(event.phase);
    setOverallProgress(event.progress);
    setDiscoveryCount(event.discovery_count);
    setStatusMessage(event.message || null);
  }, []);

  const handleCollectorUpdate = useCallback(
    (event: ScanCollectorEvent) => {
      setCollectors((prev) => {
        const idx = prev.findIndex(
          (c) => c.collector_name === event.collector_name,
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            status: event.status as ScanCollector["status"],
            progress: event.progress,
            discovery_count: event.discovery_count,
          };
          return updated;
        }
        // Add new collector
        return [
          ...prev,
          {
            id: event.collector_name,
            scan_id: scan.id,
            collector_name: event.collector_name,
            status: event.status as ScanCollector["status"],
            progress: event.progress,
            discovery_count: event.discovery_count,
            error_message: null,
            started_at: null,
            completed_at: null,
            last_heartbeat_at: null,
          },
        ];
      });
    },
    [scan.id],
  );

  const handleScanUpdate = useCallback(
    (update: Partial<ScanRun>) => {
      onScanUpdate(update);
      if (update.status === "completed" || update.status === "failed") {
        onComplete();
      }
    },
    [onScanUpdate, onComplete],
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  // Connect SSE for real-time updates
  const { isConnected, reconnect } = useScanEvents({
    scanId:
      scan.status === "scanning" || scan.status === "inspecting"
        ? scan.id
        : null,
    onProgress: handleProgress,
    onCollectorUpdate: handleCollectorUpdate,
    onScanUpdate: handleScanUpdate,
    onError: handleError,
  });

  // Format elapsed time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Get status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "scanning":
        return "Scanning";
      case "awaiting_inspection":
        return "Awaiting Inspection";
      case "inspecting":
        return "Deep Inspection";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  return (
    <div>
      {/* Header with overall progress */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ margin: 0 }}>Scan Progress</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {isConnected ? (
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--success-color)",
                }}
                title="Connected"
              />
            ) : (
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--warning-color)",
                }}
                title="Disconnected"
              />
            )}
            <span
              className="badge"
              style={{
                backgroundColor:
                  scan.status === "completed"
                    ? "var(--success-color)"
                    : scan.status === "failed"
                      ? "var(--danger-color)"
                      : "var(--primary-color)",
                color: "white",
              }}
            >
              {getStatusLabel(scan.status)}
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              color: "#991b1b",
              padding: "0.75rem 1rem",
              borderRadius: "6px",
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{error}</span>
            <button className="btn btn-outline" onClick={reconnect}>
              Reconnect
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <span style={{ fontWeight: 500 }}>Phase: </span>
            <span>{phaseLabels[currentPhase] || currentPhase}</span>
          </div>
          <div>
            <span style={{ fontWeight: 500 }}>Elapsed: </span>
            <span>{formatTime(elapsed)}</span>
          </div>
        </div>

        {statusMessage && (
          <div
            style={{
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              marginBottom: "0.75rem",
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Progress bar */}
        <div
          style={{
            height: "12px",
            backgroundColor: "var(--border-color)",
            borderRadius: "6px",
            overflow: "hidden",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${overallProgress}%`,
              backgroundColor: "var(--primary-color)",
              borderRadius: "6px",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
          }}
        >
          <span>{overallProgress}% complete</span>
          <span>{discoveryCount} discoveries</span>
        </div>
      </div>

      {/* Phase progress */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Phases</h3>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {Object.entries(scan.phases).map(([phaseName, phase]) => (
            <div key={phaseName}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.25rem",
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {phaseLabels[phaseName] || phaseName}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {phase.discovery_count} found
                  </span>
                  <span
                    className="badge"
                    style={{
                      backgroundColor:
                        phase.status === "completed"
                          ? "var(--success-color)"
                          : phase.status === "running"
                            ? "var(--primary-color)"
                            : "var(--background)",
                      color:
                        phase.status === "completed" ||
                        phase.status === "running"
                          ? "white"
                          : "var(--text-secondary)",
                    }}
                  >
                    {phase.status}
                  </span>
                </div>
              </div>
              <div
                style={{
                  height: "6px",
                  backgroundColor: "var(--border-color)",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${phase.progress}%`,
                    backgroundColor:
                      phase.status === "completed"
                        ? "var(--success-color)"
                        : "var(--primary-color)",
                    borderRadius: "3px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Collector status */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Collectors</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {collectors.length === 0 ? (
            <div
              style={{ color: "var(--text-secondary)", textAlign: "center" }}
            >
              No collectors active yet
            </div>
          ) : (
            collectors.map((collector) => (
              <div key={collector.collector_name}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span>
                      {collectorIcons[collector.collector_name] || "📦"}
                    </span>
                    <span style={{ fontWeight: 500 }}>
                      {collectorLabels[collector.collector_name] ||
                        collector.collector_name}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {collector.progress}%
                    </span>
                    <span
                      className="badge"
                      style={{
                        backgroundColor:
                          collector.discovery_count > 0
                            ? "var(--success-color)"
                            : "var(--background)",
                        color:
                          collector.discovery_count > 0
                            ? "white"
                            : "var(--text-secondary)",
                      }}
                    >
                      {collector.discovery_count} found
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    height: "8px",
                    backgroundColor: "var(--border-color)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${collector.progress}%`,
                      backgroundColor: statusColors[collector.status],
                      borderRadius: "4px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                {collector.error_message && (
                  <div
                    style={{
                      marginTop: "0.25rem",
                      fontSize: "0.75rem",
                      color: "var(--danger-color)",
                    }}
                  >
                    {collector.error_message}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
