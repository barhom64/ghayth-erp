/**
 * HR / Saudi compliance HTTP surface — Task #272.
 *
 * Exposes the existing `lib/saudi-compliance/*` engine to operators
 * and the frontend tracking screen:
 *
 *   POST   /hr/saudi/wps/runs                      → create draft run
 *   POST   /hr/saudi/wps/runs/:id/build            → build file from payroll lines
 *   POST   /hr/saudi/wps/runs/:id/submit           → mark submitted (operator)
 *   POST   /hr/saudi/wps/runs/:id/ack              → apply bank ack file
 *   GET    /hr/saudi/wps/runs                      → list runs (status + period)
 *   GET    /hr/saudi/wps/runs/:id                  → run detail + lines
 *   GET    /hr/saudi/wps/runs/:id/file             → download file as text/plain
 *   GET    /hr/saudi/banks                         → list supported bank adapters
 *
 *   POST   /hr/saudi/mudad/contracts/register      → submit a single contract
 *   GET    /hr/saudi/mudad/settlements             → list mudad submissions
 *   POST   /hr/saudi/mudad/settlements/:id/retry   → re-submit a failed row
 *
 * All endpoints are tenant-scoped via `req.scope.companyId` and
 * gated through the existing `hr.payroll.runs` feature key (the
 * same gate the payroll runner already uses).
 */
import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError,
  parseId,
  zodParse,
  ValidationError,
  NotFoundError,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { sendNotification } from "../lib/notificationService.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";

import {
  createWpsRun,
  buildAndPersist,
  submitWpsRun,
  applyAck,
  sendWpsRunToBank,
  pollWpsRunAck,
  IllegalWpsTransitionError,
} from "../lib/saudi-compliance/wps/run.js";
import { ADAPTERS } from "../lib/saudi-compliance/wps/formats/index.js";
import {
  BANK_DELIVERY_CONFIG,
  WpsDeliveryError,
  getDeliveryChannel,
} from "../lib/saudi-compliance/wps/delivery.js";
import {
  getBankCredentialFieldSpecs,
  listBankCredentialStatus,
  upsertBankCredentials,
  clearBankCredentials,
} from "../lib/saudi-compliance/wps/credentials.js";
import { isSaudiIban } from "../lib/saudi-compliance/wps/builder.js";
import type { WpsFormat, WpsPayrollEntry, MudadType } from "../lib/saudi-compliance/types.js";
import {
  MudadTransportError,
  type MudadResponse,
} from "../lib/saudi-compliance/mudad/client.js";
import {
  registerMudadContract,
  callMudadContractRegister,
  callMudadSalary,
  __setMudadCallContractRegisterForTests,
  __setMudadCallSalaryForTests,
} from "../lib/saudi-compliance/mudad/service.js";

// Re-export so existing test imports continue to work.
export {
  registerMudadContract,
  __setMudadCallContractRegisterForTests,
  __setMudadCallSalaryForTests,
};

const saudiComplianceRouter = Router();
saudiComplianceRouter.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────

const createRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  bankCode: z.string().min(2).max(20),
  fileName: z.string().max(120).optional(),
});

const buildRunSchema = z.object({
  format: z.enum(["generic_pipe", "ncb", "alrajhi", "riyad", "alinma", "albilad"]).optional(),
  vatNumber: z.string().max(40).optional(),
  crNumber: z.string().max(40).optional(),
  companyIban: z.string().max(40).optional(),
});

const ackSchema = z.object({
  ackText: z.string().min(1).max(2_000_000),
});

const retryPayloadSchema = z.object({
  iqamaOrId: z.string().min(1),
  iban: z.string().min(1),
  amount: z.coerce.number().optional(),
  basicSalary: z.coerce.number().optional(),
  housingAllowance: z.coerce.number().optional(),
  otherAllowances: z.coerce.number().optional(),
  deductions: z.coerce.number().optional(),
  period: z.string().optional(),
  startDate: z.string().optional(),
});

const mudadContractSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  iqamaOrId: z.string().min(5).max(40),
  basicSalary: z.coerce.number().nonnegative(),
  housingAllowance: z.coerce.number().nonnegative().default(0),
  otherAllowances: z.coerce.number().nonnegative().default(0),
  iban: z.string().min(15).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─────────────────────────────────────────────────────────────────────
