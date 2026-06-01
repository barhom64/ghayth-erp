// Driver portal — minimal foundation for #1354.
//
// Mirrors the clientPortal pattern (021/175): a separate portal account
// table (driver_portal_accounts, migration 242) keyed off fleet_drivers,
// JWT-signed sessions with tokenVersion gating for instant logout, and
// a small protected surface scoped to "what THIS driver needs to do".
//
// Endpoints (all under /api/driver-portal):
//   POST   /auth/login            — email + password → JWT
//   GET    /me                    — current driver profile
//   GET    /me/trips              — trips assigned to this driver
//   GET    /me/trips/:id          — single trip with vehicle/route detail
//   PATCH  /me/availability       — driver self-marks `available` or `off_duty`
//
// Out of scope for this PR (added separately when needed):
//   - Document upload (driver license renewal, etc.)
//   - In-portal trip-event log (start/pause/complete)
//   - Driver-side scorecard view
//
// The portal does NOT use the regular `authorize({ feature: ... })`
// middleware — it has its own auth path (portalAuthMiddleware) and its
// own scope shape. RBAC features are for the operator side; portal
// permissions are implicit ("a driver can see their own data").

import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { verifyPassword, hashPassword } from "../lib/auth.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  isTypedError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const router = Router();

const SECRET = config.jwtSecret;
if (!SECRET) throw new Error("JWT_SECRET is required for driver portal");

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("driver-portal:login"),
});

export interface DriverPortalScope {
  accountId: number;
  driverId: number;
  companyId: number;
  tokenVersion: number;
  type: "driver_portal";
}

interface DriverPortalAccountLoginRow {
  id: number;
  driverId: number;
  companyId: number;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  tokenVersion: number;
  driverName: string;
  driverPhone: string | null;
}

interface DriverPortalAccountStatusRow {
  id: number;
  isActive: boolean;
  tokenVersion: number;
  driverDeletedAt: string | null;
}

const portalLoginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string().min(6, "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"),
});

const availabilitySchema = z.object({
  // Drivers can self-mark only the two human-controlled states.
  // `on_trip` is mechanical (set by trip-create), `suspended` is
  // operator-only (disciplinary). We hide both from the portal.
  status: z.enum(["available", "off_duty"]),
});

function signPortalToken(payload: { accountId: number; driverId: number; companyId: number; tokenVersion: number }) {
  return jwt.sign({ ...payload, type: "driver_portal" }, SECRET!, { expiresIn: "7d" });
}

function verifyPortalToken(token: string): DriverPortalScope {
  return jwt.verify(token, SECRET!, { algorithms: ["HS256"] }) as DriverPortalScope;
}

async function portalAuthMiddleware(
  req: Request & { driverPortalScope?: DriverPortalScope },
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح: لا يوجد توكن" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyPortalToken(token);
    if (payload.type !== "driver_portal") {
      res.status(401).json({ error: "توكن غير صالح" });
      return;
    }
    const [account] = await rawQuery<DriverPortalAccountStatusRow>(
      `SELECT dpa.id, dpa."isActive", dpa."tokenVersion",
              d."deletedAt" AS "driverDeletedAt"
         FROM driver_portal_accounts dpa
         JOIN fleet_drivers d
           ON d.id = dpa."driverId"
          AND d."companyId" = dpa."companyId"
        WHERE dpa.id = $1 AND dpa."driverId" = $2 AND dpa."companyId" = $3`,
      [payload.accountId, payload.driverId, payload.companyId],
    );
    if (!account) {
      res.status(401).json({ error: "الحساب غير موجود" });
      return;
    }
    if (!account.isActive) {
      throw new ForbiddenError("الحساب موقوف، يرجى التواصل مع الإدارة");
    }
    if (account.driverDeletedAt) {
      throw new ForbiddenError("الحساب موقوف، يرجى التواصل مع الإدارة");
    }
    if (Number(account.tokenVersion ?? 0) !== Number(payload.tokenVersion ?? 0)) {
      res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مجدداً" });
      return;
    }
    req.driverPortalScope = payload;
    next();
  } catch (err) {
    if (isTypedError(err)) {
      res.status(err.status).json(err.toResponse());
      return;
    }
    res.status(401).json({ error: "توكن غير صالح أو منتهي" });
  }
}

function withDriverPortalScope(
  handler: (req: Request & { driverPortalScope: DriverPortalScope }, res: Response) => Promise<void>,
) {
  return async (
    req: Request & { driverPortalScope?: DriverPortalScope },
    res: Response,
  ): Promise<void> => {
    if (!req.driverPortalScope) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    return handler(req as Request & { driverPortalScope: DriverPortalScope }, res);
  };
}

