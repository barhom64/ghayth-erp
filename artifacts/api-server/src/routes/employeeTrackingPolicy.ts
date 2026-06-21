/**
 * employeeTrackingPolicy — the Tracking Eligibility Contract control plane.
 *
 * Mounted under /hr (requireModule("hr")). Manages explicit, per-employee
 * GPS-tracking policies and the AUDITED location-view endpoint. Eligibility
 * to be tracked NEVER derives from role=driver or attendance categoryKey —
 * it derives ONLY from an active row here.
 *
 * Authorization layers (defence in depth, all server-side — a direct URL
 * can NOT bypass any of them):
 *   1. requireModule("hr") mount gate.
 *   2. authorize() feature permission:
 *        • hr.attendance.tracking_manage → create/update/disable/list policies
 *        • hr.attendance.tracking_view   → view an employee's location
 *   3. Per-target gates inside the location handler: company ownership,
 *      an ACTIVE policy, and (if set) the policy's allowedViewerRoles.
 *   4. EVERY location view writes an audit row (action `tracking.view`).
 */
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import {
  handleRouteError,
  parseId,
  zodParse,
  NotFoundError,
  ForbiddenError,
} from "../lib/errorHandler.js";
import { getActiveTrackingPolicy } from "../lib/fieldTrackingService.js";
import { z } from "zod";

const router = Router();

const TRACKING_MODES = ["work_hours", "task", "trip", "live", "checkin_only"] as const;

const createPolicySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  trackingMode: z.enum(TRACKING_MODES).default("work_hours"),
  trackingEnabled: z.coerce.boolean().optional().default(true),
  reason: z.string().max(2000).optional(),
  approvedBy: z.coerce.number().int().positive().optional(),
  allowedViewerRoles: z.array(z.string().max(60)).optional().default([]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

const updatePolicySchema = z
  .object({
    trackingMode: z.enum(TRACKING_MODES).optional(),
    trackingEnabled: z.coerce.boolean().optional(),
    reason: z.string().max(2000).nullable().optional(),
    approvedBy: z.coerce.number().int().positive().nullable().optional(),
    allowedViewerRoles: z.array(z.string().max(60)).optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    branchId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "لا توجد حقول للتحديث" });

/** Confirm the employee is a member of the caller's company (tenant gate). */
async function assertCompanyMember(companyId: number, employeeId: number): Promise<void> {
  const [m] = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 LIMIT 1`,
    [employeeId, companyId],
  );
  if (!m) throw new NotFoundError("الموظف غير موجود في هذه الشركة");
}

const POLICY_COLS = `id, "companyId", "branchId", "employeeId", "trackingEnabled",
  "trackingMode", reason, "approvedBy", "allowedViewerRoles",
  "startsAt", "endsAt", "createdBy", "createdAt", "updatedAt"`;

// ── List active (non-deleted) policies for the company ──────────────────────
router.get(
  "/attendance/tracking-policies",
  authorize({ feature: "hr.attendance.tracking_manage", action: "list" }),
  async (req, res) => {
    try {
      const scope = (req as any).scope;
      const employeeId = req.query.employeeId ? parseId(req.query.employeeId as string, "employeeId") : null;
      const rows = await rawQuery(
        `SELECT ${POLICY_COLS}
           FROM employee_tracking_policies
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
            AND ($2::int IS NULL OR "employeeId" = $2)
          ORDER BY id DESC`,
        [scope.companyId, employeeId],
      );
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "List tracking policies error:");
    }
  },
);

// ── Detail ──────────────────────────────────────────────────────────────────
router.get(
  "/attendance/tracking-policies/:id",
  authorize({ feature: "hr.attendance.tracking_manage", action: "view" }),
  async (req, res) => {
    try {
      const scope = (req as any).scope;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery(
        `SELECT ${POLICY_COLS} FROM employee_tracking_policies
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("سياسة التتبع غير موجودة");
      res.json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Get tracking policy error:");
    }
  },
);

