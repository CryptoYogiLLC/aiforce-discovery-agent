import { useLogStream } from "../hooks/useLogStream";
import { LogStreamViewer } from "../components/logs";

export default function LogsPage() {
  const {
    isConnected,
    isPaused,
    logs,
    reconnectAttempts,
    pause,
    resume,
    clearLogs,
    connect,
  } = useLogStream();

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Log Streaming</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Real-time log feed from all services
          </p>
        </div>
        {!isConnected && reconnectAttempts > 0 && (
          <button onClick={connect} className="btn btn-primary">
            Reconnect
          </button>
        )}
      </div>

      {/* Connection error */}
      {!isConnected && reconnectAttempts >= 5 && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#dc2626",
            borderRadius: "6px",
            marginBottom: "1rem",
          }}
        >
          Failed to connect to log stream after multiple attempts. Click
          &quot;Reconnect&quot; to try again.
        </div>
      )}

      {/* Log viewer */}
      <div className="card">
        <LogStreamViewer
          logs={logs}
          isConnected={isConnected}
          isPaused={isPaused}
          onPause={pause}
          onResume={resume}
          onClear={clearLogs}
        />
      </div>
    </div>
  );
}