// Bank list — drives the bank picker in the UI
// ─────────────────────────────────────────────────────────────────────

saudiComplianceRouter.get(
  "/saudi/banks",
  authorize({ feature: "hr.payroll.runs", action: "list" }),
  (_req, res) => {
    const banks = Object.entries(ADAPTERS).map(([format, a]) => ({
      format,
      code: a.code,
      name: a.name,
      channel: getDeliveryChannel(format as WpsFormat),
    }));
    res.json({ data: banks });
  },
);

// ─────────────────────────────────────────────────────────────────────
// WPS bank delivery credentials (Task #329)
// Per-(company,bank) SFTP/HTTPS credentials. Reads list status (no
// secret values), upserts encrypted blob, deletes (falls back to env).
// ─────────────────────────────────────────────────────────────────────

saudiComplianceRouter.get(
  "/saudi/wps/credentials",
  authorize({ feature: "hr.payroll.runs", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const status = await listBankCredentialStatus(scope.companyId);
      const fieldSpecs: Record<string, ReturnType<typeof getBankCredentialFieldSpecs>> = {};
      for (const [format, cfg] of Object.entries(BANK_DELIVERY_CONFIG)) {
        if (!cfg) continue;
        fieldSpecs[format] = getBankCredentialFieldSpecs(format as WpsFormat);
      }
      res.json({ data: status, fieldSpecs });
    } catch (err) {
      handleRouteError(err, res, "GET /saudi/wps/credentials");
    }
  },
);

const credentialUpsertBody = z.object({
  fields: z.record(z.string(), z.string()),
});

saudiComplianceRouter.put(
  "/saudi/wps/credentials/:bankCode",
  authorize({ feature: "hr.payroll.runs", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const bankCode = String(req.params.bankCode || "").trim();
      if (!bankCode) throw new ValidationError("bankCode is required");
      const format = bankCodeToFormat(bankCode);
      const cfg = BANK_DELIVERY_CONFIG[format];
      if (!cfg) {
        throw new ValidationError(
          `bank "${bankCode}" has no direct-delivery channel configured`,
        );
      }
      const body = zodParse(credentialUpsertBody.safeParse(req.body ?? {}));
      const { fieldNames } = await upsertBankCredentials({
        companyId: scope.companyId,
        bankCode: format,
        format,
        fields: body.fields,
        userId: scope.userId,
      });
      await sideEffect(req, "wps.credentials.updated", "wps_bank_credential", 0, {
        companyId: scope.companyId,
        bankCode: format,
        channel: cfg.channel,
        fieldsSet: fieldNames,
      });
      res.json({ data: { bankCode: format, fieldsSet: fieldNames } });
    } catch (err) {
      handleRouteError(err, res, "PUT /saudi/wps/credentials/:bankCode");
    }
  },
);

saudiComplianceRouter.delete(
  "/saudi/wps/credentials/:bankCode",
  authorize({ feature: "hr.payroll.runs", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const bankCode = String(req.params.bankCode || "").trim();
      if (!bankCode) throw new ValidationError("bankCode is required");
      const format = bankCodeToFormat(bankCode);
      const { deleted } = await clearBankCredentials(scope.companyId, format);
      if (deleted === 0) throw new NotFoundError("bank credential not found");
      await sideEffect(req, "wps.credentials.cleared", "wps_bank_credential", 0, {
        companyId: scope.companyId,
        bankCode: format,
      });
      res.json({ data: { bankCode: format, cleared: true } });
    } catch (err) {
      handleRouteError(err, res, "DELETE /saudi/wps/credentials/:bankCode");
    }
  },
);

/**
 * Reload current employee state and merge it into a stale stored
 * payload so an auto-queued contract_register row can be retried
 * after operators fill in the missing iqama / IBAN.
 */
