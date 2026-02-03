import { Routes, Route, Link, useLocation } from "react-router-dom";
import DiscoveryList from "./pages/DiscoveryList";
import DiscoveryDetail from "./pages/DiscoveryDetail";
import DryRunPage from "./pages/DryRunPage";
import DryRunSessionDetail from "./pages/DryRunSessionDetail";

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

function App() {
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
            <nav style={{ display: "flex", gap: "0.5rem" }}>
              <NavLink to="/">Discoveries</NavLink>
              <NavLink to="/dryrun">Dry-Run</NavLink>
            </nav>
          </div>
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<DiscoveryList />} />
          <Route path="/discovery/:id" element={<DiscoveryDetail />} />
          <Route path="/dryrun" element={<DryRunPage />} />
          <Route path="/dryrun/:sessionId" element={<DryRunSessionDetail />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
