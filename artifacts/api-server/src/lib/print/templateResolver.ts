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
  // Commercial documents that share the invoice loader shape but need
  // their own labelling/totals layout. Quotations and sales orders skip
  // paid/remaining (no payment yet); delivery notes hide pricing
  // (logistics doc); credit notes flip the sign of totals to negative.
  quotation: () => buildQuotationPreset(),
  sales_order: () => buildSalesOrderPreset(),
  delivery_note: () => buildDeliveryNotePreset(),
  credit_note: () => buildCreditNotePreset(),
  // Batch-1 bespoke presets — wire every common transactional document
  // to its own template so the printed page shows real fields from the
  // loader (party block, items table, totals, signatures) instead of
  // the universal letterhead-only fallback. Schemas verified against
  // db/schema_pre.sql, tokens match what dataLoader actually returns.
  payment_voucher: () => buildVoucherPreset("payment"),
  receipt_voucher: () => buildVoucherPreset("receipt"),
  customer_statement: () => buildCustomerStatementPreset(),
  vendor_statement: () => buildVendorStatementPreset(),
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
  transport_booking_confirmation: () => buildTransportBookingConfirmationPreset(),
  // Batch-3 bespoke presets — ops + HR + safety + tasks.
  maintenance_request: () => buildMaintenanceRequestPreset(),
  fuel: () => buildFuelLogPreset(),
  evaluation_360: () => buildEvaluationPreset(),
  training: () => buildTrainingPreset(),
  traffic_violation: () => buildTrafficViolationPreset(),
  expense: () => buildExpenseClaimPreset(),
  task: () => buildTaskPreset(),
  // Batch-4 — recruitment + warehouse labels.
  job_posting: () => buildJobPostingPreset(),
  job: () => buildJobPostingPreset(),
  item_barcode_label: () => buildBarcodeLabelPreset(),
  // Batch-5 — thermal POS + warehouse transactions + HR cards.
  pos_receipt: () => buildPosReceiptPreset(),
  stock_transfer: () => buildStockTransferPreset(),
  stock_adjustment: () => buildStockAdjustmentPreset(),
  inventory_count: () => buildInventoryCountPreset(),
  excuse_request: () => buildExcuseRequestPreset(),
  transfer: () => buildTransferRequestPreset(),
  attendance: () => buildAttendancePreset(),
  client: () => buildClientCardPreset(),
  // Batch-6 — master cards + niche transactions to close remaining gaps.
  building: () => buildBuildingCardPreset(),
  vendor: () => buildVendorCardPreset(),
  supplier: () => buildVendorCardPreset(),
  insurance_policy: () => buildInsurancePolicyPreset(),
  insurance: () => buildInsurancePolicyPreset(),
  store_order: () => buildStoreOrderPreset(),
  crm_opportunity: () => buildOpportunityPreset(),
  support_ticket: () => buildSupportTicketPreset(),
  umrah_pilgrim: () => buildUmrahPilgrimPreset(),
  umrah_invoice: () => buildUmrahInvoicePreset(),
  umrah_sales_invoice: () => buildUmrahInvoicePreset(),
  project: () => buildProjectCardPreset(),
  // Batch-7 — final coverage round (HR docs, finance docs, ops).
  discipline_memo: () => buildDisciplineMemoPreset(),
  fleet_maintenance: () => buildFleetMaintenancePreset(),
  salary_advance: () => buildSalaryAdvancePreset(),
  custody: () => buildCustodyPreset(),
  training_program: () => buildTrainingProgramPreset(),
  warehouse_product: () => buildWarehouseProductPreset(),
  store_product: () => buildWarehouseProductPreset(),
  budget: () => buildBudgetPreset(),
  governance_policy: () => buildGovernancePolicyPreset(),
  // Aliases — entityRegistry uses slightly different ids than dataLoader's
  // switch keys; wire them here so the resolver finds the same preset
  // regardless of which name the call site uses.
  evaluation_cycle: () => buildEvaluationPreset(),
  expense_claim: () => buildExpenseClaimPreset(),
  fuel_log: () => buildFuelLogPreset(),
  legal_case: () => buildLegalCasePreset(),
  payroll_run: () => buildPayrollRunPreset(),
  recurring_journal: () => buildJournalEntryPreset(),
  // Final config cards (shift roster, season setup, GL account card).
  shift: () => buildShiftCardPreset(),
  umrah_season: () => buildUmrahSeasonPreset(),
  chart_of_account: () => buildChartOfAccountPreset(),
  // Short-name aliases — SPA detail pages pass the short form (`policy`,
  // `ticket`, `opportunity`) while BESPOKE_PRESETS_KEYS are the long form
  // (`insurance_policy`, `support_ticket`, `crm_opportunity`). Without these
  // entries the resolver dropped to universalFallback which renders a
  // generic key/value grid instead of the bespoke layout. The dataLoader
  // FALLBACK_TABLE_MAP already routes the short name to the right table —
  // the template lookup needed the same alias treatment.
  policy: () => buildInsurancePolicyPreset(),
  ticket: () => buildSupportTicketPreset(),
  opportunity: () => buildOpportunityPreset(),
  season: () => buildUmrahSeasonPreset(),
  account: () => buildChartOfAccountPreset(),
  property: () => buildBuildingCardPreset(),
  unit: () => buildPropertyUnitPreset(),
  contract: () => buildRentalContractPreset(),
  product: () => buildWarehouseProductPreset(),
  pilgrim: () => buildUmrahPilgrimPreset(),
  mutamer: () => buildUmrahPilgrimPreset(),
  trip: () => buildFleetTripPreset(),
  customer: () => buildClientCardPreset(),
  // U-14-P1 — short-name aliases were wired to the pilgrim preset,
  // which is wrong (the agent / sub-agent card preset already exists
  // and renders the correct fields). The umrah_agent / umrah_sub_agent
  // long-name keys above are unchanged; this just fixes the SPA
  // detail-page paths that pass the short form.
  agent: () => buildUmrahAgentCardPreset(),
  sub_agent: () => buildUmrahSubAgentCardPreset(),
  overtime: () => buildOvertimeRequestPreset(),
  leave: () => buildLeaveRequestPreset(),
  excuse: () => buildExcuseRequestPreset(),
  maintenance: () => buildMaintenanceRequestPreset(),
  violation: () => buildTrafficViolationPreset(),
  voucher: () => buildVoucherPreset("receipt"),
  request: () => buildLeaveRequestPreset(),
  // Final batch — entityTypes used in detail pages that fell through to
  // universalFallback. payroll is the high-value one (HR prints these as
  // salary slips); the rest get the same bespoke render as the long form.
  payroll: () => buildPayrollRunPreset(),
  // Issue #1286 closing sweep — every remaining SPA entityType wired to a
  // real preset so no detail page prints "قالب احتياطي" anymore.
  tenant: () => buildTenantCardPreset(),
  owner: () => buildPropertyOwnerCardPreset(),
  driver: () => buildDriverCardPreset(),
  correspondence: () => buildCorrespondenceCardPreset(),
  audit: () => buildAuditLogPreset(),
  audit_record: () => buildAuditLogPreset(),
  warehouse_category: () => buildWarehouseCategoryPreset(),
  campaign: () => buildMarketingCampaignPreset(),
  compliance: () => buildCompliancePreset(),
  risk: () => buildRiskPreset(),
  application: () => buildJobApplicationPreset(),
  project_costing: () => buildProjectCostingPreset(),
  project_statement: () => buildProjectStatementPreset(),
  umrah_agent: () => buildUmrahAgentCardPreset(),
  umrah_sub_agent: () => buildUmrahSubAgentCardPreset(),
  umrah_package: () => buildUmrahPackagePreset(),
  umrah_penalty: () => buildUmrahPenaltyPreset(),
  umrah_transport: () => buildUmrahTransportPreset(),
  transport: () => buildUmrahTransportPreset(),
  umrah_violation: () => buildUmrahViolationPreset(),
  account_statement: () => buildAccountStatementPreset(),
  crm_lead: () => buildOpportunityPreset(),
  // Registry aliases — entries below cover entityRegistry rows whose
  // `print.hasTemplate=true` was set but the BESPOKE_PRESETS map didn't
  // expose the canonical id (a live-audit gap caught by the printable
  // contract test). Each one reuses the closest semantic preset so the
  // printed doc carries the same layout the rest of the domain uses.
  fleet_driver: () => buildDriverCardPreset(),
  legal_correspondence: () => buildCorrespondenceCardPreset(),
  // U-14-P1 — umrah_group was aliased to the pilgrim preset (wrong:
  // a group is a COLLECTION of pilgrims with its own meta). U-14-P3
  // now ships the dedicated builder so the resolver no longer falls
  // through to universalFallback — operators see the group meta block
  // + pilgrim manifest.
  umrah_group: () => buildUmrahGroupPreset(),
  //
  // U-14-P2 — `umrah_agent_invoice` used to re-use the buyer-side
  // sales-invoice preset (pilgrim/group meta block), which was the
  // wrong reading audience. It now points at its own builder carrying
  // agent + sub-agent + contract attribution.
  umrah_agent_invoice: () => buildUmrahAgentInvoicePreset(),
  // Cargo bill of lading — new bespoke preset wired with loadCargoManifest.
  cargo_manifest: () => buildCargoManifestPreset(),
  manifest: () => buildCargoManifestPreset(),
  // #2079 TA-T18-11 (TPL-02) — fleet rental delivery/return docket.
  // One preset covers both states; the loader's hasHandover /
  // hasReturn flags drive the conditional blocks inside the template.
  // entityType is `fleet_rental_contract` to disambiguate from the
  // existing `rental_contract` (property rental, the real-estate
  // tenant contract above).
  fleet_rental_contract: () => buildRentalHandoverReturnPreset(),
  fleet_rental_handover: () => buildRentalHandoverReturnPreset(),
  fleet_rental_return: () => buildRentalHandoverReturnPreset(),
  performance: () => buildEvaluationPreset(),
  performance_review: () => buildEvaluationPreset(),
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
<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
  <div style="flex:1">{{system.verifyBlock}}</div>
  <div style="text-align:center">
    {{entity.zatcaQr}}
    <div style="font-size:8pt;color:#64748b;margin-top:4px;font-weight:600">رمز QR — هيئة الزكاة والضريبة</div>
  </div>
</div>
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

