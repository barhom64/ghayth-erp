// routes/numbering.ts — admin surface for the central numbering center.
//
// Issue #1141. All endpoints sit under `/numbering` (mounted in
// routes/index.ts behind the `settings` module + authMiddleware).
//
// The Numbering Service does the actual allocation work — this router
// only exposes the management surface: list / edit policies, preview
// the next number, view & search the assignments log, override / void
// individual numbers, reset & lock counters, and stream the audit log.

import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { rawQuery } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  getScheme,
  previewNextNumber,
  overrideNumber,
  voidNumber,
  resetCounter,
  lockCounter,
  unlockCounter,
  invalidateBranchCodeCache,
} from "../lib/numberingService.js";
import {
  backfillScheme,
  backfillAllSchemes,
  previewBackfill,
} from "../lib/numberingBackfill.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { checkAccess } from "../lib/rbac/authzEngine.js";

const router = Router();
router.use(authMiddleware);

// ─── Schemes (policies) ──────────────────────────────────────────────

const upsertSchemeSchema = z.object({
  displayNameAr: z.string().trim().min(1).optional(),
  displayNameEn: z.string().trim().nullable().optional(),
  prefix: z.string().trim().min(1).max(20).optional(),
  pattern: z.string().trim().min(1).max(200).optional(),
  padLength: z.coerce.number().int().min(3).max(10).optional(),
  resetPolicy: z.enum(["never", "yearly", "monthly", "seasonal", "fiscal_year"]).optional(),
  scopePolicy: z.enum(["company", "branch", "module", "entity", "season", "fiscal_year"]).optional(),
  issueTiming: z.enum(["on_draft", "on_submit", "on_approval", "on_posting"]).optional(),
  manualEditPolicy: z.enum(["disabled", "draft_only", "privileged", "legacy_import_only"]).optional(),
  requiresReasonOnManualEdit: z.boolean().optional(),
  lockAfterStatuses: z.array(z.string().trim().min(1)).optional(),
  branchPrefixOverrides: z.record(z.string(), z.string().trim().min(1).max(20)).optional(),
  isActive: z.boolean().optional(),
});

router.get(
  "/schemes",
  authorize({ feature: "settings.numbering", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      // Pre-aggregate numbering_assignments counts via CTE instead
      // of running a scalar subquery per row. Original was N+1: one
      // execution per returned scheme, so a company with N schemes
      // fired N+1 lookups through numbering_assignments. The CTE
      // scans the join table once.
      const rows = await rawQuery<Record<string, unknown>>(
        `WITH assignment_counts AS (
           SELECT "schemeId", COUNT(*) AS "assignmentCount"
           FROM numbering_assignments
           GROUP BY "schemeId"
         )
         SELECT s.id, s."moduleKey", s."entityKey", s."displayNameAr", s."displayNameEn",
                s.prefix, s.pattern, s."padLength", s."resetPolicy", s."scopePolicy",
                s."issueTiming", s."manualEditPolicy", s."requiresReasonOnManualEdit",
                s."lockAfterStatuses", s."branchPrefixOverrides", s."isActive",
                s."defaultEntityTable", s."defaultRefColumn",
                s."lastBackfillAt", s."lastBackfillCount",
                s."createdAt", s."updatedAt",
                COALESCE(ac."assignmentCount", 0)::int AS "assignmentCount"
           FROM numbering_schemes s
           LEFT JOIN assignment_counts ac ON ac."schemeId" = s.id
          WHERE s."companyId" = $1
          ORDER BY s."moduleKey", s."entityKey"`,
        [scope.companyId],
      );
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "خطأ في جلب سياسات الترقيم");
    }
  },
);

router.get(
  "/schemes/:id",
  authorize({ feature: "settings.numbering", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM numbering_schemes WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("سياسة الترقيم غير موجودة");

      // Also return the counters under this scheme + a peek at the next number.
      const counters = await rawQuery<Record<string, unknown>>(
        `SELECT id, "branchId", "fiscalYear", period, "seasonId",
                "lastNumber"::text AS "lastNumber",
                "nextNumber"::text AS "nextNumber",
                "lockedAt", "createdAt", "updatedAt"
           FROM numbering_counters
          WHERE "schemeId" = $1 AND "companyId" = $2
          ORDER BY "branchId" NULLS FIRST, "fiscalYear" DESC NULLS LAST, period DESC NULLS LAST`,
        [id, scope.companyId],
      );
      res.json({ data: row, counters });
    } catch (err) {
      handleRouteError(err, res, "خطأ في جلب سياسة الترقيم");
    }
  },
);

