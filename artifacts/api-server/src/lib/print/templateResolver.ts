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
  /** When the caller is printing a list view (entityId="list"), the
   *  bespoke single-entity preset (invoice, contract, …) doesn't apply
   *  — its `{{#each items}}` expects line-item shape, not row-of-list
   *  shape. The route layer flips this on when entityId === "list" so
   *  list exports get the universal preset's generic itemsTable. */
  asList?: boolean;
}): Promise<PrintTemplate | null> {
  const { companyId, branchId, entityType, templateId, asList } = opts;

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
  // List exports bypass the single-entity bespoke preset and go straight
  // to universal — the universal template's {{entity.itemsTable}}
  // auto-builds the table from arbitrary row shapes.
  if (asList) return universalFallback(entityType);
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
    name: "خطاب رسمي",
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
    name: "كشف حساب وكيل فرعي — عمرة",
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
    name: "كشف اليوم التشغيلي — عمرة",
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
  // Batch-1 bespoke presets — wire every common transactional document
  // to its own template so the printed page shows real fields from the
  // loader (party block, items table, totals, signatures) instead of
  // the universal letterhead-only fallback. Schemas verified against
  // db/schema_pre.sql, tokens match what dataLoader actually returns.
  payment_voucher: () => buildVoucherPreset("payment"),
  receipt_voucher: () => buildVoucherPreset("receipt"),
  purchase_order: () => buildPurchaseOrderPreset(),
  purchase_request: () => buildPurchaseRequestPreset(),
  goods_receipt: () => buildGoodsReceiptPreset(),
  journal_entry: () => buildJournalEntryPreset(),
  employee_contract: () => buildEmployeeContractPreset(),
  payslip: () => buildPayslipPreset(),
  leave_request: () => buildLeaveRequestPreset(),
  loan_request: () => buildLoanRequestPreset(),
  loan: () => buildLoanRequestPreset(),
  // Batch-2 bespoke presets — operational assets, profiles, contracts.
  vehicle: () => buildVehiclePreset(),
  fixed_asset: () => buildFixedAssetPreset(),
  employee: () => buildEmployeeProfilePreset(),
  employee_profile: () => buildEmployeeProfilePreset(),
  rental_contract: () => buildRentalContractPreset(),
  property_unit: () => buildPropertyUnitPreset(),
  legal_contract: () => buildLegalContractPreset(),
  legal_judgment: () => buildLegalCasePreset(),
  legal_session: () => buildLegalCasePreset(),
  overtime_request: () => buildOvertimeRequestPreset(),
  exit_request: () => buildExitRequestPreset(),
  fleet_trip: () => buildFleetTripPreset(),
};

