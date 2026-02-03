import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/useAuthStore";
import { useCart } from "../hooks/useCart";

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const itemCount = useCart((state) => state.getItemCount());
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="app">
      <header className="header">
        <nav className="nav">
          <Link to="/" className="logo">
            Sample Store
          </Link>

          <div className="nav-links">
            <Link to="/products">Products</Link>

            <Link to="/cart" className="cart-link">
              Cart {itemCount > 0 && <span className="badge">{itemCount}</span>}
            </Link>

            {isAuthenticated ? (
              <>
                <Link to="/orders">My Orders</Link>
                <span className="user-name">{user?.name}</span>
                <button onClick={handleLogout} className="btn-link">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Login</Link>
                <Link to="/register">Register</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <p>&copy; 2024 Sample Store. For Discovery Agent testing.</p>
      </footer>
    </div>
  );
}
