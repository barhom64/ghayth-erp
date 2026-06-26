/**
 * /my/field/* — self-service field-tracking mount (#2077 PR-9).
 *
 * WHY a second mount: the canonical /hr/attendance/field-ping lives
 * behind `requireModule("hr")` in routes/index.ts — and plain
 * employees (the actual field workers + drivers) do NOT carry the hr
 * module, so they 403'd before authorize() ever ran. The feature
 * `hr.attendance.checkin` is selfService:true in the catalog (every
 * employee may check THEMSELVES in), so the right shape is a
 * self-service mount like /my-space: authMiddleware + per-route
 * authorize, NO module gate.
 *
 * The logic is the SHARED lib/fieldTrackingService.ts — zero
 * duplication with the hr.ts wrappers. The category policy remains
 * the single authority at both mounts: office/manager/executive get
 * eligible:false + 403 on a forced ping.
 */
import { Router } from "express";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, ForbiddenError, zodParse } from "../lib/errorHandler.js";
import { fieldPingSchema, getFieldEligibility, recordFieldPing } from "../lib/fieldTrackingService.js";
import { auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { signFieldTrackingToken } from "../lib/auth.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const router = Router();

// POST /my/field/tracking-token — issue a capability-scoped, long-lived
// credential for the native background-geolocation plugin. Protected by the
// SAME self-service grant as the ping itself, and only minted for an
// employee the category policy actually tracks (office/manager categories
// get 403, never a token). The returned token may only reach
// /my/field/ping (enforced centrally in authMiddleware) — it never unlocks
// the rest of the API even though it sits on the device for hours.
router.post("/tracking-token", authorize({ feature: "hr.attendance.checkin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Only mint for an employee the category policy actually tracks — the
    // office/manager/executive categories (freq=0) get 403, never a token.
    const elig = await getFieldEligibility(scope);
    if (!elig.eligible || elig.trackingFrequencySeconds <= 0) {
      throw new ForbiddenError("فئة الموظف لا تخضع للتتبع اللحظي", {
        fix: "التتبع الميداني مفعّل فقط للسائقين والموظفين الميدانيين.",
        meta: { categoryKey: elig.categoryKey, trackingFrequencySeconds: elig.trackingFrequencySeconds },
      });
    }
    const ttlHours = config.fieldTrackingTokenTtlHours;
    const token = signFieldTrackingToken(
      { userId: scope.userId, assignmentId: scope.activeAssignmentId, role: scope.role },
      ttlHours,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
    // Audit the credential grant — never the token value, only that one was
    // issued, to whom (assignment), and for how long.
    auditFromRequest(req, "field_tracking.token_issued", "employee_assignments", scope.activeAssignmentId, {
      after: { expiresAt, ttlHours, categoryKey: elig.categoryKey },
    });
    res.json({
      token,
      expiresAt,
      minIntervalSeconds: elig.trackingFrequencySeconds,
      categoryKey: elig.categoryKey,
    });
  } catch (err) {
    handleRouteError(err, res, "Field tracking-token issuance error:");
  }
});

router.get("/eligibility", authorize({ feature: "hr.attendance.checkin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    res.json(await getFieldEligibility(scope));
  } catch (err) {
    handleRouteError(err, res, "Field eligibility (self-service) error:");
  }
});

router.post("/ping", authorize({ feature: "hr.attendance.checkin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(fieldPingSchema.safeParse(req.body));
    const r = await recordFieldPing(scope, b);
    switch (r.kind) {
      case "no_assignment":
        throw new ValidationError("لا يوجد تعيين نشط لتسجيل نقطة التتبع", {
          field: "assignment",
          fix: "يجب أن يكون لديك تعيين نشط في الشركة لإرسال نقاط الموقع.",
        });
      case "forbidden":
        throw new ForbiddenError("لا توجد سياسة تتبع فعّالة لهذا الموظف", {
          fix: "يتطلب التتبع الميداني سياسة تتبع صريحة ومفعّلة لهذا الموظف. تواصل مع المسؤول لتفعيل سياسة التتبع.",
          meta: { categoryKey: r.categoryKey, trackingFrequencySeconds: r.freq },
        });
      case "throttled":
        res.status(202).json({ accepted: false, reason: "throttled", minIntervalSeconds: r.freq });
        return;
      case "duplicate":
        res.status(200).json({ accepted: false, reason: "duplicate", minIntervalSeconds: r.freq });
        return;
      case "accepted":
        res.status(201).json({ accepted: true, id: r.id, minIntervalSeconds: r.freq });
        auditFromRequest(req, "field_tracking.ping", "field_tracking_pings", r.id, {
          after: { lat: b.lat, lng: b.lng, accuracy: b.accuracy },
        });
        emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "field_tracking.ping.accepted", entity: "field_tracking_pings", entityId: r.id, details: JSON.stringify({ lat: b.lat, lng: b.lng }) }).catch((e) => logger.error(e, "field tracking background task failed"));
        return;
    }
  } catch (err) {
    handleRouteError(err, res, "Field ping (self-service) error:");
  }
});

export default router;
