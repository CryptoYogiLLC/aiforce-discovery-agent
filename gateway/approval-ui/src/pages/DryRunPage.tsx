import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { DryrunSession } from "../types";
import DryRunStartPanel from "../components/dryrun/DryRunStartPanel";
import DryRunActiveSession from "../components/dryrun/DryRunActiveSession";
import DryRunHistory from "../components/dryrun/DryRunHistory";

export default function DryRunPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<DryrunSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check for active session on mount
  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      // Check for any active sessions (pending, generating, running)
      const [runningData, generatingData, pendingData] = await Promise.all([
        api.dryrun.listSessions({ status: "running", limit: 1 }),
        api.dryrun.listSessions({ status: "generating", limit: 1 }),
        api.dryrun.listSessions({ status: "pending", limit: 1 }),
      ]);

      const activeSessions = [
        ...runningData.sessions,
        ...generatingData.sessions,
        ...pendingData.sessions,
      ];

      if (activeSessions.length > 0) {
        // There's an active session, load it
        const activeSession = await api.dryrun.getSession(activeSessions[0].id);
        setSession(activeSession);
      }
    } catch (err) {
      // Ignore errors when checking for active session
      console.warn("Failed to check for active session:", err);
    }
  };

  const handleStart = async (profileId: string, _seed?: number) => {
    try {
      setIsStarting(true);
      setError(null);

      // Create session
      // TODO: Pass seed to backend when seed parameter is implemented (Issue #70)
      const newSession = await api.dryrun.createSession(profileId);
      setSession(newSession);

      // Start the session
      const startedSession = await api.dryrun.startSession(newSession.id);
      setSession(startedSession);

      // Navigate to session URL
      navigate(`/dryrun/${startedSession.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start dry-run");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = useCallback(() => {
    setSession(null);
    setRefreshTrigger((prev) => prev + 1);
    navigate("/dryrun");
  }, [navigate]);

  const handleSessionUpdate = useCallback((update: Partial<DryrunSession>) => {
    setSession((prev) => (prev ? { ...prev, ...update } : null));
  }, []);

  const handleComplete = useCallback(() => {
    setSession(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleViewSession = (id: string) => {
    navigate(`/dryrun/${id}`);
  };

  // Determine if we have an active session
  const hasActiveSession = Boolean(
    session && ["pending", "generating", "running"].includes(session.status),
  );

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {hasActiveSession ? (
        <DryRunActiveSession
          session={session!}
          onStop={handleStop}
          onSessionUpdate={handleSessionUpdate}
          onComplete={handleComplete}
        />
      ) : (
        <>
          <DryRunStartPanel
            onStart={handleStart}
            isLoading={isStarting}
            disabled={hasActiveSession}
          />
          <DryRunHistory
            onViewSession={handleViewSession}
            refreshTrigger={refreshTrigger}
          />
        </>
      )}
    </div>
  );
}
