import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAccessToken, setTokens, clearTokens } from '@/lib/tokenStore';
import { apiFetch } from '@/hooks/useApi';
import type { UserRole } from '@/lib/api';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  empNumber?: string;
  jobTitle?: string;
  photoUrl?: string;
  companyId?: number;
  branchId?: number;
  companyName?: string;
  branchName?: string;
  role?: string;
  userRoles?: UserRole[];
  /** مشتقّ من userRoles لتسهيل الفلترة في visibleModules */
  roles?: string[];
}

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: UserProfile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    getAccessToken().then(async (t) => {
      if (!t) { setStatus('signedOut'); return; }
      setToken(t);
      try {
        const profile = await apiFetch<UserProfile>('/api/auth/me');
        const enriched = { ...profile, roles: (profile.userRoles ?? []).map(r => r.roleKey) };
        setUser(enriched);
        setStatus('signedIn');
      } catch {
        await clearTokens();
        setStatus('signedOut');
      }
    });
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; refreshToken: string; user: UserProfile }>(
      '/api/auth/mobile/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
    await setTokens(data.accessToken, data.refreshToken);
    setToken(data.accessToken);
    const enriched = { ...data.user, roles: (data.user.userRoles ?? []).map(r => r.roleKey) };
    setUser(enriched);
    setStatus('signedIn');
  };

  const logout = async () => {
    await clearTokens();
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  };

  return (
    <AuthContext.Provider value={{ status, token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  return ctx;
}
