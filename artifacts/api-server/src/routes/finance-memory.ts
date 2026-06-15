/**
 * FIN-FINANCIAL-MEMORY-FOUNDATION — financial memory API.
 *
 * Codified manual-entry memories: payee/counterparty finance defaults,
 * expense-category defaults, and recurring manual journal templates. Every
 * monetary memory is keyed by `accountPurpose` (text) — the central financial
 * engine resolves it to a real account; this layer NEVER returns an accountCode
 * and NEVER posts a journal. All reads/writes are company-scoped.
 *
 * Mounted under /finance (see routes/index.ts).
 */
import { Router } from "express";
import { z } from "zod";
import {
  handleRouteError, NotFoundError, parseId, zodParse,
} from "../lib/errorHandler.js";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import {
  loadManualJournalTemplate, materializeTemplateLines, isTemplateMaterializationPostable,
} from "../lib/financialMemory.js";

export const financeMemoryRouter = Router();

// ── Payee / counterparty finance defaults (per canonical suppliers.id) ───────
async function assertSupplierInCompany(supplierId: number, companyId: number) {
  const [s] = await rawQuery<{ id: number }>(
    `SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [supplierId, companyId],
  );
  if (!s) throw new NotFoundError("المورد غير موجود");
}

financeMemoryRouter.get(
  "/suppliers/:id/finance-defaults",
  authorize({ feature: "finance.vendors", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      await assertSupplierInCompany(id, scope.companyId);
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT "supplierId", "defaultPaymentMethod", "defaultCurrency",
                "defaultAccountPurpose", "defaultCostCenterId"
           FROM supplier_finance_defaults
          WHERE "companyId"=$1 AND "supplierId"=$2 AND "isActive"=true AND "deletedAt" IS NULL`,
        [scope.companyId, id],
      );
      res.json(maskFields(req, { data: row ?? null }));
    } catch (err) { handleRouteError(err, res, "Supplier finance defaults error:"); }
  },
);

const supplierFinanceDefaultsSchema = z.object({
  defaultPaymentMethod: z.string().optional(),
  defaultCurrency: z.string().optional(),
  defaultAccountPurpose: z.string().optional(),
  defaultCostCenterId: z.coerce.number().int().positive().optional(),
}).strict();

financeMemoryRouter.put(
  "/suppliers/:id/finance-defaults",
  authorize({ feature: "finance.vendors", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      await assertSupplierInCompany(id, scope.companyId);
      const b = zodParse(supplierFinanceDefaultsSchema.safeParse(req.body));
      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM supplier_finance_defaults
          WHERE "companyId"=$1 AND "supplierId"=$2 AND "deletedAt" IS NULL`,
        [scope.companyId, id],
      );
      if (existing) {
        await rawExecute(
          `UPDATE supplier_finance_defaults
              SET "defaultPaymentMethod"=$3, "defaultCurrency"=$4,
                  "defaultAccountPurpose"=$5, "defaultCostCenterId"=$6, "updatedAt"=NOW()
            WHERE "companyId"=$1 AND id=$2`,
          [scope.companyId, existing.id, b.defaultPaymentMethod ?? null,
           b.defaultCurrency ?? "SAR", b.defaultAccountPurpose ?? null, b.defaultCostCenterId ?? null],
        );
      } else {
        await rawExecute(
          `INSERT INTO supplier_finance_defaults
             ("companyId","supplierId","defaultPaymentMethod","defaultCurrency",
              "defaultAccountPurpose","defaultCostCenterId")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [scope.companyId, id, b.defaultPaymentMethod ?? null, b.defaultCurrency ?? "SAR",
           b.defaultAccountPurpose ?? null, b.defaultCostCenterId ?? null],
        );
      }
      auditFromRequest(req, "finance.supplier_finance_defaults.updated", "supplier_finance_defaults", id, { after: b });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "finance.supplier_finance_defaults.updated", entity: "supplier_finance_defaults", entityId: id,
        supplierId: id, details: JSON.stringify({ supplierId: id }),
      }).catch((e) => logger.error(e, "finance-memory background task failed"));
      res.json({ ok: true });
    } catch (err) { handleRouteError(err, res, "Save supplier finance defaults error:"); }
  },
);

