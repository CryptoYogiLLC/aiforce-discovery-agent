import type { CollectorStatus } from "../../hooks/useDryRunWebSocket";

interface CollectorProgressProps {
  collectors: CollectorStatus[];
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

const statusColors: Record<string, string> = {
  pending: "var(--text-secondary)",
  running: "var(--primary-color)",
  completed: "var(--success-color)",
  failed: "var(--danger-color)",
};

export default function CollectorProgress({
  collectors,
}: CollectorProgressProps) {
  // Default collectors if none provided
  const defaultCollectors: CollectorStatus[] = [
    {
      name: "network-scanner",
      status: "pending",
      progress: 0,
      discovery_count: 0,
    },
    {
      name: "code-analyzer",
      status: "pending",
      progress: 0,
      discovery_count: 0,
    },
    {
      name: "db-inspector",
      status: "pending",
      progress: 0,
      discovery_count: 0,
    },
  ];

  const displayCollectors =
    collectors.length > 0 ? collectors : defaultCollectors;

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem" }}>Collector Status</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {displayCollectors.map((collector) => (
          <div key={collector.name}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span>{collectorIcons[collector.name] || "📦"}</span>
                <span style={{ fontWeight: 500 }}>
                  {collectorLabels[collector.name] || collector.name}
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
          </div>
        ))}
      </div>
    </div>
  );
}
