import { handleRouteError, NotFoundError, ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { FINANCE_ROLES } from "../lib/rbacCatalog.js";

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

interface AccountingMappingRow {
  id: number;
  companyId: number;
  operationType: string;
  operationLabel: string;
  debitAccountId: number | null;
  creditAccountId: number | null;
  debitAccountCode: string | null;
  creditAccountCode: string | null;
  branchId: number | null;
  activityType: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  debitCode: string | null;
  debitName: string | null;
  creditCode: string | null;
  creditName: string | null;
}

interface MappingIdRow { id: number }

interface JournalTemplateRow {
  id: number;
  companyId: number;
  name: string;
  operationType: string;
  description: string | null;
  branchId: number | null;
  activityType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  lines?: JournalTemplateLineRow[];
}

interface JournalTemplateLineRow {
  id: number;
  templateId: number;
  accountId: number | null;
  accountCode: string | null;
  accountName: string | null;
  lineType: string;
  description: string | null;
  sortOrder: number;
}

interface SubsidiaryAccountRow {
  id: number;
  companyId: number;
  entityType: string;
  entityId: number;
  accountType: string;
  accountId: number;
  isActive: boolean;
  accountCode: string | null;
  accountName: string | null;
  accountType2?: string | null;
  currentBalance?: number | string | null;
  allowPosting?: boolean | null;
  createdAt?: string;
  updatedAt?: string | null;
}

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
  const [mapping] = await rawQuery<AccountingMappingRow>(
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
    const rows = await rawQuery<AccountingMappingRow>(
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
    res.json({ data: rows, total: rows.length });
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
    const [row] = await rawQuery<AccountingMappingRow>(
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
    res.json(row);
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

    const existing = await rawQuery<MappingIdRow>(
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

    const [updated] = await rawQuery<AccountingMappingRow>(
      `SELECT am.*, da.code AS "debitCode", da.name AS "debitName", ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1 AND am."operationType" = $2`,
      [scope.companyId, operationType]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "accounting_mappings", entityId: updated?.id ?? 0, before: existing.length > 0 ? existing[0] : null, after: updated }).catch((e) => logger.error(e, "accounting-engine background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "accounting.mapping.updated", entity: "accounting_mappings", entityId: updated?.id ?? 0, details: JSON.stringify({ operationType }) }).catch((e) => logger.error(e, "accounting-engine background task failed"));
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
    res.json(result);
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
    const { operationType } = req.query as any;
    const conditions = [`jt."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (operationType) {
      params.push(operationType);
      conditions.push(`jt."operationType" = $${params.length}`);
    }

    conditions.push(`jt."deletedAt" IS NULL`);
    const templates = await rawQuery<JournalTemplateRow>(
      `SELECT jt.*
       FROM journal_entry_templates jt
       WHERE ${conditions.join(" AND ")}
       ORDER BY jt."operationType", jt.name
       LIMIT 500`,
      params
    );

    for (const t of templates) {
      t.lines = await rawQuery<JournalTemplateLineRow>(
        `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
         FROM journal_entry_template_lines tl
         LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId" AND ca."companyId" = $2
         WHERE tl."templateId" = $1
         ORDER BY tl."sortOrder", tl.id LIMIT 500`,
        [t.id, scope.companyId]
      );
    }

    res.json({ data: templates, total: templates.length });
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

    const [template] = await rawQuery<JournalTemplateRow>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`, [result, scope.companyId]
    );
    if (!template) throw new NotFoundError("القالب غير موجود");
    template.lines = await rawQuery<JournalTemplateLineRow>(
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

router.put("/journal-templates/:id", authorize({ feature: "finance.accounting_engine", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(updateJournalTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    requireFinance(scope);
    const id = parseId(req.params.id, "id");
    const { name, description, branchId, activityType, isActive, lines } = body;

    const [existing] = await rawQuery<JournalTemplateRow>(
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

    const [template] = await rawQuery<JournalTemplateRow>(`SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!template) throw new NotFoundError("القالب غير موجود");
    template.lines = await rawQuery<JournalTemplateLineRow>(
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
    const [existing] = await rawQuery<JournalTemplateRow>(
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
    const { entityType, entityId } = req.query as any;
    const conditions = [`sa."companyId" = $1`];
    const params: any[] = [scope.companyId];

    if (entityType) { params.push(entityType); conditions.push(`sa."entityType" = $${params.length}`); }
    if (entityId) { params.push(Number(entityId) || 0); conditions.push(`sa."entityId" = $${params.length}`); }

    const rows = await rawQuery<SubsidiaryAccountRow>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType2", ca."currentBalance"
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY sa."entityType", sa."entityId"
       LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List subsidiary accounts error:");
  }
});

router.get("/subsidiary-accounts/entity/:entityType/:entityId", authorize({ feature: "finance.accounting_engine", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const entityId = parseId(req.params.entityId, "entityId");
    const rows = await rawQuery<SubsidiaryAccountRow>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType2",
              ca."currentBalance", ca."allowPosting"
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE sa."companyId" = $1 AND sa."entityType" = $2 AND sa."entityId" = $3 AND sa."isActive" = true
       ORDER BY sa."accountType" LIMIT 500`,
      [scope.companyId, entityType, entityId]
    );
    res.json({ data: rows, total: rows.length });
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

    const [row] = await rawQuery<SubsidiaryAccountRow>(
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
    const [before] = await rawQuery<SubsidiaryAccountRow>(
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
// AUTO-CREATE SUBSIDIARY ACCOUNTS FOR A NEW ENTITY
// ─────────────────────────────────────────────────────────────────────────────
export async function createSubsidiaryAccountsForEntity(
  companyId: number,
  entityType: "employee" | "client" | "vendor" | "vehicle" | "driver" | "property",
  entityId: number,
  entityName: string
): Promise<void> {
  try {
    const accountsToCreate: Array<{ accountType: string; parentCode: string; suffix: string }> = [];

    if (entityType === "employee") {
      accountsToCreate.push(
        { accountType: "advance", parentCode: "1121", suffix: "سلفة" },
        { accountType: "custody", parentCode: "1131", suffix: "عهدة" }
      );
    } else if (entityType === "client") {
      accountsToCreate.push(
        { accountType: "receivable", parentCode: "1111", suffix: "ذمم" }
      );
    } else if (entityType === "vendor") {
      accountsToCreate.push(
        { accountType: "payable", parentCode: "2102", suffix: "ذمة" }
      );
    }

    await withTransaction(async (client) => {
      for (const acc of accountsToCreate) {
        const { rows: [parentAccount] } = await client.query(
          `SELECT id, code FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
          [companyId, acc.parentCode]
        );
        if (!parentAccount) continue;

        const newCode = `${acc.parentCode}-${String(entityId).padStart(4, "0")}`;
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
  } catch (err) {
    logger.error(err, "createSubsidiaryAccountsForEntity error:");
  }
}

export default router;