async function reloadContractRegisterPayload(
  companyId: number,
  employeeId: number,
  storedPayload: unknown,
): Promise<Record<string, unknown> | null> {
  const [emp] = await rawQuery<{
    iqamaNumber: string | null;
    nationalId: string | null;
    iban: string | null;
    salary: string | null;
    hireDate: string | null;
  }>(
    `SELECT e."iqamaNumber", e."nationalId", e.iban,
            ea.salary::text       AS salary,
            ea."hireDate"::text   AS "hireDate"
       FROM employees e
       LEFT JOIN employee_assignments ea
         ON ea."employeeId" = e.id AND ea."isPrimary" = true
      WHERE e.id = $1 AND e."companyId" = $2`,
    [employeeId, companyId],
  );
  if (!emp) return null;
  const iqamaOrId = (emp.iqamaNumber ?? emp.nationalId ?? "").trim();
  if (!iqamaOrId || !emp.iban) return null;
  const base =
    storedPayload && typeof storedPayload === "object"
      ? (storedPayload as Record<string, unknown>)
      : {};
  return {
    ...base,
    iqamaOrId,
    iban: emp.iban,
    basicSalary: Number(base.basicSalary ?? emp.salary ?? 0),
    housingAllowance: Number(base.housingAllowance ?? 0),
    otherAllowances: Number(base.otherAllowances ?? 0),
    startDate:
      (typeof base.startDate === "string" && base.startDate) ||
      emp.hireDate ||
      todayISO(),
  };
}

/**
 * Map a stored `wps_runs.bankCode` to the canonical adapter format.
 * Throws ValidationError when the bankCode is unknown so we never
 * silently fall back to a wrong format. Lookup is by the adapter's
 * declared `code` (case-insensitive); the format key is the adapter
 * map key (e.g. 'ncb', 'alrajhi', 'albilad').
 */
function bankCodeToFormat(bankCode: string): WpsFormat {
  const normalized = bankCode.trim().toLowerCase();
  for (const [format, adapter] of Object.entries(ADAPTERS)) {
    if (
      adapter.code.toLowerCase() === normalized ||
      format.toLowerCase() === normalized
    ) {
      return format as WpsFormat;
    }
  }
  throw new ValidationError(
    `Unknown WPS bankCode "${bankCode}"; supported codes: ${Object.values(ADAPTERS).map((a) => a.code).join(", ")}`,
  );
}

// ─────────────────────────────────────────────────────────────────────
// WPS — list + read
// ─────────────────────────────────────────────────────────────────────

saudiComplianceRouter.get(
  "/saudi/wps/runs",
  authorize({ feature: "hr.payroll.runs", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { period, status } = req.query as Record<string, string>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1`;
      if (period && /^\d{4}-\d{2}$/.test(period)) {
        params.push(period);
        where += ` AND period = $${params.length}`;
      }
      if (status) {
        params.push(status);
        where += ` AND status = $${params.length}`;
      }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, period, "bankCode", "fileName", status,
                "totalAmount"::text  AS "totalAmount",
                "recordCount", "submittedAt"::text AS "submittedAt",
                "submittedBy", "acknowledgedAt"::text AS "acknowledgedAt",
                "createdAt"::text AS "createdAt", notes,
                "deliveryChannel", "deliveryRef",
                "deliveredAt"::text AS "deliveredAt",
                "lastPolledAt"::text AS "lastPolledAt",
                "pollAttempts", "deliveryError"
         FROM wps_runs
         WHERE ${where}
         ORDER BY "createdAt" DESC
         LIMIT 200`,
        params,
      );
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] list wps runs");
    }
  },
);