// ── Create / enable (upsert the single active policy per employee) ───────────
router.post(
  "/attendance/tracking-policies",
  authorize({ feature: "hr.attendance.tracking_manage", action: "create" }),
  async (req, res) => {
    try {
      const scope = (req as any).scope;
      const b = zodParse(createPolicySchema.safeParse(req.body));
      await assertCompanyMember(scope.companyId, b.employeeId);

      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM employee_tracking_policies
          WHERE "companyId" = $1 AND "employeeId" = $2 AND "deletedAt" IS NULL`,
        [scope.companyId, b.employeeId],
      );

      let row: any;
      if (existing) {
        [row] = await rawQuery(
          `UPDATE employee_tracking_policies SET
             "trackingEnabled" = $3, "trackingMode" = $4, reason = $5,
             "approvedBy" = $6, "allowedViewerRoles" = $7::jsonb,
             "startsAt" = $8, "endsAt" = $9, "branchId" = $10, "updatedAt" = NOW()
           WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
           RETURNING ${POLICY_COLS}`,
          [
            existing.id, scope.companyId, b.trackingEnabled, b.trackingMode,
            b.reason ?? null, b.approvedBy ?? null, JSON.stringify(b.allowedViewerRoles ?? []),
            b.startsAt ?? null, b.endsAt ?? null, b.branchId ?? scope.branchId ?? null,
          ],
        );
      } else {
        [row] = await rawQuery(
          `INSERT INTO employee_tracking_policies
             ("companyId","branchId","employeeId","trackingEnabled","trackingMode",
              reason,"approvedBy","allowedViewerRoles","startsAt","endsAt","createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
           RETURNING ${POLICY_COLS}`,
          [
            scope.companyId, b.branchId ?? scope.branchId ?? null, b.employeeId,
            b.trackingEnabled, b.trackingMode, b.reason ?? null, b.approvedBy ?? null,
            JSON.stringify(b.allowedViewerRoles ?? []), b.startsAt ?? null, b.endsAt ?? null,
            scope.userId,
          ],
        );
      }

      await auditFromRequest(req, "tracking_policy.enable", "employee_tracking_policy", row.id, {
        after: row,
        reason: b.reason ?? undefined,
      });
      void emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "tracking_policy.enable", entity: "employee_tracking_policy", entityId: row.id,
        details: JSON.stringify({ employeeId: b.employeeId, trackingMode: row.trackingMode, trackingEnabled: row.trackingEnabled, upsert: existing ? "update" : "create" }),
      }).catch((e) => logger.error(e, "tracking policy event failed"));
      res.status(existing ? 200 : 201).json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Create tracking policy error:");
    }
  },
);

// ── Update ──────────────────────────────────────────────────────────────────
router.patch(
  "/attendance/tracking-policies/:id",
  authorize({ feature: "hr.attendance.tracking_manage", action: "update" }),
  async (req, res) => {
    try {
      const scope = (req as any).scope;
      const id = parseId(req.params.id, "id");
      const b = zodParse(updatePolicySchema.safeParse(req.body));

      const [before] = await rawQuery(
        `SELECT ${POLICY_COLS} FROM employee_tracking_policies
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!before) throw new NotFoundError("سياسة التتبع غير موجودة");

      const sets: string[] = [];
      const vals: unknown[] = [id, scope.companyId];
      let n = 3;
      const push = (col: string, val: unknown) => { sets.push(`"${col}" = $${n++}`); vals.push(val); };
      if (b.trackingMode !== undefined) push("trackingMode", b.trackingMode);
      if (b.trackingEnabled !== undefined) push("trackingEnabled", b.trackingEnabled);
      if (b.reason !== undefined) push("reason", b.reason);
      if (b.approvedBy !== undefined) push("approvedBy", b.approvedBy);
      if (b.allowedViewerRoles !== undefined) { sets.push(`"allowedViewerRoles" = $${n++}::jsonb`); vals.push(JSON.stringify(b.allowedViewerRoles)); }
      if (b.startsAt !== undefined) push("startsAt", b.startsAt);
      if (b.endsAt !== undefined) push("endsAt", b.endsAt);
      if (b.branchId !== undefined) push("branchId", b.branchId);

      const [row] = await rawQuery(
        `UPDATE employee_tracking_policies SET ${sets.join(", ")}, "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          RETURNING ${POLICY_COLS}`,
        vals,
      );
      await auditFromRequest(req, "tracking_policy.update", "employee_tracking_policy", id, {
        before, after: row, reason: b.reason ?? undefined,
      });
      void emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "tracking_policy.update", entity: "employee_tracking_policy", entityId: id,
        details: JSON.stringify({ employeeId: (before as any).employeeId, changed: Object.keys(b), trackingEnabled: (row as any).trackingEnabled }),
      }).catch((e) => logger.error(e, "tracking policy event failed"));
      res.json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Update tracking policy error:");
    }
  },
);

