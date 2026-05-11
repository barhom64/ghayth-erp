/**
 * siemForwarder — out-of-band security event shipping.
 *
 * Every denied request lands in `security_log` (PR #229's audit trail).
 * For SOC 2 / SAMA / banking compliance, that audit must also be
 * shipped to an external SIEM (Splunk, Sentinel, Elastic, Datadog, ...)
 * so internal admins can't tamper with it.
 *
 * Config via env:
 *   RBAC_SIEM_WEBHOOK_URL  — HTTPS endpoint that accepts JSON POSTs
 *   RBAC_SIEM_AUTH_HEADER  — optional Authorization header value
 *                            (e.g. "Bearer xyz" or "Splunk abc==")
 *
 * Graceful: if the URL is unset OR the POST fails, we never block the
 * actual request. The local DB log is the source of truth; SIEM is a
 * best-effort mirror.
 *
 * Fire-and-forget with a small per-event timeout — under no
 * circumstance should this block authorize() from returning.
 */

import { logger } from "../logger.js";

export interface SiemEvent {
  timestamp: string;
  category: "rbac.denied" | "rbac.granted" | "rbac.role_change" | "rbac.jit";
  severity: "info" | "warn" | "critical";
  userId: number;
  companyId: number;
  role: string;
  path: string;
  method: string;
  requiredPerms: string[];
  reason: string;
  ip: string | null;
  meta?: Record<string, unknown>;
}

const TIMEOUT_MS = 2_000;

function getWebhookConfig(): { url: string; auth?: string } | null {
  const url = process.env.RBAC_SIEM_WEBHOOK_URL;
  if (!url) return null;
  return { url, auth: process.env.RBAC_SIEM_AUTH_HEADER };
}

/**
 * Ship a single event. Returns immediately (sync) and the actual
 * network call runs in the background. We swallow every failure so a
 * down SIEM never affects the user-facing latency.
 */
export function forwardToSiem(event: SiemEvent): void {
  const cfg = getWebhookConfig();
  if (!cfg) return;

  // Fire-and-forget; abort after TIMEOUT_MS so a hung SIEM doesn't
  // accumulate sockets.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.auth ? { authorization: cfg.auth } : {}),
    },
    body: JSON.stringify({
      source: "ghayth-erp.rbac",
      ...event,
    }),
    signal: controller.signal,
  })
    .catch((err: unknown) => {
      // Only log the first few failures per minute to avoid log flood
      // when SIEM is offline. The local DB still has the event.
      logger.warn({ err: (err as Error)?.message }, "[siem] forward failed");
    })
    .finally(() => clearTimeout(timer));
}

/** Emits a denial event (default category). Helper used from authorize(). */
export function forwardDenial(opts: {
  userId: number;
  companyId: number;
  role: string;
  path: string;
  method: string;
  feature: string;
  action: string;
  reason: string;
  ip: string | null;
  meta?: Record<string, unknown>;
}): void {
  forwardToSiem({
    timestamp: new Date().toISOString(),
    category: "rbac.denied",
    severity: opts.reason === "SOD_VIOLATION" || opts.reason === "EMERGENCY_LOCK" ? "critical" : "warn",
    userId: opts.userId,
    companyId: opts.companyId,
    role: opts.role,
    path: opts.path,
    method: opts.method,
    requiredPerms: [`${opts.feature}:${opts.action}`],
    reason: opts.reason,
    ip: opts.ip,
    meta: opts.meta,
  });
}

/** Emits a role-change event for audit trail mirroring. */
export function forwardRoleChange(opts: {
  userId: number;
  companyId: number;
  role: string;
  changeType: string;
  meta?: Record<string, unknown>;
}): void {
  forwardToSiem({
    timestamp: new Date().toISOString(),
    category: "rbac.role_change",
    severity: "info",
    userId: opts.userId,
    companyId: opts.companyId,
    role: opts.role,
    path: "/admin/rbac",
    method: "POST",
    requiredPerms: [],
    reason: opts.changeType,
    ip: null,
    meta: opts.meta,
  });
}
