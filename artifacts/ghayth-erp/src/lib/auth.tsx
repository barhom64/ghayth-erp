import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "./api";

interface UserRole {
  id: number;
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
}

interface UserInfo {
  id: number;
  name: string;
  email: string;
  phone?: string;
  empNumber?: string;
  photoUrl?: string;
  jobTitle?: string;
  jobTitleId?: number;
  role: string;
  companyId?: number;
  branchId?: number;
  companyName?: string;
  branchName?: string;
  userRoles?: UserRole[];
}

interface Assignment {
  id: number;
  companyId: number;
  branchId: number;
  role: string;
  status: string;
  companyName: string;
  branchName: string;
  jobTitle?: string;
  jobTitleId?: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  user: UserInfo | null;
  assignments: Assignment[];
  loading: boolean;
  login: (token: string, assignments?: Assignment[]) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateToken: (newToken: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("erp_token"));
  const [user, setUser] = useState<UserInfo | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    try {
      const stored = localStorage.getItem("erp_assignments");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(!!token);
  const [, setLocation] = useLocation();

  const fetchUser = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/auth/me");
      setUser({
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        empNumber: data.empNumber,
        photoUrl: data.photoUrl,
        jobTitle: data.jobTitle,
        jobTitleId: data.jobTitleId,
        role: data.role,
        companyId: data.companyId,
        branchId: data.branchId,
        companyName: data.companyName,
        branchName: data.branchName,
        userRoles: data.userRoles || [],
      });
    } catch {
      localStorage.removeItem("erp_token");
      localStorage.removeItem("erp_assignments");
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
      setLocation("/login");
    }
  }, [token]);

  const login = (newToken: string, newAssignments?: Assignment[]) => {
    localStorage.setItem("erp_token", newToken);
    if (newAssignments) {
      localStorage.setItem("erp_assignments", JSON.stringify(newAssignments));
      setAssignments(newAssignments);
    }
    setToken(newToken);
    setLocation("/dashboard");
  };

  const logout = () => {
    const refreshToken = localStorage.getItem("erp_refresh_token");
    if (refreshToken) {
      apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem("erp_token");
    localStorage.removeItem("erp_refresh_token");
    localStorage.removeItem("erp_assignments");
    setToken(null);
    setUser(null);
    setAssignments([]);
    setLocation("/login");
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const updateToken = (newToken: string) => {
    localStorage.setItem("erp_token", newToken);
    setToken(newToken);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, user, assignments, loading, login, logout, refreshUser, updateToken }}>
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
