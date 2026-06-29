import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch, isPreAuthPath } from "./api";
import { clearNativeTokens } from "./native-auth";
import { setObsUser } from "./observability";

interface UserRole {
  id: number;
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
}

export type PreferredCalendar = "hijri" | "gregorian";
export type PreferredLocale = "ar" | "en";

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
  preferredCalendar: PreferredCalendar;
  preferredLocale: PreferredLocale;
  // Per-user table UI prefs from /auth/me. `pageSize` is the persisted
  // table page size; other keys (future column order / sort) pass through.
  tablePrefs?: { pageSize?: number } & Record<string, unknown>;
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
  /**
   * Persist a UI preference change. Hits PATCH /auth/me/preferences and
   * updates the local UserInfo so consumers re-render immediately.
   * Either field is optional — pass only what changed.
   */
  setPreferences: (prefs: {
    preferredCalendar?: PreferredCalendar;
    preferredLocale?: PreferredLocale;
    tablePrefs?: { pageSize?: number } & Record<string, unknown>;
  }) => Promise<void>;
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
        // User-controlled UI prefs from /auth/me. Defaults — hijri + ar —
        // are enforced server-side, so falling back here is belt-and-
        // braces for old API responses during deploy windows.
        preferredCalendar: (data.preferredCalendar as PreferredCalendar) ?? "hijri",
        preferredLocale: (data.preferredLocale as PreferredLocale) ?? "ar",
        // Empty object server-side default → old API responses (deploy
        // windows) fall back here so consumers read an object, not undefined.
        tablePrefs: (data.tablePrefs as UserInfo["tablePrefs"]) ?? {},
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
      // Pre-auth public pages (password reset / activation / onboarding /
      // print-verify / login itself) are reached with NO session by design.
      // Redirecting them to /login here is what made password-reset links
      // land on the login page instead of the set-password form — skip it.
      if (!isPreAuthPath()) setLocation("/login");
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
    // Native: drop the Bearer pair too, or the next app open re-authenticates
    // off a stale token instead of showing the login screen.
    clearNativeTokens();
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

  const setPreferences = async (prefs: {
    preferredCalendar?: PreferredCalendar;
    preferredLocale?: PreferredLocale;
    tablePrefs?: { pageSize?: number } & Record<string, unknown>;
  }) => {
    // Optimistic update for snappy UX — if the PATCH fails we re-fetch
    // and restore the truth. tablePrefs is shallow-merged (not overwritten)
    // to mirror the server-side jsonb merge, so partial updates like
    // { tablePrefs: { pageSize } } keep any other table prefs intact.
    const { tablePrefs, ...rest } = prefs;
    setUser((prev) =>
      prev
        ? {
            ...prev,
            ...rest,
            ...(tablePrefs !== undefined
              ? { tablePrefs: { ...prev.tablePrefs, ...tablePrefs } }
              : {}),
          }
        : prev,
    );
    try {
      await apiFetch("/auth/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      });
    } catch {
      await fetchUser();
      throw new Error("تعذّر حفظ التفضيلات");
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, assignments, loading, login, logout, refreshUser, notifyTokenRefreshed, setPreferences }}>
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

/**
 * Non-throwing auth accessor for shared components (e.g. DataTable) that may
 * render outside an AuthProvider (tests, storybook). Returns null when there
 * is no provider instead of throwing, so such components degrade gracefully
 * (no persisted prefs) rather than crashing the render.
 */
export function useOptionalAuth() {
  return useContext(AuthContext);
}
