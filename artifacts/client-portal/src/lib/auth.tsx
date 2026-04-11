import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch, ApiError } from "./api";

interface ClientInfo {
  id: number;
  name: string;
  email: string;
  phone?: string;
  classification?: string;
  portalEmail?: string;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  client: ClientInfo | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (token: string, mustChangePassword?: boolean, clientData?: ClientInfo) => void;
  logout: () => void;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("portal_token"));
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(!!token);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [, setLocation] = useLocation();
  const skipFetchRef = useRef(false);

  const fetchClient = useCallback(async () => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch("/me");
      setClient(data);
      setMustChangePassword(!!data.mustChangePassword);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        localStorage.removeItem("portal_token");
        setToken(null);
        setClient(null);
        setMustChangePassword(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchClient();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = (newToken: string, mustChange?: boolean, clientData?: ClientInfo) => {
    localStorage.setItem("portal_token", newToken);
    setLoading(true);
    if (clientData) {
      skipFetchRef.current = true;
      setClient(clientData);
      setMustChangePassword(!!mustChange);
    }
    setToken(newToken);
    if (mustChange) {
      setLocation("/change-password");
    } else {
      setLocation("/");
    }
  };

  const logout = () => {
    localStorage.removeItem("portal_token");
    setToken(null);
    setClient(null);
    setMustChangePassword(false);
    setLocation("/login");
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
    if (client) {
      setClient({ ...client, mustChangePassword: false });
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, client, loading, mustChangePassword, login, logout, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
