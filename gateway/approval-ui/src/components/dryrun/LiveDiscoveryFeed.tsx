import { useRef, useEffect, useState } from "react";
import type { DryrunDiscovery } from "../../types";

interface LiveDiscoveryFeedProps {
  discoveries: DryrunDiscovery[];
  onViewAll?: () => void;
}

const sourceIcons: Record<string, string> = {
  "network-scanner": "🔍",
  "code-analyzer": "📁",
  "db-inspector": "🗄️",
};

const typeColors: Record<string, string> = {
  server: "#3b82f6",
  service: "#8b5cf6",
  database: "#f59e0b",
  repository: "#10b981",
  schema: "#ec4899",
};

export default function LiveDiscoveryFeed({
  discoveries,
  onViewAll,
}: LiveDiscoveryFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [discoveries, autoScroll]);

  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    // Enable auto-scroll if user scrolls to bottom
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getDiscoveryLabel = (discovery: DryrunDiscovery): string => {
    const data = discovery.data as Record<string, unknown>;
    const name = (data.name || data.hostname || data.path || "") as string;
    return `${discovery.discovery_type}: ${name}`.trim();
  };

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
        <h3 style={{ margin: 0 }}>
          Live Discoveries{" "}
          <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
            ({discoveries.length})
          </span>
        </h3>
        {onViewAll && (
          <button className="btn btn-outline" onClick={onViewAll}>
            View All
          </button>
        )}
      </div>

      <div
        ref={feedRef}
        onScroll={handleScroll}
        style={{
          height: "200px",
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "0.875rem",
          backgroundColor: "var(--background)",
          borderRadius: "6px",
          padding: "0.75rem",
        }}
      >
        {discoveries.length === 0 ? (
          <div
            style={{
              color: "var(--text-secondary)",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            Waiting for discoveries...
          </div>
        ) : (
          discoveries.map((discovery) => (
            <div
              key={discovery.id}
              style={{
                display: "flex",
                gap: "0.75rem",
                padding: "0.25rem 0",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                {formatTime(discovery.discovered_at)}
              </span>
              <span>{sourceIcons[discovery.source] || "📦"}</span>
              <span
                style={{
                  color: typeColors[discovery.discovery_type] || "inherit",
                }}
              >
                {getDiscoveryLabel(discovery)}
              </span>
            </div>
          ))
        )}
      </div>

      {!autoScroll && discoveries.length > 0 && (
        <button
          className="btn btn-outline"
          onClick={() => {
            setAutoScroll(true);
            if (feedRef.current) {
              feedRef.current.scrollTop = feedRef.current.scrollHeight;
            }
          }}
          style={{
            marginTop: "0.5rem",
            width: "100%",
          }}
        >
          ↓ Scroll to latest
        </button>
      )}
    </div>
  );
}
