// Per-user rate limiters used by domain routers.
//
// Extracted from routes/index.ts as part of P3 (modularise the central
// router). Mounting and ordering stay in routes/index.ts; this file is
// just the declarations so the central router has fewer moving parts
// and a new domain limiter doesn't require touching the orchestrator
// file.
//
// All limiters share the same shape: per-user (keyed off req.scope.userId
// — owner/admin roles exempt at the helper level), 60-second window,
// 300 req/min cap. The cap is generous so a normal session is never
// throttled, but a runaway loop / misbehaving client is still capped.
// Each module gets its own prefix so a finance-heavy session doesn't
// eat into a fleet click's budget.

import { createPerUserLimiter } from "../lib/perUserRateLimit.js";

export const umrahUserLimiter = createPerUserLimiter({
  prefix: "umrah",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات العمرة. يرجى المحاولة لاحقاً",
});

export const financeUserLimiter = createPerUserLimiter({
  prefix: "finance",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات المالية. يرجى المحاولة لاحقاً",
});

export const propertiesUserLimiter = createPerUserLimiter({
  prefix: "properties",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات العقارات. يرجى المحاولة لاحقاً",
});

export const fleetUserLimiter = createPerUserLimiter({
  prefix: "fleet",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات الأسطول. يرجى المحاولة لاحقاً",
});

export const warehouseUserLimiter = createPerUserLimiter({
  prefix: "warehouse",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات المستودع. يرجى المحاولة لاحقاً",
});

export const hrUserLimiter = createPerUserLimiter({
  prefix: "hr",
  windowMs: 60 * 1000,
  max: 300,
  message: "تم تجاوز الحد الأقصى لطلبات الموارد البشرية. يرجى المحاولة لاحقاً",
});
