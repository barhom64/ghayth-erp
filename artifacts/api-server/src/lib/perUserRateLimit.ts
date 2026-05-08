import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import { makeRateLimitStore } from "./rateLimitStore.js";

// Shared helper for per-user, role-aware rate limiters.
//
// Mirrors the umrah pattern in routes/index.ts:
//  - Keys off req.scope.userId so admins behind a shared proxy IP aren't
//    lumped together. Falls back to IP only when scope is missing (which
//    should never happen for authenticated routes — defensive only).
//  - Exempts owners and admin-level roles entirely. Legitimate bulk work
//    and internal automation should never be throttled by these.
//  - Anonymous traffic can never reach a route mounted with this helper
//    because authMiddleware rejects it before the limiter runs.
//
// The caller MUST mount this AFTER authMiddleware (either via the global
// router.use(authMiddleware) in routes/index.ts, or by ordering the route
// chain explicitly: `route(path, authMiddleware, perUserLimiter, handler)`).
//
// `req.scope` is augmented onto Express.Request by authMiddleware.ts; we
// use the typed Request directly so this file passes the no-`any` quality
// gate.
export function createPerUserLimiter(opts: {
  prefix: string;
  windowMs: number;
  max: number;
  message?: string;
  // Override the role-based skip rule (defaults to owner/admin/super_admin).
  skip?: (role: string, isOwner: boolean) => boolean;
  // Extra rateLimit options pass-through (rarely needed).
  extra?: Partial<Options>;
}) {
  const {
    prefix,
    windowMs,
    max,
    message,
    skip,
    extra,
  } = opts;
  const exempt = skip ?? ((role, isOwner) => {
    if (isOwner) return true;
    const r = role.toLowerCase();
    return r === "admin" || r === "owner" || r === "super_admin";
  });
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: message ? { error: message } : undefined,
    // Redis-backed store so per-user counts survive restarts and are
    // shared across api-server replicas. Falls back to MemoryStore when
    // REDIS_URL is unset (dev) or Redis is unreachable.
    store: makeRateLimitStore(prefix),
    // keyGeneratorIpFallback: req.ip is only used as a defensive fallback
    // when scope is missing (which can't happen for authenticated routes).
    // The IPv6-bypass concern doesn't apply because the fallback path is
    // never exercised in normal operation.
    validate: { ip: false, trustProxy: false, keyGeneratorIpFallback: false },
    keyGenerator: (req: Request) => {
      const uid = req.scope?.userId;
      return uid ? `${prefix}:u:${uid}` : `${prefix}:ip:${req.ip ?? "anon"}`;
    },
    skip: (req: Request) => {
      const s = req.scope;
      if (!s) return false;
      return exempt(String(s.role ?? ""), Boolean(s.isOwner));
    },
    ...(extra ?? {}),
  });
}
