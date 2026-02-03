import { useState, FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the redirect path from location state, default to home
  const from = (location.state as { from?: string })?.from || "/";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh",
      }}
    >
      <div className="card" style={{ maxWidth: "400px", width: "100%" }}>
        <h2 style={{ marginBottom: "1.5rem", textAlign: "center" }}>Sign In</h2>

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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="username"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{
              width: "100%",
              padding: "0.75rem",
              fontSize: "1rem",
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p
          style={{
            marginTop: "1.5rem",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
          }}
        >
          Default credentials: admin / (set via DEFAULT_ADMIN_PASSWORD)
        </p>
      </div>
    </div>
  );
}