function buildQuotationPreset(): PrintTemplate {
  return makePreset({
    id: -39, presetKey: "quotation_classic", entityType: "quotation",
    name: "عرض سعر",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">عرض سعر</h2>
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
      <div><strong>صالح حتى:</strong> {{entity.validUntil}}</div>
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
  <tr style="background:#fef9c3;font-weight:bold"><td style="padding:6px 8px;border:1px solid #ca8a04">الإجمالي المعروض</td><td style="padding:6px 8px;border:1px solid #ca8a04;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
</table>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:10pt">
  <div style="font-weight:bold;margin-bottom:4px">شروط العرض</div>
  <div style="white-space:pre-wrap">{{entity.terms}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>أعدّ العرض<br/>____________________</div>
  <div>مدير المبيعات<br/>____________________</div>
  <div>قبول العميل<br/>____________________</div>
</div>`,
  });
}

function buildSalesOrderPreset(): PrintTemplate {
  return makePreset({
    id: -40, presetKey: "sales_order_classic", entityType: "sales_order",
    name: "أمر بيع",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">أمر بيع</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">العميل</div>
      <div>{{client.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الضريبي: {{client.taxNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم الأمر:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>تاريخ التسليم:</strong> {{entity.deliveryDate}}</div>
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
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المجموع</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.subtotal}} {{entity.currency}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.vatAmount}} {{entity.currency}}</td></tr>
  <tr style="background:#f1f5f9;font-weight:bold"><td style="padding:6px 8px;border:1px solid #cbd5e1">الإجمالي</td><td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
</table>
<div style="margin-top:14px;font-size:10pt;color:#475569">
  <strong>عنوان التسليم:</strong> {{entity.deliveryAddress}}
</div>
<div style="margin-top:6px;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>أعدّ الأمر<br/>____________________</div>
  <div>المسؤول<br/>____________________</div>
</div>`,
  });
}

function buildDeliveryNotePreset(): PrintTemplate {
  return makePreset({
    id: -41, presetKey: "delivery_note_classic", entityType: "delivery_note",
    name: "إذن تسليم",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">إذن تسليم</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">المرسل إليه</div>
      <div>{{client.name}}</div>
      <div style="color:#64748b;font-size:9pt">{{entity.deliveryAddress}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم الإذن:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>المرجع الأمر:</strong> {{entity.salesOrderRef}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin-bottom:14px">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">البيان</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:100px">رقم الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:80px">الكمية</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:80px">الوحدة</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.description}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;font-family:monospace;text-align:center">{{this.sku}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center;font-weight:bold">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{this.unit}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div style="margin:18px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:10pt">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات النقل</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>المسلِّم<br/>____________________</div>
  <div>الناقل<br/>____________________</div>
  <div>المستلم<br/>____________________</div>
</div>`,
  });
}

function buildCreditNotePreset(): PrintTemplate {
  return makePreset({
    id: -42, presetKey: "credit_note_classic", entityType: "credit_note",
    name: "إشعار دائن",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #dc2626;color:#991b1b">إشعار دائن</h2>
<div style="text-align:center;color:#991b1b;margin-bottom:14px;font-size:11pt">— مرتجع/تخفيض على فاتورة سابقة —</div>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">العميل</div>
      <div>{{client.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الضريبي: {{client.taxNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم الإشعار:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>الفاتورة الأصلية:</strong> {{entity.originalInvoiceRef}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:10pt">
  <div style="font-weight:bold;margin-bottom:4px;color:#991b1b">سبب الإصدار</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:14px">
  <thead>
    <tr style="background:#fef2f2">
      <th style="border:1px solid #fecaca;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #fecaca;padding:6px;font-size:10pt;text-align:right">البيان</th>
      <th style="border:1px solid #fecaca;padding:6px;font-size:10pt;width:70px">الكمية</th>
      <th style="border:1px solid #fecaca;padding:6px;font-size:10pt;width:100px">سعر الوحدة</th>
      <th style="border:1px solid #fecaca;padding:6px;font-size:10pt;width:90px">الضريبة</th>
      <th style="border:1px solid #fecaca;padding:6px;font-size:10pt;width:110px">المرتجع</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #fecaca;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #fecaca;padding:6px;font-size:10pt">{{this.description}}</td>
      <td style="border:1px solid #fecaca;padding:6px;font-size:10pt;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #fecaca;padding:6px;font-size:10pt;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #fecaca;padding:6px;font-size:10pt;text-align:left">{{this.vatAmount}}</td>
      <td style="border:1px solid #fecaca;padding:6px;font-size:10pt;text-align:left;font-weight:bold;color:#991b1b">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr><td style="padding:4px 8px;border:1px solid #fecaca">إجمالي المرتجع قبل الضريبة</td><td style="padding:4px 8px;border:1px solid #fecaca;text-align:left">{{entity.subtotal}} {{entity.currency}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #fecaca">الضريبة المسترَدة</td><td style="padding:4px 8px;border:1px solid #fecaca;text-align:left">{{entity.vatAmount}} {{entity.currency}}</td></tr>
  <tr style="background:#fef2f2;font-weight:bold;color:#991b1b"><td style="padding:6px 8px;border:1px solid #fecaca">المبلغ المسترَد</td><td style="padding:6px 8px;border:1px solid #fecaca;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>أعدّ الإشعار<br/>____________________</div>
  <div>المعتمد<br/>____________________</div>
  <div>المالية<br/>____________________</div>
</div>`,
  });
}

// ─── End commercial document presets ─────────────────────────────────────

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

// Customer & vendor statements — formal كشف حساب layouts. The data loaders
// in reportLoaders.ts return:
//   entity: { id, ref, title, clientName|supplierName, clientPhone|supplierPhone,
//             clientVat|supplierTaxNumber, date, period,
//             openingBalance (customer only), totalDebit, totalCredit, closingBalance }
//   items:  [{ التاريخ, المرجع, البيان, مدين, دائن, الرصيد التراكمي }, ...]
//
// The Arabic-keyed items are handled by buildItemsTable via {{entity.itemsTable}}
// — it picks the first six non-id keys and renders them, so the Arabic columns
// flow through unchanged.
//
// Failure mode: when the loader can't find the client/supplier it returns
// entity.note. The {{entity.note}} fallback below surfaces that message instead
// of a blank ledger — saves the user from "the report just prints empty".
function buildCustomerStatementPreset(): PrintTemplate {
  return makePreset({
    id: -74,
    presetKey: "customer_statement_classic",
    entityType: "customer_statement",
    name: "كشف حساب عميل",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف حساب عميل</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.ref}}</div>
{{#if entity.note}}<div style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:14px;color:#991b1b">{{entity.note}}</div>{{/if}}
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">العميل</div>
      <div style="font-size:11pt">{{entity.clientName}}</div>
      <div style="font-size:10pt;color:#475569">{{entity.clientPhone}}</div>
      {{#if entity.clientVat}}<div style="font-size:10pt;color:#475569">الرقم الضريبي: <span dir="ltr">{{entity.clientVat}}</span></div>{{/if}}
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>الفترة:</strong> {{entity.period}}</div>
      <div><strong>طُبع في:</strong> {{entity.date}}</div>
      <div><strong>الفرع:</strong> {{branch.branchName}}</div>
    </td>
  </tr>
</table>
<table style="width:280px;margin-bottom:10px;border-collapse:collapse">
  <tr style="background:#f1f5f9">
    <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:bold">الرصيد الافتتاحي</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.openingBalance}}</td>
  </tr>
</table>
{{entity.itemsTable}}
<table style="width:320px;margin-right:auto;margin-left:0;margin-top:10px;border-collapse:collapse">
  <tr>
    <td style="padding:6px 8px;border:1px solid #cbd5e1">إجمالي المدين</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalDebit}}</td>
  </tr>
  <tr>
    <td style="padding:6px 8px;border:1px solid #cbd5e1">إجمالي الدائن</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalCredit}}</td>
  </tr>
  <tr style="background:#f1f5f9;font-weight:bold">
    <td style="padding:6px 8px;border:1px solid #cbd5e1">الرصيد الختامي</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.closingBalance}}</td>
  </tr>
</table>
<div style="margin-top:18px;font-size:10pt;color:#475569">
  كشف حساب آلي صادر عن نظام غيث — للاستفسارات يُرجى التواصل مع قسم المالية.
</div>`,
  });
}

function buildVendorStatementPreset(): PrintTemplate {
  return makePreset({
    id: -75,
    presetKey: "vendor_statement_classic",
    entityType: "vendor_statement",
    name: "كشف حساب مورّد",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف حساب مورّد</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.ref}}</div>
{{#if entity.note}}<div style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:14px;color:#991b1b">{{entity.note}}</div>{{/if}}
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">المورّد</div>
      <div style="font-size:11pt">{{entity.supplierName}}</div>
      <div style="font-size:10pt;color:#475569">{{entity.supplierPhone}}</div>
      {{#if entity.supplierTaxNumber}}<div style="font-size:10pt;color:#475569">الرقم الضريبي: <span dir="ltr">{{entity.supplierTaxNumber}}</span></div>{{/if}}
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>الفترة:</strong> {{entity.period}}</div>
      <div><strong>طُبع في:</strong> {{entity.date}}</div>
      <div><strong>الفرع:</strong> {{branch.branchName}}</div>
    </td>
  </tr>
</table>
{{entity.itemsTable}}
<table style="width:320px;margin-right:auto;margin-left:0;margin-top:10px;border-collapse:collapse">
  <tr>
    <td style="padding:6px 8px;border:1px solid #cbd5e1">إجمالي المدين</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalDebit}}</td>
  </tr>
  <tr>
    <td style="padding:6px 8px;border:1px solid #cbd5e1">إجمالي الدائن</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalCredit}}</td>
  </tr>
  <tr style="background:#f1f5f9;font-weight:bold">
    <td style="padding:6px 8px;border:1px solid #cbd5e1">الرصيد الختامي</td>
    <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.closingBalance}}</td>
  </tr>
</table>
<div style="margin-top:18px;font-size:10pt;color:#475569">
  كشف حساب آلي صادر عن نظام غيث — للاستفسارات يُرجى التواصل مع قسم المالية.
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

function buildPayrollRunPreset(): PrintTemplate {
  // Roster view — many rows, one per employee. Different from payslip
  // which is a single-employee detail document.
  return makePreset({
    id: -73, presetKey: "payroll_run_classic", entityType: "payroll_run",
    name: "كشف رواتب",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف رواتب</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم المسير: <span dir="ltr">{{entity.ref}}</span> — فترة {{entity.period}}</div>
<div class="meta-grid">
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
  <div><strong>تاريخ الإصدار:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>عدد الموظفين:</strong> {{entity.employeeCount}}</div>
  <div><strong>تاريخ السداد:</strong> {{entity.paidAt}}</div>
  <div><strong>المعتمد:</strong> {{entity.approvedByName}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">الموظف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:80px">الرقم</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">الأساسي</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">البدلات</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">الاستقطاعات</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">الصافي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.employeeName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:9pt;font-family:monospace;text-align:center">{{this.empNumber}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.baseSalary}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.totalAllowances}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.totalDeductions}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left;font-weight:bold">{{this.netSalary}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:320px;margin-right:auto;margin-left:0;border-collapse:collapse;margin-top:14px">
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:bold">إجمالي الأساسي</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalBaseSalary}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:bold">إجمالي البدلات</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalAllowances}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:bold">إجمالي الاستقطاعات</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.totalDeductions}}</td></tr>
  <tr style="background:#dcfce7;font-weight:bold;font-size:11pt"><td style="padding:6px 8px;border:1px solid #16a34a">إجمالي الصافي</td><td style="padding:6px 8px;border:1px solid #16a34a;text-align:left">{{entity.totalNet}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>المُعِد<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
  <div>المالية<br/>____________________</div>
  <div>الإدارة العليا<br/>____________________</div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">بطاقة مركبة — <span dir="ltr">{{entity.plateNumber}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">بطاقة أصل ثابت — <span dir="ltr">{{entity.code}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">بطاقة موظف — <span dir="ltr">{{entity.empNumber}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:18px">عقد إيجار وحدة عقارية</div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">وحدة عقارية — <span dir="ltr">{{entity.unitNumber}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">عقد قانوني — <span dir="ltr">{{entity.ref}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">ملف قضية — <span dir="ltr">{{entity.caseNumber}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">طلب عمل إضافي — <span dir="ltr">{{entity.requestNumber}}</span></div>
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
<div style="text-align:center;color:#475569;margin-bottom:14px">طلب إنهاء خدمة — <span dir="ltr">{{entity.exitNumber}}</span></div>
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

// Bill of lading — كل الحقول الأساسية لشحنة بضائع (شاحن، مستلم، مركبة،
// سائق، أوزان، قيم، أصناف، توقيعات). entityType="cargo_manifest" يربطه
// بـ loadCargoManifest في dataLoader.
function buildCargoManifestPreset(): PrintTemplate {
  return makePreset({
    id: -98, presetKey: "cargo_manifest_classic", entityType: "cargo_manifest",
    name: "بوليصة شحن",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بوليصة شحن بضائع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم البوليصة: <span dir="ltr">{{entity.manifestNumber}}</span></div>
<div class="meta-grid">
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
  <div><strong>تاريخ الإنشاء:</strong> {{entity.createdAt}}</div>
  <div><strong>الرحلة المرتبطة:</strong> #{{entity.fleetTripId}}</div>
  <div><strong>من:</strong> {{entity.fromLocation}}</div>
  <div><strong>إلى:</strong> {{entity.toLocation}}</div>
  <div><strong>تاريخ التحميل:</strong> {{entity.pickupDate}}</div>
  <div><strong>تاريخ التسليم:</strong> {{entity.deliveryDate}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">بيانات العميل</div>
  <div><strong>الاسم:</strong> {{entity.customerName}} {{entity.linkedCustomerName}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.customerPhone}}</span></div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">بيانات النقل</div>
  <div><strong>المركبة:</strong> <span dir="ltr">{{entity.plateNumber}}</span> — {{entity.vehicleMake}} {{entity.vehicleModel}}</div>
  <div><strong>السائق:</strong> {{entity.driverName}} — <span dir="ltr">{{entity.driverPhone}}</span></div>
  <div><strong>رقم رخصة السائق:</strong> <span dir="ltr">{{entity.driverLicense}}</span></div>
</div>
<h3 style="margin-top:14px">قائمة البضائع</h3>
{{entity.itemsTable}}
<div class="totals">
  <div><strong>الوزن الكلي:</strong> {{entity.totalWeight}} كغم</div>
  <div><strong>القيمة المُصرَّح بها:</strong> {{entity.totalDeclaredValue}}</div>
  <div><strong>قيمة الشحن (إيراد):</strong> {{entity.freightRevenue}}</div>
  <div class="grand"><strong>تكلفة الشحن:</strong> {{entity.freightCost}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الشاحن<br/>____________________</div>
  <div>السائق<br/>____________________</div>
  <div>المستلم<br/>____________________</div>
</div>`,
  });
}

