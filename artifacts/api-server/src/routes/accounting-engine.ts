import { handleRouteError, NotFoundError, ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";
import { createAuditLog, emitEvent, assertPostableAccount } from "../lib/businessHelpers.js";
import { FINANCE_ROLES } from "../lib/rbacCatalog.js";
import {
  getClassificationCenterSummary,
  linkAnalyticAccount,
} from "../lib/gl/analytic-accounts.js";

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const updateAccountingMappingSchema = z.object({
  debitAccountId: z.coerce.number().nullable().optional(),
  creditAccountId: z.coerce.number().nullable().optional(),
  debitAccountCode: z.string().nullable().optional(),
  creditAccountCode: z.string().nullable().optional(),
  operationLabel: z.string().optional(),
  branchId: z.coerce.number().nullable().optional(),
  activityType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const batchMappingItemSchema = z.object({
  operationType: z.string().min(1),
  operationLabel: z.string().optional(),
  debitAccountId: z.coerce.number().nullable().optional(),
  creditAccountId: z.coerce.number().nullable().optional(),
  debitAccountCode: z.string().nullable().optional(),
  creditAccountCode: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const batchAccountingMappingsSchema = z.object({
  mappings: z.array(batchMappingItemSchema),
});

const templateLineSchema = z.object({
  accountId: z.coerce.number().nullable().optional(),
  accountCode: z.string().nullable().optional(),
  lineType: z.string().min(1),
  description: z.string().nullable().optional(),
});

const createJournalTemplateSchema = z.object({
  name: z.string().min(1),
  operationType: z.string().min(1),
  description: z.string().nullable().optional(),
  branchId: z.coerce.number().nullable().optional(),
  activityType: z.string().nullable().optional(),
  lines: z.array(templateLineSchema).optional(),
});

const updateJournalTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  branchId: z.coerce.number().nullable().optional(),
  activityType: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  lines: z.array(templateLineSchema).optional(),
});

const createSubsidiaryAccountSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.coerce.number(),
  accountType: z.string().min(1),
  accountId: z.coerce.number(),
});

const router = Router();

function requireFinance(scope: any): void {
  if (!FINANCE_ROLES.includes(scope.role)) {
    throw new ForbiddenError("هذه العملية مخصصة لموظفي المالية فقط");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE ACCOUNTING MAPPING — check completeness before financial operation
// ─────────────────────────────────────────────────────────────────────────────
export async function validateAccountingMapping(
  companyId: number,
  operationType: string
): Promise<{ valid: boolean; mapping?: any; error?: string }> {
  const [mapping] = await rawQuery<Record<string, unknown>>(
    `SELECT am.*, 
            da.code AS "debitCode", da.name AS "debitName",
            ca.code AS "creditCode", ca.name AS "creditName"
     FROM accounting_mappings am
     LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
     LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
     WHERE am."companyId" = $1 AND am."operationType" = $2 AND am."isActive" = true`,
    [companyId, operationType]
  );

  if (!mapping) {
    return {
      valid: false,
      error: `لا يمكن اعتماد العملية لعدم اكتمال التوجيه المحاسبي — نوع العملية: "${operationType}" غير مُعرَّف`,
    };
  }

  if (!mapping.debitAccountId && !mapping.debitAccountCode) {
    return {
      valid: false,
      error: `لا يمكن اعتماد العملية لعدم اكتمال التوجيه المحاسبي — الحساب المدين لـ "${mapping.operationLabel}" غير محدد`,
    };
  }

  if (!mapping.creditAccountId && !mapping.creditAccountCode) {
    return {
      valid: false,
      error: `لا يمكن اعتماد العملية لعدم اكتمال التوجيه المحاسبي — الحساب الدائن لـ "${mapping.operationLabel}" غير محدد`,
    };
  }

  return { valid: true, mapping };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING MAPPINGS CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/accounting-mappings", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT am.*,
              da.code AS "debitCode", da.name AS "debitName",
              ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1
       ORDER BY am."operationType" ASC
       LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "List accounting mappings error:");
  }
});

router.post("/accounting-mappings/batch", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const parsedBody = zodParse(batchAccountingMappingsSchema.safeParse(req.body));
    const scope = req.scope!;
    requireFinance(scope);
    const { mappings } = parsedBody;

    await withTransaction(async (client) => {
      for (const m of mappings) {
        await client.query(
          `INSERT INTO accounting_mappings
            ("companyId","operationType","operationLabel","debitAccountId","creditAccountId","debitAccountCode","creditAccountCode","isActive")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT ("companyId","operationType") DO UPDATE SET
            "debitAccountId" = EXCLUDED."debitAccountId",
            "creditAccountId" = EXCLUDED."creditAccountId",
            "debitAccountCode" = EXCLUDED."debitAccountCode",
            "creditAccountCode" = EXCLUDED."creditAccountCode",
            "operationLabel" = EXCLUDED."operationLabel",
            "isActive" = EXCLUDED."isActive",
            "updatedAt" = NOW()`,
          [
            scope.companyId, m.operationType, m.operationLabel ?? m.operationType,
            m.debitAccountId ?? null, m.creditAccountId ?? null,
            m.debitAccountCode ?? null, m.creditAccountCode ?? null,
            m.isActive ?? true,
          ]
        );
      }
    });

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "accounting_mappings", entityId: scope.companyId, after: { batch: true, count: mappings.length, operationTypes: mappings.map((m: any) => m.operationType) } }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.mappings.batch_updated", entity: "accounting_mappings", entityId: scope.companyId, details: JSON.stringify({ count: mappings.length, operationTypes: mappings.map((m: any) => m.operationType) }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.json({ message: "تم حفظ التوجيهات بنجاح", count: mappings.length });
  } catch (err) {
    handleRouteError(err, res, "Batch update accounting mappings error:");
  }
});

