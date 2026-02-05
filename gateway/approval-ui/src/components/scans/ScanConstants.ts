/**
 * Shared constants and utilities for scan components.
 *
 * Extracted from ScanPage.tsx during modularization - CC
 */

export const phaseLabels: Record<string, string> = {
  enumeration: "Enumeration",
  identification: "Identification",
  inspection: "Deep Inspection",
  correlation: "Correlation",
};

export const collectorLabels: Record<string, string> = {
  "network-scanner": "Network Scanner",
  "code-analyzer": "Code Analyzer",
  "db-inspector": "DB Inspector",
};

export const collectorIcons: Record<string, string> = {
  "network-scanner": "\u{1F50D}",
  "code-analyzer": "\u{1F4C1}",
  "db-inspector": "\u{1F5C4}\uFE0F",
};

export const statusColors: Record<string, string> = {
  pending: "var(--background)",
  running: "var(--primary-color)",
  completed: "var(--success-color)",
  failed: "var(--danger-color)",
};

export function formatDuration(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "--";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((endMs - startMs) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
