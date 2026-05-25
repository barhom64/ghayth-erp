/**
 * templateResolver — finds the print template for a given (companyId, branchId,
 * entityType) tuple. Lookup order:
 *   1. Explicit branch assignment in print_template_assignments
 *   2. Company-wide assignment (branchId IS NULL) in print_template_assignments
 *   3. document_templates row marked isDefault for this entityType + company
 *   4. Seeded preset (companyId IS NULL, presetKey = 'classic') for the entityType
 *
 * The last step is guaranteed by migration 081_print_engine_seed.sql, so the
 * resolver never returns null for phase-1 entities.
 */

import { rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";
import type { PaperSize, PrintTemplate, TemplateMode } from "./types.js";

/** Safe wrapper — returns [] when the underlying query throws (table missing,
 *  column missing, etc). Lets resolveTemplate fall through to the next layer
 *  instead of bubbling a DB error to the caller. */
async function safeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    return await rawQuery<T>(sql, params);
  } catch (err) {
    logger.warn(err as Error, "[print/resolveTemplate] query failed, falling through");
    return [];
  }
}

interface TemplateRow {
  id: number;
  name: string | null;
  entityType: string | null;
  branchId: number | null;
  companyId: number | null;
  paperSize: string | null;
  mode: string | null;
  presetKey: string | null;
  htmlContent: string | null;
  layoutJson: unknown;
  cssOverrides: string | null;
  headerOverride: unknown;
  footerOverride: unknown;
  isThermal: boolean | null;
  version: number | null;
}

function toTemplate(row: TemplateRow): PrintTemplate {
  return {
    id: row.id,
    name: row.name ?? "",
    entityType: row.entityType,
    branchId: row.branchId,
    companyId: row.companyId,
    paperSize: (row.paperSize as PaperSize) ?? "A4",
    mode: (row.mode as TemplateMode) ?? "preset",
    presetKey: row.presetKey,
    htmlContent: row.htmlContent,
    layoutJson: row.layoutJson,
    cssOverrides: row.cssOverrides,
    headerOverride: row.headerOverride,
    footerOverride: row.footerOverride,
    isThermal: Boolean(row.isThermal),
    version: row.version ?? 1,
  };
}

