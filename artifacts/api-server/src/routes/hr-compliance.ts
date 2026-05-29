// ============================================================================
// hr-compliance.ts
// مسارات الامتثال السعودي — السعودة (نطاقات) + ملخصات الإقامات والوثائق
// Base path: /hr
// ============================================================================
//
// المكتبة في lib/saudi-compliance:
//   - nitaqat.ts                  → classifyNitaqat (نطاقات: بلاتيني/أخضر/أصفر/أحمر)
//   - saudization-snapshot.ts     → computeSnapshot + runSaudizationSnapshot
//
// الـcron الشهري (cronScheduler) يكتب إلى saudization_snapshots شهريًا.
// هذا الملف يكشف الجدول للقراءة + يوفّر "تحديث الآن" للشركة الواحدة.

import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent, currentPeriod, todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { computeSnapshot, classifyNitaqat } from "../lib/saudi-compliance/index.js";

const router = Router();

interface SaudizationRow {
  period: string;
  totalEmployees: number;
  saudiEmployees: number;
  nonSaudiEmployees: number;
  saudizationPercent: number | string;
  category: string;
  sector: string | null;
  computedAt: string;
}

const refreshSchema = z.object({
  sector: z.enum(["default", "construction", "retail", "manufacturing", "services"]).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/saudization/current — لقطة السعودة للفترة الحالية (live + المخزّن)
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/saudization/current",
  authorize({ feature: "hr.saudization", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const period = (req.query.period as string | undefined) || currentPeriod();
      const sector = (req.query.sector as
        | "default"
        | "construction"
        | "retail"
        | "manufacturing"
        | "services"
        | undefined) || "default";

      if (!/^\d{4}-\d{2}$/.test(period)) {
        throw new ValidationError("صيغة الفترة غير صحيحة (YYYY-MM)", { field: "period" });
      }

      // 1. Live count from current employee state — what the user sees right now.
      const employees = await rawQuery<{ nationality: string | null }>(
        `SELECT nationality FROM employees
          WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId],
      );
      const live = computeSnapshot(scope.companyId, period, employees);
      const liveClassified = classifyNitaqat({
        saudiEmployees: live.saudiEmployees,
        totalEmployees: live.totalEmployees,
        sector,
      });

      // 2. Stored snapshot (the cron writes this monthly) — what the
      //    ministry "saw" at month end. Lets the UI surface drift
      //    between today's headcount and the official record.
      const [stored] = await rawQuery<SaudizationRow>(
        `SELECT period, "totalEmployees", "saudiEmployees", "nonSaudiEmployees",
                "saudizationPercent", category, sector, "computedAt"
           FROM saudization_snapshots
          WHERE "companyId" = $1 AND period = $2`,
        [scope.companyId, period],
      );

      res.json({
        period,
        sector,
        live: {
          totalEmployees: live.totalEmployees,
          saudiEmployees: live.saudiEmployees,
          nonSaudiEmployees: live.nonSaudiEmployees,
          saudizationPercent: liveClassified.saudizationPercent,
          category: liveClassified.category,
          exempt: liveClassified.exempt,
        },
        stored: stored ?? null,
      });
    } catch (err) {
      handleRouteError(err, res, "Get current saudization error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/saudization/history — آخر 12 شهر من اللقطات المخزّنة
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/saudization/history",
  authorize({ feature: "hr.saudization", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const limit = Math.min(36, Math.max(1, Number(req.query.limit) || 12));

      const rows = await rawQuery<SaudizationRow>(
        `SELECT period, "totalEmployees", "saudiEmployees", "nonSaudiEmployees",
                "saudizationPercent", category, sector, "computedAt"
           FROM saudization_snapshots
          WHERE "companyId" = $1
          ORDER BY period DESC
          LIMIT $2`,
        [scope.companyId, limit],
      );

      res.json({ data: rows.reverse(), total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "Get saudization history error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/saudization/refresh — حساب لقطة شهر فوري وحفظها (override للـcron)
// ═══════════════════════════════════════════════════════════════════════════════
router.post(
  "/saudization/refresh",
  authorize({ feature: "hr.saudization", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(refreshSchema.safeParse(req.body ?? {}));
      const period = currentPeriod();
      const sector = body.sector ?? "default";

      const employees = await rawQuery<{ nationality: string | null }>(
        `SELECT nationality FROM employees
          WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId],
      );
      const snapshot = computeSnapshot(scope.companyId, period, employees);
      const classified = classifyNitaqat({
        saudiEmployees: snapshot.saudiEmployees,
        totalEmployees: snapshot.totalEmployees,
        sector,
      });

      await rawExecute(
        `INSERT INTO saudization_snapshots (
           "companyId", period, "totalEmployees", "saudiEmployees", "nonSaudiEmployees",
           "saudizationPercent", category, sector, "computedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT ("companyId", period) DO UPDATE
           SET "totalEmployees"     = EXCLUDED."totalEmployees",
               "saudiEmployees"     = EXCLUDED."saudiEmployees",
               "nonSaudiEmployees"  = EXCLUDED."nonSaudiEmployees",
               "saudizationPercent" = EXCLUDED."saudizationPercent",
               category             = EXCLUDED.category,
               sector               = EXCLUDED.sector,
               "computedAt"         = NOW()`,
        [
          scope.companyId,
          period,
          snapshot.totalEmployees,
          snapshot.saudiEmployees,
          snapshot.nonSaudiEmployees,
          classified.saudizationPercent,
          classified.category,
          sector,
        ],
      );

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "update",
        entity: "saudization_snapshots",
        entityId: 0,
        after: {
          period,
          sector,
          totalEmployees: snapshot.totalEmployees,
          saudiEmployees: snapshot.saudiEmployees,
          saudizationPercent: classified.saudizationPercent,
          category: classified.category,
        },
      }).catch((e) => logger.error(e, "saudization audit failed"));

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "saudization.snapshot_refreshed",
        entity: "saudization_snapshots",
        entityId: 0,
        details: JSON.stringify({
          period,
          sector,
          totalEmployees: snapshot.totalEmployees,
          saudiEmployees: snapshot.saudiEmployees,
          saudizationPercent: classified.saudizationPercent,
          category: classified.category,
        }),
      }).catch((e) => logger.error(e, "saudization event failed"));

      res.json({
        period,
        sector,
        totalEmployees: snapshot.totalEmployees,
        saudiEmployees: snapshot.saudiEmployees,
        nonSaudiEmployees: snapshot.nonSaudiEmployees,
        saudizationPercent: classified.saudizationPercent,
        category: classified.category,
        exempt: classified.exempt,
        computedAt: todayISO(),
      });
    } catch (err) {
      handleRouteError(err, res, "Refresh saudization error:");
    }
  },
);

export default router;
