import type { EventMetrics } from "../../types";

interface EventMetricsPanelProps {
  metrics: EventMetrics | null;
  isLoading?: boolean;
}

export default function EventMetricsPanel({
  metrics,
  isLoading,
}: EventMetricsPanelProps) {
  if (isLoading) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Event Metrics</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "1rem",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: "80px",
                backgroundColor: "#f3f4f6",
                borderRadius: "8px",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Event Metrics</h3>
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
          }}
        >
          Unable to fetch event metrics
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem" }}>Event Metrics</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
        }}
      >
        {/* Events Per Second */}
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--background)",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              marginBottom: "0.25rem",
            }}
          >
            Events/Second
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--primary-color)",
            }}
          >
            {metrics.events_per_second.toFixed(1)}
          </div>
        </div>

        {/* Error Rate */}
        <div
          style={{
            padding: "1rem",
            backgroundColor:
              metrics.error_rate > 5
                ? "rgba(239, 68, 68, 0.1)"
                : "var(--background)",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              marginBottom: "0.25rem",
            }}
          >
            Error Rate
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: metrics.error_rate > 5 ? "#dc2626" : "#22c55e",
            }}
          >
            {metrics.error_rate.toFixed(2)}%
          </div>
        </div>

        {/* Events Today */}
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--background)",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              marginBottom: "0.25rem",
            }}
          >
            Events Today
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {metrics.events_today.toLocaleString()}
          </div>
        </div>

        {/* Events Last Hour */}
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--background)",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              marginBottom: "0.25rem",
            }}
          >
            Last Hour
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {metrics.events_last_hour.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
