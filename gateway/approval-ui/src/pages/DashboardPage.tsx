import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import type { DashboardOverview } from "../types";
import {
  ServiceHealthGrid,
  RabbitMQPanel,
  EventMetricsPanel,
} from "../components/dashboard";

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<number | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const data = await api.dashboard.getOverview();
      setOverview(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = window.setInterval(() => {
        loadDashboard();
      }, REFRESH_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, loadDashboard]);

  const handleRefresh = () => {
    setIsLoading(true);
    loadDashboard();
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          {lastUpdated && (
            <span
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
              }}
            >
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="btn btn-outline"
            style={{ opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#dc2626",
            borderRadius: "6px",
            marginBottom: "1.5rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Service Health Grid */}
      <div style={{ marginBottom: "1.5rem" }}>
        <ServiceHealthGrid
          services={overview?.services || {}}
          isLoading={isLoading && !overview}
        />
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
        }}
      >
        <RabbitMQPanel
          metrics={overview?.rabbitmq || null}
          isLoading={isLoading && !overview}
        />
        <EventMetricsPanel
          metrics={overview?.events || null}
          isLoading={isLoading && !overview}
        />
      </div>
    </div>
  );
}
