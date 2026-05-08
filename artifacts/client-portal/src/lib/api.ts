import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyRateLimited, RateLimitError } from "./rate-limit-toast";

function getToken() {
  return localStorage.getItem("portal_token");
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
    res = await fetch(`/api/portal${path}`, { ...options, headers });
  } catch (networkErr) {
    if (networkErr instanceof TypeError) {
      throw new Error("انقطع الاتصال بالخادم، يرجى التحقق من الإنترنت والمحاولة مجدداً");
    }
    throw networkErr;
  }
  if (res.status === 429) {
    const seconds = notifyRateLimited(res);
    throw new RateLimitError(seconds);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "خطأ في الخادم" }));
    throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return res.json();
}

export function useApiQuery<T = any>(key: string[], path: string, enabled: boolean = true) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path),
    enabled: Boolean(enabled),
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
