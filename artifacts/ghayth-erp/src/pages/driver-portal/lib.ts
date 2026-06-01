// Driver portal — small `fetch()` helper that adds the driver JWT
// (stored in localStorage as `driver_portal_token`) to every request.
// We don't reuse the main-app apiFetch because it uses cookie-based
// ERP auth + scope query strings; the driver portal is a fully
// separate auth surface (#1354).

const BASE = (() => {
  // Same priority as the main api.ts: VITE_API_BASE env > window override > empty.
  if (typeof window !== "undefined" && (window as any).__API_BASE__) return (window as any).__API_BASE__;
  const env = (import.meta as any)?.env?.VITE_API_BASE;
  return env ? String(env) : "";
})();

const TOKEN_KEY = "driver_portal_token";
const DRIVER_KEY = "driver_portal_driver";

export interface DriverPortalDriver {
  id: number;
  name: string;
  phone: string | null;
}

export function getDriverToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setDriverSession(token: string, driver: DriverPortalDriver): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
  } catch { /* localStorage may be unavailable */ }
}

export function getDriverProfile(): DriverPortalDriver | null {
  try {
    const raw = localStorage.getItem(DRIVER_KEY);
    return raw ? JSON.parse(raw) as DriverPortalDriver : null;
  } catch { return null; }
}

export function clearDriverSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DRIVER_KEY);
  } catch { /* noop */ }
}

export interface DriverFetchOptions extends RequestInit {
  /** When true, do NOT redirect on 401 — useful for the login endpoint. */
  noAuthRedirect?: boolean;
}

/**
 * Driver-portal fetch wrapper. Adds the JWT, parses JSON, throws on
 * non-2xx with a friendly Arabic message. On 401 (token expired or
 * revoked) clears localStorage and redirects to /driver-portal/login.
 */
export async function driverFetch<T = any>(path: string, opts: DriverFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined ?? {}),
  };
  const token = getDriverToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 && !opts.noAuthRedirect) {
    clearDriverSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/driver-portal/login") {
      window.location.assign("/driver-portal/login");
    }
  }
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (body && typeof body === "object" && (body as any).error)
      ? (body as any).error
      : `طلب فشل (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}
