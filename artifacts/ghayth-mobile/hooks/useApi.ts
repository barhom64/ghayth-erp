/**
 * طبقة الاتصال بالـ API — fetch wrapper مع TanStack Query
 * - Bearer token من tokenStore
 * - معالجة 401 تلقائياً: تجديد التوكن أو تسجيل الخروج
 */
import { useQuery, useMutation as useRQMutation, type UseQueryOptions } from '@tanstack/react-query';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/lib/tokenStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_BASE = (((globalThis as any).process?.env?.EXPO_PUBLIC_API_URL) ?? 'https://hr.door.sa').replace(/\/$/, '');

// Callback يُعيّن من AuthContext لتسجيل الخروج عند انتهاء الجلسة
let onSessionExpired: (() => void) | null = null;
export function registerSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

/** تجديد التوكن مرة واحدة فقط في نفس الوقت */
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const body = await res.json() as { accessToken?: string; refreshToken?: string };
    if (!body.accessToken) return null;
    await setTokens(body.accessToken, body.refreshToken ?? refreshToken);
    return body.accessToken;
  } catch {
    return null;
  }
}

async function refreshOnce(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { params?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { params, ...rest } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers as Record<string, string> | undefined ?? {}),
    };
  };

  let res = await fetch(url, { ...rest, headers: await buildHeaders() });

  // 401 → حاول تجديد التوكن مرة واحدة
  if (res.status === 401) {
    const newToken = await refreshOnce();
    if (newToken) {
      res = await fetch(url, { ...rest, headers: await buildHeaders() });
    } else {
      await clearTokens();
      onSessionExpired?.();
      throw new Error('انتهت جلستك، يرجى تسجيل الدخول مجدداً');
    }
  }

  if (!res.ok) {
    let msg = `خطأ ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message ?? body?.error ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

/** useQuery wrapper للقوائم */
export function useList<T = unknown>(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: Partial<UseQueryOptions<T>>,
) {
  return useQuery<T>({
    queryKey: [endpoint, params],
    queryFn: () => apiFetch<T>(endpoint, { params }),
    retry: 1,
    staleTime: 30_000,
    ...options,
  });
}

/** useQuery للتفصيل */
export function useRecord<T = unknown>(endpoint: string, id: string | number | undefined) {
  return useQuery<T>({
    queryKey: [endpoint, id],
    queryFn: () => apiFetch<T>(`${endpoint}/${id}`),
    enabled: id !== undefined && id !== '',
    retry: 1,
    staleTime: 30_000,
  });
}

/** useMutation wrapper */
export function useMutation<TData = unknown, TBody = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
) {
  return useRQMutation<TData, Error, TBody>({
    mutationFn: (body: TBody) =>
      apiFetch<TData>(endpoint, {
        method,
        body: method !== 'DELETE' ? JSON.stringify(body) : undefined,
      }),
  });
}
