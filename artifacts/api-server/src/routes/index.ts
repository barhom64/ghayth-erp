import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

// Pre-auth (anonymous) routers — mounted before authMiddleware below.
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import storageRouter from "./storage.js";
import activityIngestRouter from "./activityIngest.js";
import clientPortalRouter from "./clientPortal.js";
import driverPortalRouter from "./driverPortal.js";
import careersPortalRouter from "./careersPortal.js";
import publicDataRouter from "./publicData.js";
import printVerifyRouter from "./printVerify.js";
import pdplRouter from "./pdpl.js";
import fleetTelematicsWebhookRouter from "./fleet-telematics-webhook.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { subscriptionGate } from "../middlewares/subscriptionGate.js";
import { csrfMiddleware } from "../middlewares/csrfMiddleware.js";
import rateLimit from "express-rate-limit";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { rawQuery } from "../lib/rawdb.js";

// P3 — All 100+ domain router mounts live in ./_domain-mounts.ts. This
// file is now a thin orchestrator: pre-auth routers + auth chain +
// global limiter + a single mountDomainRouters(router) call.
import { mountDomainRouters } from "./_domain-mounts.js";

const router: IRouter = Router();

router.use(healthRouter);

// Per-IP limiter for the truly anonymous surfaces. Replaces the old
// blanket /api globalLimiter that lived in app.ts and unfairly counted
// authenticated traffic. Anonymous endpoints don't have a userId to key
// off, so per-IP is the only honest option here.
//
// /api/health is excluded so liveness probes never trip the cap.
const anonymousIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.isProduction ? 100 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("anon:ip"),
});

router.use(storageRouter);
router.use(activityIngestRouter);
// /auth is special: it mixes anonymous endpoints (/login, /register,
// /refresh) with authenticated ones (/me, /logout, /switch-assignment,
// /change-password). We deliberately do NOT mount anonymousIpLimiter on
// the whole /auth router — that would throw an IP cap on the
// authenticated endpoints too. Instead, the anonymous endpoints inside
// auth.ts each have their own per-IP limiter (loginLimiter, refreshLimiter,
// registerLimiter), and the authenticated ones use per-user limiters
// (authedUserLimiter / changePasswordLimiter) declared inside auth.ts.
router.use("/auth", authRouter);
// /portal mixes anonymous login with authenticated portal API. The
// router applies loginLimiter per-IP on /login and a portal JWT
// middleware on the rest, so adding a router-wide IP limiter here would
// double-cap authenticated portal users. Skip it.
router.use("/portal", clientPortalRouter);
// /driver-portal — same shape as /portal but for fleet drivers
// (driver_portal_accounts table, JWT type='driver_portal'). The portal
// is the only surface a non-employee driver has to see their trips
// and self-mark availability. Same anonymous-login + JWT structure
// → same skip-the-router-wide-cap reasoning.
router.use("/driver-portal", driverPortalRouter);
// /careers mixes anonymous applicant flows with authenticated ones
// behind a careers JWT. Same reasoning as /portal — don't add a
// router-wide IP cap; portalLimiter inside careersPortal.ts handles the
// anonymous traffic.
router.use("/careers", careersPortalRouter);
// /public is fully anonymous → per-IP cap is correct here.
router.use("/public", anonymousIpLimiter, publicDataRouter);
// Print verify is anonymous so couriers/customers can scan a printed
// QR without an ERP account. Mounted as /print/verify (before the
// authMiddleware below) so the URL embedded in QRs stays
// /api/print/verify/:jobId. The authenticated printRouter mounts later
// and never sees these requests.
router.use("/print/verify", printVerifyRouter);
// /pdpl mixes anonymous /privacy-notice with authenticated endpoints.
// Limiters live inside pdpl.ts: per-IP on /privacy-notice, per-user
// (pdplUserLimiter) on the authenticated routes.
router.use("/pdpl", pdplRouter);
// #1354 — CMSV6 telematics webhook. Anonymous surface, HMAC-signed via
// the integration's webhookSecret. Mounted BEFORE authMiddleware so the
// vendor doesn't need an ERP JWT. The router enforces per-IP rate limit,
// timestamp window, and timing-safe signature compare inside.
router.use("/webhooks/cmsv6", fleetTelematicsWebhookRouter);

router.get("/settings/display", async (req, res) => {
  try {
    const cookieToken: string | undefined = req.cookies?.erp_access;
    const authHeader = req.headers.authorization;
    const rawToken = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);
    let companyId: number | null = null;
    if (rawToken) {
      try {
        const jwt = await import("jsonwebtoken");
        const SECRET = config.jwtSecret;
        const payload: any = jwt.default.verify(rawToken, SECRET!, { algorithms: ["HS256"] });
        if (payload?.companyId && payload?.type !== "client_portal") companyId = payload.companyId;
      } catch (e) { logger.debug(e, "public-settings JWT decode (optional)"); }
    }
    const rows = await rawQuery<{ key: string; value: string }>(
      companyId
        ? `SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND ("companyId" IS NULL OR "companyId" = $1) AND "branchId" IS NULL`
        : `SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND "companyId" IS NULL AND "branchId" IS NULL`,
      companyId ? [companyId] : []
    );
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    res.json({ data: result });
  } catch (e) {
    logger.warn(e, "failed to load system settings, using defaults");
    res.json({ data: { currency: "SAR", timezone: "Asia/Riyadh", companyName: "" } });
  }
});

// Route discovery endpoint — disabled in production, admin-only otherwise.
router.get("/_routes", (req, res, next): void => {
  if (config.isProduction) {
    res.status(404).json({ error: "المسار غير موجود" });
    return;
  }
  next();
}, (_req, res) => {
  const found: { method: string; path: string }[] = [];
  const walk = (stack: any[], prefix: string): void => {
    for (const layer of stack ?? []) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods ?? {})
          .filter((m) => m !== "_all")
          .map((m) => m.toUpperCase());
        for (const method of methods) {
          found.push({ method, path: prefix + layer.route.path });
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        const match = layer.regexp?.source?.match(/^\^\\\/([^\\]+)/);
        const mountPoint = match ? `/${match[1]}` : "";
        walk(layer.handle.stack, prefix + mountPoint);
      }
    }
  };
  walk(router.stack, "/api");
  found.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  res.json({ count: found.length, routes: found });
});

router.use(authMiddleware);
router.use(csrfMiddleware);

// B2 subscription gate. Mounted after authMiddleware so req.scope is
// set, before any module router so an expired tenant gets blocked at
// the edge instead of inside per-domain code. Owners always pass to
// reach /admin/subscription and pay — non-owners get a 402.
router.use(subscriptionGate);

// Per-user catch-all limiter for ALL authenticated /api traffic. Replaces
// the blanket per-IP globalLimiter that used to live in app.ts. Mounted
// here so it runs after authMiddleware (req.scope is set) and BEFORE any
// module router, giving every authenticated route a baseline per-user
// budget. Module-specific limiters below stack on top with their own
// (smaller-prefix, often tighter) budgets — both must pass.
const globalUserLimiter = createPerUserLimiter({
  prefix: "api:global",
  windowMs: 60 * 1000,
  max: config.isProduction ? 600 : 6000,
  message: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً",
});
router.use(globalUserLimiter);

// P3 — Mount all 100+ domain routers (see ./_domain-mounts.ts for the
// full list + ordering rationale). Equivalent to the ~200 lines of
// router.use(...) calls that used to live inline here.
mountDomainRouters(router);

export default router;
