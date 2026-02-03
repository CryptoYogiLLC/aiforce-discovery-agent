import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type {
  ConfigProfileFull,
  CreateProfileInput,
  UpdateProfileInput,
} from "../types";
import { ProfileModal, ProfileTypeBadge } from "../components/profiles";

export default function ProfilesPage() {
  const { csrfToken, hasPermission } = useAuth();
  const [profiles, setProfiles] = useState<ConfigProfileFull[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfile, setEditingProfile] =
    useState<ConfigProfileFull | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clone modal state
  const [cloneProfile, setCloneProfile] = useState<ConfigProfileFull | null>(
    null,
  );
  const [cloneName, setCloneName] = useState("");

  // Import/Export state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importYaml, setImportYaml] = useState("");
  const [exportYaml, setExportYaml] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.profiles.list();
      setProfiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleCreate = async (
    data: CreateProfileInput | UpdateProfileInput,
  ) => {
    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.profiles.create(data as CreateProfileInput, csrfToken || "");
      setShowAddModal(false);
      loadProfiles();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to create profile",
      );
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (
    data: CreateProfileInput | UpdateProfileInput,
  ) => {
    if (!editingProfile) return;
    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.profiles.update(
        editingProfile.id,
        data as UpdateProfileInput,
        csrfToken || "",
      );
      setEditingProfile(null);
      loadProfiles();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to update profile",
      );
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClone = async () => {
    if (!cloneProfile || !cloneName.trim()) return;
    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.profiles.clone(
        cloneProfile.id,
        cloneName.trim(),
        csrfToken || "",
      );
      setCloneProfile(null);
      setCloneName("");
      loadProfiles();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to clone profile",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (profile: ConfigProfileFull) => {
    if (
      !confirm(
        `Are you sure you want to delete "${profile.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await api.profiles.delete(profile.id, csrfToken || "");
      loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete profile");
    }
  };

  const handleExport = async (profile: ConfigProfileFull) => {
    try {
      const data = await api.profiles.exportYaml(profile.id);
      setExportYaml(data.yaml);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export profile");
    }
  };

  const handleImport = async () => {
    if (!importYaml.trim()) return;
    try {
      setIsSubmitting(true);
      setModalError(null);
      await api.profiles.importYaml(importYaml.trim(), csrfToken || "");
      setShowImportModal(false);
      setImportYaml("");
      loadProfiles();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to import profile",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const canCreate = hasPermission("profile:create");
  const canEdit = hasPermission("profile:edit");
  const canDelete = hasPermission("profile:delete");

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
        <h2>Scan Profiles</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {canCreate && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="btn btn-outline"
              >
                Import YAML
              </button>
              <button
                onClick={() => {
                  setModalError(null);
                  setShowAddModal(true);
                }}
                className="btn btn-primary"
              >
                + Create Profile
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#dc2626",
            borderRadius: "6px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          Loading profiles...
        </div>
      ) : profiles.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            No profiles found. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Subnets
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "left",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Collectors
                </th>
                <th
                  style={{
                    padding: "0.75rem 1rem",
                    textAlign: "right",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr
                  key={profile.id}
                  style={{ borderBottom: "1px solid var(--border-color)" }}
                >
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{profile.name}</div>
                      {profile.description && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {profile.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <ProfileTypeBadge type={profile.profile_type} />
                    {profile.is_default && (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          padding: "0.125rem 0.375rem",
                          backgroundColor: "#dcfce7",
                          color: "#166534",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                        }}
                      >
                        Default
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                    }}
                  >
                    {profile.config.target_subnets?.length || 0} configured
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                    {profile.config.enabled_collectors?.join(", ") || "None"}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.25rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => handleExport(profile)}
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
                      {canCreate && (
                        <button
                          onClick={() => {
                            setCloneProfile(profile);
                            setCloneName(`${profile.name} (Copy)`);
                          }}
                          style={{
                            padding: "0.375rem 0.75rem",
                            fontSize: "0.875rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "4px",
                            backgroundColor: "white",
                            cursor: "pointer",
                          }}
                        >
                          Clone
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => {
                            setModalError(null);
                            setEditingProfile(profile);
                          }}
                          style={{
                            padding: "0.375rem 0.75rem",
                            fontSize: "0.875rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "4px",
                            backgroundColor: "white",
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && profile.profile_type !== "preset" && (
                        <button
                          onClick={() => handleDelete(profile)}
                          style={{
                            padding: "0.375rem 0.75rem",
                            fontSize: "0.875rem",
                            border: "1px solid #fecaca",
                            borderRadius: "4px",
                            backgroundColor: "#fef2f2",
                            color: "#dc2626",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showAddModal && (
        <ProfileModal
          onSave={handleCreate}
          onClose={() => setShowAddModal(false)}
          isSubmitting={isSubmitting}
          error={modalError}
        />
      )}

      {/* Edit Modal */}
      {editingProfile && (
        <ProfileModal
          profile={editingProfile}
          onSave={handleUpdate}
          onClose={() => setEditingProfile(null)}
          isSubmitting={isSubmitting}
          error={modalError}
        />
      )}

      {/* Clone Modal */}
      {cloneProfile && (
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
          }}
          onClick={() => setCloneProfile(null)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "400px", margin: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "1rem" }}>Clone Profile</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Create a copy of &quot;{cloneProfile.name}&quot;
            </p>

            {modalError && (
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
                {modalError}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                }}
              >
                New Profile Name
              </label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setCloneProfile(null)}
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
                onClick={handleClone}
                disabled={isSubmitting || !cloneName.trim()}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Cloning..." : "Clone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
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
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "500px", margin: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "1rem" }}>Import Profile from YAML</h2>

            {modalError && (
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
                {modalError}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                }}
              >
                YAML Content
              </label>
              <textarea
                value={importYaml}
                onChange={(e) => setImportYaml(e.target.value)}
                rows={12}
                placeholder="Paste YAML content here..."
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

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportYaml("");
                  setModalError(null);
                }}
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
                onClick={handleImport}
                disabled={isSubmitting || !importYaml.trim()}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportYaml && (
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
          }}
          onClick={() => setExportYaml(null)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "500px", margin: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "1rem" }}>Exported Profile YAML</h2>

            <div style={{ marginBottom: "1rem" }}>
              <textarea
                value={exportYaml}
                readOnly
                rows={15}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  backgroundColor: "#f9fafb",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  navigator.clipboard.writeText(exportYaml);
                }}
                style={{
                  padding: "0.75rem 1.5rem",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setExportYaml(null)}
                className="btn btn-primary"
                style={{ padding: "0.75rem 1.5rem" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