router.get("/accounting-mappings/:operationType", authorize({ feature: "finance.accounting_engine", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT am.*,
              da.code AS "debitCode", da.name AS "debitName",
              ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1 AND am."operationType" = $2`,
      [scope.companyId, req.params.operationType]
    );
    if (!row) throw new NotFoundError("التوجيه غير موجود");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Get accounting mapping error:");
  }
});

router.put("/accounting-mappings/:operationType", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(updateAccountingMappingSchema.safeParse(req.body));
    const scope = req.scope!;
    requireFinance(scope);
    const { operationType } = req.params;
    const {
      debitAccountId, creditAccountId,
      debitAccountCode, creditAccountCode,
      operationLabel, branchId, activityType, notes, isActive,
    } = body;

    const existing = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM accounting_mappings WHERE "companyId" = $1 AND "operationType" = $2`,
      [scope.companyId, operationType]
    );

    if (existing.length > 0) {
      await rawExecute(
        `UPDATE accounting_mappings SET
          "debitAccountId" = $1, "creditAccountId" = $2,
          "debitAccountCode" = $3, "creditAccountCode" = $4,
          "operationLabel" = COALESCE($5, "operationLabel"),
          "branchId" = $6, "activityType" = $7, notes = $8,
          "isActive" = COALESCE($9, true), "updatedAt" = NOW()
         WHERE "companyId" = $10 AND "operationType" = $11
         RETURNING id`,
        [
          debitAccountId ?? null, creditAccountId ?? null,
          debitAccountCode ?? null, creditAccountCode ?? null,
          operationLabel ?? null, branchId ?? null,
          activityType ?? null, notes ?? null,
          isActive ?? true, scope.companyId, operationType,
        ]
      );
    } else {
      await rawExecute(
        `INSERT INTO accounting_mappings
          ("companyId","operationType","operationLabel","debitAccountId","creditAccountId","debitAccountCode","creditAccountCode","branchId","activityType",notes,"isActive")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          scope.companyId, operationType, operationLabel ?? operationType,
          debitAccountId ?? null, creditAccountId ?? null,
          debitAccountCode ?? null, creditAccountCode ?? null,
          branchId ?? null, activityType ?? null, notes ?? null, isActive ?? true,
        ]
      );
    }

    const [updated] = await rawQuery<Record<string, unknown>>(
      `SELECT am.*, da.code AS "debitCode", da.name AS "debitName", ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1 AND am."operationType" = $2`,
      [scope.companyId, operationType]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "accounting_mappings", entityId: (updated?.id as number | undefined) ?? 0, before: existing.length > 0 ? existing[0] : null, after: updated }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.mapping.updated", entity: "accounting_mappings", entityId: (updated?.id as number | undefined) ?? 0, details: JSON.stringify({ operationType }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "Update accounting mapping error:");
  }
});

// Validate mapping endpoint
router.get("/accounting-mappings/:operationType/validate", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const result = await validateAccountingMapping(scope.companyId, String(req.params.operationType));
    res.json(maskFields(req, result));
  } catch (err) {
    handleRouteError(err, res, "Validate accounting mapping error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY TEMPLATES CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/journal-templates", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { operationType } = req.query as Record<string, string | undefined>;
    const conditions = [`jt."companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    if (operationType) {
      params.push(operationType);
      conditions.push(`jt."operationType" = $${params.length}`);
    }

    conditions.push(`jt."deletedAt" IS NULL`);
    const templates = await rawQuery<Record<string, unknown>>(
      `SELECT jt.*
       FROM journal_entry_templates jt
       WHERE ${conditions.join(" AND ")}
       ORDER BY jt."operationType", jt.name
       LIMIT 500`,
      params
    );

    if (templates.length > 0) {
      const templateIds = templates.map((t) => t.id);
      const allLines = await rawQuery<Record<string, unknown>>(
        `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
         FROM journal_entry_template_lines tl
         LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2
         WHERE tl."templateId" = ANY($1::int[])
         ORDER BY tl."templateId", tl."sortOrder", tl.id`,
        [templateIds, scope.companyId]
      );
      const linesByTemplate = new Map<number, Record<string, unknown>[]>();
      for (const line of allLines) {
        const tplId = line.templateId as number;
        const arr = linesByTemplate.get(tplId) ?? [];
        arr.push(line);
        linesByTemplate.set(tplId, arr);
      }
      for (const t of templates) {
        t.lines = linesByTemplate.get(t.id as number) ?? [];
      }
    }

    res.json(maskFields(req, { data: templates, total: templates.length }));
  } catch (err) {
    handleRouteError(err, res, "List journal templates error:");
  }
});