router.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const body = zodParse(portalLoginSchema.safeParse(req.body));
    const email = body.email.trim().toLowerCase();
    const [account] = await rawQuery<DriverPortalAccountLoginRow>(
      `SELECT dpa.id, dpa."driverId", dpa."companyId", dpa."passwordHash",
              dpa."isActive", dpa."mustChangePassword", dpa."tokenVersion",
              d.name AS "driverName", d.phone AS "driverPhone"
       FROM driver_portal_accounts dpa
       JOIN fleet_drivers d
         ON d.id = dpa."driverId"
        AND d."companyId" = dpa."companyId"
        AND d."deletedAt" IS NULL
       WHERE dpa.email = $1`,
      [email],
    );
    if (!account) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }
    if (!account.isActive) {
      throw new ForbiddenError("الحساب موقوف، يرجى التواصل مع الإدارة");
    }
    const valid = await verifyPassword(body.password, account.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }
    await rawExecute(
      `UPDATE driver_portal_accounts SET "lastLoginAt" = NOW() WHERE id = $1`,
      [account.id],
    );
    emitEvent({
      companyId: account.companyId, branchId: 0, userId: 0,
      action: "driver_portal.login", entity: "driver_portal_accounts", entityId: account.id,
      details: JSON.stringify({ driverId: account.driverId, email }),
    }).catch((e) => logger.error(e, "driverPortal background task failed"));
    createAuditLog({
      companyId: account.companyId, userId: 0,
      action: "login", entity: "driver_portal_accounts", entityId: account.id,
      after: { driverId: account.driverId, email },
    }).catch((e) => logger.error(e, "driverPortal background task failed"));
    const token = signPortalToken({
      accountId: account.id,
      driverId: account.driverId,
      companyId: account.companyId,
      tokenVersion: Number(account.tokenVersion ?? 0),
    });
    res.json({
      token,
      mustChangePassword: account.mustChangePassword,
      driver: {
        id: account.driverId,
        name: account.driverName,
        phone: account.driverPhone,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Driver portal login error:");
  }
});

const protectedRouter = Router();
protectedRouter.use(portalAuthMiddleware);

protectedRouter.get(
  "/me",
  withDriverPortalScope(async (req, res) => {
    try {
      const scope = req.driverPortalScope;
      const [driver] = await rawQuery<Record<string, unknown>>(
        `SELECT d.id, d.name, d.phone, d."licenseNumber", d."licenseExpiry",
                d."licenseType", d.status, d.rating, d."totalTrips",
                dpa.email AS "portalEmail", dpa."mustChangePassword", dpa."lastLoginAt"
         FROM fleet_drivers d
         JOIN driver_portal_accounts dpa
           ON dpa."driverId" = d.id AND dpa."companyId" = d."companyId"
        WHERE d.id = $1 AND d."companyId" = $2 AND d."deletedAt" IS NULL`,
        [scope.driverId, scope.companyId],
      );
      if (!driver) throw new NotFoundError("السائق غير موجود");
      res.json({ data: driver });
    } catch (err) {
      handleRouteError(err, res, "Driver portal me error:");
    }
  }),
);

protectedRouter.get(
  "/me/trips",
  withDriverPortalScope(async (req, res) => {
    try {
      const scope = req.driverPortalScope;
      const { status } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.driverId, scope.companyId];
      let where = `t."driverId" = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL`;
      if (status) {
        params.push(status);
        where += ` AND t.status = $${params.length}`;
      }
      const rows = await rawQuery(
        `SELECT t.id, t.status, t."tripDate", t."startTime", t."endTime",
                t."fromLocation", t."toLocation", t.distance, t.cost, t.notes,
                v."plateNumber" AS "vehiclePlate"
           FROM fleet_trips t
           LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."companyId" = t."companyId" AND v."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY COALESCE(t."startTime", t."tripDate", t."createdAt") DESC
          LIMIT 200`,
        params,
      );
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "Driver portal trips error:");
    }
  }),
);

protectedRouter.get(
  "/me/trips/:id",
  withDriverPortalScope(async (req, res) => {
    try {
      const scope = req.driverPortalScope;
      const id = parseId(req.params.id, "id");
      const [trip] = await rawQuery<Record<string, unknown>>(
        `SELECT t.*, v."plateNumber" AS "vehiclePlate", v.model AS "vehicleModel"
           FROM fleet_trips t
           LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId" AND v."companyId" = t."companyId" AND v."deletedAt" IS NULL
          WHERE t.id = $1 AND t."driverId" = $2 AND t."companyId" = $3 AND t."deletedAt" IS NULL`,
        [id, scope.driverId, scope.companyId],
      );
      if (!trip) throw new NotFoundError("الرحلة غير موجودة");
      res.json({ data: trip });
    } catch (err) {
      handleRouteError(err, res, "Driver portal trip-detail error:");
    }
  }),
);

