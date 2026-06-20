// ============================================================================
// hr-wps.ts
// مسارات Wage Protection System — توليد ملف الرواتب لتسليمه للبنك،
// تتبع حالة الإرسال، واستلام تأكيد البنك.
// Base path: /hr/wps
// ============================================================================
//
// المكتبة الكاملة موجودة في lib/saudi-compliance/wps:
//   - builder.ts  → buildWpsFile (generic + per-bank adapters)
//   - run.ts      → createWpsRun / buildAndPersist / submitWpsRun / applyAck
//   - parser.ts   → parseAckFile (يقرأ تأكيد البنك)
// هذا الملف يكشفها عبر HTTP فقط — بدون منطق أعمال جديد.
//
// تدفق الاستخدام:
//   1. POST /hr/wps/runs       → ينشئ run جديد من payroll_run معتمد
//   2. GET  /hr/wps/runs/:id/file  → ينزّل الملف لتسليمه للبنك
//   3. POST /hr/wps/runs/:id/submit → يعلّم الـrun كمُرسَل
//   4. POST /hr/wps/runs/:id/ack   → يطبّق تأكيد البنك على السطور

import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import {
  createWpsRun,
  buildAndPersist,
  submitWpsRun,
  applyAck,
  isSaudiIban,
} from "../lib/saudi-compliance/index.js";
import type { WpsPayrollEntry } from "../lib/saudi-compliance/index.js";

const router = Router();

const SUPPORTED_FORMATS = [
  "generic_pipe",
  "ncb",
  "alrajhi",
  "riyad",
  "alinma",
  "albilad",
] as const;

interface PayrollRunRow extends Record<string, unknown> {
  id: number;
  companyId: number;
  branchId: number | null;
  period: string;
  status: string;
  totalNet: string | number;
}

interface PayrollLineForWps {
  employeeId: number;
  employeeName: string;
  iqamaOrId: string | null;
  iban: string | null;
  basic: string | number;
  housingAllowance: string | number;
  transportAllowance: string | number;
  netSalary: string | number;
  gosi: string | number;
  lateDeduction: string | number;
  absenceDeduction: string | number;
  violationDeduction: string | number;
  loanDeduction: string | number;
}

