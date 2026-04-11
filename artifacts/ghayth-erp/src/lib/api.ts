import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function getToken() {
  return localStorage.getItem("erp_token");
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("erp_refresh_token");
  if (!refreshToken) return null;

  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("erp_token", data.token);
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options?.body && typeof options.body === "string") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  } catch (networkErr) {
    if (networkErr instanceof TypeError) {
      throw new Error("انقطع الاتصال بالخادم، يرجى التحقق من الإنترنت والمحاولة مجدداً");
    }
    throw networkErr;
  }

  if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${BASE}/api${path}`, { ...options, headers });
    } else {
      localStorage.removeItem("erp_token");
      localStorage.removeItem("erp_refresh_token");
      localStorage.removeItem("erp_assignments");
      window.location.href = `${BASE}/login`;
      throw new Error("انتهت الجلسة، يرجى تسجيل الدخول مجدداً");
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "خطأ في الخادم" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return res.json();
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export function asList<T = any>(resp: { data?: T[] } | T[] | unknown): T[] {
  if (Array.isArray((resp as { data?: T[] })?.data)) return (resp as { data: T[] }).data;
  if (Array.isArray(resp)) return resp as T[];
  return [];
}

export function formDataToRecord(fd: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  fd.forEach((value, key) => { obj[key] = String(value); });
  return obj;
}

export function useApiQuery<T = any>(
  key: string[],
  path: string | null,
  options?: boolean | { enabled?: boolean }
) {
  let isEnabled: boolean;
  if (typeof options === "boolean") {
    isEnabled = options;
  } else if (options && typeof options === "object") {
    isEnabled = options.enabled !== false;
  } else {
    isEnabled = true;
  }
  if (!path) isEnabled = false;

  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path!),
    enabled: isEnabled,
    retry: 1,
  });
}

export function useApiMutation<TData = any, TBody = any>(
  path: string,
  method: string = "POST",
  invalidateKeys?: string[][]
) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TBody>({
    mutationFn: (body: TBody) =>
      apiFetch<TData>(path, {
        method,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

export async function apiPatch<T = any>(path: string, body: Record<string, any>): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