// ── Expense-category memory (purpose / tax / cost-center per category) ────────
financeMemoryRouter.get(
  "/expense-memory",
  authorize({ feature: "finance.journal", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const category = typeof req.query.category === "string" && req.query.category ? req.query.category : null;
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT "categoryKey", "accountPurpose", "defaultTaxCodeId", "defaultCostCenterId"
           FROM expense_category_memory
          WHERE "companyId"=$1 AND "isActive"=true AND "deletedAt" IS NULL
            AND ($2::text IS NULL OR "categoryKey"=$2)
          ORDER BY "categoryKey" ASC`,
        [scope.companyId, category],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) { handleRouteError(err, res, "Expense memory error:"); }
  },
);

const expenseMemorySchema = z.object({
  categoryKey: z.string().min(1, "فئة المصروف مطلوبة"),
  accountPurpose: z.string().optional(),
  defaultTaxCodeId: z.coerce.number().int().positive().optional(),
  defaultCostCenterId: z.coerce.number().int().positive().optional(),
}).strict();

financeMemoryRouter.put(
  "/expense-memory",
  authorize({ feature: "finance.journal", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(expenseMemorySchema.safeParse(req.body));
      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM expense_category_memory
          WHERE "companyId"=$1 AND "categoryKey"=$2 AND "deletedAt" IS NULL`,
        [scope.companyId, b.categoryKey],
      );
      let memoryId = existing?.id ?? 0;
      if (existing) {
        await rawExecute(
          `UPDATE expense_category_memory
              SET "accountPurpose"=$3, "defaultTaxCodeId"=$4, "defaultCostCenterId"=$5, "updatedAt"=NOW()
            WHERE "companyId"=$1 AND id=$2`,
          [scope.companyId, existing.id, b.accountPurpose ?? null, b.defaultTaxCodeId ?? null, b.defaultCostCenterId ?? null],
        );
      } else {
        const { insertId } = await rawExecute(
          `INSERT INTO expense_category_memory
             ("companyId","categoryKey","accountPurpose","defaultTaxCodeId","defaultCostCenterId")
           VALUES ($1,$2,$3,$4,$5)`,
          [scope.companyId, b.categoryKey, b.accountPurpose ?? null, b.defaultTaxCodeId ?? null, b.defaultCostCenterId ?? null],
        );
        memoryId = insertId ?? 0;
      }
      auditFromRequest(req, "finance.expense_memory.updated", "expense_category_memory", memoryId, { after: b });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "finance.expense_memory.updated", entity: "expense_category_memory", entityId: memoryId,
        categoryKey: b.categoryKey, details: JSON.stringify({ categoryKey: b.categoryKey }),
      }).catch((e) => logger.error(e, "finance-memory background task failed"));
      res.json({ ok: true });
    } catch (err) { handleRouteError(err, res, "Save expense memory error:"); }
  },
);

