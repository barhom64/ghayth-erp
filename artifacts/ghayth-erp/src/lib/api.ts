import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

/**
 * ApiError — P1.3 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * The API server emits typed errors (P0.3: ValidationError / NotFoundError /
 * ConflictError / ForbiddenError / IntegrationError). Before this class,
 * `apiFetch` threw a plain `Error` with just `.message`, so the frontend lost
 * the structured `code` / `field` / `fix` / `status` / `meta` fields the
 * server worked so hard to attach.
 *
 * `apiFetch` now throws `ApiError` when the server returns a non-2xx JSON
 * payload. The class is a `Error` subclass so existing `getErrorMessage`
 * and `instanceof Error` checks keep working. New call sites can read the
 * structured fields directly:
 *
 *   try { await createLeave(body); }
 *   catch (err) {
 *     if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
 *       setFieldError(err.field!, err.fix ?? err.message);
 *       return;
 *     }
 *     throw err;  // let the boundary / default toast handle it
 *   }
 *
 * `PageErrorBoundary` (P0.5) reads `err.response` — set here so the boundary
 * can branch on code without the caller having to pass anything extra.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly field?: string;
  public readonly fix?: string;
  public readonly meta?: Record<string, unknown>;
  /**
   * Copy of the raw server response body — `PageErrorBoundary` reads this
   * to adapt its fallback UI to the error code.
   */
  public readonly response: {
    error: string;
    code: string;
    field?: string;
    fix?: string;
    status: number;
    meta?: Record<string, unknown>;
  };

  constructor(
    message: string,
    init: {
      status: number;
      code?: string;
      field?: string;
      fix?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code ?? inferCodeFromStatus(init.status);
    this.field = init.field;
    this.fix = init.fix;
    this.meta = init.meta;
    this.response = {
      error: message,
      code: this.code,
      ...(init.field !== undefined ? { field: init.field } : {}),
      ...(init.fix !== undefined ? { fix: init.fix } : {}),
      status: init.status,
      ...(init.meta !== undefined ? { meta: init.meta } : {}),
    };
  }
}

/** Fallback code when the server response didn't include one. */
function inferCodeFromStatus(status: number): string {
  if (status === 404) return "NOT_FOUND";
  if (status === 403) return "FORBIDDEN";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 502) return "INTEGRATION_ERROR";
  if (status >= 500) return "SERVER_ERROR";
  if (status >= 400) return "CLIENT_ERROR";
  return "UNKNOWN";
}

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
    const body = await res.json().catch(() => ({ error: "خطأ في الخادم" }));
    // Preserve the typed-error shape the server sent (P0.3 / P1.3).
    // The server's typed errors ship { error, code, field?, fix?, meta? }.
    // Older routes still ship { error } — the ApiError constructor fills
    // in a default code from the status so PageErrorBoundary can still
    // branch cleanly.
    throw new ApiError(body.error || `HTTP ${res.status}`, {
      status: res.status,
      code: typeof body.code === "string" ? body.code : undefined,
      field: typeof body.field === "string" ? body.field : undefined,
      fix: typeof body.fix === "string" ? body.fix : undefined,
      meta: body.meta && typeof body.meta === "object" ? body.meta : undefined,
    });
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

export interface ApiMutationOptions<TData = any, TBody = any> {
  /** Suppress the default error toast — callers that show inline errors. */
  silent?: boolean;
  /** Override the default success toast (pass false to disable). */
  successMessage?: string | false;
  onSuccess?: (data: TData, body: TBody) => void;
  onError?: (error: Error, body: TBody) => void;
  /**
   * P1.3 — invoked when the server returns a VALIDATION_ERROR with a `field`.
   * Lets the form mark the specific input as errored instead of showing a
   * toast. If this handler is set, the default error toast is suppressed for
   * validation errors only (other error codes still toast).
   */
  onFieldError?: (field: string, message: string, fix?: string) => void;
  /**
   * P1.3 — called before the default error toast for any non-validation
   * code. Return `true` to suppress the default toast (you handled it).
   * Useful for pages that want a custom message for e.g. CONFLICT while
   * keeping the default for everything else.
   */
  onCodeError?: (code: string, error: ApiError, body: TBody) => boolean | void;
}

/**
 * Translate a server error code to the arabic toast title. Unknown codes
 * fall back to the generic "تعذّر تنفيذ العملية". Messages always come
 * from the server — this function only picks the title.
 */
function toastTitleForCode(code: string): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return "البيانات غير صالحة";
    case "NOT_FOUND":
      return "السجل غير موجود";
    case "CONFLICT":
      return "لا يمكن تنفيذ هذه العملية الآن";
    case "FORBIDDEN":
      return "غير مصرح بهذه العملية";
    case "INTEGRATION_ERROR":
      return "خدمة خارجية متعطّلة";
    default:
      return "تعذّر تنفيذ العملية";
  }
}

