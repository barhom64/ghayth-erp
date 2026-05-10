import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "./api";
import { setObsUser } from "./observability";

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
  user: UserInfo | null;
  assignments: Assignment[];
  loading: boolean;
  login: (assignments?: Assignment[]) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  notifyTokenRefreshed: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    try {
      const stored = localStorage.getItem("erp_assignments");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const hasSession = !!localStorage.getItem("erp_assignments");
  const [loading, setLoading] = useState(hasSession);
  const [, setLocation] = useLocation();

  const fetchUser = useCallback(async () => {
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
      // Tie subsequent observability captures to this user. Once a real
      // backend (Sentry / Datadog / …) is wired in, every error after
      // login carries the user/role/company so triage doesn't have to
      // cross-reference logs.
      setObsUser({
        id: data.id,
        role: data.role,
        companyId: data.companyId,
        branchId: data.branchId,
      });
    } catch {
      localStorage.removeItem("erp_assignments");
      setUser(null);
      setObsUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasSession) {
      fetchUser();
    } else {
      setLoading(false);
      setLocation("/login");
    }
  }, []);

  const login = (newAssignments?: Assignment[]) => {
    if (newAssignments) {
      localStorage.setItem("erp_assignments", JSON.stringify(newAssignments));
      setAssignments(newAssignments);
    }
    fetchUser();
    setLocation("/dashboard");
  };

  const logout = () => {
    apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("erp_assignments");
    setUser(null);
    setAssignments([]);
    setObsUser(null);
    setLocation("/login");
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const notifyTokenRefreshed = () => {
    fetchUser();
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, assignments, loading, login, logout, refreshUser, notifyTokenRefreshed }}>
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