// ── Recurring manual journal templates (purpose-based memory) ─────────────────
financeMemoryRouter.get(
  "/journal-templates",
  authorize({ feature: "finance.journal", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, name, description, "defaultSupplierId", "defaultCostCenterId", currency
           FROM manual_journal_templates
          WHERE "companyId"=$1 AND "isActive"=true AND "deletedAt" IS NULL
          ORDER BY name ASC`,
        [scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) { handleRouteError(err, res, "Journal templates error:"); }
  },
);

financeMemoryRouter.get(
  "/journal-templates/:id",
  authorize({ feature: "finance.journal", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const tpl = await loadManualJournalTemplate(scope.companyId, id);
      if (!tpl) throw new NotFoundError("قالب القيد غير موجود");
      res.json(maskFields(req, tpl));
    } catch (err) { handleRouteError(err, res, "Journal template error:"); }
  },
);

// lines carry an accountPurpose (text) ONLY — .strict() rejects any accountCode key.
const templateLineSchema = z.object({
  accountPurpose: z.string().min(1, "غرض الحساب مطلوب"),
  side: z.enum(["debit", "credit"]),
  amount: z.coerce.number().optional(),
  ratio: z.coerce.number().optional(),
  requiredDimensions: z.array(z.string()).optional(),
  defaultCostCenterId: z.coerce.number().int().positive().optional(),
  description: z.string().optional(),
}).strict();

const createTemplateSchema = z.object({
  name: z.string().min(1, "اسم القالب مطلوب"),
  description: z.string().optional(),
  defaultSupplierId: z.coerce.number().int().positive().optional(),
  defaultCostCenterId: z.coerce.number().int().positive().optional(),
  currency: z.string().optional(),
  lines: z.array(templateLineSchema).min(2, "القالب يحتاج سطرين على الأقل (مدين/دائن)"),
}).strict();

financeMemoryRouter.post(
  "/journal-templates",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createTemplateSchema.safeParse(req.body));
      if (b.defaultSupplierId) await assertSupplierInCompany(b.defaultSupplierId, scope.companyId);
      const { insertId } = await rawExecute(
        `INSERT INTO manual_journal_templates
           ("companyId",name,description,"defaultSupplierId","defaultCostCenterId",currency)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [scope.companyId, b.name.trim(), b.description ?? null,
         b.defaultSupplierId ?? null, b.defaultCostCenterId ?? null, b.currency ?? "SAR"],
      );
      assertInsert(insertId, "manual_journal_templates");
      let lineNo = 1;
      for (const ln of b.lines) {
        await rawExecute(
          `INSERT INTO manual_journal_template_lines
             ("companyId","templateId","lineNo","accountPurpose",side,amount,ratio,
              "requiredDimensions","defaultCostCenterId",description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
          [scope.companyId, insertId, lineNo++, ln.accountPurpose, ln.side,
           ln.amount ?? null, ln.ratio ?? null,
           ln.requiredDimensions ? JSON.stringify(ln.requiredDimensions) : null,
           ln.defaultCostCenterId ?? null, ln.description ?? null],
        );
      }
      const tpl = await loadManualJournalTemplate(scope.companyId, insertId);
      auditFromRequest(req, "finance.journal_template.created", "manual_journal_templates", insertId, {
        after: { name: b.name.trim(), lineCount: b.lines.length },
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "finance.journal_template.created", entity: "manual_journal_templates", entityId: insertId,
        name: b.name.trim(), details: JSON.stringify({ name: b.name.trim(), lineCount: b.lines.length }),
      }).catch((e) => logger.error(e, "finance-memory background task failed"));
      res.status(201).json(tpl);
    } catch (err) { handleRouteError(err, res, "Create journal template error:"); }
  },
);

const previewSchema = z.object({
  base: z.coerce.number().optional(),
  dimensions: z.record(z.string(), z.unknown()).optional(),
}).strict();

// Materialize a template against a runtime base + dimensions and report whether
// it is balanced / has all required dimensions. Returns purpose-tagged lines —
// the actual account resolution + posting happens through the financial engine
// in the manual-journal workspace (P11), never here.
financeMemoryRouter.post(
  "/journal-templates/:id/preview",
  authorize({ feature: "finance.journal", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const b = zodParse(previewSchema.safeParse(req.body ?? {}));
      const tpl = await loadManualJournalTemplate(scope.companyId, id);
      if (!tpl) throw new NotFoundError("قالب القيد غير موجود");
      const lines = materializeTemplateLines({ lines: tpl.lines, base: b.base, dimensions: b.dimensions });
      const verdict = isTemplateMaterializationPostable(lines);
      res.json(maskFields(req, { template: { id: tpl.id, name: tpl.name, currency: tpl.currency }, lines, ...verdict }));
    } catch (err) { handleRouteError(err, res, "Preview journal template error:"); }
  },
);
