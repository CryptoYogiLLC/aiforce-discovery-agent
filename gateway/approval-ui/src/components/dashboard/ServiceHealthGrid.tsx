import type { ServiceInfo } from "../../types";
import ServiceCard from "./ServiceCard";

interface ServiceHealthGridProps {
  services: Record<string, ServiceInfo>;
  isLoading?: boolean;
}

export default function ServiceHealthGrid({
  services,
  isLoading,
}: ServiceHealthGridProps) {
  const serviceEntries = Object.entries(services);

  if (isLoading) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Service Health</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: "150px",
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

  const healthyCount = serviceEntries.filter(
    ([, s]) => s.health.status === "healthy",
  ).length;
  const totalCount = serviceEntries.length;

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
        <h3 style={{ margin: 0 }}>Service Health</h3>
        <span
          style={{
            fontSize: "0.875rem",
            color:
              healthyCount === totalCount
                ? "#166534"
                : healthyCount > 0
                  ? "#92400e"
                  : "#991b1b",
            fontWeight: 500,
          }}
        >
          {healthyCount}/{totalCount} healthy
        </span>
      </div>

      {serviceEntries.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
          }}
        >
          No services configured
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {serviceEntries.map(([name, service]) => (
            <ServiceCard key={name} name={name} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}
