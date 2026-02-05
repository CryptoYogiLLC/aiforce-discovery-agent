/**
 * Phase breakdown card showing status of each scan phase.
 *
 * Extracted from ScanPage.tsx during modularization - CC
 */
import type { ScanPhase } from "../../types";
import { phaseLabels, statusColors } from "./ScanConstants";

interface PhaseBreakdownProps {
  phases: Record<string, ScanPhase>;
}

export default function PhaseBreakdown({ phases }: PhaseBreakdownProps) {
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginBottom: "1rem" }}>Phase Breakdown</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {Object.entries(phases).map(([phaseName, phase]) => (
          <div
            key={phaseName}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.5rem 0",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <span style={{ fontWeight: 500 }}>
              {phaseLabels[phaseName] || phaseName}
            </span>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
            >
              <span
                style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
              >
                {phase.discovery_count} found
              </span>
              <span
                className="badge"
                style={{
                  backgroundColor:
                    statusColors[phase.status] || "var(--background)",
                  color:
                    phase.status === "completed" || phase.status === "running"
                      ? "white"
                      : "var(--text-secondary)",
                }}
              >
                {phase.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