function buildInvoicePreset(): PrintTemplate {
  return {
    id: -5,
    name: "فاتورة ضريبية — كلاسيك A4",
    entityType: "invoice",
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "invoice_classic",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">فاتورة ضريبية</h2>

<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">العميل</div>
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

// ─── Batch-1 bespoke presets ─────────────────────────────────────────────
// Helper to wrap a preset with the shared scaffolding so each builder
// stays focused on its body markup. Every preset opens with letterhead,
// closes with verify block + footer, and uses the same .meta-grid +
// table CSS that the universal preset uses (defined globally in the
// adapter wrapper).
function makePreset(opts: {
  id: number;
  presetKey: string;
  entityType: string;
  name: string;
  body: string;
}): PrintTemplate {
  return {
    id: opts.id,
    name: opts.name,
    entityType: opts.entityType,
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: opts.presetKey,
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
${opts.body}
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

function buildVoucherPreset(kind: "payment" | "receipt"): PrintTemplate {
  const title = kind === "payment" ? "سند صرف" : "سند قبض";
  const partyLabel = kind === "payment" ? "المستفيد" : "العميل";
  const partyToken = kind === "payment" ? "{{supplier.name}}" : "{{client.name}}";
  return makePreset({
    id: kind === "payment" ? -10 : -11,
    presetKey: kind === "payment" ? "payment_voucher_classic" : "receipt_voucher_classic",
    entityType: `${kind}_voucher`,
    name: title,
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">${title}</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم السند: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>${partyLabel}:</strong> ${partyToken}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>المبلغ:</strong> {{entity.amount}} {{entity.currency}}</div>
  <div><strong>طريقة الدفع:</strong> {{entity.paymentMethod}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">البيان</div>
  <div style="white-space:pre-wrap;font-size:11pt">{{entity.description}}</div>
</div>
<div class="signatures" style="margin-top:48px">
  <div>${kind === "payment" ? "المستلم" : "الدافع"}<br/><br/>____________________</div>
  <div>المحاسب<br/><br/>____________________</div>
  <div>الاعتماد<br/><br/>____________________</div>
</div>`,
  });
}

function buildPurchaseOrderPreset(): PrintTemplate {
  return makePreset({
    id: -12,
    presetKey: "purchase_order_classic",
    entityType: "purchase_order",
    name: "أمر شراء",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">أمر شراء</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الأمر: <span dir="ltr">{{entity.ref}}</span></div>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">المورّد</div>
      <div>{{vendor.name}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>المرجع:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>التسليم المتوقع:</strong> {{entity.expectedDelivery}}</div>
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
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:60px">الوحدة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">سعر الوحدة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:100px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.description}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.unit}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr style="background:#f1f5f9;font-weight:bold">
    <td style="padding:6px 8px;border:1px solid #cbd5e1">الإجمالي</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalAmount}}</td>
  </tr>
</table>
<div style="margin-top:14px;font-size:10pt;color:#475569">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>المُعِد<br/>____________________</div>
  <div>الاعتماد<br/>____________________</div>
</div>`,
  });
}

function buildPurchaseRequestPreset(): PrintTemplate {
  return makePreset({
    id: -13,
    presetKey: "purchase_request_classic",
    entityType: "purchase_request",
    name: "طلب شراء",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب شراء</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الطلب: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الإجمالي المقدّر:</strong> {{entity.totalAmount}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">البيان</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:70px">الكمية</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:60px">الوحدة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">السعر المقدّر</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:100px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.name}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.unit}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.estimatedPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div style="margin-top:14px;font-size:10pt;color:#475569">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>مقدّم الطلب<br/>____________________</div>
  <div>المراجِع<br/>____________________</div>
  <div>الاعتماد<br/>____________________</div>
</div>`,
  });
}

function buildGoodsReceiptPreset(): PrintTemplate {
  return makePreset({
    id: -14,
    presetKey: "goods_receipt_classic",
    entityType: "goods_receipt",
    name: "إيصال استلام بضاعة (GRN)",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">إيصال استلام بضاعة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الإيصال: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>تاريخ الاستلام:</strong> {{entity.receivedAt}}</div>
  <div><strong>أمر الشراء المرتبط:</strong> #{{entity.poId}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">الكمية المستلمة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">سعر الوحدة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:110px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.itemName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.receivedQty}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.lineTotal}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div style="margin-top:14px;font-size:10pt;color:#475569">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>المُستلم<br/>____________________</div>
  <div>المراجِع<br/>____________________</div>
  <div>أمين المخزن<br/>____________________</div>
</div>`,
  });
}

function buildJournalEntryPreset(): PrintTemplate {
  return makePreset({
    id: -15,
    presetKey: "journal_entry_classic",
    entityType: "journal_entry",
    name: "قيد محاسبي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">قيد محاسبي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم القيد: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
</div>
<div style="margin:12px 0;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11pt">{{entity.description}}</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:100px">رمز الحساب</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">البيان</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:110px">مدين</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:110px">دائن</th>
    </tr>
  </thead>
  <tbody>
    {{#each lines}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center" dir="ltr">{{this.accountCode}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.description}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.debit}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.credit}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div class="signatures" style="margin-top:36px">
  <div>المُعِد<br/>____________________</div>
  <div>المراجِع<br/>____________________</div>
  <div>المدير المالي<br/>____________________</div>
</div>`,
  });
}

function buildEmployeeContractPreset(): PrintTemplate {
  return makePreset({
    id: -16,
    presetKey: "employee_contract_classic",
    entityType: "employee_contract",
    name: "عقد عمل",
    body: `
<h1 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">عقد عمل</h1>

<div style="line-height:1.9;font-size:11pt;padding:0 8px">
  <p>إنه في تاريخ <strong>{{entity.startDate}}</strong> تم إبرام هذا العقد بين:</p>
  <p><strong>الطرف الأول:</strong> {{branch.companyName}} (الموظِّف)<br/>
     السجل التجاري: {{branch.crNumber}}<br/>
     الفرع: {{branch.branchName}} — {{branch.address}}</p>
  <p><strong>الطرف الثاني:</strong> {{employee.name}} (الموظَّف)<br/>
     الرقم الوظيفي: {{employee.empNumber}}</p>
</div>
<div class="meta-grid" style="margin-top:14px">
  <div><strong>نوع العقد:</strong> {{entity.contractType}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ البداية:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
  <div><strong>انتهاء التجربة:</strong> {{entity.probationEndDate}}</div>
  <div><strong>حالة التجربة:</strong> {{entity.probationStatus}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:11pt;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:48px">
  <div>الموظِّف<br/>الختم<br/><br/>____________________</div>
  <div>الموظَّف<br/>التوقيع<br/><br/>____________________</div>
</div>`,
  });
}

function buildPayslipPreset(): PrintTemplate {
  return makePreset({
    id: -17,
    presetKey: "payslip_classic",
    entityType: "payslip",
    name: "قسيمة راتب",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">قسيمة راتب</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">عن فترة: <span dir="ltr">{{entity.period}}</span></div>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>الفترة:</strong> {{entity.period}}</div>
      <div><strong>الفرع:</strong> {{branch.branchName}}</div>
      <div><strong>حالة الدفعة:</strong> {{entity.runStatus}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
  <thead>
    <tr style="background:#f1f5f9">
      <th colspan="2" style="border:1px solid #cbd5e1;padding:6px;font-size:11pt">الاستحقاقات</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">الراتب الأساسي</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.basic}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">بدل السكن</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.housingAllowance}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">بدل النقل</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.transportAllowance}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">العمل الإضافي</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.overtime}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">عمولات</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.commission}}</td></tr>
    <tr style="background:#f8fafc;font-weight:bold"><td style="border:1px solid #cbd5e1;padding:6px">إجمالي الاستحقاقات</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.grossSalary}}</td></tr>
  </tbody>
</table>
<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
  <thead>
    <tr style="background:#fef2f2"><th colspan="2" style="border:1px solid #cbd5e1;padding:6px;font-size:11pt">الاستقطاعات</th></tr>
  </thead>
  <tbody>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">التأمينات (GOSI)</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.gosi}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">تأخير</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.lateDeduction}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">غياب</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.absenceDeduction}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">مخالفات</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.violationDeduction}}</td></tr>
    <tr><td style="border:1px solid #cbd5e1;padding:6px">قسط قرض</td><td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{entity.loanDeduction}}</td></tr>
  </tbody>
</table>
<table style="width:100%;border-collapse:collapse;background:#ecfdf5">
  <tr><td style="padding:10px;border:1px solid #10b981;font-weight:bold;font-size:13pt">الصافي المستحق</td><td style="padding:10px;border:1px solid #10b981;text-align:left;font-weight:bold;font-size:13pt;color:#065f46">{{entity.netSalary}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المحاسب<br/>____________________</div>
</div>`,
  });
}

function buildLeaveRequestPreset(): PrintTemplate {
  return makePreset({
    id: -18,
    presetKey: "leave_request_classic",
    entityType: "leave_request",
    name: "طلب إجازة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب إجازة</h2>

<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>تاريخ الطلب:</strong> {{entity.createdAt}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<div class="meta-grid">
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ الانتهاء:</strong> {{entity.endDate}}</div>
  <div><strong>عدد الأيام:</strong> {{entity.days}}</div>
  <div><strong>نوع الإجازة:</strong> #{{entity.leaveTypeId}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">السبب</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
  <div>إدارة الموارد البشرية<br/>____________________</div>
</div>`,
  });
}

function buildLoanRequestPreset(): PrintTemplate {
  return makePreset({
    id: -19,
    presetKey: "loan_request_classic",
    entityType: "loan_request",
    name: "طلب قرض / سُلفة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب قرض / سُلفة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم القرض: <span dir="ltr">{{entity.loanNumber}}</span></div>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم القرض:</strong> {{entity.loanNumber}}</div>
      <div><strong>النوع:</strong> {{entity.loanType}}</div>
      <div><strong>الفرع:</strong> {{branch.branchName}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;width:50%">المبلغ الإجمالي</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.amount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">عدد الأقساط</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.installmentCount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">قيمة القسط الشهري</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.installmentAmount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">المسدّد حتى الآن</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.paidAmount}}</td></tr>
  <tr style="background:#fef9c3;font-weight:bold"><td style="border:1px solid #ca8a04;padding:8px">المتبقي</td><td style="border:1px solid #ca8a04;padding:8px;text-align:left">{{entity.remainingAmount}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
  <div>المالية<br/>____________________</div>
</div>`,
  });
}

function buildVehiclePreset(): PrintTemplate {
  return makePreset({
    id: -20, presetKey: "vehicle_classic", entityType: "vehicle",
    name: "بطاقة مركبة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة مركبة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Vehicle Card — <span dir="ltr">{{entity.plateNumber}}</span></div>
<div class="meta-grid">
  <div><strong>رقم اللوحة:</strong> <span dir="ltr">{{entity.plateNumber}}</span></div>
  <div><strong>الصانع:</strong> {{entity.make}}</div>
  <div><strong>الموديل:</strong> {{entity.model}}</div>
  <div><strong>السنة:</strong> {{entity.year}}</div>
  <div><strong>اللون:</strong> {{entity.color}}</div>
  <div><strong>نوع الوقود:</strong> {{entity.fuelType}}</div>
  <div><strong>الهيكل (VIN):</strong> <span dir="ltr">{{entity.vinNumber}}</span></div>
  <div><strong>العداد الحالي:</strong> {{entity.currentMileage}} كم</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold;width:50%">انتهاء التأمين</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.insuranceExpiry}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold">انتهاء الاستمارة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.registrationExpiry}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">آخر صيانة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.lastMaintenanceDate}}</td></tr>
</table>`,
  });
}

function buildFixedAssetPreset(): PrintTemplate {
  return makePreset({
    id: -21, presetKey: "fixed_asset_classic", entityType: "fixed_asset",
    name: "بطاقة أصل ثابت",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة أصل ثابت</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Fixed Asset Card — <span dir="ltr">{{entity.code}}</span></div>
<div class="meta-grid">
  <div><strong>اسم الأصل:</strong> {{entity.name}}</div>
  <div><strong>الرمز:</strong> {{entity.code}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>الموقع:</strong> {{entity.location}}</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;width:50%">تاريخ الشراء</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.purchaseDate}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">تكلفة الشراء</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.purchaseCost}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">القيمة التخريدية</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.salvageValue}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">العمر الإنتاجي (سنوات)</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.usefulLifeYears}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">طريقة الإهلاك</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.depreciationMethod}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#fef2f2;font-weight:bold">الإهلاك المتراكم</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.accumulatedDepreciation}}</td></tr>
  <tr style="background:#ecfdf5;font-weight:bold"><td style="border:1px solid #10b981;padding:10px;font-size:13pt">القيمة الدفترية الحالية</td><td style="border:1px solid #10b981;padding:10px;text-align:left;font-size:13pt;color:#065f46">{{entity.currentBookValue}}</td></tr>
</table>`,
  });
}

function buildEmployeeProfilePreset(): PrintTemplate {
  return makePreset({
    id: -22, presetKey: "employee_profile_classic", entityType: "employee_profile",
    name: "بطاقة موظف",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة موظف</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Employee Profile — <span dir="ltr">{{entity.empNumber}}</span></div>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>الاسم (إنجليزي):</strong> <span dir="ltr">{{entity.nameEn}}</span></div>
  <div><strong>الرقم الوظيفي:</strong> {{entity.empNumber}}</div>
  <div><strong>رقم الهوية:</strong> <span dir="ltr">{{entity.nationalId}}</span></div>
  <div><strong>الجنس:</strong> {{entity.gender}}</div>
  <div><strong>الجنسية:</strong> {{entity.nationality}}</div>
  <div><strong>تاريخ الميلاد:</strong> {{entity.dateOfBirth}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>البريد:</strong> <span dir="ltr">{{entity.email}}</span></div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>التوقيع<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
</div>`,
  });
}

function buildRentalContractPreset(): PrintTemplate {
  return makePreset({
    id: -23, presetKey: "rental_contract_classic", entityType: "rental_contract",
    name: "عقد إيجار",
    body: `
<h1 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">عقد إيجار</h1>
<div style="text-align:center;color:#475569;margin-bottom:18px">Lease Agreement</div>
<div style="line-height:1.9;font-size:11pt">
  <p>في يوم <strong>{{entity.startDate}}</strong> تم إبرام هذا العقد بين:</p>
  <p><strong>المؤجِّر:</strong> {{branch.companyName}} (الطرف الأول)<br/>
     السجل التجاري: {{branch.crNumber}}<br/>
     العنوان: {{branch.address}}</p>
  <p><strong>المستأجِر:</strong> {{entity.tenantName}} (الطرف الثاني)<br/>
     الهاتف: <span dir="ltr">{{entity.tenantPhone}}</span><br/>
     البريد: <span dir="ltr">{{entity.tenantEmail}}</span><br/>
     رقم الهوية: <span dir="ltr">{{entity.tenantIdNumber}}</span></p>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;width:50%">رقم الوحدة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">#{{entity.unitId}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">تاريخ البداية</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.startDate}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">تاريخ النهاية</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.endDate}}</td></tr>
  <tr style="background:#ecfdf5;font-weight:bold"><td style="border:1px solid #10b981;padding:10px;font-size:12pt">الإيجار الشهري</td><td style="border:1px solid #10b981;padding:10px;text-align:left;font-size:12pt;color:#065f46">{{entity.monthlyRent}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold">مبلغ التأمين</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.depositAmount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;font-weight:bold">يوم السداد الشهري</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.paymentDay}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;font-weight:bold">الحالة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.status}}</td></tr>
</table>
<div style="margin:18px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:48px">
  <div>المؤجِّر<br/>الختم<br/>____________________</div>
  <div>المستأجِر<br/>التوقيع<br/>____________________</div>
</div>`,
  });
}

function buildPropertyUnitPreset(): PrintTemplate {
  return makePreset({
    id: -24, presetKey: "property_unit_classic", entityType: "property_unit",
    name: "بطاقة وحدة عقارية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة وحدة عقارية</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Property Unit — <span dir="ltr">{{entity.unitNumber}}</span></div>
<div class="meta-grid">
  <div><strong>رقم الوحدة:</strong> {{entity.unitNumber}}</div>
  <div><strong>المبنى:</strong> {{entity.buildingName}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>الدور:</strong> {{entity.floor}}</div>
  <div><strong>المساحة:</strong> {{entity.area}} م²</div>
  <div><strong>غرف نوم:</strong> {{entity.bedrooms}}</div>
  <div><strong>دورات مياه:</strong> {{entity.bathrooms}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#ecfdf5;font-weight:bold;width:50%">الإيجار الشهري</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13pt;color:#065f46;font-weight:bold">{{entity.monthlyRent}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;font-weight:bold">العنوان</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.address}}</td></tr>
</table>`,
  });
}

function buildLegalContractPreset(): PrintTemplate {
  return makePreset({
    id: -25, presetKey: "legal_contract_classic", entityType: "legal_contract",
    name: "عقد قانوني",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">{{entity.title}}</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Legal Contract — <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>نوع العقد:</strong> {{entity.contractType}}</div>
  <div><strong>الطرف المتعاقد:</strong> {{entity.partyName}}</div>
  <div><strong>تواصل:</strong> <span dir="ltr">{{entity.partyContact}}</span></div>
  <div><strong>تاريخ البداية:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
  <div><strong>القيمة:</strong> {{entity.value}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div class="signatures" style="margin-top:48px">
  <div>الطرف الأول<br/>____________________</div>
  <div>الطرف الثاني<br/>____________________</div>
  <div>الشاهد<br/>____________________</div>
</div>`,
  });
}

function buildLegalCasePreset(): PrintTemplate {
  return makePreset({
    id: -26, presetKey: "legal_case_classic", entityType: "legal_case",
    name: "ملف قضية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">ملف قضية — {{entity.title}}</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Case File — <span dir="ltr">{{entity.caseNumber}}</span></div>
<div class="meta-grid">
  <div><strong>رقم القضية:</strong> {{entity.caseNumber}}</div>
  <div><strong>نوع القضية:</strong> {{entity.caseType}}</div>
  <div><strong>المحكمة:</strong> {{entity.court}}</div>
  <div><strong>تاريخ الرفع:</strong> {{entity.filingDate}}</div>
  <div><strong>الطرف الخصم:</strong> {{entity.opposingParty}}</div>
  <div><strong>المحامي:</strong> {{entity.lawyerName}}</div>
  <div><strong>الأولوية:</strong> {{entity.priority}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:12px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>`,
  });
}

function buildOvertimeRequestPreset(): PrintTemplate {
  return makePreset({
    id: -27, presetKey: "overtime_request_classic", entityType: "overtime_request",
    name: "طلب عمل إضافي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب عمل إضافي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Overtime Request — <span dir="ltr">{{entity.requestNumber}}</span></div>
<div class="meta-grid">
  <div><strong>الرقم:</strong> {{entity.requestNumber}}</div>
  <div><strong>التاريخ:</strong> {{entity.overtimeDate}}</div>
  <div><strong>من:</strong> {{entity.startTime}}</div>
  <div><strong>إلى:</strong> {{entity.endTime}}</div>
  <div><strong>عدد الساعات:</strong> {{entity.hours}}</div>
  <div><strong>السعر/الساعة:</strong> {{entity.hourlyRate}}</div>
  <div><strong>المضاعف:</strong> {{entity.multiplier}}</div>
  <div><strong>الإجمالي:</strong> {{entity.totalAmount}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">السبب</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
</div>`,
  });
}

function buildExitRequestPreset(): PrintTemplate {
  return makePreset({
    id: -28, presetKey: "exit_request_classic", entityType: "exit_request",
    name: "طلب إنهاء خدمة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب إنهاء خدمة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Exit Request — <span dir="ltr">{{entity.exitNumber}}</span></div>
<div class="meta-grid">
  <div><strong>الرقم:</strong> {{entity.exitNumber}}</div>
  <div><strong>نوع الإنهاء:</strong> {{entity.exitType}}</div>
  <div><strong>تاريخ الطلب:</strong> {{entity.requestDate}}</div>
  <div><strong>آخر يوم عمل:</strong> {{entity.lastWorkingDay}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">سبب الإنهاء</div>
  <div style="white-space:pre-wrap">{{entity.exitReason}}</div>
</div>
<div class="signatures" style="margin-top:48px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
  <div>الإدارة العليا<br/>____________________</div>
</div>`,
  });
}

function buildFleetTripPreset(): PrintTemplate {
  return makePreset({
    id: -29, presetKey: "fleet_trip_classic", entityType: "fleet_trip",
    name: "كشف رحلة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف رحلة أسطول</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">Fleet Trip — <span dir="ltr">#{{entity.id}}</span></div>
<div class="meta-grid">
  <div><strong>المركبة:</strong> #{{entity.vehicleId}}</div>
  <div><strong>السائق:</strong> #{{entity.driverId}}</div>
  <div><strong>العميل:</strong> #{{entity.clientId}}</div>
  <div><strong>المسافة:</strong> {{entity.distance}} كم</div>
  <div><strong>من:</strong> {{entity.fromLocation}}</div>
  <div><strong>إلى:</strong> {{entity.toLocation}}</div>
  <div><strong>وقت البداية:</strong> {{entity.startTime}}</div>
  <div><strong>وقت النهاية:</strong> {{entity.endTime}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>السائق<br/>____________________</div>
  <div>مسؤول العمليات<br/>____________________</div>
</div>`,
  });
}

/** In-memory template that works for any entityType. */
/** Map snake_case entityType → Arabic display label. Mirrors the labels
 *  the SPA uses on detail/list pages so the printed doc reads the same as
 *  the screen. Anything not in the map falls back to the raw entityType,
 *  which is rare now that every common type has a bespoke preset. */
const ARABIC_TITLES: Record<string, string> = {
  invoice: "فاتورة ضريبية", sales_invoice: "فاتورة مبيعات",
  credit_note: "إشعار دائن", pos_receipt: "إيصال نقطة بيع",
  receipt_voucher: "سند قبض", payment_voucher: "سند صرف",
  quotation: "عرض سعر", sales_order: "أمر بيع", delivery_note: "إذن تسليم",
  purchase_order: "أمر شراء", purchase_request: "طلب شراء",
  goods_receipt: "إيصال استلام بضاعة", journal_entry: "قيد محاسبي",
  account_statement: "كشف حساب",
  stock_transfer: "تحويل مخزون", stock_adjustment: "تسوية مخزون",
  item_barcode_label: "ملصق باركود",
  leave_request: "طلب إجازة", loan_request: "طلب قرض", loan: "قرض موظف",
  maintenance_request: "طلب صيانة", payroll: "كشف رواتب", payslip: "قسيمة راتب",
  official_letter: "خطاب رسمي", employee_contract: "عقد عمل",
  employee: "بطاقة موظف", employee_profile: "بطاقة موظف",
  overtime_request: "طلب عمل إضافي", exit_request: "طلب إنهاء خدمة",
  evaluation_360: "تقييم 360°", training: "دورة تدريبية",
  discipline_memo: "مذكرة إنذار", attendance: "سجل حضور",
  excuse: "عذر", performance_review: "تقييم أداء",
  vehicle: "بطاقة مركبة", fleet_trip: "كشف رحلة", driver: "سائق",
  fuel: "تعبئة وقود", fixed_asset: "بطاقة أصل ثابت",
  vendor: "بطاقة مورّد", supplier: "بطاقة مورّد",
  rental_contract: "عقد إيجار", property_unit: "بطاقة وحدة عقارية",
  tenant: "بطاقة مستأجر", building: "بطاقة مبنى",
  legal_contract: "عقد قانوني", legal_judgment: "ملف قضية",
  legal_session: "محضر جلسة",
  umrah_invoice: "فاتورة عمرة", umrah_statement: "كشف وكيل عمرة",
  umrah_runsheet: "كشف اليوم — عمرة", umrah_agent: "وكيل عمرة",
  umrah_sub_agent: "وكيل عمرة فرعي", umrah_pilgrim: "معتمر",
  umrah_package: "باقة عمرة", umrah_season: "موسم عمرة",
  umrah_transport: "نقل عمرة", umrah_penalty: "عقوبة عمرة",
  umrah_violation: "مخالفة عمرة",
  budget: "موازنة", custody: "عهدة", commitment: "التزام",
  receivable: "ذمم مدينة", recurring_journal: "قيد متكرر",
  project: "مشروع", project_costing: "تكلفة مشروع",
  task: "مهمة", request: "طلب", policy: "سياسة", risk: "مخاطرة",
  compliance: "التزام تنظيمي", audit_record: "سجل تدقيق",
  insurance: "وثيقة تأمين", traffic_violation: "مخالفة مرورية",
  shift: "وردية عمل", expense: "مصروف", transfer: "تحويل",
  job: "وظيفة شاغرة", store_order: "طلب متجر", store_product: "منتج متجر",
  support_ticket: "تذكرة دعم", warehouse_category: "تصنيف مستودع",
  owner: "بطاقة مالك", policy_detail: "تفاصيل سياسة",
};

function universalFallback(entityType: string): PrintTemplate {
  const title = ARABIC_TITLES[entityType] ?? entityType;
  return {
    id: -1,
    name: `قالب احتياطي — ${title}`,
    entityType,
    branchId: null,
    companyId: null,
    paperSize: "A4",
    mode: "preset",
    presetKey: "universal",
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${title}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.date}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
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
