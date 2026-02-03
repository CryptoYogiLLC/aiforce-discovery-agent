import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import DiscoveryList from "./pages/DiscoveryList";
import DiscoveryDetail from "./pages/DiscoveryDetail";
import DryRunPage from "./pages/DryRunPage";
import DryRunSessionDetail from "./pages/DryRunSessionDetail";
import ScanPage from "./pages/ScanPage";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilesPage from "./pages/ProfilesPage";
import AuditTrailPage from "./pages/AuditTrailPage";
import LogsPage from "./pages/LogsPage";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const isActive =
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "6px",
        textDecoration: "none",
        color: isActive ? "var(--primary-color)" : "var(--text-secondary)",
        backgroundColor: isActive ? "rgba(37, 99, 235, 0.1)" : "transparent",
        fontWeight: isActive ? 600 : 400,
      }}
    >
      {children}
    </Link>
  );
}

function UserMenu() {
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  if (isLoading) {
    return <span style={{ color: "var(--text-secondary)" }}>...</span>;
  }

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className="btn btn-primary"
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          textDecoration: "none",
        }}
      >
        Sign In
      </Link>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <span
        style={{
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
        }}
      >
        {user?.username}
      </span>
      <button
        onClick={() => logout()}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          backgroundColor: "transparent",
          border: "1px solid var(--border-color)",
          borderRadius: "6px",
          cursor: "pointer",
          color: "var(--text-secondary)",
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>Loading...</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { hasPermission } = useAuth();

  return (
    <div>
      <header className="header">
        <div className="container">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
              <h1>Discovery Approval Gateway</h1>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <nav style={{ display: "flex", gap: "0.5rem" }}>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/">Discoveries</NavLink>
                <NavLink to="/scan">Scan</NavLink>
                <NavLink to="/dryrun">Dry-Run</NavLink>
                <NavLink to="/profiles">Profiles</NavLink>
                {hasPermission("audit:view") && (
                  <NavLink to="/audit">Audit</NavLink>
                )}
                <NavLink to="/logs">Logs</NavLink>
                {hasPermission("user:view") && (
                  <NavLink to="/users">Users</NavLink>
                )}
              </nav>
              <div
                style={{
                  width: "1px",
                  height: "24px",
                  backgroundColor: "var(--border-color)",
                }}
              />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<DiscoveryList />} />
          <Route path="/discovery/:id" element={<DiscoveryDetail />} />
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dryrun"
            element={
              <ProtectedRoute>
                <DryRunPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dryrun/:sessionId"
            element={
              <ProtectedRoute>
                <DryRunSessionDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profiles"
            element={
              <ProtectedRoute>
                <ProfilesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <AuditTrailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <ProtectedRoute>
                <LogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
