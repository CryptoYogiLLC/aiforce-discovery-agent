import { useState, useEffect, useCallback } from "react";
import type {
  DryrunSession,
  DryrunDiscovery,
  DryrunContainer,
} from "../../types";
import {
  useDryRunWebSocket,
  type CollectorStatus,
} from "../../hooks/useDryRunWebSocket";
import EnvironmentStatus from "./EnvironmentStatus";
import CollectorProgress from "./CollectorProgress";
import LiveDiscoveryFeed from "./LiveDiscoveryFeed";
import { api } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

interface DryRunActiveSessionProps {
  session: DryrunSession;
  onStop: () => void;
  onSessionUpdate: (session: Partial<DryrunSession>) => void;
  onComplete: () => void;
}

const SESSION_TIMEOUT_MINUTES = 30;

export default function DryRunActiveSession({
  session,
  onStop,
  onSessionUpdate,
  onComplete,
}: DryRunActiveSessionProps) {
  const { csrfToken } = useAuth();
  const [containers, setContainers] = useState<DryrunContainer[]>([]);
  const [discoveries, setDiscoveries] = useState<DryrunDiscovery[]>([]);
  const [collectors, setCollectors] = useState<CollectorStatus[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate overall progress
  const overallProgress =
    collectors.length > 0
      ? Math.round(
          collectors.reduce((sum, c) => sum + c.progress, 0) /
            collectors.length,
        )
      : 0;

  // Time until auto-cleanup
  const timeoutSeconds = SESSION_TIMEOUT_MINUTES * 60;
  const remainingSeconds = Math.max(0, timeoutSeconds - elapsed);
  const remainingMinutes = Math.floor(remainingSeconds / 60);
  const remainingSecondsDisplay = remainingSeconds % 60;

  // Format elapsed time
  const elapsedMinutes = Math.floor(elapsed / 60);
  const elapsedSeconds = elapsed % 60;

  // Load initial data and poll for updates (since WebSocket isn't implemented)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [containersData, discoveriesData] = await Promise.all([
          api.dryrun.getContainers(session.id),
          api.dryrun.getDiscoveries(session.id, { limit: 500 }),
        ]);
        setContainers(containersData);
        setDiscoveries(discoveriesData.discoveries);

        // Derive collector status from discoveries
        const discoveriesBySource = discoveriesData.discoveries.reduce(
          (acc: Record<string, number>, d) => {
            acc[d.source] = (acc[d.source] || 0) + 1;
            return acc;
          },
          {},
        );

        // Update collector status based on discoveries
        const updatedCollectors: CollectorStatus[] = [
          {
            name: "network-scanner",
            status: discoveriesBySource["network-scanner"]
              ? "completed"
              : "pending",
            progress: discoveriesBySource["network-scanner"] ? 100 : 0,
            discovery_count: discoveriesBySource["network-scanner"] || 0,
          },
          {
            name: "code-analyzer",
            status: discoveriesBySource["code-analyzer"]
              ? "completed"
              : "pending",
            progress: discoveriesBySource["code-analyzer"] ? 100 : 0,
            discovery_count: discoveriesBySource["code-analyzer"] || 0,
          },
          {
            name: "db-inspector",
            status: discoveriesBySource["db-inspector"] ? "pending" : "pending",
            progress: discoveriesBySource["db-inspector"] ? 100 : 0,
            discovery_count: discoveriesBySource["db-inspector"] || 0,
          },
        ];
        setCollectors(updatedCollectors);
      } catch (err) {
        console.error("Failed to load data:", err);
      }
    };

    // Load immediately
    loadData();

    // Poll every 5 seconds for updates
    const pollInterval = setInterval(loadData, 5000);

    return () => clearInterval(pollInterval);
  }, [session.id]);

  // Timer for elapsed time
  useEffect(() => {
    const startTime = session.started_at
      ? new Date(session.started_at).getTime()
      : Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [session.started_at]);

  // WebSocket handlers
  const handleStatusUpdate = useCallback(
    (update: Partial<DryrunSession>) => {
      onSessionUpdate(update);
      if (update.status === "completed" || update.status === "cleaned") {
        onComplete();
      }
    },
    [onSessionUpdate, onComplete],
  );

  const handleDiscovery = useCallback((discovery: DryrunDiscovery) => {
    setDiscoveries((prev) => [...prev, discovery]);
  }, []);

  const handleContainerUpdate = useCallback((container: DryrunContainer) => {
    setContainers((prev) => {
      const idx = prev.findIndex(
        (c) => c.container_id === container.container_id,
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = container;
        return updated;
      }
      return [...prev, container];
    });
  }, []);

  const handleCollectorProgress = useCallback((collector: CollectorStatus) => {
    setCollectors((prev) => {
      const idx = prev.findIndex((c) => c.name === collector.name);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = collector;
        return updated;
      }
      return [...prev, collector];
    });
  }, []);

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  // Connect WebSocket
  const { isConnected, reconnect } = useDryRunWebSocket({
    sessionId:
      session.status === "running" || session.status === "generating"
        ? session.id
        : null,
    onStatusUpdate: handleStatusUpdate,
    onDiscovery: handleDiscovery,
    onContainerUpdate: handleContainerUpdate,
    onCollectorProgress: handleCollectorProgress,
    onError: handleError,
  });

  const handleStop = async () => {
    if (stopping) return;
    if (!confirm("Are you sure you want to stop this dry-run session?")) return;

    try {
      setStopping(true);
      setError(null);
      await api.dryrun.stopSession(session.id, csrfToken || undefined);
      onStop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop session");
    } finally {
      setStopping(false);
    }
  };

  const getPhaseLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Initializing";
      case "generating":
        return "Generating Environment";
      case "running":
        return "Scanning";
      case "completed":
        return "Completed";
      case "cleaning_up":
        return "Cleaning Up";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  return (
    <div>
      {/* Header with progress */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ margin: 0 }}>Dry-Run in Progress</h2>
          <button
            className="btn btn-danger"
            onClick={handleStop}
            disabled={stopping || session.status === "cleaning_up"}
          >
            {stopping ? "Stopping..." : "⏹ Stop"}
          </button>
        </div>

        {error && !error.includes("WebSocket") && (
          <div className="error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* WebSocket not implemented - hide connection warning */}
        {false && !isConnected && session.status === "running" && (
          <div
            style={{
              backgroundColor: "#fef3c7",
              color: "#92400e",
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>⚠️ Connection lost. Updates may be delayed.</span>
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
            <span>{getPhaseLabel(session.status)}</span>
          </div>
          <div>
            <span style={{ fontWeight: 500 }}>Elapsed: </span>
            <span>
              {String(elapsedMinutes).padStart(2, "0")}:
              {String(elapsedSeconds).padStart(2, "0")}
            </span>
          </div>
        </div>

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
          <span>
            Auto-cleanup in: {remainingMinutes}:
            {String(remainingSecondsDisplay).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Two-column layout for status panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <EnvironmentStatus
          containers={containers}
          totalExpected={session.container_count || 0}
        />
        <CollectorProgress collectors={collectors} />
      </div>

      {/* Live discovery feed */}
      <LiveDiscoveryFeed discoveries={discoveries} />
    </div>
  );
}
