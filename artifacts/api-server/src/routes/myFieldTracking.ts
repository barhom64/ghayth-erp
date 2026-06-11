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

const router = Router();

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
        throw new ForbiddenError("فئة الموظف لا تخضع للتتبع اللحظي", {
          fix: "التتبع الميداني مفعّل فقط للسائقين والموظفين الميدانيين. راجع فئة الموظف في إعدادات الحضور.",
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
        return;
    }
  } catch (err) {
    handleRouteError(err, res, "Field ping (self-service) error:");
  }
});

export default router;
