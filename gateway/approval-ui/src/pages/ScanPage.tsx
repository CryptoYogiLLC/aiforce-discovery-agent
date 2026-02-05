/**
 * Scan management page for autonomous discovery pipeline.
 *
 * Reference: ADR-007 Discovery Acquisition Model
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type {
  ScanRun,
  ScanCollector,
  ScanDiscovery,
  InspectionTarget,
  ConfigProfileFull,
} from "../types";
import {
  CandidateReviewPanel,
  CredentialEntryForm,
  InspectionProgress,
  ScanSummaryView,
  ScanDetailView,
} from "../components/scans";

type ScanView =
  | "start"
  | "running"
  | "summary"
  | "candidates"
  | "inspecting"
  | "detail"
  | "history";

export default function ScanPage() {
  const { csrfToken, user } = useAuth();
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [profiles, setProfiles] = useState<ConfigProfileFull[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ScanView>("start");

  // For inspection flow
  const [selectedTargets, setSelectedTargets] = useState<InspectionTarget[]>(
    [],
  );
  const [targetsWithCreds, setTargetsWithCreds] = useState<InspectionTarget[]>(
    [],
  );
  const [isInspecting, setIsInspecting] = useState(false);

  // History
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Summary view state
  const [summaryCollectors, setSummaryCollectors] = useState<ScanCollector[]>(
    [],
  );

  // Detail view state
  const [detailScan, setDetailScan] = useState<ScanRun | null>(null);
  const [detailCollectors, setDetailCollectors] = useState<ScanCollector[]>([]);
  const [detailDiscoveries, setDetailDiscoveries] = useState<ScanDiscovery[]>(
    [],
  );
  const [detailLoading, setDetailLoading] = useState(false);

  // Load profiles and check for active scan
  useEffect(() => {
    loadProfiles();
    checkActiveScan();
    loadHistory();
  }, []);

  // Load collectors when entering summary view
  useEffect(() => {
    if (currentView === "summary" && scan) {
      api.scans
        .getCollectors(scan.id)
        .then(setSummaryCollectors)
        .catch((err) =>
          console.error("Failed to load summary collectors:", err),
        );
    }
  }, [currentView, scan?.id]);

  const loadProfiles = async () => {
    try {
      const data = await api.profiles.list();
      setProfiles(data);
      const defaultProfile = data.find((p) => p.is_default);
      if (defaultProfile) {
        setSelectedProfileId(defaultProfile.id);
      } else if (data.length > 0) {
        setSelectedProfileId(data[0].id);
      }
    } catch (err) {
      setError("Failed to load configuration profiles");
      console.error("Failed to load profiles:", err);
    }
  };

  const checkActiveScan = async () => {
    try {
      const [scanningData, inspectingData, awaitingData] = await Promise.all([
        api.scans.list({ status: "scanning", limit: 1 }),
        api.scans.list({ status: "inspecting", limit: 1 }),
        api.scans.list({ status: "awaiting_inspection", limit: 1 }),
      ]);

      const activeScans = [
        ...scanningData.scans,
        ...inspectingData.scans,
        ...awaitingData.scans,
      ];

      if (activeScans.length > 0) {
        const activeScan = await api.scans.get(activeScans[0].id);
        setScan(activeScan);

        if (activeScan.status === "scanning") {
          setCurrentView("running");
        } else if (activeScan.status === "awaiting_inspection") {
          setCurrentView("summary");
        } else if (activeScan.status === "inspecting") {
          setCurrentView("inspecting");
        }
      }
    } catch (err) {
      setError("Failed to check for active scans");
      console.warn("Failed to check for active scan:", err);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const data = await api.scans.list({ limit: 10 });
      setScanHistory(
        data.scans.filter(
          (s) => s.status === "completed" || s.status === "failed",
        ),
      );
    } catch (err) {
      console.error("Failed to load scan history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStartScan = async () => {
    if (!selectedProfileId) {
      setError("Please select a configuration profile");
      return;
    }

    try {
      setIsStarting(true);
      setError(null);

      // Create scan
      const newScan = await api.scans.create(
        selectedProfileId,
        csrfToken || undefined,
      );
      setScan(newScan);

      // Start the scan
      const startedScan = await api.scans.start(
        newScan.id,
        csrfToken || undefined,
      );
      setScan(startedScan);
      setCurrentView("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopScan = async () => {
    if (!scan) return;

    if (!confirm("Are you sure you want to stop this scan?")) return;

    try {
      await api.scans.stop(scan.id, csrfToken || undefined);
      setScan(null);
      setCurrentView("start");
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop scan");
    }
  };

  const handleScanUpdate = useCallback((update: Partial<ScanRun>) => {
    setScan((prev) => (prev ? { ...prev, ...update } : null));

    // Check for status transitions
    if (update.status === "awaiting_inspection") {
      setCurrentView("summary");
    } else if (update.status === "completed" || update.status === "failed") {
      setCurrentView("start");
      loadHistory();
    }
  }, []);

  const handleScanComplete = useCallback(() => {
    // Check if scan needs inspection
    if (scan?.status === "awaiting_inspection") {
      setCurrentView("summary");
    } else {
      setScan(null);
      setCurrentView("start");
      loadHistory();
    }
  }, [scan?.status]);

  const handleSelectionChange = useCallback((targets: InspectionTarget[]) => {
    setSelectedTargets(targets);
  }, []);

  const handleCredentialsChange = useCallback((targets: InspectionTarget[]) => {
    setTargetsWithCreds(targets);
  }, []);

  const handleStartInspection = async () => {
    if (!scan || targetsWithCreds.length === 0) return;

    // Validate credentials
    const hasEmptyCreds = targetsWithCreds.some(
      (t) => !t.credentials.username || !t.credentials.password,
    );
    if (hasEmptyCreds) {
      setError("Please provide credentials for all selected targets");
      return;
    }

    try {
      setIsInspecting(true);
      setError(null);

      await api.scans.triggerInspection(
        scan.id,
        { targets: targetsWithCreds },
        csrfToken || undefined,
      );

      // Refresh scan status
      const updatedScan = await api.scans.get(scan.id);
      setScan(updatedScan);
      setCurrentView("inspecting");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start inspection",
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSkipInspection = async () => {
    if (!scan) return;

    if (
      !confirm(
        "Skip deep inspection? The scan will complete without inspecting databases.",
      )
    ) {
      return;
    }

    try {
      // Complete the scan without inspection
      await api.scans.triggerInspection(
        scan.id,
        { targets: [] },
        csrfToken || undefined,
      );
      setScan(null);
      setCurrentView("start");
      loadHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to skip inspection",
      );
    }
  };

  const handleViewScanDetail = async (scanId: string) => {
    try {
      setDetailLoading(true);
      setError(null);

      const [scanData, collectorsData, discoveriesData] = await Promise.all([
        api.scans.get(scanId),
        api.scans.getCollectors(scanId),
        api.scans.getDiscoveries(scanId, { limit: 50 }),
      ]);

      setDetailScan(scanData);
      setDetailCollectors(collectorsData);
      setDetailDiscoveries(discoveriesData.discoveries);
      setCurrentView("detail");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load scan details",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBackToScans = () => {
    setDetailScan(null);
    setDetailCollectors([]);
    setDetailDiscoveries([]);
    setCurrentView("start");
  };

  const canOperate = user?.role === "admin" || user?.role === "operator";

  // Render based on current view
  const renderContent = () => {
    switch (currentView) {
      case "running":
        return (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h1 style={{ margin: 0 }}>Discovery Scan</h1>
              <button
                className="btn btn-danger"
                onClick={handleStopScan}
                disabled={!canOperate}
              >
                Stop Scan
              </button>
            </div>
            {scan && (
              <InspectionProgress
                scan={scan}
                onScanUpdate={handleScanUpdate}
                onComplete={handleScanComplete}
              />
            )}
          </div>
        );

      case "summary":
        return scan ? (
          <ScanSummaryView
            scan={scan}
            summaryCollectors={summaryCollectors}
            canOperate={canOperate}
            onSkipInspection={handleSkipInspection}
            onContinueToReview={() => setCurrentView("candidates")}
          />
        ) : null;

      case "candidates":
        return (
          <div>
            <h1>Review Database Candidates</h1>
            <p
              style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}
            >
              The enumeration phase found potential database servers. Select
              which ones to inspect and provide credentials for deep inspection.
            </p>

            {scan && (
              <>
                <CandidateReviewPanel
                  scanId={scan.id}
                  onSelectionChange={handleSelectionChange}
                  disabled={!canOperate}
                />

                {selectedTargets.length > 0 && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <CredentialEntryForm
                      targets={selectedTargets}
                      onCredentialsChange={handleCredentialsChange}
                      disabled={!canOperate}
                    />
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "1.5rem",
                  }}
                >
                  <button
                    className="btn btn-outline"
                    onClick={handleSkipInspection}
                    disabled={!canOperate || isInspecting}
                  >
                    Skip Inspection
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleStartInspection}
                    disabled={
                      !canOperate ||
                      isInspecting ||
                      selectedTargets.length === 0
                    }
                  >
                    {isInspecting
                      ? "Starting..."
                      : `Inspect ${selectedTargets.length} Database(s)`}
                  </button>
                </div>
              </>
            )}
          </div>
        );

      case "inspecting":
        return (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h1 style={{ margin: 0 }}>Deep Inspection</h1>
              <button
                className="btn btn-danger"
                onClick={handleStopScan}
                disabled={!canOperate}
              >
                Stop Inspection
              </button>
            </div>
            {scan && (
              <InspectionProgress
                scan={scan}
                onScanUpdate={handleScanUpdate}
                onComplete={handleScanComplete}
              />
            )}
          </div>
        );

      case "detail":
        return (
          <ScanDetailView
            detailScan={detailScan}
            detailCollectors={detailCollectors}
            detailDiscoveries={detailDiscoveries}
            detailLoading={detailLoading}
            onBack={handleBackToScans}
          />
        );

      case "start":
      default:
        return (
          <div>
            <h1>Discovery Scan</h1>

            {/* Start panel */}
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginBottom: "1rem" }}>Start New Scan</h3>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="profile-select"
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: 500,
                  }}
                >
                  Configuration Profile
                </label>
                <select
                  id="profile-select"
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  disabled={isStarting || !canOperate}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                  }}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.is_default ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleStartScan}
                disabled={isStarting || !selectedProfileId || !canOperate}
                style={{ width: "100%" }}
              >
                {isStarting ? "Starting..." : "Start Discovery Scan"}
              </button>

              {!canOperate && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    textAlign: "center",
                  }}
                >
                  Operator or Admin role required to start scans
                </div>
              )}
            </div>

            {/* History */}
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Recent Scans</h3>

              {historyLoading ? (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                  Loading...
                </div>
              ) : scanHistory.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  No scan history
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {scanHistory.map((historyScan) => (
                    <div
                      key={historyScan.id}
                      onClick={() => handleViewScanDetail(historyScan.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--background)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "";
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {new Date(historyScan.created_at).toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: "0.875rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {historyScan.total_discoveries} discoveries
                        </div>
                      </div>
                      <span
                        className="badge"
                        style={{
                          backgroundColor:
                            historyScan.status === "completed"
                              ? "var(--success-color)"
                              : "var(--danger-color)",
                          color: "white",
                        }}
                      >
                        {historyScan.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div>
      {error && (
        <div className="error" style={{ marginBottom: "1rem" }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "1rem",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {renderContent()}
    </div>
  );
}
