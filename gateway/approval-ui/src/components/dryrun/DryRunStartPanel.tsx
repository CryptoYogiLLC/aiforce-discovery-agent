import { useState, useEffect } from "react";
import { api } from "../../services/api";
import type { ConfigProfileFull } from "../../types";

interface DryRunStartPanelProps {
  onStart: (profileId: string, seed?: number) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function DryRunStartPanel({
  onStart,
  isLoading,
  disabled,
}: DryRunStartPanelProps) {
  const [profiles, setProfiles] = useState<ConfigProfileFull[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [seedOption, setSeedOption] = useState<"auto" | "custom">("auto");
  const [customSeed, setCustomSeed] = useState<string>("");
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      setLoadingProfiles(true);
      const data = await api.profiles.list();
      setProfiles(data);
      // Select default profile if available
      const defaultProfile = data.find((p) => p.is_default);
      if (defaultProfile) {
        setSelectedProfile(defaultProfile.id);
      } else if (data.length > 0) {
        setSelectedProfile(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleStart = () => {
    if (!selectedProfile) return;

    let seed: number | undefined;
    if (seedOption === "custom" && customSeed) {
      const parsed = parseInt(customSeed, 10);
      if (isNaN(parsed)) {
        setError("Please enter a valid numeric seed");
        return;
      }
      seed = parsed;
    }

    setError(null);
    onStart(selectedProfile, seed);
  };

  if (loadingProfiles) {
    return (
      <div className="card">
        <div className="loading">Loading profiles...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginBottom: "0.5rem" }}>Dry-Run Simulation</h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Test the discovery system on a simulated environment before running on
        your actual network.
      </p>

      {error && <div className="error">{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: 500,
            }}
          >
            Configuration Profile
          </label>
          <select
            className="select"
            style={{ width: "100%" }}
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            disabled={isLoading || disabled}
          >
            <option value="">Select a profile...</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
                {profile.is_default ? " (Default)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: 500,
            }}
          >
            Environment Seed
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              className="select"
              value={seedOption}
              onChange={(e) =>
                setSeedOption(e.target.value as "auto" | "custom")
              }
              disabled={isLoading || disabled}
            >
              <option value="auto">Auto (Random)</option>
              <option value="custom">Custom</option>
            </select>
            {seedOption === "custom" && (
              <input
                type="number"
                className="input"
                placeholder="Enter seed..."
                value={customSeed}
                onChange={(e) => setCustomSeed(e.target.value)}
                disabled={isLoading || disabled}
                style={{ flex: 1 }}
              />
            )}
          </div>
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleStart}
        disabled={isLoading || disabled || !selectedProfile}
        style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
      >
        {isLoading ? (
          <>
            <span className="spinner" style={{ marginRight: "0.5rem" }}></span>
            Starting...
          </>
        ) : (
          <>
            <span style={{ marginRight: "0.5rem" }}>🚀</span>
            Start Dry-Run
          </>
        )}
      </button>
    </div>
  );
}