// Cargo manifests assigned to THIS driver. cargo_manifests is a
// peer of fleet_trips at the dispatch surface, so the driver
// portal exposes it under /me/cargo to match the /me/trips shape.
// Soft-delete + tenant scope enforced inline (no manifest leakage
// from outside the driver's company).
protectedRouter.get(
  "/me/cargo",
  withDriverPortalScope(async (req, res) => {
    try {
      const scope = req.driverPortalScope;
      const { status } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.driverId, scope.companyId];
      let where = `m."driverId" = $1 AND m."companyId" = $2 AND m."deletedAt" IS NULL`;
      if (status) {
        params.push(status);
        where += ` AND m.status = $${params.length}`;
      }
      const rows = await rawQuery(
        `SELECT m.id, m."manifestNumber", m.status, m."fromLocation", m."toLocation",
                m."pickupDate", m."deliveryDate", m."customerName", m."totalWeight",
                v."plateNumber" AS "vehiclePlate"
           FROM cargo_manifests m
           LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = m."companyId" AND v."deletedAt" IS NULL
          WHERE ${where}
          ORDER BY COALESCE(m."pickupDate", m."createdAt") DESC
          LIMIT 200`,
        params,
      );
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "Driver portal cargo error:");
    }
  }),
);

protectedRouter.patch(
  "/me/availability",
  withDriverPortalScope(async (req, res) => {
    try {
      const scope = req.driverPortalScope;
      const body = zodParse(availabilitySchema.safeParse(req.body));
      // Defense-in-depth: never let the driver self-flip off `on_trip`
      // (that's a mechanical state set by trip-complete) or off
      // `suspended` (operator-only). The DB-level check would catch it
      // but a clearer error here helps the SPA show the right message.
      const [current] = await rawQuery<{ status: string }>(
        `SELECT status FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [scope.driverId, scope.companyId],
      );
      if (!current) throw new NotFoundError("السائق غير موجود");
      if (current.status === "on_trip") {
        throw new ForbiddenError("لا يمكن تغيير الحالة أثناء وجود رحلة جارية");
      }
      if (current.status === "suspended") {
        throw new ForbiddenError("الحساب موقوف، التواصل مع الإدارة");
      }
      await rawExecute(
        `UPDATE fleet_drivers SET status = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3`,
        [body.status, scope.driverId, scope.companyId],
      );
      createAuditLog({
        companyId: scope.companyId, userId: 0,
        action: "update", entity: "fleet_drivers", entityId: scope.driverId,
        before: { status: current.status }, after: { status: body.status, source: "driver_portal" },
      }).catch((e) => logger.error(e, "driverPortal background task failed"));
      emitEvent({
        companyId: scope.companyId, branchId: 0, userId: 0,
        action: "fleet.driver.availability_changed", entity: "fleet_drivers", entityId: scope.driverId,
        details: JSON.stringify({ from: current.status, to: body.status, source: "driver_portal" }),
      }).catch((e) => logger.error(e, "driverPortal background task failed"));
      res.json({ data: { status: body.status } });
    } catch (err) {
      handleRouteError(err, res, "Driver portal availability error:");
    }
  }),
);

protectedRouter.post(
  "/auth/change-password",
  withDriverPortalScope(async (req, res) => {
    try {
      const scope = req.driverPortalScope;
      const body = zodParse(changePasswordSchema.safeParse(req.body));
      const [account] = await rawQuery<{ passwordHash: string; tokenVersion: number }>(
        `SELECT "passwordHash", "tokenVersion" FROM driver_portal_accounts WHERE id = $1`,
        [scope.accountId],
      );
      if (!account) throw new NotFoundError("الحساب غير موجود");
      const valid = await verifyPassword(body.currentPassword, account.passwordHash);
      if (!valid) throw new ValidationError("كلمة المرور الحالية غير صحيحة");
      const newHash = await hashPassword(body.newPassword);
      // Bump tokenVersion to invalidate any other active sessions.
      await rawExecute(
        `UPDATE driver_portal_accounts
            SET "passwordHash" = $1,
                "mustChangePassword" = false,
                "tokenVersion" = "tokenVersion" + 1,
                "updatedAt" = NOW()
          WHERE id = $2`,
        [newHash, scope.accountId],
      );
      createAuditLog({
        companyId: scope.companyId, userId: 0,
        action: "update", entity: "driver_portal_accounts", entityId: scope.accountId,
        after: { passwordChanged: true },
      }).catch((e) => logger.error(e, "driverPortal background task failed"));
      res.json({ data: { ok: true } });
    } catch (err) {
      handleRouteError(err, res, "Driver portal change-password error:");
    }
  }),
);

router.use("/", protectedRouter);

export { portalAuthMiddleware as driverPortalAuthMiddleware };
export default router;