router.post("/journal-templates", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(createJournalTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    requireFinance(scope);
    const { name, operationType, description, branchId, activityType, lines = [] } = body;

    const result = await withTransaction(async (client) => {
      const templateRes = await client.query(
        `INSERT INTO journal_entry_templates ("companyId", name, "operationType", description, "branchId", "activityType")
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [scope.companyId, name, operationType, description ?? null, branchId ?? null, activityType ?? null]
      );
      const templateId = templateRes.rows[0].id;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await client.query(
          `INSERT INTO journal_entry_template_lines ("templateId","accountId","accountCode","lineType",description,"sortOrder")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [templateId, line.accountId ?? null, line.accountCode ?? null, line.lineType, line.description ?? null, i]
        );
      }

      return templateId;
    });

    const [template] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`, [result, scope.companyId]
    );
    if (!template) throw new NotFoundError("القالب غير موجود");
    template.lines = await rawQuery<Record<string, unknown>>(
      `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM journal_entry_template_lines tl
       LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2
       WHERE tl."templateId" = $1 ORDER BY tl."sortOrder" LIMIT 500`,
      [result, scope.companyId]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "journal_entry_templates", entityId: result, after: template }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.journal_template.created", entity: "journal_entry_templates", entityId: result, details: JSON.stringify({ name, operationType }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.status(201).json(template);
  } catch (err) {
    handleRouteError(err, res, "Create journal template error:");
  }
});

router.get("/journal-templates/:id", authorize({ feature: "finance.accounting_engine", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [template] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!template) throw new NotFoundError("القالب غير موجود");
    template.lines = await rawQuery<Record<string, unknown>>(
      `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM journal_entry_template_lines tl
       LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2
       WHERE tl."templateId" = $1 ORDER BY tl."sortOrder" LIMIT 500`,
      [id, scope.companyId],
    );
    res.json(maskFields(req, { data: template }));
  } catch (err) {
    handleRouteError(err, res, "Get journal template error:");
  }
});

router.put("/journal-templates/:id", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(updateJournalTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    requireFinance(scope);
    const id = parseId(req.params.id, "id");
    const { name, description, branchId, activityType, isActive, lines } = body;

    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القالب غير موجود");

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE journal_entry_templates SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          "branchId" = $3, "activityType" = $4,
          "isActive" = COALESCE($5, "isActive"), "updatedAt" = NOW()
         WHERE id = $6 AND "companyId" = $7 AND "deletedAt" IS NULL`,
        [name ?? null, description ?? null, branchId ?? null, activityType ?? null, isActive ?? null, id, scope.companyId]
      );

      if (Array.isArray(lines)) {
        await client.query(`DELETE FROM journal_entry_template_lines WHERE "templateId" = $1`, [id]);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          await client.query(
            `INSERT INTO journal_entry_template_lines ("templateId","accountId","accountCode","lineType",description,"sortOrder")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, line.accountId ?? null, line.accountCode ?? null, line.lineType, line.description ?? null, i]
          );
        }
      }
    });

    const [template] = await rawQuery<Record<string, unknown>>(`SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!template) throw new NotFoundError("القالب غير موجود");
    template.lines = await rawQuery<Record<string, unknown>>(
      `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM journal_entry_template_lines tl
       LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2
       WHERE tl."templateId" = $1 ORDER BY tl."sortOrder" LIMIT 500`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "journal_entry_templates", entityId: id, before: existing, after: template }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.journal_template.updated", entity: "journal_entry_templates", entityId: id, details: JSON.stringify({ name, operationType: existing.operationType }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.json(template);
  } catch (err) {
    handleRouteError(err, res, "Update journal template error:");
  }
});

