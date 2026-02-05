/**
 * Summary view shown after enumeration completes (awaiting_inspection).
 *
 * Extracted from ScanPage.tsx during modularization - CC
 */
import type { ScanRun, ScanCollector } from "../../types";
import { formatDuration } from "./ScanConstants";
import PhaseBreakdown from "./PhaseBreakdown";
import CollectorList from "./CollectorList";

interface ScanSummaryViewProps {
  scan: ScanRun;
  summaryCollectors: ScanCollector[];
  canOperate: boolean;
  onSkipInspection: () => void;
  onContinueToReview: () => void;
}

export default function ScanSummaryView({
  scan,
  summaryCollectors,
  canOperate,
  onSkipInspection,
  onContinueToReview,
}: ScanSummaryViewProps) {
  return (
    <div>
      <h1>Enumeration Complete</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        The enumeration phase has finished. Review the results below.
      </p>

      {/* Stats card */}
      <div
        className="card"
        style={{
          marginBottom: "1rem",
          display: "flex",
          gap: "2rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              marginBottom: "0.25rem",
            }}
          >
            Total Discoveries
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            {scan.total_discoveries}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              marginBottom: "0.25rem",
            }}
          >
            Duration
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            {formatDuration(scan.started_at, new Date().toISOString())}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              marginBottom: "0.25rem",
            }}
          >
            Collectors
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            {summaryCollectors.length}
          </div>
        </div>
      </div>

      <PhaseBreakdown phases={scan.phases} />
      <CollectorList collectors={summaryCollectors} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "1.5rem",
        }}
      >
        <button
          className="btn btn-outline"
          onClick={onSkipInspection}
          disabled={!canOperate}
        >
          Skip Inspection
        </button>
        <button
          className="btn btn-primary"
          onClick={onContinueToReview}
          disabled={!canOperate}
        >
          Continue to Review Candidates
        </button>
      </div>
    </div>
  );
}
