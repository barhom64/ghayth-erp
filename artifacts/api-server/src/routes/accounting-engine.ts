import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];

function requireFinance(scope: any, res: any): boolean {
  if (!FINANCE_ROLES.includes(scope.role)) {
    res.status(403).json({ error: "هذه العملية مخصصة لموظفي المالية فقط" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE ACCOUNTING MAPPING — check completeness before financial operation
// ─────────────────────────────────────────────────────────────────────────────
export async function validateAccountingMapping(
  companyId: number,
  operationType: string
): Promise<{ valid: boolean; mapping?: any; error?: string }> {
  const [mapping] = await rawQuery<any>(
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

router.get("/accounting-mappings", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT am.*,
              da.code AS "debitCode", da.name AS "debitName",
              ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1
       ORDER BY am."operationType" ASC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List accounting mappings error:");
  }
});

router.get("/accounting-mappings/:operationType", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT am.*,
              da.code AS "debitCode", da.name AS "debitName",
              ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1 AND am."operationType" = $2`,
      [scope.companyId, req.params.operationType]
    );
    if (!row) { res.status(404).json({ error: "التوجيه غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Get accounting mapping error:");
  }
});

router.put("/accounting-mappings/:operationType", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { operationType } = req.params;
    const {
      debitAccountId, creditAccountId,
      debitAccountCode, creditAccountCode,
      operationLabel, branchId, activityType, notes, isActive,
    } = req.body as any;

    const existing = await rawQuery<any>(
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

    const [updated] = await rawQuery<any>(
      `SELECT am.*, da.code AS "debitCode", da.name AS "debitName", ca.code AS "creditCode", ca.name AS "creditName"
       FROM accounting_mappings am
       LEFT JOIN chart_of_accounts da ON da.id = am."debitAccountId"
       LEFT JOIN chart_of_accounts ca ON ca.id = am."creditAccountId"
       WHERE am."companyId" = $1 AND am."operationType" = $2`,
      [scope.companyId, operationType]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "accounting_mappings", entityId: updated?.id ?? 0, before: existing.length > 0 ? existing[0] : null, after: updated }).catch(console.error);
    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "Update accounting mapping error:");
  }
});

router.post("/accounting-mappings/batch", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { mappings } = req.body as any;
    if (!Array.isArray(mappings)) {
      throw new ValidationError("mappings يجب أن تكون مصفوفة", {
        field: "mappings",
        fix: "أرسل مصفوفة من التوجيهات",
      });
    }

    for (const m of mappings) {
      await rawExecute(
        `INSERT INTO accounting_mappings
          ("companyId","operationType","operationLabel","debitAccountId","creditAccountId","debitAccountCode","creditAccountCode","isActive")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT ("companyId","operationType") DO UPDATE SET
          "debitAccountId" = EXCLUDED."debitAccountId",
          "creditAccountId" = EXCLUDED."creditAccountId",
          "debitAccountCode" = EXCLUDED."debitAccountCode",
          "creditAccountCode" = EXCLUDED."creditAccountCode",
          "updatedAt" = NOW()`,
        [
          scope.companyId, m.operationType, m.operationLabel ?? m.operationType,
          m.debitAccountId ?? null, m.creditAccountId ?? null,
          m.debitAccountCode ?? null, m.creditAccountCode ?? null,
          m.isActive ?? true,
        ]
      );
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "accounting_mappings", entityId: scope.companyId, after: { batch: true, count: mappings.length, operationTypes: mappings.map((m: any) => m.operationType) } }).catch(console.error);
    res.json({ message: "تم حفظ التوجيهات بنجاح", count: mappings.length });
  } catch (err) {
    handleRouteError(err, res, "Batch update accounting mappings error:");
  }
});

// Validate mapping endpoint
router.get("/accounting-mappings/:operationType/validate", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const result = await validateAccountingMapping(scope.companyId, req.params.operationType);
    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "Validate accounting mapping error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY TEMPLATES CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/journal-templates", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { operationType } = req.query as any;
    const conditions = [`jt."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (operationType) {
      params.push(operationType);
      conditions.push(`jt."operationType" = $${params.length}`);
    }

    const templates = await rawQuery<any>(
      `SELECT jt.*
       FROM journal_entry_templates jt
       WHERE ${conditions.join(" AND ")}
       ORDER BY jt."operationType", jt.name`,
      params
    );

    for (const t of templates) {
      t.lines = await rawQuery<any>(
        `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
         FROM journal_entry_template_lines tl
         LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId"
         WHERE tl."templateId" = $1
         ORDER BY tl."sortOrder", tl.id`,
        [t.id]
      );
    }

    res.json({ data: templates, total: templates.length });
  } catch (err) {
    handleRouteError(err, res, "List journal templates error:");
  }
});

router.post("/journal-templates", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { name, operationType, description, branchId, activityType, lines = [] } = req.body as any;

    if (!name || !operationType) {
      throw new ValidationError("الاسم ونوع العملية مطلوبان", {
        field: "name",
        fix: "أدخل اسم القالب ونوع العملية",
      });
    }

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

    const [template] = await rawQuery<any>(
      `SELECT * FROM journal_entry_templates WHERE id = $1`, [result]
    );
    template.lines = await rawQuery<any>(
      `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM journal_entry_template_lines tl
       LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId"
       WHERE tl."templateId" = $1 ORDER BY tl."sortOrder"`,
      [result]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "journal_entry_templates", entityId: result, after: template }).catch(console.error);
    res.status(201).json(template);
  } catch (err) {
    handleRouteError(err, res, "Create journal template error:");
  }
});

