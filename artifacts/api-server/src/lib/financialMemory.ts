/**
 * FIN-FINANCIAL-MEMORY-FOUNDATION — financial memory resolver layer.
 *
 * Codifies repeated manual financial entries into recallable memories
 * (supplier items #2235, supplier finance defaults, expense-category defaults,
 * manual journal templates). This layer returns MEMORY DATA ONLY — every
 * monetary line is tagged with an `accountPurpose` (text), and the caller MUST
 * pass each purpose through the central financial engine to derive the real GL
 * account. The memory NEVER decides a journal and NEVER returns an accountCode.
 *
 * All reads are company-scoped (tenant isolation): a memory of one company is
 * invisible to another.
 */
import { rawQuery } from "./rawdb.js";

export interface SupplierFinanceDefaults {
  supplierId: number;
  defaultPaymentMethod: string | null;
  defaultCurrency: string;
  defaultAccountPurpose: string | null;
  defaultCostCenterId: number | null;
}

export interface ExpenseCategoryMemory {
  categoryKey: string;
  accountPurpose: string | null;
  defaultTaxCodeId: number | null;
  defaultCostCenterId: number | null;
}

export interface ManualJournalTemplateLine {
  lineNo: number;
  accountPurpose: string;
  side: "debit" | "credit";
  amount: number | null;
  ratio: number | null;
  requiredDimensions: string[] | null;
  defaultCostCenterId: number | null;
  description: string | null;
}

export interface ManualJournalTemplate {
  id: number;
  name: string;
  description: string | null;
  defaultSupplierId: number | null;
  defaultCostCenterId: number | null;
  currency: string;
  lines: ManualJournalTemplateLine[];
}

/** Per-supplier finance defaults (payment/currency/purpose/cost-center). */
export async function getSupplierFinanceDefaults(
  companyId: number,
  supplierId: number,
): Promise<SupplierFinanceDefaults | null> {
  const [row] = await rawQuery<SupplierFinanceDefaults>(
    `SELECT "supplierId", "defaultPaymentMethod", "defaultCurrency",
            "defaultAccountPurpose", "defaultCostCenterId"
       FROM supplier_finance_defaults
      WHERE "companyId"=$1 AND "supplierId"=$2 AND "isActive"=true AND "deletedAt" IS NULL`,
    [companyId, supplierId],
  );
  return row ?? null;
}

/** Per-category expense defaults (purpose/tax/cost-center). */
export async function getExpenseCategoryMemory(
  companyId: number,
  categoryKey: string,
): Promise<ExpenseCategoryMemory | null> {
  const [row] = await rawQuery<ExpenseCategoryMemory>(
    `SELECT "categoryKey", "accountPurpose", "defaultTaxCodeId", "defaultCostCenterId"
       FROM expense_category_memory
      WHERE "companyId"=$1 AND "categoryKey"=$2 AND "isActive"=true AND "deletedAt" IS NULL`,
    [companyId, categoryKey],
  );
  return row ?? null;
}

/** Load a manual journal template (header + lines) for a company. */
export async function loadManualJournalTemplate(
  companyId: number,
  templateId: number,
): Promise<ManualJournalTemplate | null> {
  const [header] = await rawQuery<{
    id: number; name: string; description: string | null;
    defaultSupplierId: number | null; defaultCostCenterId: number | null; currency: string;
  }>(
    `SELECT id, name, description, "defaultSupplierId", "defaultCostCenterId", currency
       FROM manual_journal_templates
      WHERE id=$1 AND "companyId"=$2 AND "isActive"=true AND "deletedAt" IS NULL`,
    [templateId, companyId],
  );
  if (!header) return null;
  const lines = await rawQuery<ManualJournalTemplateLine>(
    `SELECT "lineNo", "accountPurpose", side, amount, ratio,
            "requiredDimensions", "defaultCostCenterId", description
       FROM manual_journal_template_lines
      WHERE "companyId"=$1 AND "templateId"=$2
      ORDER BY "lineNo" ASC`,
    [companyId, templateId],
  );
  return { ...header, lines };
}

export interface MaterializedLine {
  accountPurpose: string;
  side: "debit" | "credit";
  amount: number;
  costCenterId: number | null;
  requiredDimensions: string[];
  missingDimensions: string[];
  description: string | null;
}

/**
 * Resolve a template's lines against a runtime base + provided dimensions.
 * Returns purpose-tagged monetary lines — it does NOT resolve GL accounts
 * (the caller passes each `accountPurpose` through the financial engine) and
 * does NOT post. `ratio` lines become `round(ratio * base)`; `amount` lines
 * are used as-is. `missingDimensions` flags any `requiredDimensions` the
 * caller has not supplied (the caller blocks posting until empty).
 */
export function materializeTemplateLines(args: {
  lines: ManualJournalTemplateLine[];
  base?: number;
  dimensions?: Record<string, unknown>;
}): MaterializedLine[] {
  const { lines, base = 0, dimensions = {} } = args;
  return lines.map((ln) => {
    const amount =
      ln.amount != null
        ? Number(ln.amount)
        : ln.ratio != null
          ? Math.round(Number(ln.ratio) * base * 100) / 100
          : 0;
    const required = Array.isArray(ln.requiredDimensions) ? ln.requiredDimensions : [];
    const missing = required.filter((d) => {
      const v = (dimensions as Record<string, unknown>)[d];
      return v == null || v === "";
    });
    return {
      accountPurpose: ln.accountPurpose,
      side: ln.side,
      amount,
      costCenterId: ln.defaultCostCenterId,
      requiredDimensions: required,
      missingDimensions: missing,
      description: ln.description,
    };
  });
}

/** A materialized template is postable only if balanced and all dimensions present. */
export function isTemplateMaterializationPostable(lines: MaterializedLine[]): {
  balanced: boolean;
  missingDimensions: string[];
  postable: boolean;
} {
  const debit = lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0);
  const credit = lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0);
  const balanced = Math.round((debit - credit) * 100) === 0 && debit > 0;
  const missingDimensions = Array.from(new Set(lines.flatMap((l) => l.missingDimensions)));
  return { balanced, missingDimensions, postable: balanced && missingDimensions.length === 0 };
}
