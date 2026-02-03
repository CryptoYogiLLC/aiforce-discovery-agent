import type { RabbitMQMetrics } from "../../types";

interface RabbitMQPanelProps {
  metrics: RabbitMQMetrics | null;
  isLoading?: boolean;
}

const stateColors: Record<string, { bg: string; color: string }> = {
  running: { bg: "#dcfce7", color: "#166534" },
  idle: { bg: "#f3f4f6", color: "#6b7280" },
  blocked: { bg: "#fee2e2", color: "#991b1b" },
};

export default function RabbitMQPanel({
  metrics,
  isLoading,
}: RabbitMQPanelProps) {
  if (isLoading) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>RabbitMQ</h3>
        <div
          style={{
            height: "200px",
            backgroundColor: "#f3f4f6",
            borderRadius: "8px",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>RabbitMQ</h3>
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
          }}
        >
          Unable to fetch RabbitMQ metrics
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
        <h3 style={{ margin: 0 }}>RabbitMQ</h3>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 500,
            backgroundColor: metrics.connected ? "#dcfce7" : "#fee2e2",
            color: metrics.connected ? "#166534" : "#991b1b",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: metrics.connected ? "#22c55e" : "#ef4444",
            }}
          />
          {metrics.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "var(--background)",
            borderRadius: "6px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Total Messages
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {metrics.total_messages?.toLocaleString() ?? "-"}
          </div>
        </div>
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "var(--background)",
            borderRadius: "6px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Total Consumers
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {metrics.total_consumers ?? "-"}
          </div>
        </div>
      </div>

      {/* Queue table */}
      {metrics.queues && metrics.queues.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding: "0.5rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Queue
                </th>
                <th
                  style={{
                    padding: "0.5rem",
                    textAlign: "right",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Messages
                </th>
                <th
                  style={{
                    padding: "0.5rem",
                    textAlign: "right",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Consumers
                </th>
                <th
                  style={{
                    padding: "0.5rem",
                    textAlign: "right",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Rate/s
                </th>
                <th
                  style={{
                    padding: "0.5rem",
                    textAlign: "center",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.queues.map((queue) => {
                const stateStyle = stateColors[queue.state] || stateColors.idle;
                return (
                  <tr key={queue.name}>
                    <td
                      style={{
                        padding: "0.5rem",
                        borderBottom: "1px solid var(--border-color)",
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                      }}
                    >
                      {queue.name}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "right",
                        borderBottom: "1px solid var(--border-color)",
                        fontWeight:
                          queue.messages != null && queue.messages > 100
                            ? 600
                            : 400,
                        color:
                          queue.messages != null && queue.messages > 1000
                            ? "#dc2626"
                            : "inherit",
                      }}
                    >
                      {queue.messages?.toLocaleString() ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "right",
                        borderBottom: "1px solid var(--border-color)",
                        color:
                          queue.consumers === 0
                            ? "#dc2626"
                            : "var(--text-secondary)",
                      }}
                    >
                      {queue.consumers ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "right",
                        borderBottom: "1px solid var(--border-color)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {queue.message_rate?.toFixed(1) ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "center",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <span
                        style={{
                          padding: "0.125rem 0.375rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          backgroundColor: stateStyle.bg,
                          color: stateStyle.color,
                        }}
                      >
                        {queue.state}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "1rem",
            color: "var(--text-secondary)",
          }}
        >
          No queues found
        </div>
      )}
    </div>
  );
}
