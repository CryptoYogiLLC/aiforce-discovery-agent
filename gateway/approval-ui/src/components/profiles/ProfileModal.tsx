import { useState, FormEvent } from "react";
import type {
  ConfigProfileFull,
  ProfileConfig,
  CreateProfileInput,
  UpdateProfileInput,
} from "../../types";
import SubnetInput from "./SubnetInput";

interface ProfileModalProps {
  profile?: ConfigProfileFull;
  onSave: (data: CreateProfileInput | UpdateProfileInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
}

const COLLECTORS = [
  { id: "network-scanner", label: "Network Scanner" },
  { id: "code-analyzer", label: "Code Analyzer" },
  { id: "db-inspector", label: "Database Inspector" },
];

const DEFAULT_CONFIG: ProfileConfig = {
  target_subnets: [],
  port_ranges: { tcp: "1-1024", udp: "53,67,68,123,161" },
  scan_rate_limit: 1000,
  max_services: 1000,
  max_hosts: 256,
  timeout_seconds: 30,
  disk_space_limit_mb: 1024,
  memory_limit_mb: 512,
  enabled_collectors: ["network-scanner"],
};

export default function ProfileModal({
  profile,
  onSave,
  onClose,
  isSubmitting,
  error,
}: ProfileModalProps) {
  const isEdit = Boolean(profile);
  const isPreset = profile?.profile_type === "preset";

  const [formData, setFormData] = useState({
    name: profile?.name || "",
    description: profile?.description || "",
    config: profile?.config || DEFAULT_CONFIG,
  });

  const [warnings, setWarnings] = useState<string[]>([]);

  const validateAndWarn = (config: ProfileConfig) => {
    const newWarnings: string[] = [];

    // Large subnet + high rate warning
    const totalHosts = config.target_subnets.reduce((sum, subnet) => {
      const prefix = parseInt(subnet.split("/")[1] || "32", 10);
      return sum + Math.pow(2, 32 - prefix);
    }, 0);

    if (totalHosts > 1000 && config.scan_rate_limit > 5000) {
      newWarnings.push(
        "Large subnet with high scan rate may cause network congestion",
      );
    }

    if (config.max_hosts > 1000) {
      newWarnings.push(
        "Scanning more than 1000 hosts may take significant time",
      );
    }

    setWarnings(newWarnings);
  };

  const updateConfig = (updates: Partial<ProfileConfig>) => {
    const newConfig = { ...formData.config, ...updates };
    setFormData({ ...formData, config: newConfig });
    validateAndWarn(newConfig);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isEdit) {
      const updates: UpdateProfileInput = {};
      if (formData.name !== profile?.name) updates.name = formData.name;
      if (formData.description !== profile?.description)
        updates.description = formData.description;
      if (JSON.stringify(formData.config) !== JSON.stringify(profile?.config))
        updates.config = formData.config;
      await onSave(updates);
    } else {
      await onSave({
        name: formData.name,
        description: formData.description || undefined,
        config: formData.config,
      });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        overflow: "auto",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: "1.5rem" }}>
          {isEdit ? "Edit Profile" : "Create Profile"}
          {isPreset && (
            <span
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.75rem",
                padding: "0.25rem 0.5rem",
                backgroundColor: "#fef3c7",
                color: "#92400e",
                borderRadius: "4px",
              }}
            >
              Preset profiles have limited editing
            </span>
          )}
        </h2>

        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#dc2626",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#fef3c7",
              color: "#92400e",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
              }}
            >
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              disabled={isPreset}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                boxSizing: "border-box",
                backgroundColor: isPreset ? "#f3f4f6" : "white",
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
              }}
            >
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={2}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>

          {/* Target Subnets */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
              }}
            >
              Target Subnets *
            </label>
            <SubnetInput
              value={formData.config.target_subnets}
              onChange={(subnets) => updateConfig({ target_subnets: subnets })}
              disabled={isPreset}
            />
          </div>

          {/* Port Ranges */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginBottom: "1rem",
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
                TCP Ports
              </label>
              <input
                type="text"
                value={formData.config.port_ranges.tcp}
                onChange={(e) =>
                  updateConfig({
                    port_ranges: {
                      ...formData.config.port_ranges,
                      tcp: e.target.value,
                    },
                  })
                }
                placeholder="1-1024,3306,5432"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                }}
              >
                UDP Ports
              </label>
              <input
                type="text"
                value={formData.config.port_ranges.udp}
                onChange={(e) =>
                  updateConfig({
                    port_ranges: {
                      ...formData.config.port_ranges,
                      udp: e.target.value,
                    },
                  })
                }
                placeholder="53,67,68,123"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </div>

          {/* Scan Settings */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Rate Limit (pps)
              </label>
              <input
                type="number"
                value={formData.config.scan_rate_limit}
                onChange={(e) =>
                  updateConfig({
                    scan_rate_limit: parseInt(e.target.value, 10),
                  })
                }
                min={1}
                max={100000}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Max Services
              </label>
              <input
                type="number"
                value={formData.config.max_services}
                onChange={(e) =>
                  updateConfig({ max_services: parseInt(e.target.value, 10) })
                }
                min={1}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Max Hosts
              </label>
              <input
                type="number"
                value={formData.config.max_hosts}
                onChange={(e) =>
                  updateConfig({ max_hosts: parseInt(e.target.value, 10) })
                }
                min={1}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Resource Limits */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Timeout (sec)
              </label>
              <input
                type="number"
                value={formData.config.timeout_seconds}
                onChange={(e) =>
                  updateConfig({
                    timeout_seconds: parseInt(e.target.value, 10),
                  })
                }
                min={1}
                max={300}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Disk Limit (MB)
              </label>
              <input
                type="number"
                value={formData.config.disk_space_limit_mb}
                onChange={(e) =>
                  updateConfig({
                    disk_space_limit_mb: parseInt(e.target.value, 10),
                  })
                }
                min={100}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                Memory Limit (MB)
              </label>
              <input
                type="number"
                value={formData.config.memory_limit_mb}
                onChange={(e) =>
                  updateConfig({
                    memory_limit_mb: parseInt(e.target.value, 10),
                  })
                }
                min={128}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Enabled Collectors */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
              }}
            >
              Enabled Collectors
            </label>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {COLLECTORS.map((collector) => (
                <label
                  key={collector.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.config.enabled_collectors.includes(
                      collector.id,
                    )}
                    onChange={(e) => {
                      const newCollectors = e.target.checked
                        ? [...formData.config.enabled_collectors, collector.id]
                        : formData.config.enabled_collectors.filter(
                            (c) => c !== collector.id,
                          );
                      updateConfig({ enabled_collectors: newCollectors });
                    }}
                  />
                  {collector.label}
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.75rem 1.5rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !formData.name ||
                formData.config.target_subnets.length === 0
              }
              className="btn btn-primary"
              style={{
                padding: "0.75rem 1.5rem",
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
