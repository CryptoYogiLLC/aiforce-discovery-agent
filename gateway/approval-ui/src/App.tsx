import { Routes, Route, Link } from "react-router-dom";
import DiscoveryList from "./pages/DiscoveryList";
import DiscoveryDetail from "./pages/DiscoveryDetail";

function App() {
  return (
    <div>
      <header className="header">
        <div className="container">
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            <h1>Discovery Approval Gateway</h1>
          </Link>
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<DiscoveryList />} />
          <Route path="/discovery/:id" element={<DiscoveryDetail />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