router.patch(
  "/schemes/:id",
  authorize({ feature: "settings.numbering", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(upsertSchemeSchema.safeParse(req.body ?? {}));

      const [existing] = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM numbering_schemes WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("سياسة الترقيم غير موجودة");

      const sets: string[] = [];
      const params: unknown[] = [];
      const fields: (keyof typeof body)[] = [
        "displayNameAr", "displayNameEn", "prefix", "pattern", "padLength",
        "resetPolicy", "scopePolicy", "issueTiming", "manualEditPolicy",
        "requiresReasonOnManualEdit", "isActive",
      ];
      for (const f of fields) {
        if (body[f] !== undefined) {
          params.push(body[f]);
          sets.push(`"${f}" = $${params.length}`);
        }
      }
      if (body.lockAfterStatuses !== undefined) {
        params.push(JSON.stringify(body.lockAfterStatuses));
        sets.push(`"lockAfterStatuses" = $${params.length}::jsonb`);
      }
      if (body.branchPrefixOverrides !== undefined) {
        params.push(JSON.stringify(body.branchPrefixOverrides));
        sets.push(`"branchPrefixOverrides" = $${params.length}::jsonb`);
      }
      if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتعديل");
      sets.push(`"updatedAt" = NOW()`);
      params.push(id, scope.companyId);

      const [updated] = await rawQuery<Record<string, unknown>>(
        `UPDATE numbering_schemes SET ${sets.join(", ")}
          WHERE id = $${params.length - 1} AND "companyId" = $${params.length}
          RETURNING *`,
        params,
      );

      // Audit + clear cached branch codes (the operator may have just
      // renamed/overridden branch codes via `branchPrefixOverrides`).
      invalidateBranchCodeCache();
      await rawQuery(
        `INSERT INTO numbering_audit_logs (
           "companyId","branchId","actorId",action,"schemeId","before","after",reason
         ) VALUES ($1,$2,$3,'update_scheme',$4,$5,$6,$7)`,
        [
          scope.companyId, scope.branchId ?? null, scope.userId, id,
          JSON.stringify(existing), JSON.stringify(updated), req.body?.reason ?? null,
        ],
      );
      await createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "numbering_scheme_updated", entity: "numbering_schemes", entityId: id,
        before: existing, after: updated,
      });
      await emitEvent({
        companyId: scope.companyId,
        userId: scope.userId ?? null,
        action: "numbering.scheme.updated",
        entity: "numbering_schemes",
        entityId: id,
      });
      res.json(updated);
    } catch (err) {
      handleRouteError(err, res, "خطأ في تعديل سياسة الترقيم");
    }
  },
);

// ─── Preview next number ─────────────────────────────────────────────

router.get(
  "/preview",
  authorize({ feature: "settings.numbering", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const moduleKey = String(req.query.moduleKey || "");
      const entityKey = String(req.query.entityKey || "");
      const branchId = req.query.branchId ? Number(req.query.branchId) : (scope.branchId ?? null);
      const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      if (!moduleKey || !entityKey) {
        throw new ValidationError("يجب تمرير moduleKey و entityKey");
      }
      const preview = await previewNextNumber({
        companyId: scope.companyId,
        branchId,
        moduleKey, entityKey,
        fiscalYear,
        seasonId,
      });
      if (!preview) {
        throw new NotFoundError(`لا توجد سياسة ترقيم نشطة لـ ${moduleKey}.${entityKey}`);
      }
      res.json(preview);
    } catch (err) {
      handleRouteError(err, res, "خطأ في معاينة الرقم القادم");
    }
  },
);

// ─── Assignments (number history / search) ──────────────────────────

