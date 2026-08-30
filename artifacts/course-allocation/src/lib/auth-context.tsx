import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "STUDENT" | "ADMIN";
  studentId?: string | null;
  programme?: string | null;
  semester?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("cs_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("cs_token");
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const savedToken = localStorage.getItem("cs_token");
      try {
        const headers: Record<string, string> = {};
        if (savedToken) headers["Authorization"] = `Bearer ${savedToken}`;

        const res = await fetch("/api/auth/me", {
          headers,
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          localStorage.setItem("cs_user", JSON.stringify(data.user));
        } else if (savedToken) {
          localStorage.removeItem("cs_token");
          localStorage.removeItem("cs_user");
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error("Failed to verify session:", err);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("cs_token", newToken);
    localStorage.setItem("cs_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("cs_token");
    localStorage.removeItem("cs_user");
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