export async function resolveTemplate(opts: {
  companyId: number;
  branchId: number | null;
  entityType: string;
  templateId?: number;
}): Promise<PrintTemplate | null> {
  const { companyId, branchId, entityType, templateId } = opts;

  if (templateId) {
    const rows = await safeQuery<TemplateRow>(
      `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
              "presetKey", "htmlContent", "layoutJson", "cssOverrides",
              "headerOverride", "footerOverride", "isThermal", "version"
       FROM document_templates WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
      [templateId]
    );
    if (rows[0]) return toTemplate(rows[0]);
  }

  // 1 & 2: assignments table (branch-specific, then company-wide)
  const assignment = await safeQuery<TemplateRow>(
    `SELECT t.id, t.name, t."entityType", t."branchId", t."companyId", t."paperSize", t."mode",
            t."presetKey", t."htmlContent", t."layoutJson", t."cssOverrides",
            t."headerOverride", t."footerOverride", t."isThermal", t."version"
     FROM print_template_assignments a
     JOIN document_templates t ON t.id = a."templateId" AND t."deletedAt" IS NULL
     WHERE a."companyId" = $1
       AND a."entityType" = $2
       AND a."isDefault" = true
       AND (a."branchId" = $3 OR a."branchId" IS NULL)
     ORDER BY (a."branchId" IS NOT NULL) DESC
     LIMIT 1`,
    [companyId, entityType, branchId]
  );
  if (assignment[0]) return toTemplate(assignment[0]);

  // 3: company default in document_templates
  const companyDefault = await safeQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE "companyId" = $1 AND "entityType" = $2 AND "isDefault" = true AND "isActive" = true AND "deletedAt" IS NULL
     ORDER BY "branchId" NULLS LAST, id DESC
     LIMIT 1`,
    [companyId, entityType]
  );
  if (companyDefault[0]) return toTemplate(companyDefault[0]);

  // 4: seeded preset (companyId IS NULL)
  const preset = await safeQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE "companyId" IS NULL AND "entityType" = $1 AND "presetKey" = 'classic' AND "deletedAt" IS NULL
     ORDER BY id ASC LIMIT 1`,
    [entityType]
  );
  if (preset[0]) return toTemplate(preset[0]);

  // 5: synthesized universal fallback — every entityType prints something
  // even if nobody seeded or designed a template for it. Renders the branch
  // letterhead, a sensible title, the entity fields as an info-grid, the
  // items table if present, and the branch footer.
  return BESPOKE_PRESETS[entityType]?.() ?? universalFallback(entityType);
}

// ─── Bespoke in-memory presets ──────────────────────────────────────────────
// A few entity shapes need richer HTML than the universal fallback can give —
// official letters need a freeform body, Umrah statement needs a ledger table
// with closing-balance footer, the daily run-sheet has three independent
// sections. We keep them inline (no DB row required) so the engine always has
// something tasteful to render even on a fresh install.

const BESPOKE_PRESETS: Record<string, () => PrintTemplate> = {
  official_letter: () => ({
    id: -2,
    name: "Letterhead — official letter",
    entityType: "official_letter",
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "letter_classic",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0 8px 0">{{entity.subject}}</h2>
<div class="meta-grid">
  <div><strong>رقم الخطاب:</strong> {{entity.id}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:18px 0;font-size:11pt;line-height:1.9;white-space:pre-wrap">{{entity.content}}</div>
<div class="signatures">
  <div>التوقيع<br/>____________________</div>
  <div>الختم الرسمي<br/>____________________</div>
</div>
{{branch.footer}}
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: false,
    version: 1,
  }),
  umrah_statement: () => ({
    id: -3,
    name: "Umrah — sub-agent statement",
    entityType: "umrah_statement",
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "umrah_statement_classic",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0 4px 0">كشف حساب وكيل فرعي — عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:12px">{{entity.subAgentName}} · {{entity.nuskCode}} · {{entity.rangeText}}</div>
<div class="meta-grid">
  <div><strong>الوكيل الفرعي:</strong> {{entity.subAgentName}}</div>
  <div><strong>رمز نسك:</strong> {{entity.nuskCode}}</div>
  <div><strong>شروط الدفع:</strong> {{entity.paymentTermsLabel}}</div>
  <div><strong>الرصيد الافتتاحي:</strong> {{entity.openingBalance}}</div>
</div>
{{entity.linesTable}}
<div class="totals">
  <div><strong>إجمالي المدين:</strong> {{entity.totalDebit}}</div>
  <div><strong>إجمالي الدائن:</strong> {{entity.totalCredit}}</div>
  <div class="grand"><strong>{{entity.closingBalanceLabel}}:</strong> {{entity.closingBalance}}</div>
</div>
{{branch.footer}}
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: false,
    version: 1,
  }),
  umrah_runsheet: () => ({
    id: -4,
    name: "Umrah — daily run-sheet",
    entityType: "umrah_runsheet",
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "umrah_runsheet_classic",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0 4px 0">كشف اليوم التشغيلي — عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:12px">تاريخ التشغيل: {{entity.date}}</div>
<div style="background:#f1f5f9;padding:8px 12px;border-radius:6px;margin-bottom:14px;text-align:center">
  وصول: {{entity.arrivalsCount}} &nbsp;|&nbsp; مغادرة: {{entity.departuresCount}} &nbsp;|&nbsp; متجاوزون: {{entity.overstaysCount}}
</div>
<h3 style="margin-top:14px">الوصول اليوم ({{entity.arrivalsCount}})</h3>
{{entity.arrivalsTable}}
<h3 style="margin-top:14px">المغادرة اليوم ({{entity.departuresCount}})</h3>
{{entity.departuresTable}}
<h3 style="margin-top:14px">المتجاوزون حالياً ({{entity.overstaysCount}})</h3>
{{entity.overstaysTable}}
{{branch.footer}}
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: false,
    version: 1,
  }),
  // A sales invoice with no DB-stored template used to fall through to
  // universalFallback, which printed only ref/status/id — no totals, no
  // client, no line breakdown. Users got an unusable document. This preset
  // gives a complete A4 invoice straight out of the box (header → buyer →
  // items table → totals → footer) using the {entity, items, client}
  // payload shape from dataLoader.loadInvoice.
  invoice: () => buildInvoicePreset(),
  sales_invoice: () => buildInvoicePreset(),
};

function buildInvoicePreset(): PrintTemplate {
  return {
    id: -5,
    name: "Invoice — classic A4",
    entityType: "invoice",
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "invoice_classic",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">فاتورة ضريبية</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Tax Invoice</div>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">العميل / Bill To</div>
      <div>{{client.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الضريبي: {{client.taxNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>المرجع:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>تاريخ الاستحقاق:</strong> {{entity.dueDate}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin-bottom:14px">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">البيان</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:70px">الكمية</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:100px">سعر الوحدة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">الضريبة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:110px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.description}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.vatAmount}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المجموع قبل الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.subtotal}} {{entity.currency}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">ضريبة القيمة المضافة ({{entity.vatRate}}%)</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.vatAmount}} {{entity.currency}}</td></tr>
  <tr style="background:#f1f5f9;font-weight:bold"><td style="padding:6px 8px;border:1px solid #cbd5e1">الإجمالي شامل الضريبة</td><td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المدفوع</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.paidAmount}} {{entity.currency}}</td></tr>
</table>
<div style="margin-top:18px;font-size:10pt;color:#475569">{{entity.notes}}</div>
{{system.verifyBlock}}
{{branch.footer}}
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: false,
    version: 1,
  };
}

/** In-memory template that works for any entityType. */
function universalFallback(entityType: string): PrintTemplate {
  return {
    id: -1,
    name: `Universal fallback — ${entityType}`,
    entityType,
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "universal",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${entityType}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{branch.footer}}
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: false,
    version: 1,
  };
}

export async function listTemplates(opts: {
  companyId: number;
  branchId?: number | null;
  entityType?: string;
}): Promise<PrintTemplate[]> {
  const where: string[] = [`("companyId" = $1 OR "companyId" IS NULL)`, `"deletedAt" IS NULL`];
  const params: unknown[] = [opts.companyId];
  if (opts.entityType) {
    params.push(opts.entityType);
    where.push(`"entityType" = $${params.length}`);
  }
  if (opts.branchId !== undefined) {
    if (opts.branchId === null) {
      where.push(`"branchId" IS NULL`);
    } else {
      params.push(opts.branchId);
      where.push(`("branchId" = $${params.length} OR "branchId" IS NULL)`);
    }
  }
  const rows = await safeQuery<TemplateRow>(
    `SELECT id, name, "entityType", "branchId", "companyId", "paperSize", "mode",
            "presetKey", "htmlContent", "layoutJson", "cssOverrides",
            "headerOverride", "footerOverride", "isThermal", "version"
     FROM document_templates
     WHERE ${where.join(" AND ")}
     ORDER BY "entityType" NULLS LAST, name`,
    params
  );
  return rows.map(toTemplate);
}
