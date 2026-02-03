import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

type UserRole = "admin" | "operator" | "viewer";

interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  csrfToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Role hierarchy: admin > operator > viewer
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

// Permission to minimum role mapping
const PERMISSION_ROLES: Record<string, UserRole> = {
  // Discovery permissions
  "discovery:view": "viewer",
  "discovery:approve": "operator",
  "discovery:reject": "operator",
  "discovery:delete": "admin",
  // Dry-run permissions
  "dryrun:view": "viewer",
  "dryrun:start": "operator",
  "dryrun:stop": "operator",
  "dryrun:delete": "admin",
  // Profile permissions
  "profile:view": "viewer",
  "profile:create": "operator",
  "profile:edit": "operator",
  "profile:delete": "admin",
  // User management
  "user:view": "admin",
  "user:create": "admin",
  "user:edit": "admin",
  "user:delete": "admin",
  // Audit
  "audit:view": "operator",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user has required role
  const hasRole = useCallback(
    (role: UserRole | UserRole[]): boolean => {
      if (!user) return false;

      const roles = Array.isArray(role) ? role : [role];
      return roles.some((r) => ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[r]);
    },
    [user],
  );

  // Check if user has permission based on role hierarchy
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;

      const requiredRole = PERMISSION_ROLES[permission];
      if (!requiredRole) {
        // Unknown permission - deny by default
        console.warn(`Unknown permission: ${permission}`);
        return false;
      }

      return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[requiredRole];
    },
    [user],
  );

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        if (data.csrf_token) {
          setCsrfToken(data.csrf_token);
        }
      } else {
        setUser(null);
        setCsrfToken(null);
      }
    } catch {
      setUser(null);
      setCsrfToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if user is already authenticated on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await response.json();
    setUser(data.user);
    setCsrfToken(data.csrf_token);
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      });
    } finally {
      setUser(null);
      setCsrfToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        csrfToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
