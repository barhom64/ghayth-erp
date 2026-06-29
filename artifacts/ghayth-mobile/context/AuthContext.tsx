import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/lib/tokenStore';
import { apiFetch, registerSessionExpiredHandler } from '@/hooks/useApi';
import type { UserRole } from '@/lib/api';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

export interface Assignment {
  id: number;
  companyId: number;
  branchId: number | null;
  role: string;
  status: string;
  jobTitle: string | null;
  companyName: string | null;
  branchName: string | null;
}

interface UserProfile {
  id: number;
  name: string;
  email: string;
  empNumber?: string;
  jobTitle?: string;
  photoUrl?: string;
  companyId?: number;
  branchId?: number | null;
  companyName?: string;
  branchName?: string;
  role?: string;
  userRoles?: UserRole[];
  roles?: string[];
}

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: UserProfile | null;
  assignments: Assignment[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchAssignment: (assignmentId: number) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ASSIGNMENTS_KEY = 'gh_assignments';

function storeAssignments(list: Assignment[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(list));
    }
  } catch { /* ignore */ }
}

function loadAssignments(): Assignment[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(ASSIGNMENTS_KEY);
      if (raw) return JSON.parse(raw) as Assignment[];
    }
  } catch { /* ignore */ }
  return [];
}

function enrichUser(profile: UserProfile): UserProfile {
  return { ...profile, roles: (profile.userRoles ?? []).map(r => r.roleKey) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const logout = useCallback(async () => {
    try {
      const rt = await getRefreshToken();
      if (rt) {
        await apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) }).catch(() => {});
      }
    } finally {
      await clearTokens();
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(ASSIGNMENTS_KEY); } catch { /* ignore */ }
      setToken(null);
      setUser(null);
      setAssignments([]);
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      clearTokens().catch(() => {});
      setToken(null);
      setUser(null);
      setAssignments([]);
      setStatus('signedOut');
    });
  }, []);

  const fetchMe = useCallback(async (): Promise<UserProfile> => {
    const profile = await apiFetch<UserProfile>('/api/auth/me');
    return enrichUser(profile);
  }, []);

  // Boot: restore session from stored tokens
  useEffect(() => {
    getAccessToken().then(async (t) => {
      if (!t) { setStatus('signedOut'); return; }
      setToken(t);
      setAssignments(loadAssignments());
      try {
        const profile = await fetchMe();
        setUser(profile);
        setStatus('signedIn');
      } catch {
        await clearTokens();
        setStatus('signedOut');
      }
    });
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{
      accessToken: string;
      refreshToken: string;
      assignments?: Assignment[];
      userRoles?: UserRole[];
    }>('/api/auth/mobile/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    await setTokens(data.accessToken, data.refreshToken);
    setToken(data.accessToken);

    const list = data.assignments ?? [];
    setAssignments(list);
    storeAssignments(list);

    // Fetch full profile via /me now that we have a valid token
    const profile = await fetchMe();
    setUser(profile);
    setStatus('signedIn');
  }, [fetchMe]);

  const switchAssignment = useCallback(async (assignmentId: number) => {
    const data = await apiFetch<{ accessToken: string; refreshToken: string }>(
      '/api/auth/switch-assignment',
      { method: 'POST', body: JSON.stringify({ assignmentId }) },
    );
    await setTokens(data.accessToken, data.refreshToken);
    setToken(data.accessToken);
    const profile = await fetchMe();
    setUser(profile);
  }, [fetchMe]);

  const refreshUser = useCallback(async () => {
    const profile = await fetchMe();
    setUser(profile);
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ status, token, user, assignments, login, logout, switchAssignment, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  return ctx;
}
