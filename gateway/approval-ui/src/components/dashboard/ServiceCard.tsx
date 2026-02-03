import type { ServiceInfo } from "../../types";

interface ServiceCardProps {
  name: string;
  service: ServiceInfo;
}

const statusColors: Record<string, { bg: string; color: string; dot: string }> =
  {
    healthy: { bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
    degraded: { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    unhealthy: { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444" },
    unknown: { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" },
  };

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "Unknown";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function ServiceCard({ name, service }: ServiceCardProps) {
  const { health, metrics } = service;
  const status = statusColors[health.status] || statusColors.unknown;

  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {/* Header with status */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h4
            style={{
              margin: 0,
              fontSize: "0.875rem",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {name.replace(/-/g, " ")}
          </h4>
          {health.version && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
              }}
            >
              v{health.version}
            </span>
          )}
        </div>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 500,
            backgroundColor: status.bg,
            color: status.color,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: status.dot,
            }}
          />
          {health.status}
        </span>
      </div>

      {/* Metrics */}
      {metrics && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "0.5rem",
            fontSize: "0.75rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-secondary)" }}>CPU</span>
            <div style={{ fontWeight: 500 }}>
              {metrics.cpu_percent.toFixed(1)}%
            </div>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Memory</span>
            <div style={{ fontWeight: 500 }}>{metrics.memory_mb} MB</div>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Requests/min</span>
            <div style={{ fontWeight: 500 }}>{metrics.requests_per_minute}</div>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Error Rate</span>
            <div
              style={{
                fontWeight: 500,
                color: metrics.error_rate > 5 ? "#dc2626" : "inherit",
              }}
            >
              {metrics.error_rate.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          borderTop: "1px solid var(--border-color)",
          paddingTop: "0.5rem",
          marginTop: "auto",
        }}
      >
        <span>Uptime: {formatUptime(health.uptime_seconds)}</span>
        <span>
          Last check:{" "}
          {new Date(health.last_check).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Error message */}
      {health.error_message && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#dc2626",
            padding: "0.5rem",
            backgroundColor: "#fef2f2",
            borderRadius: "4px",
          }}
        >
          {health.error_message}
        </div>
      )}
    </div>
  );
}
