import { useRef, useEffect, useState, useCallback } from "react";
import type { LogEntry as LogEntryType, LogLevel } from "../../types";
import LogEntry from "./LogEntry";

interface LogStreamViewerProps {
  logs: LogEntryType[];
  isConnected: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}

const SERVICES = [
  "network-scanner",
  "code-analyzer",
  "db-inspector",
  "approval-api",
  "enrichment",
  "pii-redactor",
  "scoring",
  "transmitter",
];

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

export default function LogStreamViewer({
  logs,
  isConnected,
  isPaused,
  onPause,
  onResume,
  onClear,
}: LogStreamViewerProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [serviceFilter, setServiceFilter] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<LogLevel[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const serviceMatch =
      serviceFilter.length === 0 || serviceFilter.includes(log.service);
    const levelMatch =
      levelFilter.length === 0 || levelFilter.includes(log.level);
    const searchMatch =
      !searchTerm ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.service.toLowerCase().includes(searchTerm.toLowerCase());
    return serviceMatch && levelMatch && searchMatch;
  });

  useEffect(() => {
    if (autoScroll && feedRef.current && !isPaused) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isPaused]);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  const handleExport = () => {
    const content = filteredLogs
      .map(
        (log) =>
          `${log.timestamp} [${log.level}] [${log.service}] ${log.message}${
            log.metadata ? " " + JSON.stringify(log.metadata) : ""
          }`,
      )
      .join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleService = (service: string) => {
    setServiceFilter((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service],
    );
  };

  const toggleLevel = (level: LogLevel) => {
    setLevelFilter((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : [...prev, level],
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Search */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search logs..."
          style={{
            padding: "0.5rem",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            width: "200px",
          }}
        />

        {/* Service filter */}
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {SERVICES.map((service) => (
            <button
              key={service}
              onClick={() => toggleService(service)}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                backgroundColor: serviceFilter.includes(service)
                  ? "var(--primary-color)"
                  : "white",
                color: serviceFilter.includes(service)
                  ? "white"
                  : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {service.split("-").pop()}
            </button>
          ))}
        </div>

        {/* Level filter */}
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                backgroundColor: levelFilter.includes(level)
                  ? "var(--primary-color)"
                  : "white",
                color: levelFilter.includes(level)
                  ? "white"
                  : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Clear filters */}
        {(serviceFilter.length > 0 || levelFilter.length > 0) && (
          <button
            onClick={() => {
              setServiceFilter([]);
              setLevelFilter([]);
            }}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "0.875rem",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: isConnected ? "#22c55e" : "#ef4444",
              }}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
            }}
          >
            ({filteredLogs.length} of {logs.length} logs)
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={isPaused ? onResume : onPause}
            style={{
              padding: "0.375rem 0.75rem",
              fontSize: "0.875rem",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              backgroundColor: isPaused ? "#fef3c7" : "white",
              cursor: "pointer",
            }}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={onClear}
            style={{
              padding: "0.375rem 0.75rem",
              fontSize: "0.875rem",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
          <button
            onClick={handleExport}
            style={{
              padding: "0.375rem 0.75rem",
              fontSize: "0.875rem",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            Export
          </button>
        </div>
      </div>

      {/* Log feed */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: "400px",
          maxHeight: "600px",
          overflowY: "auto",
          backgroundColor: "#fafafa",
          borderRadius: "6px",
          padding: "0.5rem",
          border: "1px solid var(--border-color)",
        }}
      >
        {filteredLogs.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "var(--text-secondary)",
            }}
          >
            {logs.length === 0
              ? "Waiting for logs..."
              : "No logs match the current filters"}
          </div>
        ) : (
          filteredLogs.map((log) => <LogEntry key={log.id} entry={log} />)
        )}
      </div>

      {/* Scroll to latest */}
      {!autoScroll && filteredLogs.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (feedRef.current) {
              feedRef.current.scrollTop = feedRef.current.scrollHeight;
            }
          }}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem",
            width: "100%",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Scroll to latest
        </button>
      )}
    </div>
  );
}
