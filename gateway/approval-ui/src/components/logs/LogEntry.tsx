import type { LogEntry as LogEntryType, LogLevel } from "../../types";

interface LogEntryProps {
  entry: LogEntryType;
}

const levelColors: Record<LogLevel, { bg: string; color: string; text: string }> = {
  DEBUG: { bg: "#f3f4f6", color: "#6b7280", text: "DBG" },
  INFO: { bg: "#dbeafe", color: "#1e40af", text: "INF" },
  WARN: { bg: "#fef3c7", color: "#92400e", text: "WRN" },
  ERROR: { bg: "#fee2e2", color: "#991b1b", text: "ERR" },
};

const serviceColors: Record<string, string> = {
  "network-scanner": "#3b82f6",
  "code-analyzer": "#8b5cf6",
  "db-inspector": "#f59e0b",
  "approval-api": "#10b981",
  enrichment: "#ec4899",
  "pii-redactor": "#06b6d4",
  scoring: "#84cc16",
  transmitter: "#f97316",
};

export default function LogEntry({ entry }: LogEntryProps) {
  const levelStyle = levelColors[entry.level] || levelColors.INFO;
  const serviceColor = serviceColors[entry.service] || "#6b7280";

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${time}.${ms}`;
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        padding: "0.25rem 0",
        fontFamily: "monospace",
        fontSize: "0.8125rem",
        borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
        alignItems: "flex-start",
      }}
    >
      {/* Timestamp */}
      <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {formatTime(entry.timestamp)}
      </span>

      {/* Level badge */}
      <span
        style={{
          padding: "0 0.25rem",
          borderRadius: "2px",
          fontSize: "0.6875rem",
          fontWeight: 600,
          backgroundColor: levelStyle.bg,
          color: levelStyle.color,
          minWidth: "28px",
          textAlign: "center",
        }}
      >
        {levelStyle.text}
      </span>

      {/* Service */}
      <span
        style={{
          color: serviceColor,
          minWidth: "120px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        [{entry.service}]
      </span>

      {/* Message */}
      <span
        style={{
          flex: 1,
          color:
            entry.level === "ERROR"
              ? "#dc2626"
              : entry.level === "WARN"
                ? "#d97706"
                : "inherit",
          wordBreak: "break-word",
        }}
      >
        {entry.message}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <span
            style={{
              marginLeft: "0.5rem",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
            }}
          >
            {JSON.stringify(entry.metadata)}
          </span>
        )}
      </span>
    </div>
  );
}
