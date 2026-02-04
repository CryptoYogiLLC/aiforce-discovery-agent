/**
 * Secure credential entry form for database inspection.
 *
 * Uses autocomplete="new-password" to prevent browser autofill of credentials.
 *
 * Reference: ADR-007 Discovery Acquisition Model
 */
import { useState, useEffect, useCallback } from "react";
import type { InspectionTarget } from "../../types";

interface CredentialEntryFormProps {
  targets: InspectionTarget[];
  onCredentialsChange: (targets: InspectionTarget[]) => void;
  disabled?: boolean;
}

interface TargetCredentials {
  username: string;
  password: string;
  useShared: boolean;
}

const dbTypeLabels: Record<string, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  mssql: "SQL Server",
  oracle: "Oracle",
  couchdb: "CouchDB",
  cassandra: "Cassandra",
  elasticsearch: "Elasticsearch",
};

export default function CredentialEntryForm({
  targets,
  onCredentialsChange,
  disabled = false,
}: CredentialEntryFormProps) {
  // Shared credentials for all targets
  const [sharedUsername, setSharedUsername] = useState("");
  const [sharedPassword, setSharedPassword] = useState("");
  const [useSharedCredentials, setUseSharedCredentials] = useState(true);

  // Per-target credentials (when not using shared)
  const [targetCredentials, setTargetCredentials] = useState<
    Map<string, TargetCredentials>
  >(new Map());

  // Initialize per-target credentials
  useEffect(() => {
    const newCreds = new Map<string, TargetCredentials>();
    targets.forEach((target) => {
      const key = `${target.host}:${target.port}`;
      const existing = targetCredentials.get(key);
      newCreds.set(
        key,
        existing || { username: "", password: "", useShared: true },
      );
    });
    setTargetCredentials(newCreds);
  }, [targets]);

  // Update parent when credentials change
  const updateParent = useCallback(() => {
    const updatedTargets = targets.map((target) => {
      const key = `${target.host}:${target.port}`;
      const creds = targetCredentials.get(key);

      if (useSharedCredentials || creds?.useShared) {
        return {
          ...target,
          credentials: {
            username: sharedUsername,
            password: sharedPassword,
          },
        };
      }

      return {
        ...target,
        credentials: {
          username: creds?.username || "",
          password: creds?.password || "",
        },
      };
    });

    onCredentialsChange(updatedTargets);
  }, [
    targets,
    targetCredentials,
    useSharedCredentials,
    sharedUsername,
    sharedPassword,
    onCredentialsChange,
  ]);

  useEffect(() => {
    updateParent();
  }, [updateParent]);

  const updateTargetCredential = (
    key: string,
    field: keyof TargetCredentials,
    value: string | boolean,
  ) => {
    setTargetCredentials((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(key) || {
        username: "",
        password: "",
        useShared: true,
      };
      newMap.set(key, { ...current, [field]: value });
      return newMap;
    });
  };

  // Check if all credentials are filled
  const hasValidCredentials = () => {
    if (targets.length === 0) return false;

    if (useSharedCredentials) {
      return sharedUsername.trim() !== "" && sharedPassword.trim() !== "";
    }

    return targets.every((target) => {
      const key = `${target.host}:${target.port}`;
      const creds = targetCredentials.get(key);
      if (creds?.useShared) {
        return sharedUsername.trim() !== "" && sharedPassword.trim() !== "";
      }
      return creds?.username.trim() !== "" && creds?.password.trim() !== "";
    });
  };

  if (targets.length === 0) {
    return (
      <div className="card">
        <h3>Credentials</h3>
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--text-secondary)",
          }}
        >
          Select database candidates to configure credentials.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem" }}>Inspection Credentials</h3>

      <div
        style={{
          backgroundColor: "#fef3c7",
          color: "#92400e",
          padding: "0.75rem 1rem",
          borderRadius: "6px",
          marginBottom: "1rem",
          fontSize: "0.875rem",
        }}
      >
        <strong>Security Note:</strong> Credentials are used only for this
        inspection and are not stored. Use read-only database accounts when
        possible.
      </div>

      {/* Shared credentials toggle */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={useSharedCredentials}
            onChange={(e) => setUseSharedCredentials(e.target.checked)}
            disabled={disabled}
          />
          <span>Use same credentials for all databases</span>
        </label>
      </div>

      {/* Shared credentials form */}
      {useSharedCredentials && (
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
              htmlFor="shared-username"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
              }}
            >
              Username
            </label>
            <input
              id="shared-username"
              type="text"
              value={sharedUsername}
              onChange={(e) => setSharedUsername(e.target.value)}
              placeholder="Database username"
              autoComplete="off"
              disabled={disabled}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="shared-password"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
              }}
            >
              Password
            </label>
            <input
              id="shared-password"
              type="password"
              value={sharedPassword}
              onChange={(e) => setSharedPassword(e.target.value)}
              placeholder="Database password"
              autoComplete="new-password"
              disabled={disabled}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
              }}
            />
          </div>
        </div>
      )}

      {/* Per-target credentials */}
      {!useSharedCredentials && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {targets.map((target) => {
            const key = `${target.host}:${target.port}`;
            const creds = targetCredentials.get(key);

            return (
              <div
                key={key}
                style={{
                  padding: "1rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div>
                    <strong>
                      {target.host}:{target.port}
                    </strong>
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      ({dbTypeLabels[target.db_type] || target.db_type})
                    </span>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={creds?.useShared ?? true}
                      onChange={(e) =>
                        updateTargetCredential(
                          key,
                          "useShared",
                          e.target.checked,
                        )
                      }
                      disabled={disabled}
                    />
                    Use shared
                  </label>
                </div>

                {!creds?.useShared && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <input
                      type="text"
                      value={creds?.username || ""}
                      onChange={(e) =>
                        updateTargetCredential(key, "username", e.target.value)
                      }
                      placeholder="Username"
                      autoComplete="off"
                      disabled={disabled}
                      style={{
                        padding: "0.5rem",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                      }}
                    />
                    <input
                      type="password"
                      value={creds?.password || ""}
                      onChange={(e) =>
                        updateTargetCredential(key, "password", e.target.value)
                      }
                      placeholder="Password"
                      autoComplete="new-password"
                      disabled={disabled}
                      style={{
                        padding: "0.5rem",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Validation status */}
      <div
        style={{
          marginTop: "1rem",
          padding: "0.75rem",
          backgroundColor: hasValidCredentials()
            ? "rgba(var(--success-rgb), 0.1)"
            : "var(--background)",
          borderRadius: "6px",
          textAlign: "center",
          color: hasValidCredentials()
            ? "var(--success-color)"
            : "var(--text-secondary)",
        }}
      >
        {hasValidCredentials()
          ? "✓ Credentials configured for all targets"
          : "Enter credentials for all selected targets"}
      </div>
    </div>
  );
}
