/**
 * Observability boundary — vendor-neutral facade for error capture,
 * structured messages, and user context.
 *
 * The audit flagged "no central error tracking (Sentry)" as a top-15
 * risk. Rather than commit to a specific vendor at audit time, this
 * file is the **single seam** every page goes through. Today it
 * defaults to `console.error` with a stable structured shape; the day
 * ops decides on a vendor (Sentry / Rollbar / Datadog / Honeycomb /
 * self-hosted) the implementation here is the only file that changes.
 *
 * Usage:
 *   import { captureException, captureMessage, setObsUser } from "@/lib/observability";
 *
 *   try { … } catch (err) {
 *     captureException(err, { tags: { module: "finance" }, extra: { invoiceId } });
 *     toast.error("…");
 *   }
 *
 *   captureMessage("payment-gateway-timeout", "warning", { extra: { ms } });
 *
 *   setObsUser({ id: 42, role: "owner", companyId: 1 });
 *
 * Wiring a real backend later:
 *   1. `pnpm add @sentry/react` (or your chosen vendor) at the workspace
 *      catalog level so every frontend gets the same version.
 *   2. Replace the `console.*` calls in this file with the vendor SDK
 *      equivalents. The exported function signatures are intentionally
 *      a subset of Sentry's API so the swap is mechanical.
 *   3. Initialise the SDK once in main.tsx **before** rendering, with
 *      DSN read from `import.meta.env.VITE_OBS_DSN`.
 *
 * This file deliberately avoids importing any heavy dependency, so it's
 * always cheap to include and never bloats the bundle when observability
 * isn't yet enabled.
 */

export type ObsLevel = "fatal" | "error" | "warning" | "info" | "debug";

export interface ObsContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ObsUser {
  id: number | string;
  role?: string;
  companyId?: number;
  branchId?: number;
}

let currentUser: ObsUser | null = null;
let currentTags: Record<string, string> = {};

const isProd = import.meta.env.MODE === "production";

function format(level: ObsLevel, payload: object): void {
  // In production we keep the line short and structured so log
  // shippers can pick it up cleanly. In development we let the
  // browser's full object viewer help debugging.
  if (isProd) {
    // eslint-disable-next-line no-console
    console[level === "warning" || level === "info" ? "warn" : "error"](
      `[obs:${level}]`,
      JSON.stringify(payload),
    );
  } else {
    // eslint-disable-next-line no-console
    console[level === "warning" || level === "info" ? "warn" : "error"](
      `[obs:${level}]`,
      payload,
    );
  }
}

/**
 * Capture an Error (or anything thrown). Adds the current user and
 * any tags previously set via `setObsTag`.
 */
export function captureException(err: unknown, context: ObsContext = {}): void {
  const error = err instanceof Error ? err : new Error(String(err));
  format("error", {
    message: error.message,
    name: error.name,
    stack: error.stack,
    user: currentUser,
    tags: { ...currentTags, ...(context.tags ?? {}) },
    extra: context.extra ?? {},
  });
}

/**
 * Capture a structured message at the given level. Use for
 * non-exception signals (slow API, integration timeout, expected-but-
 * notable user error) that you want to surface centrally without
 * throwing.
 */
export function captureMessage(
  message: string,
  level: ObsLevel = "info",
  context: ObsContext = {},
): void {
  format(level, {
    message,
    user: currentUser,
    tags: { ...currentTags, ...(context.tags ?? {}) },
    extra: context.extra ?? {},
  });
}

/**
 * Tie subsequent captures to the active user. Call once on login and
 * again on logout (with `null`) so the previous user doesn't leak into
 * a different session's reports.
 */
export function setObsUser(user: ObsUser | null): void {
  currentUser = user;
}

/**
 * Add a tag (a low-cardinality dimension) that will be attached to
 * every future capture until cleared. Examples: feature flag, A/B
 * variant, deployed version.
 */
export function setObsTag(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete currentTags[key];
  } else {
    currentTags[key] = value;
  }
}

/**
 * Clear all tags. Useful in tests so state doesn't leak between cases.
 */
export function clearObsTags(): void {
  currentTags = {};
}