router.put("/journal-templates/:id", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { id } = req.params;
    const { name, description, branchId, activityType, isActive, lines } = req.body as any;

    const [existing] = await rawQuery<any>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "القالب غير موجود" }); return; }

    await rawExecute(
      `UPDATE journal_entry_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        "branchId" = $3, "activityType" = $4,
        "isActive" = COALESCE($5, "isActive"), "updatedAt" = NOW()
       WHERE id = $6 AND "companyId" = $7`,
      [name ?? null, description ?? null, branchId ?? null, activityType ?? null, isActive ?? null, Number(id), scope.companyId]
    );

    if (Array.isArray(lines)) {
      await rawExecute(`DELETE FROM journal_entry_template_lines WHERE "templateId" = $1`, [Number(id)]);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await rawExecute(
          `INSERT INTO journal_entry_template_lines ("templateId","accountId","accountCode","lineType",description,"sortOrder")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [Number(id), line.accountId ?? null, line.accountCode ?? null, line.lineType, line.description ?? null, i]
        );
      }
    }

    const [template] = await rawQuery<any>(`SELECT * FROM journal_entry_templates WHERE id = $1`, [Number(id)]);
    template.lines = await rawQuery<any>(
      `SELECT tl.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM journal_entry_template_lines tl
       LEFT JOIN chart_of_accounts ca ON ca.id = tl."accountId"
       WHERE tl."templateId" = $1 ORDER BY tl."sortOrder"`,
      [Number(id)]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "journal_entry_templates", entityId: Number(id), before: existing, after: template }).catch(console.error);
    res.json(template);
  } catch (err) {
    handleRouteError(err, res, "Update journal template error:");
  }
});

router.delete("/journal-templates/:id", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const [existing] = await rawQuery<any>(
      `SELECT * FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "القالب غير موجود" }); return; }
    await rawExecute(`DELETE FROM journal_entry_templates WHERE id = $1 AND "companyId" = $2`, [Number(req.params.id), scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "journal_entry_templates", entityId: Number(req.params.id), before: existing }).catch(console.error);
    res.json({ message: "تم حذف القالب" });
  } catch (err) {
    handleRouteError(err, res, "Delete journal template error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSIDIARY ACCOUNTS CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/subsidiary-accounts", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.query as any;
    const conditions = [`sa."companyId" = $1`];
    const params: any[] = [scope.companyId];

    if (entityType) { params.push(entityType); conditions.push(`sa."entityType" = $${params.length}`); }
    if (entityId) { params.push(Number(entityId)); conditions.push(`sa."entityId" = $${params.length}`); }

    const rows = await rawQuery<any>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType2", ca."currentBalance"
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY sa."entityType", sa."entityId"`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List subsidiary accounts error:");
  }
});

router.get("/subsidiary-accounts/entity/:entityType/:entityId", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const rows = await rawQuery<any>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType2",
              ca."currentBalance", ca."allowPosting"
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE sa."companyId" = $1 AND sa."entityType" = $2 AND sa."entityId" = $3 AND sa."isActive" = true
       ORDER BY sa."accountType"`,
      [scope.companyId, entityType, Number(entityId)]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Get entity subsidiary accounts error:");
  }
});