// ── Disable (immediate stop) ────────────────────────────────────────────────
router.post(
  "/attendance/tracking-policies/:id/disable",
  authorize({ feature: "hr.attendance.tracking_manage", action: "update" }),
  async (req, res) => {
    try {
      const scope = (req as any).scope;
      const id = parseId(req.params.id, "id");
      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;

      const [before] = await rawQuery(
        `SELECT ${POLICY_COLS} FROM employee_tracking_policies
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!before) throw new NotFoundError("سياسة التتبع غير موجودة");

      const [row] = await rawQuery(
        `UPDATE employee_tracking_policies
            SET "trackingEnabled" = FALSE, "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          RETURNING ${POLICY_COLS}`,
        [id, scope.companyId],
      );
      await auditFromRequest(req, "tracking_policy.disable", "employee_tracking_policy", id, {
        before, after: row, reason,
      });
      void emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "tracking_policy.disable", entity: "employee_tracking_policy", entityId: id,
        details: JSON.stringify({ employeeId: (before as any).employeeId, reason: reason ?? null }),
      }).catch((e) => logger.error(e, "tracking policy event failed"));
      res.json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Disable tracking policy error:");
    }
  },
);

// ── AUDITED location view ────────────────────────────────────────────────────
// Requires tracking_view perm + company ownership + an ACTIVE policy +
// (if the policy restricts viewers) the caller's active role in
// allowedViewerRoles. EVERY successful view writes a `tracking.view` audit.
router.get(
  "/attendance/tracking-policies/:employeeId/location",
  authorize({ feature: "hr.attendance.tracking_view", action: "view" }),
  async (req, res) => {
    try {
      const scope = (req as any).scope;
      const employeeId = parseId(req.params.employeeId, "employeeId");

      // Tenant gate — a cross-company id must look identical to "no data",
      // never leak existence.
      await assertCompanyMember(scope.companyId, employeeId);

      const policy = await getActiveTrackingPolicy(scope.companyId, employeeId);
      if (!policy) {
        // No active policy → not viewable. Disabling the policy makes this
        // immediate.
        throw new NotFoundError("لا توجد سياسة تتبع فعّالة لهذا الموظف");
      }

      // Per-policy viewer restriction. The viewer's ACTIVE role (scope.role)
      // is the authority — it is always populated and already reflects any
      // role-picker downgrade, unlike selectedRoleKey which is null when no
      // role was explicitly picked.
      if (policy.allowedViewerRoles.length > 0) {
        const viewerRole = scope.role ?? null;
        if (!viewerRole || !policy.allowedViewerRoles.includes(viewerRole)) {
          throw new ForbiddenError("صفتك الحالية غير مخوّلة لعرض موقع هذا الموظف");
        }
      }

      const points = await rawQuery(
        `SELECT id, lat, lng, accuracy, speed, heading, battery, source,
                "assignmentId", "capturedAt"
           FROM field_tracking_points
          WHERE "companyId" = $1 AND "employeeId" = $2
          ORDER BY "capturedAt" DESC
          LIMIT 500`,
        [scope.companyId, employeeId],
      );

      // EVERY view is audited (await so the record is durable before reply).
      await auditFromRequest(req, "tracking.view", "employee_tracking_policy", employeeId, {
        after: { policyId: policy.id, trackingMode: policy.trackingMode, points: points.length },
        reason: policy.reason ?? undefined,
      });

      res.json({
        data: {
          employeeId,
          trackingMode: policy.trackingMode,
          latest: points[0] ?? null,
          points,
        },
      });
    } catch (err) {
      handleRouteError(err, res, "View tracking location error:");
    }
  },
);

export default router;