// #2079 TA-T18-11 (TPL-02) — rental delivery/return docket.
//
// Single preset that renders the handover block when the contract
// has been handed over (hasHandover) and the return block when
// returned (hasReturn). All fields come from migration 293 columns
// the loader already projects: handoverOdometer / handoverFuelLevel
// / handoverNotes / handoverAt and the return-side counterparts.
//
// Why one preset, not two: the operator's mental model is "the
// rental docket" — they print it once at delivery, then update it
// at return. Two distinct presets would force the print engine to
// switch templates mid-lifecycle and double-track an
// administrative artefact that's conceptually one document.
function buildRentalHandoverReturnPreset(): PrintTemplate {
  return makePreset({
    id: -99, presetKey: "rental_handover_return_classic",
    entityType: "fleet_rental_contract",
    name: "محضر تسليم/إرجاع التأجير",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">محضر تسليم/إرجاع تأجير مركبة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">عقد التأجير: <span dir="ltr" style="font-family:monospace">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
  <div><strong>تاريخ بدء العقد:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ نهاية العقد:</strong> {{entity.endDate}}</div>
  <div><strong>السائق ضمن العقد:</strong> {{entity.withDriver}}</div>
  <div><strong>شروط الدفع:</strong> {{entity.paymentTerms}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">بيانات العميل</div>
  <div><strong>الاسم:</strong> {{entity.clientName}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.clientPhone}}</span></div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">بيانات المركبة المؤجَّرة</div>
  <div><strong>اللوحة:</strong> <span dir="ltr">{{entity.plateNumber}}</span> — {{entity.vehicleMake}} {{entity.vehicleModel}} ({{entity.vehicleYear}})</div>
  <div><strong>اللون:</strong> {{entity.vehicleColor}}</div>
  <div><strong>VIN:</strong> <span dir="ltr">{{entity.vinNumber}}</span></div>
</div>
{{#if entity.withDriver}}
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">بيانات السائق المرفق</div>
  <div><strong>الاسم:</strong> {{entity.driverName}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.driverPhone}}</span></div>
  <div><strong>رخصة:</strong> <span dir="ltr">{{entity.driverLicense}}</span></div>
</div>
{{/if}}
<div class="totals">
  <div><strong>السعر اليومي:</strong> {{entity.dailyRate}}</div>
  <div><strong>السعر الأسبوعي:</strong> {{entity.weeklyRate}}</div>
  <div><strong>السعر الشهري:</strong> {{entity.monthlyRate}}</div>
  <div class="grand"><strong>الضمان المؤمَّن:</strong> {{entity.securityDeposit}}</div>
</div>
{{#if entity.hasHandover}}
<div style="margin:14px 0;padding:12px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">إيصال التسليم</div>
  <div><strong>تاريخ التسليم:</strong> {{entity.handoverAt}}</div>
  <div><strong>قراءة العداد عند التسليم (كم):</strong> {{entity.handoverOdometer}}</div>
  <div><strong>مستوى الوقود عند التسليم:</strong> {{entity.fuelLevelPct}}%</div>
  {{#if entity.handoverNotes}}
  <div><strong>ملاحظات التسليم:</strong></div>
  <div style="white-space:pre-wrap">{{entity.handoverNotes}}</div>
  {{/if}}
</div>
{{/if}}
{{#if entity.hasReturn}}
<div style="margin:14px 0;padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">محضر الإرجاع</div>
  <div><strong>تاريخ الإرجاع:</strong> {{entity.returnedAt}}</div>
  <div><strong>تاريخ الانتهاء الفعلي:</strong> {{entity.actualEndDate}}</div>
  <div><strong>قراءة العداد عند الإرجاع (كم):</strong> {{entity.returnOdometer}}</div>
  <div><strong>مستوى الوقود عند الإرجاع:</strong> {{entity.returnFuelLevelPct}}%</div>
  <div><strong>مبلغ التجاوز:</strong> {{entity.overageAmount}}</div>
  {{#if entity.returnNotes}}
  <div><strong>ملاحظات الإرجاع:</strong></div>
  <div style="white-space:pre-wrap">{{entity.returnNotes}}</div>
  {{/if}}
</div>
{{/if}}
{{#if entity.notes}}
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات العقد</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>
{{/if}}
<div class="signatures" style="margin-top:36px">
  <div>المؤجِّر<br/>____________________</div>
  <div>المستأجِر<br/>____________________</div>
</div>`,
  });
}

// #1812 — booking confirmation (user's gap #10). Customer-facing
// document with QR for pickup/scan verification. The loader
// (loadTransportBookingConfirmation) prerenders legsHtml + dispatchHtml
// + qrDataUrl so the preset stays declarative.
function buildTransportBookingConfirmationPreset(): PrintTemplate {
  return makePreset({
    id: -110, presetKey: "transport_booking_confirmation_classic",
    entityType: "transport_booking_confirmation",
    name: "تأكيد حجز نقل",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">تأكيد حجز نقل</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الحجز: <span dir="ltr" style="font-family:monospace">{{entity.bookingNumber}}</span></div>

{{#if entity.qrDataUrl}}
<div style="float:left;margin:0 0 12px 12px;text-align:center">
  <img src="{{entity.qrDataUrl}}" alt="QR" style="width:120px;height:120px;border:1px solid #e2e8f0;padding:4px" />
  <div style="font-size:10px;color:#475569;margin-top:4px">امسح للتحقق</div>
</div>
{{/if}}

<div class="meta-grid">
  <div><strong>العميل:</strong> {{entity.customerName}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.customerPhone}}</span></div>
  <div><strong>نوع الخدمة:</strong> {{entity.transportServiceType}}</div>
  <div><strong>المصدر:</strong> {{entity.bookingSource}}</div>
  <div><strong>عدد الركاب:</strong> {{entity.passengerCount}}</div>
  <div><strong>مجموعة عمرة:</strong> {{entity.umrahGroupId}}</div>
  <div><strong>تاريخ التحميل:</strong> {{entity.requestedPickupDate}} {{entity.requestedPickupTime}}</div>
  <div><strong>تاريخ التسليم:</strong> {{entity.requestedDeliveryDate}} {{entity.requestedDeliveryTime}}</div>
</div>

{{#if entity.flightNumber}}
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">بيانات العمرة</div>
  <div><strong>رقم الرحلة:</strong> <span dir="ltr">{{entity.flightNumber}}</span></div>
  <div><strong>الفندق:</strong> {{entity.hotelName}}</div>
  <div><strong>المشرف:</strong> {{entity.supervisorName}} <span dir="ltr">({{entity.supervisorPhone}})</span></div>
</div>
{{/if}}

<h3 style="margin-top:14px">مقاطع المسار</h3>
{{{entity.legsHtml}}}

<h3 style="margin-top:14px">المركبات والسائقون المُسنَدون</h3>
{{{entity.dispatchHtml}}}

{{#if entity.notes}}
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>
{{/if}}

<div style="margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:10px;color:#64748b;text-align:center">
  رمز التحقق: <span style="font-family:monospace">{{entity.qrPayload}}</span>
</div>`,
  });
}

function buildFleetTripPreset(): PrintTemplate {
  return makePreset({
    id: -29, presetKey: "fleet_trip_classic", entityType: "fleet_trip",
    name: "كشف رحلة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف رحلة أسطول</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رحلة أسطول — <span dir="ltr">#{{entity.id}}</span></div>
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

function buildMaintenanceRequestPreset(): PrintTemplate {
  return makePreset({
    id: -30, presetKey: "maintenance_request_classic", entityType: "maintenance_request",
    name: "طلب صيانة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب صيانة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم البلاغ: #{{entity.id}}</div>
<div class="meta-grid">
  <div><strong>الوحدة:</strong> #{{entity.unitId}}</div>
  <div><strong>المستأجر:</strong> {{entity.tenantName}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>الأولوية:</strong> {{entity.priority}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الطلب:</strong> {{entity.createdAt}}</div>
  <div><strong>الفنّي المُكلّف:</strong> #{{entity.assignedTo}}</div>
  <div><strong>تاريخ الإنهاء:</strong> {{entity.completedAt}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">وصف العطل</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold;width:50%">التكلفة المقدّرة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.estimatedCost}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#ecfdf5;font-weight:bold">التكلفة الفعلية</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:bold;color:#065f46">{{entity.actualCost}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>مقدّم البلاغ<br/>____________________</div>
  <div>الفنّي<br/>____________________</div>
  <div>الإدارة<br/>____________________</div>
</div>`,
  });
}

function buildFuelLogPreset(): PrintTemplate {
  return makePreset({
    id: -31, presetKey: "fuel_log_classic", entityType: "fuel",
    name: "إيصال تعبئة وقود",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">إيصال تعبئة وقود</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم العملية: #{{entity.id}}</div>
<div class="meta-grid">
  <div><strong>المركبة:</strong> #{{entity.vehicleId}}</div>
  <div><strong>السائق:</strong> #{{entity.driverId}}</div>
  <div><strong>التاريخ:</strong> {{entity.fuelDate}}</div>
  <div><strong>المحطّة:</strong> {{entity.stationName}}</div>
  <div><strong>عداد المركبة:</strong> {{entity.mileageAtFuel}} كم</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;width:50%">عدد اللترات</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.liters}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">السعر/اللتر</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.costPerLiter}}</td></tr>
  <tr style="background:#ecfdf5;font-weight:bold"><td style="border:1px solid #10b981;padding:10px;font-size:13pt">الإجمالي</td><td style="border:1px solid #10b981;padding:10px;text-align:left;font-size:13pt;color:#065f46">{{entity.totalCost}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>السائق<br/>____________________</div>
  <div>أمين الأسطول<br/>____________________</div>
</div>`,
  });
}

function buildEvaluationPreset(): PrintTemplate {
  return makePreset({
    id: -32, presetKey: "evaluation_classic", entityType: "evaluation_360",
    name: "تقييم 360°",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">تقييم أداء 360°</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">دورة تقييم — {{entity.period}}</div>
<div class="meta-grid">
  <div><strong>الموظف:</strong> #{{entity.employeeId}}</div>
  <div><strong>البادئ:</strong> #{{entity.initiatorId}}</div>
  <div><strong>الفترة:</strong> {{entity.period}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ البداية:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
</div>`,
  });
}

function buildTrainingPreset(): PrintTemplate {
  return makePreset({
    id: -33, presetKey: "training_classic", entityType: "training",
    name: "دورة تدريبية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">{{entity.title}}</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">دورة تدريبية — {{entity.type}}</div>
<div class="meta-grid">
  <div><strong>اسم الدورة:</strong> {{entity.title}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>الجهة المقدِّمة:</strong> {{entity.provider}}</div>
  <div><strong>عدد الساعات:</strong> {{entity.hours}}</div>
  <div><strong>تاريخ البداية:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>المدرّب<br/>____________________</div>
  <div>منسّق التدريب<br/>____________________</div>
</div>`,
  });
}

function buildTrafficViolationPreset(): PrintTemplate {
  return makePreset({
    id: -34, presetKey: "traffic_violation_classic", entityType: "traffic_violation",
    name: "مخالفة مرورية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">مخالفة مرورية</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم المخالفة: <span dir="ltr">{{entity.violationNumber}}</span></div>
<div class="meta-grid">
  <div><strong>المركبة:</strong> #{{entity.vehicleId}}</div>
  <div><strong>السائق:</strong> #{{entity.driverId}}</div>
  <div><strong>نوع المخالفة:</strong> {{entity.violationType}}</div>
  <div><strong>تاريخ المخالفة:</strong> {{entity.violationDate}}</div>
  <div><strong>الموقع:</strong> {{entity.location}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr style="background:#fef2f2;font-weight:bold"><td style="border:1px solid #fecaca;padding:10px;font-size:13pt;width:50%">قيمة الغرامة</td><td style="border:1px solid #fecaca;padding:10px;text-align:left;font-size:13pt;color:#991b1b">{{entity.fineAmount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">تاريخ السداد</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.paidAt}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;font-weight:bold">السدّاد</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">#{{entity.paidBy}}</td></tr>
</table>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildExpenseClaimPreset(): PrintTemplate {
  return makePreset({
    id: -35, presetKey: "expense_claim_classic", entityType: "expense",
    name: "مطالبة نفقات",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">{{entity.title}}</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم المطالبة: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>العنوان:</strong> {{entity.title}}</div>
  <div><strong>الموظف:</strong> #{{entity.employeeId}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>تاريخ المصروف:</strong> {{entity.expenseDate}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>اعتُمد من:</strong> #{{entity.approvedBy}}</div>
  <div><strong>تاريخ السداد:</strong> {{entity.paidAt}}</div>
</div>
<table style="width:100%;margin-top:14px;border-collapse:collapse">
  <tr style="background:#ecfdf5;font-weight:bold"><td style="border:1px solid #10b981;padding:10px;font-size:13pt;width:50%">المبلغ المطلوب</td><td style="border:1px solid #10b981;padding:10px;text-align:left;font-size:13pt;color:#065f46">{{entity.amount}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير<br/>____________________</div>
  <div>المالية<br/>____________________</div>
</div>`,
  });
}

function buildTaskPreset(): PrintTemplate {
  return makePreset({
    id: -36, presetKey: "task_classic", entityType: "task",
    name: "بطاقة مهمة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">{{entity.title}}</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">بطاقة مهمة — #{{entity.id}}</div>
<div class="meta-grid">
  <div><strong>العنوان:</strong> {{entity.title}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>الأولوية:</strong> {{entity.priority}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>مكلَّف:</strong> #{{entity.assignedTo}}</div>
  <div><strong>العميل:</strong> #{{entity.clientId}}</div>
  <div><strong>تاريخ الإنشاء:</strong> {{entity.createdAt}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>`,
  });
}

function buildJobPostingPreset(): PrintTemplate {
  return makePreset({
    id: -37, presetKey: "job_posting_classic", entityType: "job_posting",
    name: "إعلان وظيفي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">إعلان وظيفي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.title}}</div>
<div class="meta-grid">
  <div><strong>المسمى الوظيفي:</strong> {{entity.title}}</div>
  <div><strong>الإدارة:</strong> {{entity.department}}</div>
  <div><strong>الموقع:</strong> {{entity.location}}</div>
  <div><strong>نوع التوظيف:</strong> {{entity.type}}</div>
  <div><strong>مستوى الخبرة:</strong> {{entity.experienceLevel}}</div>
  <div><strong>عدد الشواغر:</strong> {{entity.vacancies}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الإقفال:</strong> {{entity.closingDate}}</div>
  <div><strong>الحد الأدنى للراتب:</strong> {{entity.salaryMin}}</div>
  <div><strong>الحد الأعلى للراتب:</strong> {{entity.salaryMax}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف الوظيفي</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المتطلبات</div>
  <div style="white-space:pre-wrap">{{entity.requirements}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المهارات المطلوبة</div>
  <div style="white-space:pre-wrap">{{entity.skills}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المؤهلات العلمية</div>
  <div style="white-space:pre-wrap">{{entity.education}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fdf2f8;border:1px solid #fbcfe8;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المزايا</div>
  <div style="white-space:pre-wrap">{{entity.benefits}}</div>
</div>`,
  });
}

function buildBarcodeLabelPreset(): PrintTemplate {
  return makePreset({
    id: -38, presetKey: "item_barcode_label_classic", entityType: "item_barcode_label",
    name: "ملصق باركود صنف",
    body: `
<div class="label-doc">
  <div class="l-name">{{entity.name}}</div>
  <div class="l-sku">SKU: <span dir="ltr">{{entity.sku}}</span></div>
  <div class="l-barcode" dir="ltr">*{{entity.barcode}}*</div>
  <div class="l-sku" dir="ltr">{{entity.barcode}}</div>
  <div class="l-price">{{entity.price}}</div>
</div>`,
  });
}

// ─── Batch-5 presets ─────────────────────────────────────────────────────

function buildPosReceiptPreset(): PrintTemplate {
  // Thermal 80mm POS receipt. Doesn't go through makePreset because it
  // intentionally skips the A4 letterhead/footer block.
  return {
    id: -43,
    name: "إيصال نقطة بيع",
    entityType: "pos_receipt",
    branchId: null,
    companyId: null,
    paperSize: "THERMAL_80",
    mode: "preset",
    presetKey: "pos_receipt_thermal",
    htmlContent: `<div class="thermal-doc" style="width:78mm;font-family:Tahoma,monospace;font-size:9pt;line-height:1.3">
  <div style="text-align:center;font-weight:bold;font-size:11pt;margin-bottom:2mm">{{branch.companyName}}</div>
  <div style="text-align:center;font-size:8pt;margin-bottom:2mm">{{branch.branchName}}</div>
  <div style="text-align:center;font-size:8pt;margin-bottom:2mm">الرقم الضريبي: <span dir="ltr">{{branch.taxNumber}}</span></div>
  <div style="border-top:1px dashed #000;margin:2mm 0"></div>
  <div style="text-align:center;font-weight:bold;font-size:10pt">إيصال نقطة بيع</div>
  <div style="text-align:center;font-size:8pt;margin-bottom:2mm">رقم: {{entity.ref}}</div>
  <div style="font-size:8pt;margin-bottom:2mm">التاريخ: {{entity.createdAt}}</div>
  <div style="font-size:8pt;margin-bottom:2mm">الكاشير: {{entity.cashierName}}</div>
  <div style="border-top:1px dashed #000;margin:2mm 0"></div>
  <table style="width:100%;font-size:8pt;border-collapse:collapse">
    <thead><tr><th style="text-align:right;padding:1mm">البيان</th><th style="width:8mm;text-align:center">كمية</th><th style="width:18mm;text-align:left">إجمالي</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr>
        <td style="padding:0.5mm 1mm">{{this.description}}</td>
        <td style="text-align:center">{{this.quantity}}</td>
        <td style="text-align:left">{{this.totalPrice}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div style="border-top:1px dashed #000;margin:2mm 0"></div>
  <div style="display:flex;justify-content:space-between;font-size:8pt"><span>قبل الضريبة</span><span>{{entity.subtotal}}</span></div>
  <div style="display:flex;justify-content:space-between;font-size:8pt"><span>الضريبة ({{entity.vatRate}}%)</span><span>{{entity.vatAmount}}</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:10pt;border-top:1px solid #000;padding-top:1mm;margin-top:1mm"><span>الإجمالي</span><span>{{entity.total}} {{entity.currency}}</span></div>
  <div style="display:flex;justify-content:space-between;font-size:8pt"><span>المدفوع</span><span>{{entity.paidAmount}}</span></div>
  <div style="display:flex;justify-content:space-between;font-size:8pt"><span>الباقي</span><span>{{entity.changeAmount}}</span></div>
  <div style="border-top:1px dashed #000;margin:2mm 0"></div>
  <div style="text-align:center;font-size:7pt;margin-top:2mm">{{system.verifyQr}}</div>
  <div style="text-align:center;font-size:7pt;margin-top:2mm">شكراً لزيارتكم</div>
</div>`,
    layoutJson: null,
    cssOverrides: null,
    headerOverride: null,
    footerOverride: null,
    isThermal: true,
    version: 1,
  };
}

function buildStockTransferPreset(): PrintTemplate {
  return makePreset({
    id: -44, presetKey: "stock_transfer_classic", entityType: "stock_transfer",
    name: "تحويل مخزون",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سند تحويل مخزون</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم السند: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>من مستودع:</strong> {{entity.fromWarehouseName}}</div>
  <div><strong>إلى مستودع:</strong> {{entity.toWarehouseName}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>السبب:</strong> {{entity.reason}}</div>
  <div><strong>أنشأ التحويل:</strong> {{entity.createdByName}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:right">الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:110px">رقم الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:90px">الكمية</th>
      <th style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;width:80px">الوحدة</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.productName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-family:monospace;text-align:center">{{this.sku}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.unit}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div class="signatures" style="margin-top:36px">
  <div>أمين المستودع المُصدِر<br/>____________________</div>
  <div>الناقل<br/>____________________</div>
  <div>أمين المستودع المستلِم<br/>____________________</div>
</div>`,
  });
}

function buildStockAdjustmentPreset(): PrintTemplate {
  return makePreset({
    id: -45, presetKey: "stock_adjustment_classic", entityType: "stock_adjustment",
    name: "تسوية مخزون",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سند تسوية مخزون</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم السند: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>المستودع:</strong> {{entity.warehouseName}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>نوع التسوية:</strong> {{entity.adjustmentType}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>أنشأ التسوية:</strong> {{entity.createdByName}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">سبب التسوية</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;text-align:right">الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:90px">الكمية القديمة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:90px">الكمية الجديدة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:90px">الفرق</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.productName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.oldQuantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.newQuantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold">{{this.variance}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div class="signatures" style="margin-top:36px">
  <div>أمين المستودع<br/>____________________</div>
  <div>المراجع<br/>____________________</div>
  <div>المدير المالي<br/>____________________</div>
</div>`,
  });
}

function buildInventoryCountPreset(): PrintTemplate {
  return makePreset({
    id: -46, presetKey: "inventory_count_classic", entityType: "inventory_count",
    name: "كشف جرد",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف جرد مخزون</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الجرد: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>المستودع:</strong> {{entity.warehouseName}}</div>
  <div><strong>تاريخ الجرد:</strong> {{entity.countDate}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>عدد الأصناف:</strong> {{entity.lineCount}}</div>
  <div><strong>المسؤول:</strong> {{entity.assigneeName}}</div>
  <div><strong>المعتمد:</strong> {{entity.approvedByName}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;text-align:right">الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:90px">رقم الصنف</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">المتوقع</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">العدّ الفعلي</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">الفرق</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.productName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;font-family:monospace;text-align:center">{{this.sku}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.expectedQty}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.actualQty}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold">{{this.variance}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div class="signatures" style="margin-top:36px">
  <div>القائم بالجرد<br/>____________________</div>
  <div>أمين المستودع<br/>____________________</div>
  <div>المراجع<br/>____________________</div>
</div>`,
  });
}

function buildExcuseRequestPreset(): PrintTemplate {
  return makePreset({
    id: -47, presetKey: "excuse_request_classic", entityType: "excuse_request",
    name: "طلب استئذان",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب استئذان</h2>
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
  <div><strong>تاريخ الاستئذان:</strong> {{entity.excuseDate}}</div>
  <div><strong>من ساعة:</strong> {{entity.startTime}}</div>
  <div><strong>إلى ساعة:</strong> {{entity.endTime}}</div>
  <div><strong>عدد الساعات:</strong> {{entity.hours}}</div>
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

function buildTransferRequestPreset(): PrintTemplate {
  return makePreset({
    id: -48, presetKey: "transfer_request_classic", entityType: "transfer",
    name: "طلب نقل",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب نقل وظيفي</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>تاريخ الطلب:</strong> {{entity.createdAt}}</div>
      <div><strong>تاريخ النفاذ:</strong> {{entity.effectiveDate}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold">من قسم</td>
    <td style="border:1px solid #cbd5e1;padding:8px">{{entity.fromDepartment}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#dcfce7;font-weight:bold">إلى قسم</td>
    <td style="border:1px solid #cbd5e1;padding:8px">{{entity.toDepartment}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold">من فرع</td>
    <td style="border:1px solid #cbd5e1;padding:8px">{{entity.fromBranch}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#dcfce7;font-weight:bold">إلى فرع</td>
    <td style="border:1px solid #cbd5e1;padding:8px">{{entity.toBranch}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold">المسمى الحالي</td>
    <td style="border:1px solid #cbd5e1;padding:8px">{{entity.currentJobTitle}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#dcfce7;font-weight:bold">المسمى الجديد</td>
    <td style="border:1px solid #cbd5e1;padding:8px">{{entity.newJobTitle}}</td>
  </tr>
</table>
<div style="margin:18px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">سبب النقل</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>مدير القسم المُصدِر<br/>____________________</div>
  <div>مدير القسم المستلِم<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
</div>`,
  });
}

function buildAttendancePreset(): PrintTemplate {
  return makePreset({
    id: -49, presetKey: "attendance_classic", entityType: "attendance",
    name: "سجل حضور",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سجل حضور</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>التاريخ:</strong> {{entity.attendanceDate}}</div>
      <div><strong>اليوم:</strong> {{entity.dayName}}</div>
      <div><strong>الوردية:</strong> {{entity.shiftName}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr style="background:#f1f5f9">
    <th style="border:1px solid #cbd5e1;padding:8px">الحدث</th>
    <th style="border:1px solid #cbd5e1;padding:8px;width:120px">الوقت</th>
    <th style="border:1px solid #cbd5e1;padding:8px;width:120px">الموقع</th>
  </tr>
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px">دخول الصباح</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.checkInTime}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.checkInLocation}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px">خروج النهاية</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.checkOutTime}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.checkOutLocation}}</td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold">دقائق التأخر</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.lateMinutes}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#fee2e2;font-weight:bold">دقائق المغادرة المبكرة</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.earlyMinutes}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#dcfce7;font-weight:bold">ساعات العمل</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.workedHours}}</td>
    <td style="border:1px solid #cbd5e1;padding:8px;background:#dbeafe;font-weight:bold">الحالة</td>
    <td style="border:1px solid #cbd5e1;padding:8px;text-align:center">{{entity.status}}</td>
  </tr>
</table>
<div style="margin:14px 0;color:#475569;font-size:10pt;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
</div>`,
  });
}

function buildClientCardPreset(): PrintTemplate {
  return makePreset({
    id: -50, presetKey: "client_card_classic", entityType: "client",
    name: "بطاقة عميل",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة عميل</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم العميل:</strong> {{entity.name}}</div>
  <div><strong>الاسم بالإنجليزية:</strong> {{entity.nameEn}}</div>
  <div><strong>نوع العميل:</strong> {{entity.clientType}}</div>
  <div><strong>التصنيف:</strong> {{entity.category}}</div>
  <div><strong>الرقم الضريبي:</strong> {{entity.taxNumber}}</div>
  <div><strong>السجل التجاري:</strong> {{entity.commercialReg}}</div>
  <div><strong>الهاتف:</strong> {{entity.phone}}</div>
  <div><strong>البريد الإلكتروني:</strong> {{entity.email}}</div>
  <div><strong>المدينة:</strong> {{entity.city}}</div>
  <div><strong>الدولة:</strong> {{entity.country}}</div>
  <div><strong>سقف الائتمان:</strong> {{entity.creditLimit}}</div>
  <div><strong>شروط السداد:</strong> {{entity.paymentTerms}}</div>
  <div><strong>المسؤول:</strong> {{entity.accountManagerName}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">العنوان الكامل</div>
  <div style="white-space:pre-wrap">{{entity.address}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>`,
  });
}

// ─── Batch-6 presets: master cards + niche transactions ──────────────────

function buildBuildingCardPreset(): PrintTemplate {
  return makePreset({
    id: -51, presetKey: "building_card_classic", entityType: "building",
    name: "بطاقة مبنى",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة مبنى</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم المبنى:</strong> {{entity.name}}</div>
  <div><strong>الكود:</strong> <span dir="ltr">{{entity.code}}</span></div>
  <div><strong>المدينة:</strong> {{entity.city}}</div>
  <div><strong>الحي:</strong> {{entity.district}}</div>
  <div><strong>الشارع:</strong> {{entity.street}}</div>
  <div><strong>رقم المبنى:</strong> {{entity.buildingNumber}}</div>
  <div><strong>عدد الطوابق:</strong> {{entity.floors}}</div>
  <div><strong>عدد الوحدات:</strong> {{entity.unitsCount}}</div>
  <div><strong>المساحة الإجمالية:</strong> {{entity.totalArea}} م²</div>
  <div><strong>المالك:</strong> {{entity.ownerName}}</div>
  <div><strong>سنة البناء:</strong> {{entity.yearBuilt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">العنوان الكامل</div>
  <div style="white-space:pre-wrap">{{entity.fullAddress}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>`,
  });
}

function buildVendorCardPreset(): PrintTemplate {
  return makePreset({
    id: -52, presetKey: "vendor_card_classic", entityType: "vendor",
    name: "بطاقة مورّد",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة مورّد</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم المورّد:</strong> {{entity.name}}</div>
  <div><strong>الاسم بالإنجليزية:</strong> {{entity.nameEn}}</div>
  <div><strong>الرقم الضريبي:</strong> {{entity.taxNumber}}</div>
  <div><strong>السجل التجاري:</strong> {{entity.commercialReg}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>الهاتف:</strong> {{entity.phone}}</div>
  <div><strong>البريد الإلكتروني:</strong> {{entity.email}}</div>
  <div><strong>المدينة:</strong> {{entity.city}}</div>
  <div><strong>الدولة:</strong> {{entity.country}}</div>
  <div><strong>الموقع:</strong> {{entity.website}}</div>
  <div><strong>شخص الاتصال:</strong> {{entity.contactPerson}}</div>
  <div><strong>هاتف الاتصال:</strong> {{entity.contactPhone}}</div>
  <div><strong>شروط السداد:</strong> {{entity.paymentTerms}}</div>
  <div><strong>سقف الائتمان:</strong> {{entity.creditLimit}}</div>
  <div><strong>العملة المفضلة:</strong> {{entity.preferredCurrency}}</div>
  <div><strong>بنك المورّد:</strong> {{entity.bankName}}</div>
  <div><strong>رقم الحساب (IBAN):</strong> <span dir="ltr">{{entity.iban}}</span></div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">العنوان الكامل</div>
  <div style="white-space:pre-wrap">{{entity.address}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>`,
  });
}

function buildInsurancePolicyPreset(): PrintTemplate {
  return makePreset({
    id: -53, presetKey: "insurance_policy_classic", entityType: "insurance_policy",
    name: "وثيقة تأمين",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">وثيقة تأمين</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الوثيقة: <span dir="ltr">{{entity.policyNumber}}</span></div>
<div class="meta-grid">
  <div><strong>نوع التأمين:</strong> {{entity.policyType}}</div>
  <div><strong>الجهة المؤمَّن لها:</strong> {{entity.insuredEntity}}</div>
  <div><strong>شركة التأمين:</strong> {{entity.insurerName}}</div>
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ الانتهاء:</strong> {{entity.expiryDate}}</div>
  <div><strong>قيمة التغطية:</strong> {{entity.coverageAmount}}</div>
  <div><strong>قيمة القسط:</strong> {{entity.premiumAmount}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الوكيل<br/>____________________</div>
  <div>المؤمَّن له<br/>____________________</div>
</div>`,
  });
}

function buildStoreOrderPreset(): PrintTemplate {
  return makePreset({
    id: -54, presetKey: "store_order_classic", entityType: "store_order",
    name: "طلب متجر",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب متجر إلكتروني</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">العميل</div>
      <div>{{entity.customerName}}</div>
      <div style="color:#64748b;font-size:9pt">{{entity.customerPhone}}</div>
      <div style="color:#64748b;font-size:9pt">{{entity.customerEmail}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم الطلب:</strong> <span dir="ltr">{{entity.orderNumber}}</span></div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>طريقة الدفع:</strong> {{entity.paymentMethod}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<div style="margin:14px 0;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:10pt">
  <div style="font-weight:bold;margin-bottom:4px">عنوان الشحن</div>
  <div style="white-space:pre-wrap">{{entity.shippingAddress}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;text-align:right">المنتج</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">الكمية</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:100px">السعر</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:100px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.productName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المجموع</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.subtotal}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">الشحن</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.shippingFee}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.vatAmount}}</td></tr>
  <tr style="background:#f1f5f9;font-weight:bold"><td style="padding:6px 8px;border:1px solid #cbd5e1">الإجمالي</td><td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
</table>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildOpportunityPreset(): PrintTemplate {
  return makePreset({
    id: -55, presetKey: "crm_opportunity_classic", entityType: "crm_opportunity",
    name: "فرصة بيع",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">فرصة بيع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.title}}</div>
<div class="meta-grid">
  <div><strong>اسم الفرصة:</strong> {{entity.title}}</div>
  <div><strong>العميل المحتمل:</strong> {{entity.clientName}}</div>
  <div><strong>جهة الاتصال:</strong> {{entity.contactName}}</div>
  <div><strong>المرحلة:</strong> {{entity.stage}}</div>
  <div><strong>الاحتمالية:</strong> {{entity.probability}}%</div>
  <div><strong>القيمة المتوقعة:</strong> {{entity.expectedValue}}</div>
  <div><strong>تاريخ الإغلاق المتوقع:</strong> {{entity.closeDate}}</div>
  <div><strong>المسؤول:</strong> {{entity.assigneeName}}</div>
  <div><strong>المصدر:</strong> {{entity.source}}</div>
  <div><strong>تاريخ الإنشاء:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#dbeafe;border:1px solid #93c5fd;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الخطوة التالية</div>
  <div style="white-space:pre-wrap">{{entity.nextAction}}</div>
</div>`,
  });
}

function buildSupportTicketPreset(): PrintTemplate {
  return makePreset({
    id: -56, presetKey: "support_ticket_classic", entityType: "support_ticket",
    name: "تذكرة دعم",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">تذكرة دعم</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.subject}}</div>
<div class="meta-grid">
  <div><strong>رقم التذكرة:</strong> <span dir="ltr">{{entity.ticketNumber}}</span></div>
  <div><strong>الموضوع:</strong> {{entity.subject}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>الأولوية:</strong> {{entity.priority}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المقدِّم:</strong> {{entity.reporterName}}</div>
  <div><strong>مكلَّف بـ:</strong> {{entity.assigneeName}}</div>
  <div><strong>القناة:</strong> {{entity.channel}}</div>
  <div><strong>تاريخ الفتح:</strong> {{entity.createdAt}}</div>
  <div><strong>SLA الاستجابة:</strong> {{entity.responseSla}}</div>
  <div><strong>SLA الحل:</strong> {{entity.resolutionSla}}</div>
  <div><strong>تاريخ الإغلاق:</strong> {{entity.closedAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الحل المطبَّق</div>
  <div style="white-space:pre-wrap">{{entity.resolution}}</div>
</div>`,
  });
}

function buildUmrahPilgrimPreset(): PrintTemplate {
  return makePreset({
    id: -57, presetKey: "umrah_pilgrim_classic", entityType: "umrah_pilgrim",
    name: "بطاقة معتمر",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة معتمر</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>الاسم بالكامل:</strong> {{entity.name}}</div>
  <div><strong>الاسم بالإنجليزية:</strong> <span dir="ltr">{{entity.nameEn}}</span></div>
  <div><strong>رقم الجواز:</strong> <span dir="ltr">{{entity.passportNumber}}</span></div>
  <div><strong>الجنسية:</strong> {{entity.nationality}}</div>
  <div><strong>تاريخ الميلاد:</strong> {{entity.birthDate}}</div>
  <div><strong>الجنس:</strong> {{entity.gender}}</div>
  <div><strong>الهاتف:</strong> {{entity.phone}}</div>
  <div><strong>البريد الإلكتروني:</strong> {{entity.email}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
  <div><strong>الباقة:</strong> {{entity.packageName}}</div>
  <div><strong>المجموعة:</strong> {{entity.groupName}}</div>
  <div><strong>الوكيل:</strong> {{entity.agentName}}</div>
  <div><strong>تاريخ الوصول:</strong> {{entity.arrivalDate}}</div>
  <div><strong>تاريخ المغادرة:</strong> {{entity.departureDate}}</div>
  <div><strong>السكن:</strong> {{entity.accommodation}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">جهة الاتصال في حالة الطوارئ</div>
  <div>{{entity.emergencyContact}}</div>
  <div>{{entity.emergencyPhone}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

// U-14-P3 — dedicated umrah_group preset.
//
// The U-14-P1 fix removed the wrong `umrah_group → buildUmrahPilgrim`
// alias and let the resolver fall through to universalFallback. That
// rendered the bare group ROW columns, which is correct but not the
// usable doc operators wanted: a meta block + the pilgrim manifest.
//
// loadUmrahGroup returns:
//   entity   — group row joined with agentName / subAgentName / seasonName
//   pilgrims — manifest array (fullName, passport, visa, nationality, ...)
//
// The body below renders both. Same totals-style block + table convention
// the rest of the umrah-side presets use.
function buildUmrahGroupPreset(): PrintTemplate {
  return makePreset({
    id: -107, presetKey: "umrah_group_classic", entityType: "umrah_group",
    name: "مجموعة عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">مجموعة عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">المجموعة</div>
      <div>{{entity.name}}</div>
      <div style="color:#64748b;font-size:9pt">الموسم: {{entity.seasonName}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>الوكيل الرئيسي:</strong> {{entity.agentName}}</div>
      <div><strong>الوكيل الفرعي:</strong> {{entity.subAgentName}}</div>
      <div><strong>تاريخ الوصول:</strong> {{entity.arrivalDate}}</div>
      <div><strong>تاريخ المغادرة:</strong> {{entity.departureDate}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<h3 style="margin:14px 0 6px 0;font-size:11pt;color:#334155">قائمة المعتمرين</h3>
<table style="width:100%;border-collapse:collapse;margin:6px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;text-align:right">الاسم</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:100px">رقم الجواز</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:90px">التأشيرة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">الجنسية</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:90px">الحالة</th>
    </tr>
  </thead>
  <tbody>
    {{#each pilgrims}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.fullName}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left"><span dir="ltr">{{this.passportNumber}}</span></td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left"><span dir="ltr">{{this.visaNumber}}</span></td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.nationality}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.status}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div style="margin-top:18px;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

// U-14-P2 — dedicated agent-invoice preset.
//
// The previous resolver mapping pointed `umrah_agent_invoice` at the
// buyer-side `buildUmrahInvoicePreset()`, which renders the pilgrim /
// group meta block — totally wrong for the agent-side document which
// reads to the AGENT, not the pilgrim. The agent invoice carries:
//   - main agent + sub-agent identification block
//   - season + contract reference (the agent has a contract; the pilgrim
//     doesn't)
//   - same line-items + totals shape so partial-payment math reads
//     identically
//
// `data.entity` is whatever `loadUmrahAgentInvoice(...)` returns. Keys
// referenced here (`agentName` / `subAgentName` / `contractRef` /
// `seasonName`) are pulled by that loader.
function buildUmrahAgentInvoicePreset(): PrintTemplate {
  return makePreset({
    id: -106, presetKey: "umrah_agent_invoice_classic", entityType: "umrah_agent_invoice",
    name: "فاتورة وكيل عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">فاتورة وكيل عمرة</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الوكيل الرئيسي</div>
      <div>{{entity.agentName}}</div>
      <div style="color:#64748b;font-size:9pt">الوكيل الفرعي: {{entity.subAgentName}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم الفاتورة:</strong> <span dir="ltr">{{entity.ref}}</span></div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
      <div><strong>رقم العقد:</strong> <span dir="ltr">{{entity.contractRef}}</span></div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;text-align:right">الخدمة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">العدد</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:100px">السعر</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:110px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.description}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">قبل الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.subtotal}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.vatAmount}}</td></tr>
  <tr style="background:#f1f5f9;font-weight:bold"><td style="padding:6px 8px;border:1px solid #cbd5e1">الإجمالي</td><td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المدفوع</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.paidAmount}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المتبقي</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.remaining}}</td></tr>
</table>
<div style="margin-top:18px;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildUmrahInvoicePreset(): PrintTemplate {
  return makePreset({
    id: -58, presetKey: "umrah_invoice_classic", entityType: "umrah_invoice",
    name: "فاتورة عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">فاتورة عمرة</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">المعتمر / المجموعة</div>
      <div>{{entity.pilgrimName}}</div>
      <div style="color:#64748b;font-size:9pt">{{entity.groupName}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم الفاتورة:</strong> <span dir="ltr">{{entity.ref}}</span></div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
      <div><strong>الباقة:</strong> {{entity.packageName}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px;width:32px">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;text-align:right">الخدمة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:80px">العدد</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:100px">السعر</th>
      <th style="border:1px solid #cbd5e1;padding:6px;width:110px">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{@index}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px">{{this.description}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:center">{{this.quantity}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{this.unitPrice}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;text-align:left">{{this.totalPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
<table style="width:280px;margin-right:auto;margin-left:0;border-collapse:collapse">
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">قبل الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.subtotal}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">الضريبة</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.vatAmount}}</td></tr>
  <tr style="background:#f1f5f9;font-weight:bold"><td style="padding:6px 8px;border:1px solid #cbd5e1">الإجمالي</td><td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.total}} {{entity.currency}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المدفوع</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.paidAmount}}</td></tr>
  <tr><td style="padding:4px 8px;border:1px solid #cbd5e1">المتبقي</td><td style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left">{{entity.remaining}}</td></tr>
</table>
<div style="margin-top:18px;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildProjectCardPreset(): PrintTemplate {
  return makePreset({
    id: -59, presetKey: "project_card_classic", entityType: "project",
    name: "بطاقة مشروع",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة مشروع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم المشروع:</strong> {{entity.name}}</div>
  <div><strong>الكود:</strong> <span dir="ltr">{{entity.code}}</span></div>
  <div><strong>العميل:</strong> {{entity.clientName}}</div>
  <div><strong>المدير المسؤول:</strong> {{entity.managerName}}</div>
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية المتوقع:</strong> {{entity.endDate}}</div>
  <div><strong>الميزانية:</strong> {{entity.budget}}</div>
  <div><strong>المنفَّذ حتى الآن:</strong> {{entity.actualCost}}</div>
  <div><strong>نسبة الإنجاز:</strong> {{entity.progress}}%</div>
  <div><strong>المرحلة:</strong> {{entity.stage}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الأهداف الرئيسية</div>
  <div style="white-space:pre-wrap">{{entity.objectives}}</div>
</div>`,
  });
}

// ─── Batch-7 presets: final coverage round ───────────────────────────────

function buildDisciplineMemoPreset(): PrintTemplate {
  return makePreset({
    id: -60, presetKey: "discipline_memo_classic", entityType: "discipline_memo",
    name: "مذكرة إنذار",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #991b1b;color:#991b1b">مذكرة إنذار</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
      <div style="color:#64748b;font-size:9pt">القسم: {{employee.departmentName}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم المذكرة:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>المستوى:</strong> {{entity.severity}}</div>
      <div><strong>عدد المخالفات السابقة:</strong> {{entity.priorCount}}</div>
    </td>
  </tr>
</table>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px;color:#991b1b">نوع المخالفة</div>
  <div>{{entity.violationType}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px;color:#991b1b">تفاصيل المخالفة</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الإجراء المتخَذ</div>
  <div style="white-space:pre-wrap">{{entity.action}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
</div>`,
  });
}

function buildFleetMaintenancePreset(): PrintTemplate {
  return makePreset({
    id: -61, presetKey: "fleet_maintenance_classic", entityType: "fleet_maintenance",
    name: "أمر صيانة مركبة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">أمر صيانة مركبة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">رقم الأمر: <span dir="ltr">{{entity.ref}}</span></div>
<div class="meta-grid">
  <div><strong>المركبة:</strong> {{entity.plateNumber}}</div>
  <div><strong>السائق:</strong> {{entity.driverName}}</div>
  <div><strong>نوع الصيانة:</strong> {{entity.serviceType}}</div>
  <div><strong>التاريخ:</strong> {{entity.serviceDate}}</div>
  <div><strong>الورشة:</strong> {{entity.workshopName}}</div>
  <div><strong>عدد الكيلومترات:</strong> {{entity.odometer}}</div>
  <div><strong>تاريخ الصيانة القادمة:</strong> {{entity.nextServiceDate}}</div>
  <div><strong>الكيلومترات للصيانة القادمة:</strong> {{entity.nextServiceKm}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">وصف العطل / الطلب</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr style="background:#fef9c3;font-weight:bold"><td style="border:1px solid #ca8a04;padding:8px;width:50%">إجمالي التكلفة</td><td style="border:1px solid #ca8a04;padding:8px;text-align:left">{{entity.totalCost}}</td></tr>
</table>
<div class="signatures" style="margin-top:36px">
  <div>السائق<br/>____________________</div>
  <div>الورشة<br/>____________________</div>
  <div>أمين الأسطول<br/>____________________</div>
</div>`,
  });
}

function buildSalaryAdvancePreset(): PrintTemplate {
  return makePreset({
    id: -62, presetKey: "salary_advance_classic", entityType: "salary_advance",
    name: "سلفة راتب",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب سلفة راتب</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
      <div style="color:#64748b;font-size:9pt">الراتب الأساسي: {{employee.baseSalary}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم السلفة:</strong> {{entity.ref}}</div>
      <div><strong>تاريخ الطلب:</strong> {{entity.createdAt}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;width:50%">مبلغ السلفة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13pt;font-weight:bold">{{entity.amount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">عدد أشهر الخصم</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.installmentCount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">قيمة القسط الشهري</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.monthlyInstallment}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">تاريخ بدء الخصم</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.firstDeductionDate}}</td></tr>
</table>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">سبب طلب السلفة</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>الموظف<br/>____________________</div>
  <div>المدير المباشر<br/>____________________</div>
  <div>الموارد البشرية<br/>____________________</div>
  <div>المالية<br/>____________________</div>
</div>`,
  });
}

function buildCustodyPreset(): PrintTemplate {
  return makePreset({
    id: -63, presetKey: "custody_classic", entityType: "custody",
    name: "سند عهدة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سند عهدة</h2>
<table style="width:100%;margin-bottom:14px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;width:50%;padding:0 6px">
      <div style="font-weight:bold;margin-bottom:4px">الموظف العهدة</div>
      <div>{{employee.name}}</div>
      <div style="color:#64748b;font-size:9pt">الرقم الوظيفي: {{employee.empNumber}}</div>
    </td>
    <td style="vertical-align:top;width:50%;padding:0 6px;text-align:left">
      <div><strong>رقم السند:</strong> {{entity.ref}}</div>
      <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
      <div><strong>الغرض:</strong> {{entity.purpose}}</div>
      <div><strong>الحالة:</strong> {{entity.status}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#fef9c3;font-weight:bold;width:50%">مبلغ العهدة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13pt;font-weight:bold">{{entity.amount}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">المُسدَّد</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.settledAmount}}</td></tr>
  <tr style="background:#fef2f2;font-weight:bold"><td style="border:1px solid #fecaca;padding:8px">المتبقي</td><td style="border:1px solid #fecaca;padding:8px;text-align:left">{{entity.remainingAmount}}</td></tr>
</table>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">وصف الغرض</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>المستلِم<br/>____________________</div>
  <div>المعتمِد<br/>____________________</div>
  <div>المالية<br/>____________________</div>
</div>`,
  });
}

function buildTrainingProgramPreset(): PrintTemplate {
  return makePreset({
    id: -64, presetKey: "training_program_classic", entityType: "training_program",
    name: "برنامج تدريبي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">برنامج تدريبي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.title}}</div>
<div class="meta-grid">
  <div><strong>اسم البرنامج:</strong> {{entity.title}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>المُدرِّب:</strong> {{entity.trainerName}}</div>
  <div><strong>الجهة المقدِّمة:</strong> {{entity.provider}}</div>
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
  <div><strong>عدد الساعات:</strong> {{entity.totalHours}}</div>
  <div><strong>عدد المقاعد:</strong> {{entity.seats}}</div>
  <div><strong>عدد المسجَّلين:</strong> {{entity.enrolledCount}}</div>
  <div><strong>الموقع:</strong> {{entity.location}}</div>
  <div><strong>التكلفة لكل موظف:</strong> {{entity.costPerEmployee}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الهدف من البرنامج</div>
  <div style="white-space:pre-wrap">{{entity.objectives}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المحاور</div>
  <div style="white-space:pre-wrap">{{entity.modules}}</div>
</div>`,
  });
}

function buildWarehouseProductPreset(): PrintTemplate {
  return makePreset({
    id: -65, presetKey: "warehouse_product_classic", entityType: "warehouse_product",
    name: "بطاقة منتج",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة منتج مستودع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم المنتج:</strong> {{entity.name}}</div>
  <div><strong>الاسم بالإنجليزية:</strong> <span dir="ltr">{{entity.nameEn}}</span></div>
  <div><strong>رقم الصنف (SKU):</strong> <span dir="ltr">{{entity.sku}}</span></div>
  <div><strong>الباركود:</strong> <span dir="ltr">{{entity.barcode}}</span></div>
  <div><strong>التصنيف:</strong> {{entity.categoryName}}</div>
  <div><strong>الوحدة:</strong> {{entity.unit}}</div>
  <div><strong>المستودع:</strong> {{entity.warehouseName}}</div>
  <div><strong>المخزون الحالي:</strong> {{entity.currentStock}}</div>
  <div><strong>الحد الأدنى:</strong> {{entity.minStock}}</div>
  <div><strong>الحد الأعلى:</strong> {{entity.maxStock}}</div>
  <div><strong>سعر التكلفة:</strong> {{entity.costPrice}}</div>
  <div><strong>سعر البيع:</strong> {{entity.price}}</div>
  <div><strong>نسبة الضريبة:</strong> {{entity.vatRate}}%</div>
  <div><strong>المورّد الافتراضي:</strong> {{entity.defaultSupplierName}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>`,
  });
}

function buildBudgetPreset(): PrintTemplate {
  return makePreset({
    id: -66, presetKey: "budget_classic", entityType: "budget",
    name: "موازنة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">موازنة تقديرية</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.title}}</div>
<div class="meta-grid">
  <div><strong>عنوان الموازنة:</strong> {{entity.title}}</div>
  <div><strong>السنة المالية:</strong> {{entity.fiscalYear}}</div>
  <div><strong>الفترة:</strong> {{entity.period}}</div>
  <div><strong>مركز التكلفة:</strong> {{entity.costCenterName}}</div>
  <div><strong>المسؤول:</strong> {{entity.ownerName}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الإنشاء:</strong> {{entity.createdAt}}</div>
  <div><strong>تاريخ الاعتماد:</strong> {{entity.approvedAt}}</div>
</div>
<table style="width:100%;border-collapse:collapse;margin:14px 0">
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;width:33%">إجمالي الموازنة</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left;font-weight:bold;font-size:13pt">{{entity.totalBudget}}</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold">المُستنفَد حتى الآن</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:left">{{entity.consumed}}</td></tr>
  <tr style="background:#dcfce7;font-weight:bold"><td style="border:1px solid #16a34a;padding:8px">المتبقي</td><td style="border:1px solid #16a34a;padding:8px;text-align:left">{{entity.remaining}}</td></tr>
</table>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>المُعِد<br/>____________________</div>
  <div>المراجع<br/>____________________</div>
  <div>المعتمِد<br/>____________________</div>
</div>`,
  });
}

function buildGovernancePolicyPreset(): PrintTemplate {
  return makePreset({
    id: -67, presetKey: "governance_policy_classic", entityType: "governance_policy",
    name: "سياسة حوكمة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سياسة حوكمة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.title}}</div>
<div class="meta-grid">
  <div><strong>عنوان السياسة:</strong> {{entity.title}}</div>
  <div><strong>الكود:</strong> <span dir="ltr">{{entity.code}}</span></div>
  <div><strong>المجال:</strong> {{entity.domain}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>الإصدار:</strong> {{entity.version}}</div>
  <div><strong>تاريخ النفاذ:</strong> {{entity.effectiveDate}}</div>
  <div><strong>تاريخ المراجعة القادمة:</strong> {{entity.nextReviewDate}}</div>
  <div><strong>المسؤول:</strong> {{entity.ownerName}}</div>
  <div><strong>المعتمِد:</strong> {{entity.approvedByName}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الغرض</div>
  <div style="white-space:pre-wrap">{{entity.purpose}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">النطاق</div>
  <div style="white-space:pre-wrap">{{entity.scope}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المحتوى</div>
  <div style="white-space:pre-wrap">{{entity.content}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المسؤوليات</div>
  <div style="white-space:pre-wrap">{{entity.responsibilities}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>مالك السياسة<br/>____________________</div>
  <div>الشؤون القانونية<br/>____________________</div>
  <div>الإدارة العليا<br/>____________________</div>
</div>`,
  });
}

// ─── Final config-card presets ───────────────────────────────────────────

function buildShiftCardPreset(): PrintTemplate {
  return makePreset({
    id: -70, presetKey: "shift_card_classic", entityType: "shift",
    name: "بطاقة وردية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة وردية عمل</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم الوردية:</strong> {{entity.name}}</div>
  <div><strong>الكود:</strong> <span dir="ltr">{{entity.code}}</span></div>
  <div><strong>وقت البداية:</strong> {{entity.startTime}}</div>
  <div><strong>وقت النهاية:</strong> {{entity.endTime}}</div>
  <div><strong>عدد الساعات:</strong> {{entity.totalHours}}</div>
  <div><strong>أيام العمل:</strong> {{entity.workDays}}</div>
  <div><strong>أيام الراحة:</strong> {{entity.offDays}}</div>
  <div><strong>دقائق سماح التأخر:</strong> {{entity.lateGraceMinutes}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>`,
  });
}

function buildUmrahSeasonPreset(): PrintTemplate {
  return makePreset({
    id: -71, presetKey: "umrah_season_classic", entityType: "umrah_season",
    name: "موسم عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">إعداد موسم عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم الموسم:</strong> {{entity.name}}</div>
  <div><strong>السنة الهجرية:</strong> {{entity.hijriYear}}</div>
  <div><strong>السنة الميلادية:</strong> {{entity.gregorianYear}}</div>
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
  <div><strong>عدد الوكلاء:</strong> {{entity.agentCount}}</div>
  <div><strong>عدد المعتمرين المتوقَّع:</strong> {{entity.expectedPilgrims}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">ملاحظات الموسم</div>
  <div style="white-space:pre-wrap">{{entity.notes}}</div>
</div>`,
  });
}

function buildChartOfAccountPreset(): PrintTemplate {
  return makePreset({
    id: -72, presetKey: "chart_of_account_classic", entityType: "chart_of_account",
    name: "بطاقة حساب",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة حساب محاسبي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}} — <span dir="ltr">{{entity.code}}</span></div>
<div class="meta-grid">
  <div><strong>رمز الحساب:</strong> <span dir="ltr">{{entity.code}}</span></div>
  <div><strong>اسم الحساب:</strong> {{entity.name}}</div>
  <div><strong>الاسم بالإنجليزية:</strong> <span dir="ltr">{{entity.nameEn}}</span></div>
  <div><strong>نوع الحساب:</strong> {{entity.type}}</div>
  <div><strong>المستوى:</strong> {{entity.level}}</div>
  <div><strong>الحساب الأب:</strong> <span dir="ltr">{{entity.parentCode}}</span></div>
  <div><strong>تحليلي / تجميعي:</strong> {{entity.isAnalytical}}</div>
  <div><strong>يسمح بالقيود:</strong> {{entity.allowPosting}}</div>
  <div><strong>الرصيد الحالي:</strong> {{entity.currentBalance}}</div>
  <div><strong>العملة:</strong> {{entity.currency}}</div>
  <div><strong>الحالة:</strong> {{entity.isActive}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>`,
  });
}

// ─── Final coverage round: bespoke presets for entityTypes that previously
// fell through to universalFallback. Each one targets a SPA detail page that
// users routinely print but were getting the generic ref/date/status grid.
// Issue #1286 second sweep — adding real layouts so prints look like real
// documents instead of an empty placeholder card.

function buildTenantCardPreset(): PrintTemplate {
  return makePreset({
    id: -80, presetKey: "tenant_card_classic", entityType: "tenant",
    name: "بطاقة مستأجر",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة مستأجر</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>نوع المستأجر:</strong> {{entity.tenantType}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">{{entity.email}}</span></div>
  <div><strong>رقم الهوية:</strong> <span dir="ltr">{{entity.nationalId}}</span></div>
  <div><strong>نوع الهوية:</strong> {{entity.idType}}</div>
  <div><strong>الجنسية:</strong> {{entity.nationality}}</div>
  <div><strong>تاريخ الميلاد:</strong> {{entity.birthDate}}</div>
  <div><strong>الجنس:</strong> {{entity.gender}}</div>
  <div><strong>الحالة الاجتماعية:</strong> {{entity.maritalStatus}}</div>
  <div><strong>المهنة:</strong> {{entity.occupation}}</div>
  <div><strong>الدخل الشهري:</strong> {{entity.monthlyIncome}}</div>
  <div><strong>السجل التجاري:</strong> <span dir="ltr">{{entity.crNumber}}</span></div>
  <div><strong>الرقم الموحَّد:</strong> <span dir="ltr">{{entity.unifiedNumber}}</span></div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الكفيل / الضامن</div>
  <div><strong>الاسم:</strong> {{entity.guarantorName}}</div>
  <div><strong>رقم الهوية:</strong> <span dir="ltr">{{entity.guarantorId}}</span></div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.guarantorPhone}}</span></div>
  <div><strong>صلة القرابة:</strong> {{entity.guarantorRelation}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef9c3;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">جهة الاتصال في الطوارئ</div>
  <div>{{entity.emergencyName}}</div>
  <div dir="ltr">{{entity.emergencyContact}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">السكن السابق</div>
  <div><strong>العنوان:</strong> {{entity.previousAddress}}</div>
  <div><strong>المؤجِّر السابق:</strong> {{entity.previousLandlord}} — <span dir="ltr">{{entity.previousLandlordPhone}}</span></div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildPropertyOwnerCardPreset(): PrintTemplate {
  return makePreset({
    id: -81, presetKey: "property_owner_card_classic", entityType: "owner",
    name: "بطاقة مالك",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة مالك عقار</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>نوع المالك:</strong> {{entity.ownerType}}</div>
  <div><strong>رقم الهوية:</strong> <span dir="ltr">{{entity.nationalId}}</span></div>
  <div><strong>السجل التجاري:</strong> <span dir="ltr">{{entity.crNumber}}</span></div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">{{entity.email}}</span></div>
  <div><strong>المدينة:</strong> {{entity.city}}</div>
  <div><strong>البنك:</strong> {{entity.bankName}}</div>
  <div><strong>الآيبان:</strong> <span dir="ltr">{{entity.iban}}</span></div>
  <div><strong>رقم التوكيل:</strong> <span dir="ltr">{{entity.authorizationNumber}}</span></div>
  <div><strong>تاريخ التوكيل:</strong> {{entity.authorizationDate}}</div>
  <div><strong>انتهاء التوكيل:</strong> {{entity.authorizationExpiry}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">العنوان الكامل</div>
  <div style="white-space:pre-wrap">{{entity.address}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildDriverCardPreset(): PrintTemplate {
  return makePreset({
    id: -82, presetKey: "fleet_driver_classic", entityType: "driver",
    name: "بطاقة سائق",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة سائق</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>الاسم:</strong> {{entity.name}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>رقم الرخصة:</strong> <span dir="ltr">{{entity.licenseNumber}}</span></div>
  <div><strong>نوع الرخصة:</strong> {{entity.licenseType}}</div>
  <div><strong>انتهاء الرخصة:</strong> {{entity.licenseExpiry}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>التقييم:</strong> {{entity.rating}} / 5.0</div>
  <div><strong>إجمالي الرحلات:</strong> {{entity.totalTrips}}</div>
  <div><strong>الموظف المرتبط:</strong> {{entity.employeeId}}</div>
  <div><strong>آخر تحديث للموقع:</strong> {{entity.lastLocationUpdate}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>السائق<br/>____________________</div>
  <div>مدير الأسطول<br/>____________________</div>
</div>`,
  });
}

function buildCorrespondenceCardPreset(): PrintTemplate {
  return makePreset({
    id: -83, presetKey: "correspondence_classic", entityType: "correspondence",
    name: "مراسلة رسمية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">مراسلة رسمية</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.subject}}</div>
<div class="meta-grid">
  <div><strong>الرقم المرجعي:</strong> <span dir="ltr">{{entity.ref}}</span></div>
  <div><strong>الاتجاه:</strong> {{entity.direction}}</div>
  <div><strong>القناة:</strong> {{entity.channel}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المرسِل:</strong> {{entity.senderName}}</div>
  <div><strong>جهة المرسِل:</strong> {{entity.senderOrg}}</div>
  <div><strong>المستلِم:</strong> {{entity.recipientName}}</div>
  <div><strong>جهة المستلِم:</strong> {{entity.recipientOrg}}</div>
  <div><strong>تاريخ الإرسال:</strong> {{entity.sentAt}}</div>
  <div><strong>تاريخ الاستلام:</strong> {{entity.receivedAt}}</div>
  <div><strong>تاريخ الرد:</strong> {{entity.respondedAt}}</div>
  <div><strong>المرجع المرتبط:</strong> {{entity.entityType}} #{{entity.entityId}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المحتوى</div>
  <div style="white-space:pre-wrap;font-size:11pt;line-height:1.9">{{entity.content}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>التوقيع<br/>____________________</div>
  <div>الختم<br/>____________________</div>
</div>`,
  });
}

function buildAuditLogPreset(): PrintTemplate {
  return makePreset({
    id: -84, presetKey: "audit_log_entry_classic", entityType: "audit_record",
    name: "سجل تدقيق",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سجل تدقيق</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">إجراء: <span dir="ltr">{{entity.action}}</span></div>
<div class="meta-grid">
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
  <div><strong>الإجراء:</strong> <span dir="ltr">{{entity.action}}</span></div>
  <div><strong>الكيان:</strong> <span dir="ltr">{{entity.entity}}</span></div>
  <div><strong>معرّف الكيان:</strong> <span dir="ltr">{{entity.entityId}}</span></div>
  <div><strong>المستخدم:</strong> {{entity.userId}}</div>
  <div><strong>الفرع:</strong> {{entity.branchId}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>عنوان IP:</strong> <span dir="ltr">{{entity.ipAddress}}</span></div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">السبب</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569">
  وكيل المستخدم: <span dir="ltr">{{entity.userAgent}}</span>
</div>`,
  });
}

function buildWarehouseCategoryPreset(): PrintTemplate {
  return makePreset({
    id: -85, presetKey: "warehouse_category_classic", entityType: "warehouse_category",
    name: "تصنيف مستودع",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة تصنيف مستودع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم التصنيف:</strong> {{entity.name}}</div>
  <div><strong>الكود:</strong> {{entity.id}}</div>
  <div><strong>التصنيف الأب:</strong> {{entity.parentId}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>`,
  });
}

function buildMarketingCampaignPreset(): PrintTemplate {
  return makePreset({
    id: -86, presetKey: "marketing_campaign_classic", entityType: "campaign",
    name: "حملة تسويقية",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة حملة تسويقية</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم الحملة:</strong> {{entity.name}}</div>
  <div><strong>النوع:</strong> {{entity.type}}</div>
  <div><strong>القناة:</strong> {{entity.channel}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الميزانية:</strong> {{entity.budget}}</div>
  <div><strong>المُنفَق:</strong> {{entity.spent}}</div>
  <div><strong>الإيرادات:</strong> {{entity.revenue}}</div>
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ النهاية:</strong> {{entity.endDate}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الجمهور المستهدَف</div>
  <div style="white-space:pre-wrap">{{entity.targetAudience}}</div>
</div>`,
  });
}

function buildCompliancePreset(): PrintTemplate {
  return makePreset({
    id: -87, presetKey: "governance_compliance_classic", entityType: "compliance",
    name: "التزام تنظيمي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سجل التزام تنظيمي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.regulation}}</div>
<div class="meta-grid">
  <div><strong>التشريع / اللائحة:</strong> {{entity.regulation}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الاستحقاق:</strong> {{entity.dueDate}}</div>
  <div><strong>الشخص المسؤول:</strong> {{entity.responsiblePerson}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildRiskPreset(): PrintTemplate {
  return makePreset({
    id: -88, presetKey: "governance_risk_classic", entityType: "risk",
    name: "سجل مخاطر",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سجل مخاطر</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.title}}</div>
<div class="meta-grid">
  <div><strong>عنوان المخاطرة:</strong> {{entity.title}}</div>
  <div><strong>الخطورة:</strong> {{entity.severity}}</div>
  <div><strong>الاحتمال:</strong> {{entity.likelihood}}</div>
  <div><strong>الأثر:</strong> {{entity.impact}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المكلَّف بها:</strong> {{entity.assignedTo}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
  <div><strong>مالك المعالجة:</strong> {{entity.treatmentOwner}}</div>
  <div><strong>حالة المعالجة:</strong> {{entity.treatmentStatus}}</div>
  <div><strong>موعد المعالجة:</strong> {{entity.treatmentDueDate}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef9c3;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">خطة التخفيف</div>
  <div style="white-space:pre-wrap">{{entity.mitigationPlan}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#dbeafe;border:1px solid #93c5fd;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">خطة المعالجة</div>
  <div style="white-space:pre-wrap">{{entity.treatmentPlan}}</div>
</div>`,
  });
}

function buildJobApplicationPreset(): PrintTemplate {
  return makePreset({
    id: -89, presetKey: "job_application_classic", entityType: "application",
    name: "طلب توظيف",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">طلب توظيف</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.applicantName}}</div>
<div class="meta-grid">
  <div><strong>اسم المتقدِّم:</strong> {{entity.applicantName}}</div>
  <div><strong>الإعلان:</strong> #{{entity.postingId}}</div>
  <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">{{entity.email}}</span></div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>التقييم:</strong> {{entity.rating}}</div>
  <div><strong>المصدر:</strong> {{entity.source}}</div>
  <div><strong>الراتب المتوقَّع:</strong> {{entity.expectedSalary}}</div>
  <div><strong>الشركة الحالية:</strong> {{entity.currentCompany}}</div>
  <div><strong>تاريخ المقابلة:</strong> {{entity.interviewDate}}</div>
  <div><strong>تاريخ التقديم:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الخبرة</div>
  <div style="white-space:pre-wrap">{{entity.experience}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">المؤهلات العلمية</div>
  <div style="white-space:pre-wrap">{{entity.education}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">رسالة التغطية</div>
  <div style="white-space:pre-wrap">{{entity.coverLetter}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildProjectStatementPreset(): PrintTemplate {
  return makePreset({
    id: -111, presetKey: "project_statement_classic", entityType: "project_statement",
    name: "مستخلص المشروع",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">مستخلص المشروع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>رقم المشروع:</strong> <span dir="ltr">{{entity.ref}}</span></div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>العميل:</strong> {{entity.clientName}}</div>
  <div><strong>مدير المشروع:</strong> {{entity.managerName}}</div>
  <div><strong>تاريخ البدء:</strong> {{entity.startDate}}</div>
  <div><strong>تاريخ الانتهاء:</strong> {{entity.endDate}}</div>
</div>
<div class="meta-grid" style="margin-top:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px">
  <div><strong>الميزانية المعتمدة:</strong> {{entity.budget}}</div>
  <div><strong>إجمالي التكاليف:</strong> {{entity.totalCosts}}</div>
  <div><strong>المفوتر للعميل:</strong> {{entity.totalBilled}}</div>
  <div><strong>المتبقي من الميزانية:</strong> {{entity.remaining}}</div>
</div>
<div style="margin:16px 0">
  <div style="font-weight:bold;margin-bottom:6px">تفصيل التكاليف</div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">#</th>
      <th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">التاريخ</th>
      <th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">الفئة</th>
      <th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">البيان</th>
      <th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">القيمة</th>
    </tr></thead>
    <tbody>
    {{#each costs}}
      <tr>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center">{{@index}}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:center" dir="ltr">{{this.costDate}}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.category}}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">{{this.description}}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt;text-align:left">{{this.amount}}</td>
      </tr>
    {{/each}}
    </tbody>
  </table>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.description}}</div>
<div class="signatures" style="margin-top:36px">
  <div>مدير المشروع<br/>____________________</div>
  <div>المالية<br/>____________________</div>
  <div>الإدارة<br/>____________________</div>
</div>`,
  });
}

function buildProjectCostingPreset(): PrintTemplate {
  return makePreset({
    id: -90, presetKey: "project_costing_classic", entityType: "project_costing",
    name: "بند تكلفة مشروع",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بند تكلفة مشروع</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.category}}</div>
<div class="meta-grid">
  <div><strong>المشروع:</strong> #{{entity.projectId}}</div>
  <div><strong>الفئة:</strong> {{entity.category}}</div>
  <div><strong>القيمة:</strong> {{entity.amount}}</div>
  <div><strong>تاريخ التكلفة:</strong> {{entity.costDate}}</div>
  <div><strong>مرجع الفاتورة:</strong> <span dir="ltr">{{entity.invoiceRef}}</span></div>
  <div><strong>المسجِّل:</strong> {{entity.enteredBy}}</div>
  <div><strong>تاريخ التسجيل:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>المسجِّل<br/>____________________</div>
  <div>مدير المشروع<br/>____________________</div>
  <div>المالية<br/>____________________</div>
</div>`,
  });
}

function buildUmrahAgentCardPreset(): PrintTemplate {
  return makePreset({
    id: -91, presetKey: "umrah_agent_card_classic", entityType: "umrah_agent",
    name: "وكيل عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة وكيل عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم الوكيل:</strong> {{entity.name}}</div>
  <div><strong>رقم نسك للوكيل:</strong> <span dir="ltr">{{entity.nuskAgentNumber}}</span></div>
  <div><strong>الموسم:</strong> {{entity.seasonId}}</div>
  <div><strong>الدولة:</strong> {{entity.country}}</div>
  <div><strong>جهة الاتصال:</strong> {{entity.contactPerson}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">{{entity.email}}</span></div>
  <div><strong>مرجع العقد:</strong> <span dir="ltr">{{entity.contractRef}}</span></div>
  <div><strong>هامش الربح:</strong> {{entity.profitMargin}}%</div>
  <div><strong>العملة:</strong> {{entity.currency}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>الوكيل<br/>____________________</div>
  <div>إدارة العمرة<br/>____________________</div>
</div>`,
  });
}

function buildUmrahSubAgentCardPreset(): PrintTemplate {
  return makePreset({
    id: -92, presetKey: "umrah_sub_agent_card_classic", entityType: "umrah_sub_agent",
    name: "وكيل عمرة فرعي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة وكيل عمرة فرعي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم الوكيل الفرعي:</strong> {{entity.name}}</div>
  <div><strong>رمز نسك:</strong> <span dir="ltr">{{entity.nuskCode}}</span></div>
  <div><strong>الوكيل الرئيسي:</strong> #{{entity.agentId}}</div>
  <div><strong>العميل المرتبط:</strong> #{{entity.clientId}}</div>
  <div><strong>شروط الدفع:</strong> {{entity.paymentTerms}}</div>
  <div><strong>السعر الافتراضي للمعتمر:</strong> {{entity.defaultPricePerMutamer}}</div>
  <div><strong>الدولة:</strong> {{entity.country}}</div>
  <div><strong>الهاتف:</strong> <span dir="ltr">{{entity.phone}}</span></div>
  <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">{{entity.email}}</span></div>
  <div><strong>الحالة:</strong> {{entity.isActive}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>`,
  });
}

function buildUmrahPackagePreset(): PrintTemplate {
  return makePreset({
    id: -93, presetKey: "umrah_package_classic", entityType: "umrah_package",
    name: "باقة عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">بطاقة باقة عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}}</div>
<div class="meta-grid">
  <div><strong>اسم الباقة:</strong> {{entity.name}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
  <div><strong>سعر التكلفة:</strong> {{entity.costPrice}}</div>
  <div><strong>سعر البيع:</strong> {{entity.sellPrice}}</div>
  <div><strong>المدة:</strong> {{entity.duration}} يوم</div>
  <div><strong>تشمل النقل:</strong> {{entity.includesTransport}}</div>
  <div><strong>تشمل الإقامة:</strong> {{entity.includesHotel}}</div>
  <div><strong>تشمل الوجبات:</strong> {{entity.includesMeals}}</div>
  <div><strong>تشمل الزيارة:</strong> {{entity.includesZiyarat}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الإضافة:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">الوصف</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>`,
  });
}

function buildUmrahPenaltyPreset(): PrintTemplate {
  return makePreset({
    id: -94, presetKey: "umrah_penalty_classic", entityType: "umrah_penalty",
    name: "عقوبة عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">إشعار عقوبة عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.pilgrimName}} — <span dir="ltr">{{entity.nuskNumber}}</span></div>
<div class="meta-grid">
  <div><strong>المعتمر:</strong> {{entity.pilgrimName}}</div>
  <div><strong>رقم نسك:</strong> <span dir="ltr">{{entity.nuskNumber}}</span></div>
  <div><strong>رقم الجواز:</strong> <span dir="ltr">{{entity.passportNumber}}</span></div>
  <div><strong>الجنسية:</strong> {{entity.nationality}}</div>
  <div><strong>الوكيل:</strong> {{entity.agentName}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
  <div><strong>نوع العقوبة:</strong> {{entity.type}}</div>
  <div><strong>قيمة العقوبة:</strong> {{entity.amount}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>تاريخ الرصد:</strong> {{entity.detectedAt}}</div>
  <div><strong>تاريخ الإصدار:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">سبب العقوبة</div>
  <div style="white-space:pre-wrap">{{entity.reason}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>إدارة العمرة<br/>____________________</div>
  <div>الشؤون المالية<br/>____________________</div>
</div>`,
  });
}

function buildUmrahTransportPreset(): PrintTemplate {
  return makePreset({
    id: -95, presetKey: "umrah_transport_classic", entityType: "umrah_transport",
    name: "نقل عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">رحلة نقل عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.fromLocation}} → {{entity.toLocation}}</div>
<div class="meta-grid">
  <div><strong>تاريخ الرحلة:</strong> {{entity.tripDate}}</div>
  <div><strong>من:</strong> {{entity.fromLocation}}</div>
  <div><strong>إلى:</strong> {{entity.toLocation}}</div>
  <div><strong>الموسم:</strong> {{entity.seasonName}}</div>
  <div><strong>المركبة:</strong> <span dir="ltr">{{entity.plateNumber}}</span> — {{entity.vehicleMake}} {{entity.vehicleModel}}</div>
  <div><strong>السائق:</strong> {{entity.driverName}} — <span dir="ltr">{{entity.driverLicense}}</span></div>
  <div><strong>السعة:</strong> {{entity.capacity}}</div>
  <div><strong>عدد المعتمرين:</strong> {{entity.pilgrimCount}}</div>
  <div><strong>التكلفة:</strong> {{entity.cost}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>القيد المحاسبي:</strong> #{{entity.journalEntryId}}</div>
  <div><strong>تاريخ الإنشاء:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;font-size:10pt;color:#475569;white-space:pre-wrap">{{entity.notes}}</div>
<div class="signatures" style="margin-top:36px">
  <div>السائق<br/>____________________</div>
  <div>مشرف الرحلة<br/>____________________</div>
</div>`,
  });
}

function buildUmrahViolationPreset(): PrintTemplate {
  return makePreset({
    id: -96, presetKey: "umrah_violation_classic", entityType: "umrah_violation",
    name: "مخالفة عمرة",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">سجل مخالفة عمرة</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px"><span dir="ltr">{{entity.referenceNumber}}</span></div>
<div class="meta-grid">
  <div><strong>نوع المخالفة:</strong> {{entity.type}}</div>
  <div><strong>نوع المرجع:</strong> {{entity.referenceType}}</div>
  <div><strong>الرقم المرجعي:</strong> <span dir="ltr">{{entity.referenceNumber}}</span></div>
  <div><strong>المعتمر:</strong> {{entity.pilgrimName}} — <span dir="ltr">{{entity.pilgrimNuskNumber}}</span></div>
  <div><strong>المجموعة:</strong> {{entity.groupName}}</div>
  <div><strong>الوكيل الفرعي:</strong> {{entity.subAgentName}} — <span dir="ltr">{{entity.subAgentNuskCode}}</span></div>
  <div><strong>الوكيل:</strong> {{entity.agentName}} — <span dir="ltr">{{entity.agentNuskNumber}}</span></div>
  <div><strong>قيمة الغرامة:</strong> {{entity.penaltyAmount}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>الفاتورة المرتبطة:</strong> <span dir="ltr">{{entity.linkedInvoiceRef}}</span></div>
  <div><strong>تاريخ الرصد:</strong> {{entity.detectedAt}}</div>
  <div><strong>تاريخ التسجيل:</strong> {{entity.createdAt}}</div>
</div>
<div style="margin:14px 0;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
  <div style="font-weight:bold;margin-bottom:4px">وصف المخالفة</div>
  <div style="white-space:pre-wrap">{{entity.description}}</div>
</div>
<div class="signatures" style="margin-top:36px">
  <div>محرر المحضر<br/>____________________</div>
  <div>المسؤول<br/>____________________</div>
</div>`,
  });
}

function buildAccountStatementPreset(): PrintTemplate {
  return makePreset({
    id: -97, presetKey: "account_statement_classic", entityType: "account_statement",
    name: "كشف حساب محاسبي",
    body: `
<h2 style="text-align:center;margin:16px 0 4px 0;padding-bottom:8px;border-bottom:2px solid #334155">كشف حساب محاسبي</h2>
<div style="text-align:center;color:#475569;margin-bottom:14px">{{entity.name}} — <span dir="ltr">{{entity.code}}</span></div>
<div class="meta-grid">
  <div><strong>رمز الحساب:</strong> <span dir="ltr">{{entity.code}}</span></div>
  <div><strong>اسم الحساب:</strong> {{entity.name}}</div>
  <div><strong>نوع الحساب:</strong> {{entity.type}}</div>
  <div><strong>العملة:</strong> {{entity.currency}}</div>
  <div><strong>الرصيد الحالي:</strong> {{entity.currentBalance}}</div>
  <div><strong>الفرع:</strong> {{branch.branchName}}</div>
  <div><strong>تاريخ الطباعة:</strong> {{date.now}}</div>
</div>
{{entity.movementsTable}}
<div style="margin-top:18px;font-size:10pt;color:#475569">
  كشف حساب آلي صادر عن نظام غيث.
</div>`,
  });
}

/** Map snake_case entityType → Arabic display label. Mirrors the labels
 *  the SPA uses on detail/list pages so the printed doc reads the same as
 *  the screen. Anything not in the map falls back to the raw entityType,
 *  which is rare now that every common type has a bespoke preset. */
/** Exported so printService can pre-fill `data.entity.title` when the
 *  caller hasn't supplied one — the universalFallback template references
 *  `{{entity.title}}` instead of baking the title at template-build time. */
export const ARABIC_TITLES: Record<string, string> = {
  invoice: "فاتورة ضريبية", sales_invoice: "فاتورة مبيعات",
  credit_note: "إشعار دائن", pos_receipt: "إيصال نقطة بيع",
  receipt_voucher: "سند قبض", payment_voucher: "سند صرف",
  quotation: "عرض سعر", sales_order: "أمر بيع", delivery_note: "إذن تسليم",
  purchase_order: "أمر شراء", purchase_request: "طلب شراء",
  goods_receipt: "إيصال استلام بضاعة", journal_entry: "قيد محاسبي",
  account_statement: "كشف حساب",
  customer_statement: "كشف حساب عميل",
  vendor_statement: "كشف حساب مورّد",
  stock_transfer: "تحويل مخزون", stock_adjustment: "تسوية مخزون",
  item_barcode_label: "ملصق باركود",
  leave_request: "طلب إجازة", loan_request: "طلب قرض", loan: "قرض موظف",
  maintenance_request: "طلب صيانة", payroll: "كشف رواتب", payslip: "قسيمة راتب",
  official_letter: "خطاب رسمي", employee_contract: "عقد عمل",
  employee: "بطاقة موظف", employee_profile: "بطاقة موظف",
  overtime_request: "طلب عمل إضافي", exit_request: "طلب إنهاء خدمة",
  evaluation_360: "تقييم 360°", training: "دورة تدريبية",
  discipline_memo: "مذكرة إنذار", attendance: "سجل حضور",
  excuse: "عذر", excuse_request: "طلب استئذان", performance_review: "تقييم أداء",
  vehicle: "بطاقة مركبة", fleet_trip: "كشف رحلة", driver: "سائق",
  fuel: "تعبئة وقود", fixed_asset: "بطاقة أصل ثابت",
  vendor: "بطاقة مورّد", supplier: "بطاقة مورّد",
  rental_contract: "عقد إيجار", property_unit: "بطاقة وحدة عقارية",
  // #2079 TA-T18-11 — fleet rental docket (distinct from the property
  // rental_contract above; same Arabic-label family but the schema +
  // template differ).
  fleet_rental_contract: "محضر تسليم/إرجاع تأجير",
  fleet_rental_handover: "محضر تسليم تأجير",
  fleet_rental_return: "محضر إرجاع تأجير",
  tenant: "بطاقة مستأجر", building: "بطاقة مبنى",
  legal_contract: "عقد قانوني", legal_judgment: "ملف قضية",
  legal_session: "محضر جلسة", legal_correspondence: "مراسلة قانونية",
  umrah_invoice: "فاتورة عمرة", umrah_statement: "كشف وكيل عمرة",
  umrah_runsheet: "كشف اليوم — عمرة", umrah_agent: "وكيل عمرة",
  umrah_group: "مجموعة عمرة", umrah_agent_invoice: "فاتورة وكيل عمرة",
  fleet_driver: "سائق أسطول", cargo_manifest: "بوليصة شحن", manifest: "بوليصة",
  transport_booking_confirmation: "تأكيد حجز نقل",
  umrah_sub_agent: "وكيل عمرة فرعي", umrah_pilgrim: "معتمر",
  umrah_package: "باقة عمرة", umrah_season: "موسم عمرة",
  umrah_transport: "نقل عمرة", umrah_penalty: "عقوبة عمرة",
  umrah_violation: "مخالفة عمرة",
  budget: "موازنة", custody: "عهدة", commitment: "التزام",
  receivable: "ذمم مدينة", recurring_journal: "قيد متكرر",
  project: "مشروع", project_costing: "تكلفة مشروع", project_statement: "مستخلص المشروع",
  fleet_maintenance: "صيانة مركبة", salary_advance: "سلفة راتب",
  training_program: "برنامج تدريبي", warehouse_product: "بطاقة منتج",
  governance_policy: "سياسة حوكمة",
  task: "مهمة", request: "طلب", policy: "سياسة", risk: "مخاطرة",
  compliance: "التزام تنظيمي", audit_record: "سجل تدقيق",
  insurance: "وثيقة تأمين", traffic_violation: "مخالفة مرورية",
  shift: "وردية عمل", expense: "مصروف", transfer: "تحويل",
  job: "وظيفة شاغرة", job_posting: "إعلان وظيفي", store_order: "طلب متجر", store_product: "منتج متجر",
  support_ticket: "تذكرة دعم", warehouse_category: "تصنيف مستودع",
  owner: "بطاقة مالك", policy_detail: "تفاصيل سياسة",
  client: "بطاقة عميل", crm_lead: "عميل محتمل",
  // Short-name aliases — match the BESPOKE_PRESETS entries added above.
  ticket: "تذكرة دعم", opportunity: "فرصة CRM", season: "موسم عمرة",
  account: "حساب", property: "بطاقة عقار", unit: "وحدة عقارية",
  contract: "عقد إيجار", product: "بطاقة منتج",
  pilgrim: "بطاقة معتمر", mutamer: "بطاقة معتمر",
  trip: "رحلة أسطول", customer: "بطاقة عميل",
  agent: "وكيل عمرة", sub_agent: "وكيل فرعي",
  overtime: "طلب وقت إضافي", leave: "طلب إجازة",
  maintenance: "طلب صيانة", violation: "مخالفة",
  voucher: "سند",
  // Closing-sweep additions (issue #1286 last gap fill). crm_lead is
  // already declared above next to client — kept the original entry, only
  // adding the genuinely new ones here.
  campaign: "حملة تسويقية", application: "طلب توظيف",
  performance: "تقييم أداء", transport: "نقل عمرة",
  audit: "سجل تدقيق", correspondence: "مراسلة رسمية",
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
    // Title token resolution: printService sets `data.entity.title` to the
    // caller-supplied value when present, else the ARABIC_TITLES lookup, so
    // by the time substitute() runs there's always a usable title in
    // entity.title. Without that defaulting, the 37 report types whose
    // entityType is not in ARABIC_TITLES (report_print_log, report_ar_aging,
    // …) rendered the raw snake_case slug in the printed header.
    htmlContent: `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">{{entity.title}}</h2>
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

/** Every entityType the engine has a bespoke preset for, plus its Arabic
 *  label and whether the preset uses thermal/label-only paper. Drives the
 *  template-editor entity dropdown and the per-branch assignment grid so
 *  the SPA no longer carries a hard-coded list that's always stale. */
export function listPrintableEntityTypes(): Array<{
  id: string;
  label: string;
  hasBespokePreset: boolean;
}> {
  const ids = new Set([
    ...Object.keys(BESPOKE_PRESETS),
    ...Object.keys(ARABIC_TITLES),
  ]);
  return Array.from(ids)
    .filter((id) => !id.startsWith("report_"))
    .map((id) => ({
      id,
      label: ARABIC_TITLES[id] ?? id,
      hasBespokePreset: Boolean(BESPOKE_PRESETS[id]),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
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