router.post("/subsidiary-accounts", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { entityType, entityId, accountType, accountId } = req.body as any;

    if (!entityType || !entityId || !accountType || !accountId) {
      throw new ValidationError("جميع الحقول مطلوبة", {
        field: "entityType",
        fix: "أدخل نوع الكيان، معرفه، نوع الحساب، والحساب",
      });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO subsidiary_accounts ("companyId","entityType","entityId","accountType","accountId")
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("companyId","entityType","entityId","accountType") DO UPDATE SET "accountId" = EXCLUDED."accountId", "isActive" = true
       RETURNING id`,
      [scope.companyId, entityType, Number(entityId), accountType, Number(accountId)]
    );

    const [row] = await rawQuery<any>(
      `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName"
       FROM subsidiary_accounts sa JOIN chart_of_accounts ca ON ca.id = sa."accountId"
       WHERE sa.id = $1`,
      [insertId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "subsidiary_accounts", entityId: insertId, after: row }).catch(console.error);
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create subsidiary account error:");
  }
});

router.delete("/subsidiary-accounts/:id", requirePermission("finance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const [before] = await rawQuery<any>(
      `SELECT * FROM subsidiary_accounts WHERE id = $1 AND "companyId" = $2`,
      [Number(req.params.id), scope.companyId]
    );
    await rawExecute(
      `DELETE FROM subsidiary_accounts WHERE id = $1 AND "companyId" = $2`,
      [Number(req.params.id), scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "subsidiary_accounts", entityId: Number(req.params.id), before: before ?? null }).catch(console.error);
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

    for (const acc of accountsToCreate) {
      const [parentAccount] = await rawQuery<any>(
        `SELECT id, code FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`,
        [companyId, acc.parentCode]
      );
      if (!parentAccount) continue;

      const seqRes = await rawQuery<any>(
        `SELECT COUNT(*) AS cnt FROM subsidiary_accounts WHERE "companyId" = $1 AND "accountType" = $2`,
        [companyId, acc.accountType]
      );
      const seq = Number(seqRes[0]?.cnt ?? 0) + 1;
      const newCode = `${acc.parentCode}-${String(entityId).padStart(4, "0")}`;
      const [existingAcc] = await rawQuery<any>(
        `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`,
        [companyId, newCode]
      );

      let accountId: number;
      if (existingAcc) {
        accountId = existingAcc.id;
      } else {
        const { insertId } = await rawExecute(
          `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "parentId", level, "allowPosting", "isAnalytical", "isActive")
           VALUES ($1,$2,$3,$4,
             (SELECT type FROM chart_of_accounts WHERE id = $5),
             $5,
             (SELECT level + 1 FROM chart_of_accounts WHERE id = $5),
             true, true, true)
           RETURNING id`,
          [companyId, newCode, `${entityName} - ${acc.suffix}`, `${entityName} - ${acc.suffix}`, parentAccount.id]
        );
        accountId = insertId;
      }

      await rawExecute(
        `INSERT INTO subsidiary_accounts ("companyId","entityType","entityId","accountType","accountId")
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ("companyId","entityType","entityId","accountType") DO NOTHING`,
        [companyId, entityType, entityId, acc.accountType, accountId]
      );
    }
  } catch (err) {
    console.error("createSubsidiaryAccountsForEntity error:", err);
  }
}

export default router;
