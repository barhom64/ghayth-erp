/**
 * طبقة الاتصال بالـ API — axios/fetch wrapper مع TanStack Query
 */
import { useQuery, useMutation as useRQMutation, type UseQueryOptions } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/tokenStore';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://hr.door.sa').replace(/\/$/, '');

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { params?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const token = await getAccessToken();
  const { params, ...rest } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.headers as Record<string, string> | undefined ?? {}),
  };

  const res = await fetch(url, { ...rest, headers });

  if (!res.ok) {
    let msg = `خطأ ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.message ?? body?.error ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

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
    ...options,
  });
}

/** useQuery للتفصيل */
export function useRecord<T = unknown>(endpoint: string, id: string | number | undefined) {
  return useQuery<T>({
    queryKey: [endpoint, id],
    queryFn: () => apiFetch<T>(`${endpoint}/${id}`),
    enabled: id !== undefined && id !== '',
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
        body: JSON.stringify(body),
      }),
  });
}
