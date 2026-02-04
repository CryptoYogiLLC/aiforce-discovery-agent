import type { DryrunContainer } from "../../types";

interface EnvironmentStatusProps {
  containers: DryrunContainer[];
  totalExpected: number;
}

const statusIcons: Record<string, string> = {
  running: "✅",
  starting: "🔄",
  stopped: "⏹️",
  failed: "❌",
};

export default function EnvironmentStatus({
  containers,
  totalExpected,
}: EnvironmentStatusProps) {
  const runningCount = containers.filter((c) => c.status === "running").length;

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
        <h3 style={{ margin: 0 }}>Environment Status</h3>
        <span
          className="badge"
          style={{
            backgroundColor:
              runningCount === totalExpected
                ? "var(--success-color)"
                : "var(--warning-color)",
            color: "white",
          }}
        >
          {runningCount}/{totalExpected} Services Running
        </span>
      </div>

      <div
        style={{
          maxHeight: "300px",
          overflowY: "auto",
        }}
      >
        <table>
          <thead>
            <tr>
              <th style={{ width: "40px" }}>Status</th>
              <th>Name</th>
              <th>Type</th>
              <th>Ports</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => (
              <tr key={container.id}>
                <td style={{ textAlign: "center" }}>
                  <span title={container.status}>
                    {statusIcons[container.status] || "❓"}
                  </span>
                </td>
                <td>
                  <span
                    style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
                  >
                    {container.container_name}
                  </span>
                </td>
                <td>{container.service_type}</td>
                <td>
                  {container.port_mappings.map((pm, idx) => (
                    <span
                      key={idx}
                      className="badge"
                      style={{
                        backgroundColor: "var(--background)",
                        color: "var(--text-primary)",
                        marginRight: "0.25rem",
                        fontSize: "0.75rem",
                      }}
                    >
                      {pm.host}:{pm.container}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {containers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    padding: "1rem",
                  }}
                >
                  Waiting for containers to start...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