router.get(
  "/assignments",
  authorize({ feature: "settings.numbering", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const params: unknown[] = [scope.companyId];
      let where = `a."companyId" = $1`;

      if (req.query.moduleKey) { params.push(String(req.query.moduleKey)); where += ` AND a."moduleKey" = $${params.length}`; }
      if (req.query.entityKey) { params.push(String(req.query.entityKey)); where += ` AND a."entityKey" = $${params.length}`; }
      if (req.query.branchId) { params.push(Number(req.query.branchId)); where += ` AND a."branchId" = $${params.length}`; }
      if (req.query.status) { params.push(String(req.query.status)); where += ` AND a.status = $${params.length}`; }
      if (req.query.q) {
        params.push(`%${String(req.query.q).trim()}%`);
        where += ` AND (a.number ILIKE $${params.length} OR a."entityTable" ILIKE $${params.length})`;
      }
      const limit = Math.min(Number(req.query.limit) || 100, 500);

      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT a.id, a.number, a."moduleKey", a."entityKey", a."entityTable", a."entityId",
                a."branchId", a."schemeId", a."counterId", a."sequenceValue",
                a.status, a."issuedBy", a."issuedAt", a."assignedAt", a."voidReason",
                s."displayNameAr" AS "schemeName"
           FROM numbering_assignments a
           LEFT JOIN numbering_schemes s ON s.id = a."schemeId"
          WHERE ${where}
          ORDER BY a.id DESC
          LIMIT ${limit}`,
        params,
      );
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "خطأ في جلب سجل الأرقام");
    }
  },
);

// ─── Override a single assignment number ────────────────────────────

const overrideSchema = z.object({
  newNumber: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(500),
  isDraft: z.boolean().optional(),
});

router.post(
  "/assignments/:id/override",
  authorize({ feature: "settings.numbering.override", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(overrideSchema.safeParse(req.body ?? {}));
      const isPrivileged = (await checkAccess(scope, {
        feature: "settings.numbering.override",
        action: "update",
      })).allowed;
      await overrideNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        assignmentId: id,
        newNumber: body.newNumber,
        actorId: scope.userId,
        reason: body.reason,
        isPrivileged,
        isDraft: body.isDraft ?? false,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "خطأ في تعديل الرقم");
    }
  },
);

// ─── Void an assignment ─────────────────────────────────────────────

const voidSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

router.post(
  "/assignments/:id/void",
  authorize({ feature: "settings.numbering.override", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(voidSchema.safeParse(req.body ?? {}));
      await voidNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        assignmentId: id,
        actorId: scope.userId,
        reason: body.reason,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "خطأ في إلغاء الرقم");
    }
  },
);

// ─── Counter ops (reset / lock / unlock) ────────────────────────────

const resetCounterSchema = z.object({
  newValue: z.coerce.number().int().min(0).max(9_999_999),
  reason: z.string().trim().min(3).max(500),
  force: z.boolean().optional(),
});

router.post(
  "/counters/:id/reset",
  authorize({ feature: "settings.numbering.reset", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(resetCounterSchema.safeParse(req.body ?? {}));
      await resetCounter({
        companyId: scope.companyId,
        counterId: id,
        newValue: body.newValue,
        reason: body.reason,
        actorId: scope.userId,
        force: body.force,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "خطأ في تصفير العداد");
    }
  },
);

const counterReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

router.post(
  "/counters/:id/lock",
  authorize({ feature: "settings.numbering", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(counterReasonSchema.safeParse(req.body ?? {}));
      await lockCounter({
        companyId: scope.companyId, counterId: id,
        actorId: scope.userId, reason: body.reason,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "خطأ في قفل العداد");
    }
  },
);

router.post(
  "/counters/:id/unlock",
  authorize({ feature: "settings.numbering", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(counterReasonSchema.safeParse(req.body ?? {}));
      await unlockCounter({
        companyId: scope.companyId, counterId: id,
        actorId: scope.userId, reason: body.reason,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "خطأ في فتح العداد");
    }
  },
);

// ─── Audit log ──────────────────────────────────────────────────────

router.get(
  "/audit",
  authorize({ feature: "settings.numbering.audit", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const params: unknown[] = [scope.companyId];
      let where = `l."companyId" = $1`;
      if (req.query.action) { params.push(String(req.query.action)); where += ` AND l.action = $${params.length}`; }
      if (req.query.schemeId) { params.push(Number(req.query.schemeId)); where += ` AND l."schemeId" = $${params.length}`; }
      if (req.query.assignmentId) { params.push(Number(req.query.assignmentId)); where += ` AND l."assignmentId" = $${params.length}`; }
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT l.*, COALESCE(e.name, u.email) AS "actorName",
                s."displayNameAr" AS "schemeName"
           FROM numbering_audit_logs l
           LEFT JOIN users u ON u.id = l."actorId"
           LEFT JOIN employees e ON e.id = u."employeeId"
           LEFT JOIN numbering_schemes s ON s.id = l."schemeId"
          WHERE ${where}
          ORDER BY l.id DESC
          LIMIT ${limit}`,
        params,
      );
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "خطأ في جلب سجل التدقيق");
    }
  },
);

