import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  nationalId?: string;
  gender?: string;
  dateOfBirth?: string;
  city?: string;
  education?: string;
  experienceYears?: number;
  resumeUrl?: string;
  skills?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("careers_token");
      if (!token) {
        setUser(null);
        return;
      }
      const { data } = await api.getMe();
      setUser(data);
    } catch {
      localStorage.removeItem("careers_token");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { token } = await api.login({ email, password });
    localStorage.setItem("careers_token", token);
    await refreshUser();
  };

  const register = async (name: string, email: string, phone: string, password: string) => {
    const { token } = await api.register({ name, email, phone, password });
    localStorage.setItem("careers_token", token);
    await refreshUser();
  };

  const logout = () => {
    localStorage.removeItem("careers_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