/**
 * Build the toast description for a typed `ApiError`. R.1.2 upgrades
 * the description line to surface the richest structured detail the
 * server returned so the user sees the specific blocker instead of a
 * generic "cannot do this right now" line.
 *
 * Priority order (first non-empty wins):
 *
 *   1. CONFLICT with `meta.blockers: string[]` — Phase C.7b delete
 *      guards (vendors with open POs, accounts with journal lines,
 *      budgets with used amount, fiscal periods with pending journals,
 *      etc.) ship an array of human-readable blockers. Render up to
 *      three of them joined with " — " so the toast stays one line.
 *
 *   2. CONFLICT with `meta.pendingCount: number` — fiscal period close
 *      sends the count of unposted manual journals. Format as
 *      "يوجد N قيد يدوي غير مُرحَّل".
 *
 *   3. CONFLICT with `meta.currentStatus: string` — engine rejected
 *      the transition because the row was in the wrong state. Format
 *      as "الحالة الحالية: <currentStatus>" for operators.
 *
 *   4. FORBIDDEN with `meta.requiredRoles: string[]` — Phase 5
 *      `assertRole` failures ship the allowed role list. Format as
 *      "الأدوار المسموح لها: <joined>".
 *
 *   5. `err.fix` — the server's recovery hint (set on every typed
 *      ValidationError/ConflictError that was upgraded in Phase C.7b).
 *
 *   6. `err.message` — the server's arabic message (fallback).
 */
function toastDescriptionForError(err: ApiError): string {
  const meta = err.meta ?? {};

  if (err.code === "CONFLICT" && Array.isArray((meta as any).blockers)) {
    const blockers = (meta as any).blockers as unknown[];
    const humanReadable = blockers
      .filter((b) => typeof b === "string" && b.length > 0)
      .slice(0, 3) as string[];
    if (humanReadable.length > 0) {
      return humanReadable.join(" — ");
    }
  }

  if (err.code === "CONFLICT" && typeof (meta as any).pendingCount === "number") {
    return `يوجد ${(meta as any).pendingCount} قيد يدوي غير مُرحَّل`;
  }

  if (err.code === "CONFLICT" && typeof (meta as any).currentStatus === "string") {
    return `الحالة الحالية: ${(meta as any).currentStatus}`;
  }

  if (err.code === "FORBIDDEN" && Array.isArray((meta as any).requiredRoles)) {
    const roles = ((meta as any).requiredRoles as unknown[])
      .filter((r) => typeof r === "string" && r.length > 0) as string[];
    if (roles.length > 0) {
      return `الأدوار المسموح لها: ${roles.join("، ")}`;
    }
  }

  return err.fix ?? err.message;
}

/**
 * R.2 iter 2 — `path` accepts either a fixed string or a function that
 * derives the path from the mutation body. The function form is
 * required for row-level actions where the URL contains an id taken
 * from the body (`/finance/journal-manual/:id/submit`). Before this
 * extension, every page that needed per-row URL composition was
 * forced to bypass `useApiMutation` and fall back to a hand-rolled
 * `useMutation` + `apiFetch`, losing the typed-error toast pipeline.
 *
 * The `TBody` type also gains a narrowed shape for the function form
 * so callers get autocomplete on the body fields inside `pathFn`.
 */
export type ApiMutationPath<TBody> = string | ((body: TBody) => string);

export function useApiMutation<TData = any, TBody = any>(
  path: ApiMutationPath<TBody>,
  method: string = "POST",
  invalidateKeys?: string[][],
  options?: ApiMutationOptions<TData, TBody>
) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TBody>({
    mutationFn: (body: TBody) => {
      const url = typeof path === "function" ? path(body) : path;
      // When the path is a function, the caller owns URL composition
      // and the body carries the row id (and possibly other fields).
      // The DELETE / POST / PATCH body is still the same body object
      // — the function form only affects the URL, never the request
      // payload.
      return apiFetch<TData>(url, {
        method,
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data, body) => {
      invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      if (options?.successMessage !== false && options?.successMessage !== undefined) {
        toast({ title: options.successMessage });
      }
      options?.onSuccess?.(data, body);
    },
    // Default error handler — P1.3 upgrade:
    //   1. If the error is a typed ApiError, we route it through
    //      `onFieldError` / `onCodeError` first so callers can opt into
    //      structured handling without killing the default toast.
    //   2. The default toast title is picked by error code rather than a
    //      single generic "تعذّر تنفيذ العملية" for everything.
    //   3. Plain errors (network, non-JSON) still fall through to the
    //      legacy generic toast so pre-P1.3 call sites behave identically.
    onError: (error, body) => {
      if (error instanceof ApiError) {
        if (
          (error.code === "VALIDATION_ERROR" || error.code === "CONFLICT") &&
          error.field &&
          options?.onFieldError
        ) {
          options.onFieldError(error.field, error.message, error.fix);
          options.onError?.(error, body);
          return;
        }
        // Custom code handler → caller decides whether to show the toast.
        if (options?.onCodeError) {
          const suppressed = options.onCodeError(error.code, error, body);
          if (suppressed === true) {
            options.onError?.(error, body);
            return;
          }
        }
        if (!options?.silent) {
          toast({
            title: toastTitleForCode(error.code),
            description: toastDescriptionForError(error),
            variant: "destructive",
          });
        }
        options?.onError?.(error, body);
        return;
      }

      // Non-ApiError path — legacy behaviour preserved.
      if (!options?.silent) {
        toast({
          title: "تعذّر تنفيذ العملية",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      }
      options?.onError?.(error, body);
    },
  });
}

export async function apiPatch<T = any>(path: string, body: Record<string, any>): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