saudiComplianceRouter.get(
  "/saudi/wps/runs/:id",
  authorize({ feature: "hr.payroll.runs", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [run] = await rawQuery<Record<string, unknown>>(
        `SELECT id, period, "bankCode", "fileName", status,
                "totalAmount"::text AS "totalAmount", "recordCount",
                "submittedAt"::text AS "submittedAt", "submittedBy",
                "acknowledgedAt"::text AS "acknowledgedAt",
                "createdAt"::text AS "createdAt", notes,
                "deliveryChannel", "deliveryRef",
                "deliveredAt"::text AS "deliveredAt",
                "lastPolledAt"::text AS "lastPolledAt",
                "pollAttempts", "deliveryError",
                COALESCE("skippedEntries", '[]'::jsonb) AS "skippedEntries"
         FROM wps_runs
         WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!run) throw new NotFoundError("WPS run not found");
      const lines = await rawQuery<Record<string, unknown>>(
        `SELECT id, "employeeId", "iqamaOrId", iban,
                amount::text AS amount,
                "basicSalary"::text AS "basicSalary",
                "housingAllowance"::text AS "housingAllowance",
                "otherAllowances"::text AS "otherAllowances",
                deductions::text AS deductions,
                remark, status, "bankRefNumber", "errorMessage"
         FROM wps_run_lines
         WHERE "wpsRunId" = $1
         ORDER BY id ASC`,
        [id],
      );
      res.json({ data: { ...run, lines } });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] read wps run");
    }
  },
);

saudiComplianceRouter.get(
  "/saudi/wps/runs/:id/file",
  authorize({ feature: "hr.payroll.runs", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery<{ fileName: string | null; fileBytes: string | null }>(
        `SELECT "fileName", "fileBytes" FROM wps_runs
         WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("WPS run not found");
      if (!row.fileBytes) throw new ValidationError("WPS file has not been built yet");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${row.fileName ?? `wps_${id}.txt`}"`,
      );
      res.send(row.fileBytes);
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] download wps file");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// WPS — lifecycle (create / build / submit / ack)
// ─────────────────────────────────────────────────────────────────────

saudiComplianceRouter.post(
  "/saudi/wps/runs",
  authorize({ feature: "hr.payroll.runs", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const input = zodParse(createRunSchema.safeParse(req.body ?? {}));
      const { wpsRunId } = await createWpsRun({
        companyId: scope.companyId,
        period: input.period,
        bankCode: input.bankCode,
        fileName: input.fileName,
      });
      await sideEffect(req, "wps.run.created", "wps_run", wpsRunId, {
        period: input.period,
        bankCode: input.bankCode,
      });
      res.json({ data: { wpsRunId } });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] create wps run");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/wps/runs/:id/build",
  authorize({ feature: "hr.payroll.runs", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const input = zodParse(buildRunSchema.safeParse(req.body ?? {}));

      const [run] = await rawQuery<{ period: string; status: string; bankCode: string }>(
        `SELECT period, status, "bankCode" FROM wps_runs
         WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!run) throw new NotFoundError("WPS run not found");

      // Bank format must match the run's stored bankCode — operators
      // must not be able to build an Alrajhi run with NCB's format.
      const expectedFormat = bankCodeToFormat(run.bankCode);
      const requestedFormat = (input.format ?? expectedFormat) as WpsFormat;
      if (requestedFormat !== expectedFormat) {
        throw new ValidationError(
          `Bank format "${requestedFormat}" does not match this run's bankCode "${run.bankCode}" (expected "${expectedFormat}")`,
        );
      }

      const { entries, skipped } = await loadPayrollEntriesForPeriod(
        scope.companyId,
        run.period,
      );
      if (entries.length === 0) {
        // Persist skipped so operators can see *why* no eligible lines
        // were found, even when the build failed.
        await rawExecute(
          `UPDATE wps_runs SET "skippedEntries" = $1::jsonb WHERE id = $2`,
          [JSON.stringify(skipped), id],
        );
        throw new ValidationError(
          `No payroll lines found for period ${run.period}; run payroll first`,
        );
      }

      const outcome = await buildAndPersist({
        wpsRunId: id,
        companyId: scope.companyId,
        entries,
        format: requestedFormat,
        vatNumber: input.vatNumber,
        crNumber: input.crNumber,
        companyIban: input.companyIban,
      });
      await rawExecute(
        `UPDATE wps_runs SET "skippedEntries" = $1::jsonb WHERE id = $2`,
        [JSON.stringify(skipped), id],
      );
      await sideEffect(req, "wps.run.built", "wps_run", id, {
        ...outcome,
        skippedCount: skipped.length,
      });
      // Task #323 — proactively page HR when the build excluded employees
      // so they can fix missing IBAN / iqama before the bank cut-off
      // instead of waiting for someone to open the compliance screen.
      // Deduped per run id so a re-build does not re-page.
      await notifyHrOfSkippedWps({
        companyId: scope.companyId,
        wpsRunId: id,
        period: run.period,
        skippedCount: skipped.length,
      }).catch((e) =>
        logger.error(e, "[saudi-compliance] notify HR of skipped WPS failed"),
      );
      res.json({ data: { ...outcome, skipped } });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] build wps run");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/wps/runs/:id/submit",
  authorize({ feature: "hr.payroll.runs", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      try {
        await submitWpsRun({
          wpsRunId: id,
          companyId: scope.companyId,
          submittedBy: scope.userId,
        });
      } catch (err) {
        if (err instanceof IllegalWpsTransitionError) {
          throw new ValidationError(err.message);
        }
        throw err;
      }
      await sideEffect(req, "wps.run.submitted", "wps_run", id, {});
      res.json({ data: { status: "submitted" } });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] submit wps run");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/wps/runs/:id/send-to-bank",
  authorize({ feature: "hr.payroll.runs", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      let outcome;
      try {
        outcome = await sendWpsRunToBank({
          wpsRunId: id,
          companyId: scope.companyId,
          sentBy: scope.userId,
        });
      } catch (err) {
        if (err instanceof IllegalWpsTransitionError) {
          throw new ValidationError(err.message);
        }
        if (err instanceof WpsDeliveryError) {
          // Map by stage:
          //   - "config" → 422 caller hasn't wired credentials / wrong state
          //   - "locked" → 409 a concurrent attempt holds the advisory lock
          //   - "upload"/"poll" → 502 bank-side transport failure
          const status =
            err.stage === "config" ? 422 :
            err.stage === "locked" ? 409 :
            502;
          logger.warn(
            { wpsRunId: id, stage: err.stage, status, err: err.message },
            "[saudi-compliance] direct delivery failed",
          );
          res.status(status).json({ error: err.message, stage: err.stage });
          return;
        }
        throw err;
      }
      await sideEffect(req, "wps.run.sent_to_bank", "wps_run", id, {
        channel: outcome.channel,
        deliveryRef: outcome.deliveryRef,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] send wps run to bank");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/wps/runs/:id/poll-ack",
  authorize({ feature: "hr.payroll.runs", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      let outcome;
      try {
        outcome = await pollWpsRunAck({ wpsRunId: id, companyId: scope.companyId });
      } catch (err) {
        if (err instanceof WpsDeliveryError) {
          const status =
            err.stage === "config" ? 422 :
            err.stage === "locked" ? 409 :
            502;
          res.status(status).json({ error: err.message, stage: err.stage });
          return;
        }
        throw err;
      }
      if (outcome.applied) {
        await sideEffect(req, "wps.run.ack_polled", "wps_run", id, {
          finalStatus: outcome.status,
          paid: outcome.ack?.paid ?? 0,
          failed: outcome.ack?.failed ?? 0,
        });
      }
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] poll wps run ack");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/wps/runs/:id/ack",
  authorize({ feature: "hr.payroll.runs", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { ackText } = zodParse(ackSchema.safeParse(req.body ?? {}));
      const outcome = await applyAck({
        wpsRunId: id,
        companyId: scope.companyId,
        ackText,
      });
      await sideEffect(req, "wps.run.acknowledged", "wps_run", id, { ...outcome });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] apply ack");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// Mudad — list / submit / retry
// ─────────────────────────────────────────────────────────────────────

saudiComplianceRouter.get(
  "/saudi/mudad/settlements",
  authorize({ feature: "hr.payroll.runs", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { period, type, status, employeeId } = req.query as Record<string, string>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1`;
      if (period && /^\d{4}-\d{2}$/.test(period)) {
        params.push(period);
        where += ` AND period = $${params.length}`;
      }
      if (type) {
        params.push(type);
        where += ` AND type = $${params.length}`;
      }
      if (status) {
        params.push(status);
        where += ` AND status = $${params.length}`;
      }
      if (employeeId && /^\d+$/.test(employeeId)) {
        params.push(Number(employeeId));
        where += ` AND "employeeId" = $${params.length}`;
      }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, period, type, "employeeId", "mudadRefId",
                status, amount::text AS amount,
                response,
                "submittedAt"::text AS "submittedAt",
                "acknowledgedAt"::text AS "acknowledgedAt",
                "journalEntryId",
                COALESCE((payload->>'attempts')::int, 0)         AS "attempts",
                payload->>'nextAttemptAt'                        AS "nextAttemptAt",
                payload->>'lastError'                            AS "lastError",
                payload->>'giveUpReason'                         AS "giveUpReason"
         FROM mudad_settlements
         WHERE ${where}
         ORDER BY "submittedAt" DESC, id DESC
         LIMIT 200`,
        params,
      );
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] list mudad settlements");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/mudad/contracts/register",
  authorize({ feature: "hr.payroll.runs", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(mudadContractSchema.safeParse(req.body ?? {}));
      const outcome = await registerMudadContract({
        companyId: scope.companyId,
        userId: scope.userId,
        ...body,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] register mudad contract");
    }
  },
);

saudiComplianceRouter.post(
  "/saudi/mudad/settlements/:id/retry",
  authorize({ feature: "hr.payroll.runs", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery<{
        type: MudadType;
        status: string;
        payload: unknown;
        period: string | null;
        employeeId: number;
      }>(
        `SELECT type, status, payload, period, "employeeId"
         FROM mudad_settlements
         WHERE id = $1 AND "companyId" = $2`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("Mudad settlement not found");
      if (row.status !== "rejected" && row.status !== "retry") {
        throw new ValidationError(
          `Cannot retry settlement in status "${row.status}"; only rejected/retry rows are retryable`,
        );
      }

      // For now the retry pipeline only supports salary + contract_register
      // — the operator surfaces leave/exit/termination via dedicated UIs.
      let parsedPayload = retryPayloadSchema.safeParse(row.payload);
      if (!parsedPayload.success && row.type === "contract_register") {
        // Auto-queued contract_register rows may have null iqama/IBAN
        // (employee was created before those fields were populated).
        // Reload current employee state and retry with merged data.
        const reloaded = await reloadContractRegisterPayload(
          scope.companyId,
          row.employeeId,
          row.payload,
        );
        if (reloaded) {
          parsedPayload = retryPayloadSchema.safeParse(reloaded);
        }
      }
      if (!parsedPayload.success) {
        throw new ValidationError(
          `Cannot retry settlement #${id}: stored payload is missing required fields (${parsedPayload.error.errors.map((e) => e.path.join(".")).join(", ")})`,
        );
      }
      const newPayload = parsedPayload.data;
      let response: MudadResponse;
      try {
        if (row.type === "salary") {
          response = await callMudadSalary({
            companyId: scope.companyId,
            submission: {
              period: newPayload.period ?? row.period ?? "",
              employeeId: row.employeeId,
              iqamaOrId: newPayload.iqamaOrId,
              iban: newPayload.iban,
              amount: newPayload.amount ?? newPayload.basicSalary ?? 0,
              basicSalary: newPayload.basicSalary ?? 0,
              housingAllowance: newPayload.housingAllowance ?? 0,
              otherAllowances: newPayload.otherAllowances ?? 0,
              deductions: newPayload.deductions ?? 0,
            },
          });
        } else if (row.type === "contract_register") {
          if (!newPayload.startDate) {
            throw new ValidationError(
              `Cannot retry contract_register #${id}: stored payload missing startDate`,
            );
          }
          response = await callMudadContractRegister({
            companyId: scope.companyId,
            submission: {
              employeeId: row.employeeId,
              iqamaOrId: newPayload.iqamaOrId,
              iban: newPayload.iban,
              startDate: newPayload.startDate,
              basicSalary: newPayload.basicSalary ?? 0,
              housingAllowance: newPayload.housingAllowance ?? 0,
              otherAllowances: newPayload.otherAllowances ?? 0,
            },
          });
        } else {
          throw new ValidationError(
            `Retry not supported for settlement type "${row.type}"`,
          );
        }
      } catch (err) {
        if (err instanceof MudadTransportError) {
          // Stays in the queue; operator can retry once Mudad recovers.
          await rawExecute(
            `UPDATE mudad_settlements
               SET status = 'retry',
                   response = $1
             WHERE id = $2`,
            [JSON.stringify({ httpStatus: err.httpStatus, error: String(err.message) }), id],
          );
          throw new ValidationError(`Mudad transport error: ${err.message}`);
        }
        throw err;
      }

      await rawExecute(
        `UPDATE mudad_settlements
           SET status = $1, "mudadRefId" = $2, response = $3,
               "acknowledgedAt" = CASE WHEN $1 = 'acknowledged' THEN NOW() ELSE "acknowledgedAt" END
         WHERE id = $4`,
        [
          response.status === "acknowledged" ? "acknowledged" : response.status === "rejected" ? "rejected" : "submitted",
          response.refId,
          JSON.stringify(response.rawResponse ?? {}),
          id,
        ],
      );
      await sideEffect(req, "mudad.settlement.retried", "mudad_settlement", id, {
        status: response.status,
        refId: response.refId,
      });
      res.json({ data: { status: response.status, refId: response.refId } });
    } catch (err) {
      handleRouteError(err, res, "[saudi-compliance] retry mudad settlement");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Reasons a payroll line can be excluded from the WPS file. Kept in
 * lockstep with `isSaudiIban` rules so the guard test can assert
 * coverage (Task #300).
 */
export type WpsSkipReason =
  | "no_iban"
  | "non_saudi_iban"
  | "no_iqama_or_national_id"
  | "non_positive_net";

export interface WpsSkippedEntry {
  employeeId: number;
  employeeName: string | null;
  iqamaOrId: string | null;
  iban: string | null;
  netSalary: number | null;
  reason: WpsSkipReason;
}

export interface LoadedPayrollEntries {
  entries: WpsPayrollEntry[];
  skipped: WpsSkippedEntry[];
}

/**
 * Pure classification of a payroll row into either an eligible WPS
 * entry or a skipped row with reason. Exported for the guard test
 * (Task #300) so the skip-reason coverage stays in lockstep with
 * `isSaudiIban` rules.
 */
export function classifyPayrollRowForWps(row: {
  employeeId: number;
  employeeName?: string | null;
  iqama?: string | null;
  nationalId?: string | null;
  iban?: string | null;
  netSalary?: string | number | null;
  basic?: string | number | null;
  housing?: string | number | null;
  other?: string | number | null;
  deductions?: string | number | null;
}): { kind: "entry"; entry: WpsPayrollEntry } | { kind: "skipped"; skipped: WpsSkippedEntry } {
  const iqamaOrId = (row.iqama ?? row.nationalId ?? "").trim();
  const amount = Number(row.netSalary ?? 0);
  const base = {
    employeeId: row.employeeId,
    employeeName: row.employeeName ?? null,
    iqamaOrId: iqamaOrId || null,
    iban: row.iban ?? null,
    netSalary: Number.isFinite(amount) ? amount : null,
  };
  if (!row.iban) {
    return { kind: "skipped", skipped: { ...base, reason: "no_iban" } };
  }
  if (!isSaudiIban(row.iban)) {
    return { kind: "skipped", skipped: { ...base, reason: "non_saudi_iban" } };
  }
  if (!iqamaOrId) {
    return { kind: "skipped", skipped: { ...base, reason: "no_iqama_or_national_id" } };
  }
  if (!(amount > 0)) {
    return { kind: "skipped", skipped: { ...base, reason: "non_positive_net" } };
  }
  return {
    kind: "entry",
    entry: {
      employeeId: row.employeeId,
      iqamaOrId,
      iban: row.iban,
      amount,
      basicSalary: Number(row.basic ?? 0),
      housingAllowance: Number(row.housing ?? 0),
      otherAllowances: Number(row.other ?? 0),
      deductions: Number(row.deductions ?? 0),
    },
  };
}

export async function loadPayrollEntriesForPeriod(
  companyId: number,
  period: string,
): Promise<LoadedPayrollEntries> {
  // Read the most recent payroll_run for the period and its lines.
  const [run] = await rawQuery<{ id: number }>(
    `SELECT id FROM payroll_runs
     WHERE "companyId" = $1 AND period = $2 AND "deletedAt" IS NULL
     ORDER BY "createdAt" DESC LIMIT 1`,
    [companyId, period],
  );
  if (!run) return { entries: [], skipped: [] };
  const rows = await rawQuery<{
    employeeId: number;
    employeeName: string | null;
    iqama: string | null;
    nationalId: string | null;
    iban: string | null;
    netSalary: string | null;
    basic: string | null;
    housing: string | null;
    other: string | null;
    deductions: string | null;
  }>(
    `SELECT ea."employeeId"   AS "employeeId",
            e.name            AS "employeeName",
            e."iqamaNumber"   AS iqama,
            e."nationalId"    AS "nationalId",
            e.iban            AS iban,
            pl."netSalary"::text   AS "netSalary",
            pl.basic::text         AS basic,
            pl."housingAllowance"::text AS housing,
            (pl."grossSalary" - pl.basic - pl."housingAllowance")::text  AS other,
            pl."lateDeduction"::text    AS deductions
     FROM payroll_lines pl
     LEFT JOIN employee_assignments ea ON ea.id = pl."assignmentId"
     LEFT JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
     WHERE pl."runId" = $1 AND pl."deletedAt" IS NULL`,
    [run.id],
  );
  const entries: WpsPayrollEntry[] = [];
  const skipped: WpsSkippedEntry[] = [];
  for (const r of rows) {
    const result = classifyPayrollRowForWps(r);
    if (result.kind === "entry") entries.push(result.entry);
    else skipped.push(result.skipped);
  }
  return { entries, skipped };
}

/**
 * Task #323 — page HR when a WPS build excluded employees so they
 * can fix the missing IBAN / iqama before the bank cut-off.
 *
 * The canonical "queue" is the `wps_skip_alerts` table: one row per
 * (companyId, wpsRunId), enforced atomically by the
 * `uq_wps_skip_alerts_company_run` UNIQUE index (migration 175). The
 * INSERT uses `ON CONFLICT DO NOTHING RETURNING id` so even
 * concurrent rebuilds collapse to a single queue row and a single
 * fan-out — no race window between SELECT and INSERT.
 *
 * Side effect: on the first successful insert (and only then) we
 * dispatch an in-app HR notification via the existing notification
 * service so every active hr_manager assignment sees it. Re-builds
 * never re-page because the conflict short-circuits the function.
 *
 * Returns 1 when a queue row was newly inserted (and HR was paged),
 * 0 otherwise (skippedCount === 0, or already alerted for this run).
 */
export async function notifyHrOfSkippedWps(input: {
  companyId: number;
  wpsRunId: number;
  period: string;
  skippedCount: number;
}): Promise<number> {
  if (input.skippedCount <= 0) return 0;

  const inserted = await rawQuery<{ id: number }>(
    `INSERT INTO wps_skip_alerts
       ("companyId", "wpsRunId", period, "skippedCount")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("companyId", "wpsRunId") DO NOTHING
     RETURNING id`,
    [input.companyId, input.wpsRunId, input.period, input.skippedCount],
  );
  if (inserted.length === 0) return 0;

  // Fan-out side effect — one in-app notification per active HR
  // recipient. Failures are logged but do not undo the queue row;
  // the `wps_skip_alerts` row is the source of truth that this run
  // has already been alerted on.
  await sendNotification({
    companyId: input.companyId,
    type: "payroll",
    title: `${input.skippedCount} موظفون مستبعدون من ملف WPS لشهر ${input.period}`,
    body: `تم بناء ملف WPS لشهر ${input.period} مع استبعاد ${input.skippedCount} موظف بسبب نقص في رقم الآيبان أو الإقامة. يرجى المراجعة قبل موعد البنك.`,
    priority: "high",
    targetRole: "hr_manager",
    refType: "wps_run_skipped",
    refId: input.wpsRunId,
    actionUrl: `/hr/saudi-compliance/wps/${input.wpsRunId}`,
  }).catch((e) =>
    logger.error(e, "[saudi-compliance] HR fan-out for skipped WPS failed"),
  );

  return 1;
}

async function sideEffect(
  req: { scope?: any },
  action: string,
  entity: string,
  entityId: number,
  after: Record<string, unknown>,
): Promise<void> {
  auditFromRequest(req, action, entity, entityId, { after }).catch((e) =>
    logger.error(e, "[saudi-compliance] audit failed"),
  );
  const scope = req.scope;
  if (scope) {
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action,
      entity,
      entityId,
      details: JSON.stringify(after),
    }).catch((e) => logger.error(e, "[saudi-compliance] event emit failed"));
  }
}

export default saudiComplianceRouter;