router.delete("/journal-templates/:id", authorize({ feature: "finance.accounting_engine", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    requireFinance(scope);
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القالب غير موجود");
    const { affectedRows } = await rawExecute(`UPDATE journal_entry_templates SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "journal_entry_templates", entityId: id, before: existing }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.journal_template.deleted", entity: "journal_entry_templates", entityId: id, details: JSON.stringify({ name: existing.name }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.json({ message: "تم حذف القالب" });
  } catch (err) {
    handleRouteError(err, res, "Delete journal template error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSIDIARY ACCOUNTS CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/subsidiary-accounts", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.query as Record<string, string | undefined>;
    const conditions = [`sa."companyId" = $1`];
    const params: unknown[] = [scope.companyId];

    if (entityType) { params.push(entityType); conditions.push(`sa."entityType" = $${params.length}`); }
    if (entityId) { params.push(Number(entityId) || 0); conditions.push(`sa."entityId" = $${params.length}`); }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType2", ca."currentBalance"
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY sa."entityType", sa."entityId"
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "List subsidiary accounts error:");
  }
});

router.get("/subsidiary-accounts/entity/:entityType/:entityId", authorize({ feature: "finance.accounting_engine", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const entityId = parseId(req.params.entityId, "entityId");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType2",
              ca."currentBalance", ca."allowPosting"
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE sa."companyId" = $1 AND sa."entityType" = $2 AND sa."entityId" = $3 AND sa."isActive" = true
       ORDER BY sa."accountType" LIMIT 500`,
      [scope.companyId, entityType, entityId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "Get entity subsidiary accounts error:");
  }
});

router.post("/subsidiary-accounts", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(createSubsidiaryAccountSchema.safeParse(req.body));
    const scope = req.scope!;
    requireFinance(scope);
    const { entityType, entityId, accountType, accountId } = body;

    const { insertId } = await rawExecute(
      `INSERT INTO subsidiary_accounts ("companyId","entityType","entityId","accountType","accountId")
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("companyId","entityType","entityId","accountType") DO UPDATE SET "accountId" = EXCLUDED."accountId", "isActive" = true
       RETURNING id`,
      [scope.companyId, entityType, Number(entityId), accountType, Number(accountId)]
    );
    assertInsert(insertId, "subsidiary_accounts");

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE sa.id = $1 AND sa."companyId" = $2`,
      [insertId, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "subsidiary_accounts", entityId: insertId, after: row }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.subsidiary_account.created", entity: "subsidiary_accounts", entityId: insertId, details: JSON.stringify({ entityType, entityId, accountType }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create subsidiary account error:");
  }
});

router.delete("/subsidiary-accounts/:id", authorize({ feature: "finance.accounting_engine", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    requireFinance(scope);
    const [before] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM subsidiary_accounts WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    await rawExecute(
      `DELETE FROM subsidiary_accounts WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "subsidiary_accounts", entityId: id, before: before ?? null }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.subsidiary_account.deleted", entity: "subsidiary_accounts", entityId: id, details: JSON.stringify({ entityType: before?.entityType, entityId: before?.entityId }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.json({ message: "تم الحذف" });
  } catch (err) {
    handleRouteError(err, res, "Delete subsidiary account error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// #2091 — subsidiary-account provisioning FAILURES review queue + retry.
// The unresolved rows are the finance review surface; retry re-runs the
// idempotent provisioning and self-resolves on success.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/subsidiary-account-failures", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const includeResolved = String(req.query.includeResolved ?? "") === "true";
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "entityType", "entityId", "entityName", "missingAccountTypes", reason,
              "branchId", "actorUserId", "retryCount", resolved, "resolvedAt", "firstSeenAt", "lastAttemptAt"
         FROM subsidiary_account_provisioning_failures
        WHERE "companyId" = $1 ${includeResolved ? "" : "AND resolved = false"}
        ORDER BY resolved ASC, "lastAttemptAt" DESC
        LIMIT 500`,
      [scope.companyId],
    );
    res.json({ data: rows, total: rows.length, openCount: rows.filter((r) => r.resolved === false).length });
  } catch (err) {
    handleRouteError(err, res, "List subsidiary provisioning failures error:");
  }
});

router.post("/subsidiary-account-failures/:id/retry", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await retrySubsidiaryProvisioningFailure(id, scope.companyId);
    if (!result) throw new NotFoundError("سجل فشل التأسيس غير موجود");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "subsidiary_provisioning.retry", entity: "subsidiary_account_provisioning_failures", entityId: id,
      after: { resolved: result.resolved },
    }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    res.json({ id, resolved: result.resolved, message: result.resolved ? "تم تأسيس الحسابات الفرعية وإغلاق السجل" : "لا يزال التأسيس متعذّرًا — راجع شجرة الحسابات" });
  } catch (err) {
    handleRouteError(err, res, "Retry subsidiary provisioning error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-CREATE SUBSIDIARY ACCOUNTS FOR A NEW ENTITY
// ─────────────────────────────────────────────────────────────────────────────
// #1945 FIN-003 — intent describing the CONTROL parent each per-entity
// subsidiary account hangs under. The literal `parentCode` is a last-resort
// fallback ONLY: the historical literals (client→1111, employee advance→1121,
// custody→1131, vendor→2102) matched neither the default-seed chart nor the
// SOCPA chart — both actually use 1130 (AR), 2110 (AP), 1140/1141/1142
// (staff advances/custody). The old codes pointed client receivables at
// 1111 (الصندوق — cash!), employee advances at 1121 (a bank), and custody at
// 1131 (clients), so every per-entity account was minted under the WRONG
// parent and any posting through it overstated cash / mislabelled balances.
// Resolution now goes by intent (type + name keywords) and only falls back to
// the literal when no chart account matches — so it is correct on any tenant
// chart, exactly like the operation-account intent search in businessHelpers.
type ParentIntent = { type: string; keywords: string[] };
interface SubsidiaryAccountSpec { accountType: string; parentCode: string; suffix: string; parentIntent: ParentIntent }

/**
 * Resolve the control parent account for a per-entity subsidiary account.
 * Intent (type + keyword match, shallowest code wins → the control header)
 * first; the literal fallbackCode only if intent finds nothing. Returns the
 * resolved { id, code } or null when neither path matches (caller skips).
 */
async function resolveSubsidiaryParent(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ id: number; code: string }> }> },
  companyId: number,
  intent: ParentIntent,
  fallbackCode: string,
): Promise<{ id: number; code: string } | null> {
  const likeClauses = intent.keywords.map((_, i) => `name LIKE $${i + 3}`).join(" OR ");
  const params = [companyId, intent.type, ...intent.keywords.map((k) => `%${k}%`)];
  const byIntent = await client.query(
    `SELECT id, code FROM chart_of_accounts
      WHERE "companyId" = $1 AND type = $2 AND "deletedAt" IS NULL AND (${likeClauses})
      ORDER BY length(code) ASC, code ASC LIMIT 1`,
    params,
  );
  if (byIntent.rows[0]) return byIntent.rows[0];
  const byCode = await client.query(
    `SELECT id, code FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
    [companyId, fallbackCode],
  );
  return byCode.rows[0] ?? null;
}