// Smoke endpoint used by the smoke test + admin "Is numbering live?" UI tile.
router.get(
  "/health",
  authorize({ feature: "settings.numbering", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const [{ schemes }] = await rawQuery<{ schemes: string }>(
        `SELECT COUNT(*)::text AS schemes FROM numbering_schemes WHERE "companyId" = $1`,
        [scope.companyId],
      );
      const [{ counters }] = await rawQuery<{ counters: string }>(
        `SELECT COUNT(*)::text AS counters FROM numbering_counters WHERE "companyId" = $1`,
        [scope.companyId],
      );
      const [{ assignments }] = await rawQuery<{ assignments: string }>(
        `SELECT COUNT(*)::text AS assignments FROM numbering_assignments WHERE "companyId" = $1`,
        [scope.companyId],
      );
      res.json({
        ok: true,
        schemes: Number(schemes),
        counters: Number(counters),
        assignments: Number(assignments),
      });
    } catch (err) {
      handleRouteError(err, res, "خطأ في فحص حالة الترقيم");
    }
  },
);

// ─── Backfill — inventory legacy refs (Issue #1141 phase 5) ─────────
//
// One-time admin tool that scans an entity table for refs that
// existed before the unified numbering center was introduced and
// inserts a `numbering_assignments` row for each so they appear in
// the search, the audit log, and the printed reports.

router.get(
  "/schemes/:id/backfill/preview",
  authorize({ feature: "settings.numbering", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const preview = await previewBackfill({
        companyId: scope.companyId,
        schemeId: id,
      });
      res.json(preview);
    } catch (err) {
      handleRouteError(err, res, "خطأ في معاينة الجرد");
    }
  },
);

router.post(
  "/schemes/:id/backfill",
  authorize({ feature: "settings.numbering.reset", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const summary = await backfillScheme({
        companyId: scope.companyId,
        schemeId: id,
        actorId: scope.userId,
      });
      res.json(summary);
    } catch (err) {
      handleRouteError(err, res, "خطأ في جرد المعاملات السابقة");
    }
  },
);

router.post(
  "/backfill-all",
  authorize({ feature: "settings.numbering.reset", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const summaries = await backfillAllSchemes({
        companyId: scope.companyId,
        actorId: scope.userId,
      });
      const totalImported = summaries.reduce((s, x) => s + x.imported, 0);
      res.json({
        ok: true,
        totalImported,
        schemes: summaries,
      });
    } catch (err) {
      handleRouteError(err, res, "خطأ في الجرد الشامل");
    }
  },
);

// Helper for downstream routes: load a scheme by (module, entity). Not
// scoped to companyId — admins inspecting policies do that via /schemes.
router.get(
  "/scheme-lookup",
  authorize({ feature: "settings.numbering", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const moduleKey = String(req.query.moduleKey || "");
      const entityKey = String(req.query.entityKey || "");
      if (!moduleKey || !entityKey) throw new ValidationError("يجب تمرير moduleKey و entityKey");
      const scheme = await getScheme(scope.companyId, moduleKey, entityKey);
      if (!scheme) throw new NotFoundError("سياسة الترقيم غير معرفة");
      res.json(scheme);
    } catch (err) {
      handleRouteError(err, res, "خطأ في البحث عن سياسة الترقيم");
    }
  },
);

export default router;