interface WpsRunRow extends Record<string, unknown> {
  id: number;
  companyId: number;
  period: string;
  bankCode: string;
  fileName: string | null;
  status: string;
  totalAmount: string | number;
  recordCount: number;
  submittedAt: string | null;
  submittedBy: number | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WpsLineRow extends Record<string, unknown> {
  id: number;
  wpsRunId: number;
  employeeId: number;
  employeeName: string | null;
  iqamaOrId: string;
  iban: string;
  amount: string | number;
  status: string;
  bankRefNumber: string | null;
  errorMessage: string | null;
}

interface WpsSettingsRow {
  bankCode: string | null;
  bankIban: string | null;
  filenameTemplate: string | null;
  isActive: boolean;
}

const createRunSchema = z.object({
  payrollRunId: z.coerce.number({ message: "مسير الرواتب مطلوب" }),
  bankCode: z.string().min(1, "رمز البنك مطلوب").optional(),
  format: z.enum(SUPPORTED_FORMATS).optional(),
});

const ackSchema = z.object({
  ackText: z.string().min(1, "نص تأكيد البنك مطلوب"),
});

// ─── helpers ───────────────────────────────────────────────────────────────

async function getWpsSettings(companyId: number): Promise<WpsSettingsRow | null> {
  const [row] = await rawQuery<WpsSettingsRow>(
    `SELECT "bankCode", "bankIban", "filenameTemplate", "isActive"
       FROM wps_settings WHERE "companyId" = $1`,
    [companyId],
  );
  return row ?? null;
}

async function getCompanyInfo(companyId: number): Promise<{ vatNumber: string | null; crNumber: string | null }> {
  const [row] = await rawQuery<{ vatNumber: string | null; crNumber: string | null }>(
    `SELECT "vatNumber", "crNumber" FROM companies WHERE id = $1`,
    [companyId],
  );
  return row ?? { vatNumber: null, crNumber: null };
}

function aggregateLineToEntry(line: PayrollLineForWps): WpsPayrollEntry | null {
  // Identifier: prefer iqama (non-Saudis); fall back to nationalId stored elsewhere
  // is left to the route handler (it injects from employees table).
  if (!line.iban || !line.iqamaOrId) return null;
  const housing = Number(line.housingAllowance || 0);
  const transport = Number(line.transportAllowance || 0);
  const otherAllowances = housing + transport; // transport collapses into "other"
  const deductions =
    Number(line.gosi || 0) +
    Number(line.lateDeduction || 0) +
    Number(line.absenceDeduction || 0) +
    Number(line.violationDeduction || 0) +
    Number(line.loanDeduction || 0);
  return {
    employeeId: line.employeeId,
    iqamaOrId: line.iqamaOrId,
    iban: line.iban.replace(/\s+/g, "").toUpperCase(),
    amount: Number(line.netSalary || 0),
    basicSalary: Number(line.basic || 0),
    housingAllowance: housing,
    otherAllowances: otherAllowances - housing, // keep housing separate
    deductions,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/wps/settings — قراءة إعدادات WPS الحالية
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/wps/settings",
  authorize({ feature: "hr.payroll.wps", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const settings = await getWpsSettings(scope.companyId);
      // bankIban is declared sensitive in featureCatalog; pass through
      // maskFields so role-level field policies can hide it from view-only.
      res.json(maskFields(req, settings ?? { bankCode: null, bankIban: null, filenameTemplate: null, isActive: false }));
    } catch (err) {
      handleRouteError(err, res, "Get WPS settings error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/wps/preflight/:payrollRunId — كشف الجاهزية قبل التوليد
// يعيد قائمة الموظفين المؤهلين والذين ينقصهم IBAN/iqama
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/wps/preflight/:payrollRunId",
  authorize({ feature: "hr.payroll.wps", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const payrollRunId = parseId(req.params.payrollRunId, "payrollRunId");

      const [run] = await rawQuery<PayrollRunRow>(
        `SELECT id, "companyId", "branchId", period, status, "totalNet"
           FROM payroll_runs
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [payrollRunId, scope.companyId],
      );
      if (!run) throw new NotFoundError("مسير الرواتب غير موجود");

      const lines = await rawQuery<PayrollLineForWps>(
        `SELECT pl."employeeId",
                COALESCE(e.name, '') AS "employeeName",
                COALESCE(e."iqamaNumber", e."nationalId") AS "iqamaOrId",
                e.iban,
                pl.basic, pl."housingAllowance", pl."transportAllowance",
                pl."netSalary", pl.gosi, pl."lateDeduction",
                pl."absenceDeduction", pl."violationDeduction", pl."loanDeduction"
           FROM payroll_lines pl
           JOIN employee_assignments ea ON ea.id = pl."assignmentId" AND ea."companyId" = $2
           JOIN employees e ON e.id = ea."employeeId"
          WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL`,
        [payrollRunId, scope.companyId],
      );

      const eligible: { employeeId: number; employeeName: string; amount: number }[] = [];
      const missingIban: { employeeId: number; employeeName: string }[] = [];
      const missingId: { employeeId: number; employeeName: string }[] = [];
      const invalidIban: { employeeId: number; employeeName: string; iban: string }[] = [];
      // Separate bucket so the operator can tell "no IBAN" (data entry
      // problem) from "deductions ≥ salary" (HR problem: loans, fines,
      // etc. ate the whole check). Previously these collapsed together
      // into missingIban and operators wasted time chasing the wrong fix.
      const zeroAmount: { employeeId: number; employeeName: string; netSalary: number }[] = [];
      let totalAmount = 0;

      for (const l of lines) {
        const name = l.employeeName || `#${l.employeeId}`;
        if (!l.iqamaOrId) {
          missingId.push({ employeeId: l.employeeId, employeeName: name });
          continue;
        }
        if (!l.iban) {
          missingIban.push({ employeeId: l.employeeId, employeeName: name });
          continue;
        }
        if (!isSaudiIban(l.iban)) {
          invalidIban.push({ employeeId: l.employeeId, employeeName: name, iban: l.iban });
          continue;
        }
        const amount = Number(l.netSalary || 0);
        if (amount <= 0) {
          zeroAmount.push({ employeeId: l.employeeId, employeeName: name, netSalary: amount });
          continue;
        }
        eligible.push({ employeeId: l.employeeId, employeeName: name, amount });
        totalAmount += amount;
      }

      // eligible[].amount is sensitive (declared in featureCatalog) — pass
      // through maskFields so role field-policies can redact it.
      res.json(
        maskFields(req, {
          payrollRunId: run.id,
          period: run.period,
          status: run.status,
          canGenerate: run.status === "approved" || run.status === "paid",
          eligibleCount: eligible.length,
          skippedCount:
            missingIban.length + missingId.length + invalidIban.length + zeroAmount.length,
          totalAmount,
          eligible,
          missingIban,
          missingId,
          invalidIban,
          zeroAmount,
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "WPS preflight error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/wps/runs — قائمة جميع تشغيلات WPS
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/wps/runs",
  authorize({ feature: "hr.payroll.wps", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const status = (req.query.status as string | undefined) || undefined;
      const period = (req.query.period as string | undefined) || undefined;

      const params: unknown[] = [scope.companyId];
      let whereExtra = "";
      if (status) {
        params.push(status);
        whereExtra += ` AND r.status = $${params.length}`;
      }
      if (period) {
        params.push(period);
        whereExtra += ` AND r.period = $${params.length}`;
      }

      const rows = await rawQuery<WpsRunRow>(
        `SELECT r.id, r."companyId", r.period, r."bankCode", r."fileName",
                r.status, r."totalAmount", r."recordCount",
                r."submittedAt", r."submittedBy", r."acknowledgedAt",
                r."createdAt", r."updatedAt"
           FROM wps_runs r
          WHERE r."companyId" = $1 ${whereExtra}
          ORDER BY r."createdAt" DESC
          LIMIT 200`,
        params,
      );

      res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
    } catch (err) {
      handleRouteError(err, res, "List WPS runs error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/wps/runs/:id — تفاصيل + سطور
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/wps/runs/:id",
  authorize({ feature: "hr.payroll.wps", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");

      const [run] = await rawQuery<WpsRunRow>(
        `SELECT id, "companyId", period, "bankCode", "fileName",
                status, "totalAmount", "recordCount",
                "submittedAt", "submittedBy", "acknowledgedAt",
                "createdAt", "updatedAt", "skippedEntries"
           FROM wps_runs WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!run) throw new NotFoundError("تشغيل WPS غير موجود");

      const lines = await rawQuery<WpsLineRow>(
        `SELECT l.id, l."wpsRunId", l."employeeId",
                COALESCE(e.name, '') AS "employeeName",
                l."iqamaOrId", l.iban, l.amount, l.status,
                l."bankRefNumber", l."errorMessage"
           FROM wps_run_lines l
           LEFT JOIN employees e ON e.id = l."employeeId"
          WHERE l."wpsRunId" = $1
          ORDER BY l.id`,
        [id],
      );

      res.json(maskFields(req, { ...run, lines }));
    } catch (err) {
      handleRouteError(err, res, "Get WPS run detail error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/wps/runs — يبني run جديد من payroll_run معتمد
// ═══════════════════════════════════════════════════════════════════════════════
router.post(
  "/wps/runs",
  authorize({ feature: "hr.payroll.wps", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(createRunSchema.safeParse(req.body));

      const [run] = await rawQuery<PayrollRunRow>(
        `SELECT id, "companyId", "branchId", period, status, "totalNet"
           FROM payroll_runs
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [body.payrollRunId, scope.companyId],
      );
      if (!run) throw new NotFoundError("مسير الرواتب غير موجود");
      if (run.status !== "approved" && run.status !== "paid") {
        throw new ValidationError("لا يمكن توليد WPS قبل اعتماد مسير الرواتب", {
          field: "payrollRunId",
          meta: { currentStatus: run.status },
        });
      }

      const settings = await getWpsSettings(scope.companyId);
      const bankCode = body.bankCode || settings?.bankCode || "";
      if (!bankCode) {
        throw new ValidationError("لم يتم تحديد بنك الراتب — يرجى ضبط إعدادات WPS أولاً", {
          field: "bankCode",
        });
      }

      // Library's createWpsRun is an UPSERT on (companyId, period, bankCode) that
      // unconditionally resets status to 'draft' and buildAndPersist then
      // wipes wps_run_lines. If an operator rebuilds for a period that's
      // already submitted/acknowledged, they'd silently lose the prior
      // file + bank acks. Gate that here.
      const [existing] = await rawQuery<{ id: number; status: string }>(
        `SELECT id, status FROM wps_runs
          WHERE "companyId" = $1 AND period = $2 AND "bankCode" = $3`,
        [scope.companyId, run.period, bankCode],
      );
      if (existing && existing.status !== "draft") {
        throw new ConflictError(
          "يوجد تشغيل WPS لهذه الفترة والبنك بحالة لا تسمح بإعادة التوليد",
          {
            meta: {
              wpsRunId: existing.id,
              currentStatus: existing.status,
              period: run.period,
              bankCode,
            },
          },
        );
      }

      const lines = await rawQuery<PayrollLineForWps>(
        `SELECT pl."employeeId",
                COALESCE(e.name, '') AS "employeeName",
                COALESCE(e."iqamaNumber", e."nationalId") AS "iqamaOrId",
                e.iban,
                pl.basic, pl."housingAllowance", pl."transportAllowance",
                pl."netSalary", pl.gosi, pl."lateDeduction",
                pl."absenceDeduction", pl."violationDeduction", pl."loanDeduction"
           FROM payroll_lines pl
           JOIN employee_assignments ea ON ea.id = pl."assignmentId" AND ea."companyId" = $2
           JOIN employees e ON e.id = ea."employeeId"
          WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL`,
        [body.payrollRunId, scope.companyId],
      );

      const entries: WpsPayrollEntry[] = [];
      const skipped: { employeeId: number; employeeName: string; reason: string }[] = [];

      for (const l of lines) {
        const name = l.employeeName || `#${l.employeeId}`;
        if (!l.iqamaOrId) {
          skipped.push({ employeeId: l.employeeId, employeeName: name, reason: "missing_id" });
          continue;
        }
        if (!l.iban) {
          skipped.push({ employeeId: l.employeeId, employeeName: name, reason: "missing_iban" });
          continue;
        }
        if (!isSaudiIban(l.iban)) {
          skipped.push({ employeeId: l.employeeId, employeeName: name, reason: "invalid_iban" });
          continue;
        }
        const amount = Number(l.netSalary || 0);
        if (amount <= 0) {
          skipped.push({ employeeId: l.employeeId, employeeName: name, reason: "zero_amount" });
          continue;
        }
        const entry = aggregateLineToEntry(l);
        if (entry) entries.push(entry);
      }

      if (entries.length === 0) {
        throw new ValidationError(
          "لا يوجد موظفون مؤهلون — تحقق من IBAN ورقم الإقامة لكل موظف في المسير",
          { meta: { skipped: skipped.slice(0, 50) } },
        );
      }

      const company = await getCompanyInfo(scope.companyId);

      // 1. Create header (idempotent: ON CONFLICT updates back to draft)
      const { wpsRunId } = await createWpsRun({
        companyId: scope.companyId,
        period: run.period,
        bankCode,
      });

      // 2. Build file + persist lines
      const outcome = await buildAndPersist({
        wpsRunId,
        companyId: scope.companyId,
        entries,
        format: body.format,
        vatNumber: company.vatNumber ?? undefined,
        crNumber: company.crNumber ?? undefined,
        companyIban: settings?.bankIban ?? undefined,
      });

      // 3. Record skipped entries for the operator
      if (skipped.length > 0) {
        await rawQuery(
          `UPDATE wps_runs SET "skippedEntries" = $1::jsonb WHERE id = $2 AND "companyId" = $3`,
          [JSON.stringify(skipped), wpsRunId, scope.companyId],
        );
      }

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "create",
        entity: "wps_runs",
        entityId: wpsRunId,
        after: {
          payrollRunId: body.payrollRunId,
          period: run.period,
          bankCode,
          format: body.format ?? "generic_pipe",
          recordCount: outcome.recordCount,
          totalAmount: outcome.totalAmount,
          skippedCount: skipped.length,
        },
      }).catch((e) => logger.error(e, "wps audit log failed"));

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "hr.wps.created",
        entity: "wps_runs",
        entityId: wpsRunId,
        details: JSON.stringify({
          payrollRunId: body.payrollRunId,
          period: run.period,
          recordCount: outcome.recordCount,
          totalAmount: outcome.totalAmount,
        }),
      }).catch((e) => logger.error(e, "wps event emit failed"));

      res.status(201).json({
        wpsRunId,
        period: run.period,
        bankCode,
        recordCount: outcome.recordCount,
        totalAmount: outcome.totalAmount,
        skippedCount: skipped.length,
        skipped,
      });
    } catch (err) {
      handleRouteError(err, res, "Create WPS run error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /hr/wps/runs/:id/file — تنزيل ملف WPS لتسليمه للبنك
// ═══════════════════════════════════════════════════════════════════════════════
router.get(
  "/wps/runs/:id/file",
  authorize({ feature: "hr.payroll.wps", action: "export" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");

      const [row] = await rawQuery<{ fileBytes: string | null; fileName: string | null }>(
        `SELECT "fileBytes", "fileName"
           FROM wps_runs WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("تشغيل WPS غير موجود");
      if (!row.fileBytes) {
        throw new ConflictError("الملف لم يُبنَ بعد — أعد توليد التشغيل");
      }

      const filename = row.fileName || `WPS_${id}.csv`;
      const safeName = filename.replace(/[^A-Za-z0-9_.-]/g, "_");

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "export",
        entity: "wps_runs",
        entityId: id,
        after: { downloadedAt: new Date().toISOString() },
      }).catch((e) => logger.error(e, "wps download audit failed"));

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.status(200).send(row.fileBytes);
    } catch (err) {
      handleRouteError(err, res, "Download WPS file error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/wps/runs/:id/submit — تعليم الـrun كمُرسَل (بعد رفعه يدوياً للبنك)
// ═══════════════════════════════════════════════════════════════════════════════
router.post(
  "/wps/runs/:id/submit",
  authorize({ feature: "hr.payroll.wps", action: "submit" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");

      // The library throws Error (not typed) on FSM violations; map it.
      try {
        await submitWpsRun({
          wpsRunId: id,
          companyId: scope.companyId,
          submittedBy: scope.activeAssignmentId,
        });
      } catch (libErr) {
        const msg = libErr instanceof Error ? libErr.message : String(libErr);
        if (msg.includes("not found")) {
          throw new NotFoundError("تشغيل WPS غير موجود");
        }
        if (msg.includes("no records")) {
          throw new ConflictError("الملف فارغ — لا يمكن إرساله");
        }
        if (msg.includes("Illegal")) {
          throw new ConflictError("لا يمكن إرسال هذا الـrun في حالته الحالية");
        }
        throw libErr;
      }

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "submit",
        entity: "wps_runs",
        entityId: id,
        after: { submittedAt: new Date().toISOString() },
      }).catch((e) => logger.error(e, "wps submit audit failed"));

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "hr.wps.submitted",
        entity: "wps_runs",
        entityId: id,
        details: JSON.stringify({ submittedBy: scope.userId }),
      }).catch((e) => logger.error(e, "wps submit event failed"));

      res.json({ status: "submitted" });
    } catch (err) {
      handleRouteError(err, res, "Submit WPS run error:");
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /hr/wps/runs/:id/ack — تطبيق رد البنك على السطور
// Body: { ackText: string }  (محتوى ملف الـack من البنك)
// ═══════════════════════════════════════════════════════════════════════════════
router.post(
  "/wps/runs/:id/ack",
  authorize({ feature: "hr.payroll.wps", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const body = zodParse(ackSchema.safeParse(req.body));

      let outcome;
      try {
        outcome = await applyAck({
          wpsRunId: id,
          companyId: scope.companyId,
          ackText: body.ackText,
        });
      } catch (libErr) {
        const msg = libErr instanceof Error ? libErr.message : String(libErr);
        if (msg.includes("not found")) throw new NotFoundError("تشغيل WPS غير موجود");
        if (msg.includes("only valid")) {
          throw new ConflictError("لا يمكن تطبيق تأكيد البنك في حالة الـrun الحالية");
        }
        throw libErr;
      }

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "update",
        entity: "wps_runs",
        entityId: id,
        after: {
          ackAppliedAt: new Date().toISOString(),
          finalStatus: outcome.finalStatus,
          paid: outcome.paid,
          failed: outcome.failed,
          held: outcome.held,
          rejected: outcome.rejected,
          unmatched: outcome.unmatched,
        },
      }).catch((e) => logger.error(e, "wps ack audit failed"));

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: `hr.wps.${outcome.finalStatus}`,
        entity: "wps_runs",
        entityId: id,
        details: JSON.stringify(outcome),
      }).catch((e) => logger.error(e, "wps ack event failed"));

      res.json(outcome);
    } catch (err) {
      handleRouteError(err, res, "Apply WPS ack error:");
    }
  },
);

export default router;
