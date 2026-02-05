/**
 * Collector results card showing status of each collector.
 *
 * Extracted from ScanPage.tsx during modularization - CC
 */
import type { ScanCollector } from "../../types";
import { collectorLabels, collectorIcons, statusColors } from "./ScanConstants";

interface CollectorListProps {
  collectors: ScanCollector[];
}

export default function CollectorList({ collectors }: CollectorListProps) {
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginBottom: "1rem" }}>Collector Results</h3>
      {collectors.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", textAlign: "center" }}>
          No collector data
        </div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {collectors.map((collector) => (
            <div
              key={collector.collector_name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span>
                  {collectorIcons[collector.collector_name] || "\u{1F4E6}"}
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
                  {collector.discovery_count} discoveries
                </span>
                <span
                  className="badge"
                  style={{
                    backgroundColor:
                      statusColors[collector.status] || "var(--background)",
                    color:
                      collector.status === "completed" ||
                      collector.status === "running"
                        ? "white"
                        : "var(--text-secondary)",
                  }}
                >
                  {collector.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