export async function createSubsidiaryAccountsForEntity(
  companyId: number,
  entityType: "employee" | "client" | "vendor" | "vehicle" | "driver" | "property" | "umrah_agent",
  entityId: number,
  entityName: string,
  opts?: { branchId?: number | null; actorUserId?: number | null }
): Promise<void> {
  // declared outside the try so the catch can record the expected accountTypes
  const accountsToCreate: SubsidiaryAccountSpec[] = [];
  try {
    if (entityType === "employee") {
      accountsToCreate.push(
        { accountType: "advance", parentCode: "1140", suffix: "سلفة", parentIntent: { type: "asset", keywords: ["سلف الموظف", "سلف"] } },
        { accountType: "custody", parentCode: "1142", suffix: "عهدة", parentIntent: { type: "asset", keywords: ["عهد مالية للموظف"] } }
      );
    } else if (entityType === "client") {
      accountsToCreate.push(
        { accountType: "receivable", parentCode: "1130", suffix: "ذمم", parentIntent: { type: "asset", keywords: ["الذمم المدينة", "العملاء"] } }
      );
    } else if (entityType === "vendor") {
      accountsToCreate.push(
        { accountType: "payable", parentCode: "2110", suffix: "ذمة", parentIntent: { type: "liability", keywords: ["الذمم الدائنة", "الموردون"] } }
      );
    } else if (entityType === "driver") {
      // Drivers receive cash advances for fuel + on-the-road
      // repairs (custody). The driver-level custody account
      // splits these from generic employee custody so fleet
      // managers can report per-driver outstanding cash without
      // pulling employee_assignments joins.
      accountsToCreate.push(
        { accountType: "custody", parentCode: "1113", suffix: "عهدة سائق", parentIntent: { type: "asset", keywords: ["العهد النقدية", "عهد"] } }
      );
    } else if (entityType === "vehicle") {
      // Per-vehicle subsidiary accounts (#1594 — "نظام قوي قابل للتحكم"):
      // each vehicle gets its OWN postable leaf under the standard fleet
      // parents so fuel/maintenance/depreciation post per-plate and roll up
      // to the parent for consolidated reporting. Editable later from the
      // vehicle page via /finance/subsidiary-accounts. Parents that don't
      // exist in a minimal COA are skipped gracefully (the loop `continue`s).
      accountsToCreate.push(
        { accountType: "custody", parentCode: "1113", suffix: "عهدة مركبة", parentIntent: { type: "asset", keywords: ["العهد النقدية"] } },
        { accountType: "fuel", parentCode: "5510", suffix: "وقود", parentIntent: { type: "expense", keywords: ["الوقود", "وقود"] } },
        { accountType: "maintenance", parentCode: "5520", suffix: "صيانة", parentIntent: { type: "expense", keywords: ["صيانة وإصلاح المركبات", "صيانة"] } },
        { accountType: "depreciation", parentCode: "5710", suffix: "إهلاك", parentIntent: { type: "expense", keywords: ["إهلاك المركبات", "إهلاك"] } }
      );
    } else if (entityType === "umrah_agent") {
      // Per-agent revenue routing (#1594): each umrah agent gets its own
      // postable revenue leaf under the umrah/service revenue parent, so
      // sales per agent roll up to the parent for consolidated reporting.
      // resolveRevenueAccount() picks it up automatically via the
      // umrah_agent → accountType='revenue' subsidiary lookup. Editable
      // later from /finance/subsidiary-accounts.
      accountsToCreate.push(
        { accountType: "revenue", parentCode: "4130", suffix: "إيراد عمرة", parentIntent: { type: "revenue", keywords: ["إيرادات الخدمات", "عمرة"] } }
      );
    }

    // #2091 — track WHY any expected account couldn't be opened (a control
    // parent that doesn't resolve on this company's chart) so the gap is
    // recorded, not silently skipped by the loop's `continue`.
    const parentFailures: string[] = [];
    await withTransaction(async (client) => {
      for (const acc of accountsToCreate) {
        const parentAccount = await resolveSubsidiaryParent(client as any, companyId, acc.parentIntent, acc.parentCode);
        if (!parentAccount) { parentFailures.push(acc.accountType); continue; }

        const newCode = `${parentAccount.code}-${String(entityId).padStart(4, "0")}`;
        const { rows: [existingAcc] } = await client.query(
          `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
          [companyId, newCode]
        );

        let accountId: number;
        if (existingAcc) {
          accountId = existingAcc.id;
        } else {
          const { rows: [newAcc] } = await client.query(
            `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "parentId", level, "allowPosting", "isAnalytical", "isActive")
             VALUES ($1,$2,$3,$4,
               (SELECT type FROM chart_of_accounts WHERE id = $5),
               $5,
               (SELECT level + 1 FROM chart_of_accounts WHERE id = $5),
               true, true, true)
             RETURNING id`,
            [companyId, newCode, `${entityName} - ${acc.suffix}`, `${entityName} - ${acc.suffix}`, parentAccount.id]
          );
          accountId = newAcc.id;
        }

        await client.query(
          `INSERT INTO subsidiary_accounts ("companyId","entityType","entityId","accountType","accountId")
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT ("companyId","entityType","entityId","accountType") DO NOTHING`,
          [companyId, entityType, entityId, acc.accountType, accountId]
        );
      }
    });
    // #2091 — record the outcome (no silent failure). Compare the expected
    // accountTypes against what now actually exists; if any are missing (a
    // parent that didn't resolve, a non-postable header, …) open/refresh a
    // tracked failure for review + retry. If all present, self-heal any open
    // failure for this entity.
    await reconcileSubsidiaryProvisioning(
      companyId, entityType, entityId, entityName,
      accountsToCreate.map((a) => a.accountType),
      parentFailures, null, opts,
    );
  } catch (err) {
    // An exception rolled the whole provisioning back → also a tracked failure.
    await reconcileSubsidiaryProvisioning(
      companyId, entityType, entityId, entityName,
      accountsToCreate.map((a) => a.accountType),
      [], err, opts,
    ).catch((e) => logger.warn(e, "[subsidiary-provisioning] failed to record failure after error"));
    logger.error(err, "createSubsidiaryAccountsForEntity error:");
  }
}

/**
 * #2091 — reconcile a subsidiary-provisioning attempt against reality and
 * record/resolve a tracked failure. Never throws into the caller (best-effort).
 */
async function reconcileSubsidiaryProvisioning(
  companyId: number,
  entityType: string,
  entityId: number,
  entityName: string,
  expectedAccountTypes: string[],
  parentFailures: string[],
  txnError: unknown,
  opts?: { branchId?: number | null; actorUserId?: number | null },
): Promise<void> {
  try {
    if (expectedAccountTypes.length === 0) return; // nothing was expected (e.g. property)

    const have = new Set(
      (await rawQuery<{ accountType: string }>(
        `SELECT "accountType" FROM subsidiary_accounts
          WHERE "companyId"=$1 AND "entityType"=$2 AND "entityId"=$3 AND "isActive"=true AND "deletedAt" IS NULL`,
        [companyId, entityType, entityId],
      )).map((r) => r.accountType),
    );
    const missing = expectedAccountTypes.filter((t) => !have.has(t));

    if (missing.length === 0 && !txnError) {
      // fully provisioned → self-heal any open failure for this entity
      await rawExecute(
        `UPDATE subsidiary_account_provisioning_failures
            SET resolved=true, "resolvedAt"=now()
          WHERE "companyId"=$1 AND "entityType"=$2 AND "entityId"=$3 AND resolved=false`,
        [companyId, entityType, entityId],
      );
      return;
    }

    const reason = txnError
      ? (txnError instanceof Error ? txnError.message : String(txnError))
      : `تعذّر إيجاد الأصل الضابط القابل للترحيل لأنواع الحساب: ${(parentFailures.length ? parentFailures : missing).join("، ")}`;

    await rawExecute(
      `INSERT INTO subsidiary_account_provisioning_failures
         ("companyId","branchId","entityType","entityId","entityName","missingAccountTypes",reason,"actorUserId",context,"retryCount","lastAttemptAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,now())
       ON CONFLICT ("companyId","entityType","entityId") WHERE resolved=false
       DO UPDATE SET
         reason=EXCLUDED.reason,
         "missingAccountTypes"=EXCLUDED."missingAccountTypes",
         "branchId"=COALESCE(EXCLUDED."branchId", subsidiary_account_provisioning_failures."branchId"),
         "actorUserId"=COALESCE(EXCLUDED."actorUserId", subsidiary_account_provisioning_failures."actorUserId"),
         context=EXCLUDED.context,
         "retryCount"=subsidiary_account_provisioning_failures."retryCount"+1,
         "lastAttemptAt"=now()`,
      [
        companyId, opts?.branchId ?? null, entityType, entityId, entityName, missing, reason,
        opts?.actorUserId ?? null,
        JSON.stringify({ entityName, missing, parentFailures, errored: !!txnError }),
      ],
    );

    // Persisted audit trail (audit_logs) + a notification event. Both awaited
    // inside reconcile's own try/catch so they never break the caller.
    await createAuditLog({
      companyId, branchId: opts?.branchId ?? undefined, userId: opts?.actorUserId ?? 0,
      action: "subsidiary_provisioning.failed", entity: "subsidiary_accounts", entityId,
      after: { entityType, missing, reason },
    }).catch((e) => logger.warn(e, "[subsidiary-provisioning] audit log failed"));
    await emitEvent({
      companyId, branchId: opts?.branchId ?? undefined, userId: opts?.actorUserId ?? null,
      action: "finance.subsidiary_account.provisioning_failed",
      entity: "subsidiary_accounts", entityId,
      details: JSON.stringify({ entityType, missing, reason }),
    }).catch((e) => logger.warn(e, "[subsidiary-provisioning] event emit failed"));

    logger.error({ entityType, entityId, missing, reason }, "[subsidiary-provisioning] incomplete — recorded for review (#2091)");
  } catch (e) {
    logger.warn(e, "[subsidiary-provisioning] reconcile failed");
  }
}

/**
 * #2091 — retry a tracked subsidiary-provisioning failure. Re-runs the
 * (idempotent) provisioning; on full success the tracked row is marked
 * resolved by reconcileSubsidiaryProvisioning. Returns the post-retry row.
 */
export async function retrySubsidiaryProvisioningFailure(failureId: number, companyId: number): Promise<{ resolved: boolean } | null> {
  const [f] = await rawQuery<{ entityType: string; entityId: number; entityName: string | null; branchId: number | null }>(
    `SELECT "entityType","entityId","entityName","branchId"
       FROM subsidiary_account_provisioning_failures WHERE id=$1 AND "companyId"=$2`,
    [failureId, companyId],
  );
  if (!f) return null;
  await createSubsidiaryAccountsForEntity(
    companyId, f.entityType as any, f.entityId, f.entityName ?? `${f.entityType}#${f.entityId}`,
    { branchId: f.branchId },
  );
  const [after] = await rawQuery<{ resolved: boolean }>(
    `SELECT resolved FROM subsidiary_account_provisioning_failures WHERE id=$1`, [failureId],
  );
  return after ?? null;
}

// ─── مركز التصنيف والمطابقة — Issue #2197 ────────────────────────────────────

/**
 * GET /api/accounting/classification-center
 * Returns summary counts for the operator dashboard.
 */
router.get("/classification-center", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const companyId = (req as any).user.companyId as number;
    const summary = await getClassificationCenterSummary(companyId);
    res.json(summary);
  } catch (err) {
    handleRouteError(err, res, "Classification center summary error:");
  }
});

/**
 * GET /api/accounting/classification-center/analytic-accounts
 * Lists analytic accounts that need linking (needsLinking=true).
 */
router.get("/classification-center/analytic-accounts", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const companyId = (req as any).user.companyId as number;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status ?? "needs_linking";

    const rows = await rawQuery<{
      id: number; name: string; code: string | null; status: string;
      sourceModule: string | null; seasonId: number | null; partyId: number | null;
      partyRole: string | null; branchId: number | null; needsLinking: boolean;
      linkingNote: string | null; createdAt: string;
    }>(
      `SELECT id, name, code, status, "sourceModule", "seasonId", "partyId",
              "partyRole", "branchId", "needsLinking", "linkingNote", "createdAt"
       FROM analytic_accounts
       WHERE "companyId" = $1 AND status = $2 AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT $3 OFFSET $4`,
      [companyId, statusFilter, limit, offset]
    );

    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM analytic_accounts
       WHERE "companyId" = $1 AND status = $2 AND "deletedAt" IS NULL`,
      [companyId, statusFilter]
    );

    res.json({ data: rows, total: Number(count), page, limit });
  } catch (err) {
    handleRouteError(err, res, "List analytic accounts error:");
  }
});

const linkAnalyticSchema = z.object({
  partyId:       z.coerce.number().optional(),
  partyRole:     z.string().optional(),
  parentPartyId: z.coerce.number().optional(),
  seasonId:      z.coerce.number().optional(),
  contractId:    z.coerce.number().optional(),
  projectId:     z.coerce.number().optional(),
  employeeId:    z.coerce.number().optional(),
  custodyId:     z.coerce.number().optional(),
  status:        z.enum(["active","needs_linking","closed","archived"]).optional(),
  reason:        z.string().optional(),
});

/**
 * PATCH /api/accounting/classification-center/analytic-accounts/:id/link
 * Link a needs_linking analytic account to a party/season/contract.
 */
router.patch("/classification-center/analytic-accounts/:id/link", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const companyId = (req as any).user.companyId as number;
    const userId    = (req as any).user.id as number;
    const id = parseId(req.params.id);
    const body = zodParse(linkAnalyticSchema.safeParse(req.body));

    await linkAnalyticAccount({
      analyticAccountId: id,
      companyId,
      updatedBy: userId,
      reason: body.reason,
      updates: {
        partyId:       body.partyId,
        partyRole:     body.partyRole,
        parentPartyId: body.parentPartyId,
        seasonId:      body.seasonId,
        contractId:    body.contractId,
        projectId:     body.projectId,
        employeeId:    body.employeeId,
        custodyId:     body.custodyId,
        status:        body.status,
        needsLinking:  body.status === "active" ? false : undefined,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Link analytic account error:");
  }
});

/**
 * GET /api/accounting/classification-center/posting-failures
 * Lists unresolved posting failures classified by category.
 */
router.get("/classification-center/posting-failures", authorize({ feature: "finance.accounting_engine", action: "list" }), async (req, res) => {
  try {
    const companyId = (req as any).user.companyId as number;
    const category = req.query.category as string | undefined;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;

    const whereClauses = [`"companyId" = $1`, `resolved = false`];
    const params: unknown[] = [companyId];
    if (category) { whereClauses.push(`"failureCategory" = $${params.length + 1}`); params.push(category); }

    const rows = await rawQuery<{
      id: number; sourceType: string; sourceId: number | null;
      error: string; failureCategory: string | null; failureReason: string | null;
      suggestedFix: string | null; createdAt: string;
    }>(
      `SELECT id, "sourceType", "sourceId", error, "failureCategory", "failureReason", "suggestedFix", "createdAt"
       FROM financial_posting_failures
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM financial_posting_failures WHERE ${whereClauses.join(" AND ")}`,
      params
    );

    res.json({ data: rows, total: Number(count), page, limit });
  } catch (err) {
    handleRouteError(err, res, "List posting failures error:");
  }
});

/**
 * POST /api/accounting/classification-center/posting-failures/:id/classify
 * Manually set or override the category/fix for a failure row.
 */
const classifyFailureSchema = z.object({
  failureCategory: z.enum(["parent_account","missing_mapping","missing_party","missing_config","unlinked_analytic","period_closed","unbalanced_entry","other"]),
  failureReason:  z.string().optional(),
  suggestedFix:   z.string().optional(),
});

router.post("/classification-center/posting-failures/:id/classify", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const companyId = (req as any).user.companyId as number;
    const userId    = (req as any).user.id as number;
    const id = parseId(req.params.id);
    const body = zodParse(classifyFailureSchema.safeParse(req.body));

    // Read before-state for audit diff
    const [before] = await rawQuery<{ failureCategory: string | null; failureReason: string | null }>(
      `SELECT "failureCategory", "failureReason" FROM financial_posting_failures WHERE id=$1 AND "companyId"=$2`,
      [id, companyId]
    );
    if (!before) {
      res.status(404).json({ error: "سجل الخطأ غير موجود" });
      return;
    }

    await rawExecute(
      `UPDATE financial_posting_failures
       SET "failureCategory"=$1, "failureReason"=$2, "suggestedFix"=$3,
           "classifiedAt"=NOW(), "classifiedBy"=$4
       WHERE id=$5 AND "companyId"=$6`,
      [body.failureCategory, body.failureReason ?? null, body.suggestedFix ?? null, userId, id, companyId]
    );

    // Audit trail — who classified what and when
    await rawExecute(
      `INSERT INTO audit_logs ("companyId","userId",action,entity,"entityId","before","after")
       VALUES ($1,$2,'classify_failure','financial_posting_failures',$3,$4,$5)`,
      [
        companyId, userId, id,
        JSON.stringify(before),
        JSON.stringify({ failureCategory: body.failureCategory, failureReason: body.failureReason, suggestedFix: body.suggestedFix }),
      ]
    ).catch((e) => logger.warn(e, "[classification-center] audit insert failed"));

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Classify posting failure error:");
  }
});

/**
 * GET /api/accounting/assert-postable?code=XXXX
 * Dev/admin helper — verify a code is postable without posting.
 * Used by CI guards and the settings UI.
 */
router.get("/assert-postable", authorize({ feature: "finance.accounting_engine", action: "view" }), async (req, res) => {
  try {
    const companyId = (req as any).user.companyId as number;
    const code = String(req.query.code ?? "").trim();
    await assertPostableAccount(companyId, code, { field: "code" });
    res.json({ ok: true, code, postable: true });
  } catch (err: any) {
    res.status(422).json({ ok: false, code: req.query.code, postable: false, message: err.message });
  }
});

export default router;
