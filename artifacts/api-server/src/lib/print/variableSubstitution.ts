/**
 * variableSubstitution — minimal Handlebars-like engine sufficient for the
 * preset HTML templates seeded by 081_print_engine_seed.sql. Supports:
 *   {{path.to.value}}          — simple variable
 *   {{#each items}}…{{/each}}  — array repetition with @index/this
 *   {{branch.letterhead}}      — auto-generated A4 header block
 *   {{branch.letterheadThermal}}- auto-generated thermal header block
 *   {{branch.footer}}           — auto-generated footer
 *   {{entity.itemsTable}}       — auto-generated <table> from data.items
 *
 * Output is plain HTML safe to embed in a print iframe or to feed into the
 * thermal HTML adapter.
 */

import type { BranchLetterhead, RenderContext } from "./types.js";
import { renderLayoutToHtml } from "./layoutRenderer.js";

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function get(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Canonical English DB enum value → Arabic display label, used by
 *  formatValue() so `{{entity.status}}` renders "نشط" instead of "active"
 *  in every printed doc. Covers the 27 distinct status values found in
 *  db/schema_pre.sql plus common type/workflow synonyms. Keep this in sync
 *  with the SPA's per-page STATUS_LABELS maps so the on-screen badge and
 *  the printed-doc text never disagree. */
const ENUM_AR: Record<string, string> = {
  // Lifecycle statuses
  draft: "مسودة",
  pending: "قيد المراجعة",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  active: "نشط",
  inactive: "غير نشط",
  posted: "مُرحَّل",
  completed: "مكتمل",
  cancelled: "ملغى",
  void: "ملغى",
  closed: "مغلق",
  open: "مفتوح",
  new: "جديد",
  in_progress: "قيد التنفيذ",
  scheduled: "مجدول",
  on_hold: "معلَّق",
  suspended: "موقوف",
  blocked: "محظور",
  expired: "منتهٍ",
  overdue: "متأخر",
  // Payment / settlement statuses
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  partial: "جزئي",
  partially_paid: "مدفوع جزئياً",
  invoiced: "مُفوتر",
  disputed: "متنازع عليه",
  // Inventory / logistics
  delivered: "مُسلَّم",
  received: "مُستلَم",
  shipped: "مشحون",
  returned: "مُرتجع",
  fulfilled: "مُلبَّى",
  // Warehouse lot / serial lifecycle — mirrored from the STATUS_LABELS maps
  // in warehouse/serials.tsx, warehouse/lots.tsx and warehouse/cycle-counts.tsx
  // so a printed inventory list reads the same Arabic label as the SPA badge.
  // (Ambiguous cross-domain words like "return"/"submitted"/"handover" are
  // intentionally left to per-page payloads to avoid wrong global meanings.)
  in_stock: "في المخزن",
  reserved: "محجوز",
  sold: "مُباع",
  defective: "تالف",
  scrapped: "متلف",
  quarantine: "حجر صحي",
  recalled: "مستدعى",
  disposed: "متلف",
  reviewed: "مراجَع",
  // Voucher / journal types
  receipt: "سند قبض",
  payment: "سند صرف",
  // Boolean stringifications a few loaders produce
  true: "نعم",
  false: "لا",
  yes: "نعم",
  no: "لا",
  // Gender (one of the few enums printed unchanged today)
  male: "ذكر",
  female: "أنثى",
  // Common direction / channel words
  incoming: "وارد",
  outgoing: "صادر",
  internal: "داخلي",
  external: "خارجي",
  // ── Finance type maps ─ mirrored from
  // artifacts/ghayth-erp/src/lib/finance-type-maps.ts so the printed PDF
  // reads the same Arabic label as the SPA badge for the same value.
  // Payment methods
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  bank: "تحويل بنكي",
  check: "شيك",
  cheque: "شيك",
  credit_card: "بطاقة ائتمان",
  card: "بطاقة ائتمان",
  custody: "من العهدة",
  // Voucher operations (when used as `type` on a voucher row)
  rent: "تحصيل إيجار",
  invoice_payment: "سداد فاتورة عميل",
  deposit: "إيداع ضمان",
  refund: "استرداد",
  vendor_invoice: "سداد فاتورة مورد",
  salary: "صرف راتب",
  advance: "سلفة موظف",
  legal_fee: "أتعاب قانونية",
  purchase: "مشتريات",
  insurance: "سداد تأمين",
  maintenance: "صيانة",
  // Invoice types
  standard: "فاتورة عادية",
  simplified: "فاتورة مبسطة",
  credit_memo: "إشعار دائن",
  debit_memo: "إشعار مدين",
  credit_note: "إشعار دائن",
  debit_note: "إشعار مدين",
  // Depreciation methods
  straight_line: "القسط الثابت",
  declining_balance: "القسط المتناقص",
  // Account types
  asset: "أصول",
  liability: "التزامات",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
  contra: "حساب مقابل",
  // Expense categories
  operational: "تشغيلية",
  administrative: "إدارية",
  marketing: "تسويقية",
  travel: "سفر",
  utilities: "مرافق",
  salaries: "رواتب",
  // Priority labels (priority-labels.ts)
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
  urgent: "عاجلة",
  critical: "حرجة",
  // ── HR type maps ─ from hr-type-maps.ts
  // Leave types
  annual: "سنوية",
  sick: "مرضية",
  personal: "شخصية",
  maternity: "أمومة",
  paternity: "أبوة",
  emergency: "طارئة",
  // Discipline reasons
  late: "تأخر",
  early_leave: "مغادرة مبكرة",
  absence: "غياب",
  behavior: "سلوك",
  organization: "تنظيم",
  gps_out_of_range: "خروج عن النطاق",
  // Document types
  employment_certificate: "شهادة عمل",
  salary_certificate: "شهادة راتب",
  experience_letter: "شهادة خبرة",
  warning_letter: "خطاب إنذار",
  termination_letter: "خطاب إنهاء خدمة",
  work_permit: "تصريح عمل",
  iqama: "إقامة",
  passport: "جواز سفر",
  contract: "عقد عمل",
  driving_license: "رخصة قيادة",
  vehicle_registration: "رخصة سير",
  vehicle_insurance: "تأمين مركبة",
  vehicle_inspection: "فحص دوري",
  commercial_registration: "سجل تجاري",
  // Exit / termination reasons
  resignation: "استقالة",
  termination: "فصل",
  end_of_service: "إنهاء خدمة",
  contract_end: "انتهاء عقد",
  retirement: "تقاعد",
  mutual: "اتفاق متبادل",
  // Loan / advance types
  salary_advance: "سلفة راتب",
  housing: "سكن",
  education: "تعليمية",
  // Salary component types
  fixed: "ثابت",
  percentage: "نسبة",
  variable: "متغير",
  formula: "معادلة",
  allowance: "بدل",
  // ── Fleet type maps ─ from fleet-type-maps.ts
  preventive: "وقائية",
  corrective: "تصحيحية",
  inspection: "فحص دوري",
  // Fuel types
  gasoline_91: "بنزين 91",
  gasoline_95: "بنزين 95",
  diesel: "ديزل",
  electric: "كهربائي",
  hybrid: "هجين",
  // Trip types
  delivery: "توصيل",
  pickup: "استلام",
  transfer: "نقل",
  client_visit: "زيارة عميل",
  // Insurance / coverage
  comprehensive: "شامل",
  third_party: "ضد الغير",
  extended: "موسع",
  // Traffic violation types
  speeding: "تجاوز السرعة",
  parking: "مخالفة وقوف",
  signal: "قطع إشارة",
  lane: "مخالفة مسار",
  license: "رخصة منتهية",
  phone: "استخدام الهاتف",
  seatbelt: "عدم ربط الحزام",
  // ── CRM type maps ─ from crm-type-maps.ts
  call: "مكالمة",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة",
  // ── Currency codes ─ Saudi convention prints the Arabic symbol next to
  // amounts (not the ISO triplet). Leaving the three-letter code in the
  // doc looked like a typo to non-technical readers.
  sar: "ر.س",
  usd: "$",
  eur: "€",
  aed: "د.إ",
  kwd: "د.ك",
  bhd: "د.ب",
  qar: "ر.ق",
  omr: "ر.ع",
  egp: "ج.م",
  jod: "د.أ",
  // ── Generic fallbacks
  other: "أخرى",
  unknown: "غير محدد",
  none: "لا يوجد",
  custom: "مخصّص",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return v.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    // Enum lookup BEFORE date/numeric checks so values like "open" / "new"
    // don't fall through to the raw-string return. Case-insensitive to
    // handle "Active" / "ACTIVE" variants some loaders pass through.
    const enumAr = ENUM_AR[trimmed.toLowerCase()];
    if (enumAr !== undefined) return enumAr;
    // ISO date / timestamp detection — formats like "2025-06-15" or
    // "2025-06-15T12:34:56.000Z" come back from PG date/timestamp columns
    // as strings. Convert to Arabic locale date so {{entity.createdAt}}
    // renders as "15‏/06‏/2025" not the raw ISO string. We're strict
    // about the shape to avoid mangling refs that coincidentally look
    // similar (e.g., "2025-INV-001" would NOT match).
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d.toLocaleDateString("ar-SA");
    }
    // Numeric strings from PG NUMERIC columns. Only format if purely
    // numeric — don't mangle SKUs / refs like "300SP-X".
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) {
        return n.toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
          maximumFractionDigits: 2,
        });
      }
    }
    return v;
  }
  if (v instanceof Date) {
    return v.toLocaleDateString("ar-SA");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Embedded Ghayth brand mark — used as the default letterhead logo when the
// branch hasn't configured one. Stays inline so the print engine doesn't
// depend on the SPA's public folder being reachable from the server (PDFs
// often render before the user has uploaded their own logo).
const GHAYTH_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="64" height="64">
<defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3FBFD9"/><stop offset="100%" stop-color="#0F3D5C"/></linearGradient></defs>
<path d="M58 80a18 18 0 0 1 36 -10a22 22 0 0 1 32 5a16 16 0 0 1 14 32h-82a18 18 0 0 1 0 -27 z" stroke="url(#gg)" stroke-width="6" fill="none" stroke-linejoin="round"/>
<g fill="#0F3D5C"><rect x="74" y="72" width="6" height="32" rx="3"/><rect x="86" y="60" width="6" height="44" rx="3"/><rect x="98" y="50" width="6" height="54" rx="3"/><rect x="110" y="60" width="6" height="44" rx="3"/><rect x="122" y="72" width="6" height="32" rx="3"/></g>
<text x="100" y="148" text-anchor="middle" font-family="'Noto Naskh Arabic','Tahoma',sans-serif" font-size="34" font-weight="700" fill="#0F3D5C" direction="rtl">غيث</text>
<text x="100" y="178" text-anchor="middle" font-family="'Inter','Segoe UI',sans-serif" font-size="14" font-weight="600" letter-spacing="3" fill="#3FBFD9">GHAITH</text>
</svg>`;

function buildLetterheadA4(branch: BranchLetterhead): string {
  const logo = branch.logoUrl
    ? `<img src="${escapeHtml(branch.logoUrl)}" alt="شعار الشركة" style="max-height:64px"/>`
    : GHAYTH_MARK_SVG;
  return `<header class="branch-letterhead" style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #334155;padding-bottom:8px;margin-bottom:12px">
  <div>${logo}</div>
  <div style="text-align:center;flex:1">
    <div style="font-weight:bold;font-size:14pt">${escapeHtml(branch.companyName)}</div>
    <div style="font-size:11pt">${escapeHtml(branch.branchName)}</div>
    ${branch.branchNameEn ? `<div style="font-size:9pt;color:#475569" dir="ltr">${escapeHtml(branch.branchNameEn)}</div>` : ""}
  </div>
  <div style="text-align:left;font-size:9pt;color:#475569">
    ${branch.phone ? `<div dir="ltr">${escapeHtml(branch.phone)}</div>` : ""}
    ${branch.email ? `<div dir="ltr">${escapeHtml(branch.email)}</div>` : ""}
    ${branch.taxNumber ? `<div>الرقم الضريبي: ${escapeHtml(branch.taxNumber)}</div>` : ""}
  </div>
</header>`;
}

// Thermal-receipt mark — single-color so it prints cleanly on monochrome
// 80mm/58mm thermal printers. Same geometry as the A4 mark.
const GHAYTH_MARK_SVG_MONO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 130" width="40" height="40">
<path d="M58 80a18 18 0 0 1 36 -10a22 22 0 0 1 32 5a16 16 0 0 1 14 32h-82a18 18 0 0 1 0 -27 z" stroke="#000" stroke-width="6" fill="none" stroke-linejoin="round"/>
<g fill="#000"><rect x="74" y="72" width="6" height="32" rx="3"/><rect x="86" y="60" width="6" height="44" rx="3"/><rect x="98" y="50" width="6" height="54" rx="3"/><rect x="110" y="60" width="6" height="44" rx="3"/><rect x="122" y="72" width="6" height="32" rx="3"/></g>
</svg>`;

function buildLetterheadThermal(branch: BranchLetterhead): string {
  return `<div class="t-header" style="text-align:center;border-bottom:1px dashed #000;padding-bottom:4px;margin-bottom:4px">
  ${branch.logoUrl ? `<img src="${escapeHtml(branch.logoUrl)}" style="max-height:40px"/>` : GHAYTH_MARK_SVG_MONO}
  <div style="font-weight:bold;font-size:11pt">${escapeHtml(branch.companyName)}</div>
  <div style="font-size:9pt">${escapeHtml(branch.branchName)}</div>
  ${branch.phone ? `<div style="font-size:8pt" dir="ltr">${escapeHtml(branch.phone)}</div>` : ""}
  ${branch.taxNumber ? `<div style="font-size:8pt">ر.ض: ${escapeHtml(branch.taxNumber)}</div>` : ""}
</div>`;
}

function buildFooter(branch: BranchLetterhead, isThermal: boolean): string {
  if (!branch.footerText && !branch.address) return "";
  const border = isThermal ? "border-top:1px dashed #000" : "border-top:1px solid #cbd5e1";
  return `<footer class="branch-footer" style="${border};padding-top:6px;margin-top:12px;text-align:center;font-size:${isThermal ? "8pt" : "9pt"};color:#475569">
  ${branch.footerText ? `<div>${escapeHtml(branch.footerText)}</div>` : ""}
  ${branch.address ? `<div>${escapeHtml(branch.address)}</div>` : ""}
</footer>`;
}

/** Snake/camel column key → Arabic display label for auto-built tables.
 *  Mirrors the column titles the SPA uses on list pages so a printed
 *  list of invoices reads identically to the on-screen list. */
const COLUMN_AR: Record<string, string> = {
  ref: "المرجع", name: "الاسم", title: "العنوان", description: "البيان", notes: "ملاحظات",
  status: "الحالة", type: "النوع", category: "الفئة", priority: "الأولوية",
  date: "التاريخ", startDate: "تاريخ البداية", endDate: "تاريخ النهاية",
  dueDate: "تاريخ الاستحقاق", createdAt: "تاريخ الإنشاء", paidAt: "تاريخ السداد",
  amount: "المبلغ", total: "الإجمالي", totalAmount: "الإجمالي", totalPrice: "الإجمالي",
  subtotal: "المجموع قبل الضريبة", vatAmount: "الضريبة", vatRate: "نسبة الضريبة",
  netAmount: "الصافي", netSalary: "صافي الراتب", grossSalary: "إجمالي الراتب",
  paidAmount: "المدفوع", remainingAmount: "المتبقي", balance: "الرصيد",
  quantity: "الكمية", qty: "الكمية", unit: "الوحدة", unitPrice: "سعر الوحدة",
  lineTotal: "إجمالي السطر", lineGross: "الإجمالي شامل الضريبة",
  receivedQty: "الكمية المستلمة", itemName: "اسم الصنف",
  accountCode: "رمز الحساب", debit: "مدين", credit: "دائن",
  reference: "المرجع", currency: "العملة", paymentMethod: "طريقة الدفع",
  clientName: "اسم العميل", supplierName: "اسم المورّد", vendorName: "اسم المورّد",
  employeeName: "اسم الموظف", empNumber: "الرقم الوظيفي",
  branchName: "الفرع", departmentName: "الإدارة",
  plateNumber: "رقم اللوحة", make: "الصانع", model: "الموديل", year: "السنة",
  vinNumber: "رقم الهيكل", currentMileage: "العداد", fuelType: "نوع الوقود",
  insuranceExpiry: "انتهاء التأمين", registrationExpiry: "انتهاء الاستمارة",
  period: "الفترة", days: "عدد الأيام", hours: "الساعات",
  reason: "السبب", phone: "الهاتف", email: "البريد", address: "العنوان",
  taxNumber: "الرقم الضريبي", crNumber: "السجل التجاري",
  monthlyRent: "الإيجار الشهري", depositAmount: "مبلغ التأمين",
  contractType: "نوع العقد", partyName: "الطرف", value: "القيمة",
  caseNumber: "رقم القضية", court: "المحكمة", filingDate: "تاريخ الرفع",
  opposingParty: "الطرف الخصم", lawyerName: "المحامي",
  exitType: "نوع الإنهاء", exitReason: "سبب الإنهاء",
  fromLocation: "من", toLocation: "إلى", distance: "المسافة",
  startTime: "وقت البداية", endTime: "وقت النهاية",
  approvedAt: "تاريخ الاعتماد", approvedBy: "المعتمِد",
  installmentAmount: "قيمة القسط", installmentCount: "عدد الأقساط",
  loanType: "نوع القرض", loanNumber: "رقم القرض",
};

function buildItemsTable(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="empty">لا توجد بنود</div>`;
  }
  // Find the first row that's actually a non-null object — protects against
  // weird shapes (a column with NULL JSONB, a row that came back as a
  // primitive) so Object.keys() can't blow up on null/undefined.
  const sample = items.find((r) => r && typeof r === "object") as Record<string, unknown> | undefined;
  if (!sample) {
    return `<div class="empty">لا توجد بنود</div>`;
  }
  const cols = Object.keys(sample).filter(
    (k) => !["id", "createdAt", "updatedAt"].includes(k) && !k.endsWith("Id")
  ).slice(0, 6);
  if (cols.length === 0) {
    return `<div class="empty">لا توجد بنود</div>`;
  }
  // Translate column keys to Arabic labels so the printed table reads
  // as a real document, not a database dump. Anything not in the map
  // keeps the snake_case key — those are rare leaves like custom
  // metric columns where the user usually knows what they mean.
  const head = cols.map((c) => `<th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;font-size:10pt">${escapeHtml(COLUMN_AR[c] ?? c)}</th>`).join("");
  const body = items
    .map((r) => {
      if (!r || typeof r !== "object") return "";
      const row = r as Record<string, unknown>;
      const cells = cols
        .map(
          (c) =>
            `<td style="border:1px solid #cbd5e1;padding:6px;font-size:10pt">${escapeHtml(formatValue(row[c]))}</td>`
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildLinesTable(lines: unknown): string {
  return buildItemsTable(lines);
}

function buildMovementsTable(movements: unknown): string {
  return buildItemsTable(movements);
}

/** Phase 6 — a small bottom-corner block with the QR + verify URL +
 *  jobId for scanners. Designed to be dropped via `{{system.verifyBlock}}`
 *  in any preset that wants the verification badge. Renders nothing for
 *  ephemeral previews (no jobId allocated). */
function buildVerifyBlock(opts: {
  verifyUrl?: string | null;
  verifyQrDataUrl?: string | null;
  jobId?: string | null;
}): string {
  if (!opts.jobId) return "";
  const qr = opts.verifyQrDataUrl
    ? `<img src="${opts.verifyQrDataUrl}" alt="رمز التحقق" style="width:80px;height:80px;display:block;"/>`
    : "";
  const url = opts.verifyUrl ? escapeHtml(opts.verifyUrl) : "";
  const jid = escapeHtml(opts.jobId);
  return `<div style="margin-top:14px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;display:flex;align-items:center;gap:10px;font-size:9pt;background:#f8fafc">
    ${qr}
    <div style="flex:1;line-height:1.5">
      <div style="font-weight:bold;color:#0f172a">للتحقق من صحة المستند</div>
      <div style="color:#64748b">امسح الرمز أو افتح:</div>
      <div dir="ltr" style="font-family:monospace;font-size:8pt;color:#334155;word-break:break-all">${url}</div>
      <div style="color:#94a3b8;margin-top:2px">رقم المرجع: <span dir="ltr" style="font-family:monospace">${jid}</span></div>
    </div>
  </div>`;
}

/** Expand simple {{#each}} blocks. */
function expandEach(template: string, data: Record<string, unknown>): string {
  const re = /\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  return template.replace(re, (_match, path, body) => {
    const list = get(data, path);
    if (!Array.isArray(list)) return "";
    return list
      .map((item, idx) => {
        // Substitute @index and this/path within the body using a local scope.
        return body
          .replace(/\{\{@index\}\}/g, String(idx + 1))
          .replace(/\{\{this\}\}/g, escapeHtml(formatValue(item)))
          .replace(/\{\{this\.([\w.]+)\}\}/g, (_m: string, p: string) =>
            escapeHtml(formatValue(get(item, p)))
          );
      })
      .join("");
  });
}

/** Expand `{{#if path}}body{{/if}}` blocks. A value counts as truthy if it's
 *  present, non-empty, non-zero, and not the string "0" / "false". Several
 *  presets (customer_statement, vendor_statement, …) were authored with
 *  this Handlebars-style helper assuming it would gate optional rows like
 *  the customer's VAT number — without an implementation the literal
 *  `{{#if entity.X}}` and `{{/if}}` markers ended up in the printed PDF.
 *  Single-pass non-greedy match is fine for now: none of the presets nest
 *  these blocks, and `[\s\S]*?` keeps each helper self-contained. */
function expandIf(template: string, data: Record<string, unknown>): string {
  const re = /\{\{#if ([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  return template.replace(re, (_match, path, body) => {
    const v = get(data, path);
    if (v === undefined || v === null) return "";
    if (typeof v === "string") {
      const s = v.trim();
      if (s === "" || s === "0" || s.toLowerCase() === "false") return "";
    }
    if (typeof v === "number" && v === 0) return "";
    if (Array.isArray(v) && v.length === 0) return "";
    return body;
  });
}

export interface SubstitutionInput {
  template: string;
  data: Record<string, unknown>;
  branch: BranchLetterhead;
  isThermal: boolean;
  watermark?: string;
  /** Phase 6 verify context — when present, templates can use
   *  {{system.verifyUrl}} (text) or {{system.verifyQr}} (img src).
   *  Allocated upfront by printService so the URL matches the audit row. */
  verifyUrl?: string | null;
  verifyQrDataUrl?: string | null;
  jobId?: string | null;
}

export function substitute(input: SubstitutionInput): string {
  const { data, branch, isThermal, watermark, verifyUrl, verifyQrDataUrl, jobId } = input;
  let html = input.template ?? "";

  // Auto-tokens
  const autoTokens: Record<string, string> = {
    "branch.letterhead": buildLetterheadA4(branch),
    "branch.letterheadThermal": buildLetterheadThermal(branch),
    "branch.footer": buildFooter(branch, false),
    "branch.footerThermal": buildFooter(branch, true),
    // Phase 6 verify tokens — templates can reference these to show a QR
    // and a verify URL on every printed page. Empty strings when this is
    // an ephemeral preview (no audit row, nothing to verify against).
    "system.verifyUrl": verifyUrl ?? "",
    "system.verifyQr": verifyQrDataUrl
      ? `<img src="${verifyQrDataUrl}" alt="رمز التحقق" style="width:90px;height:90px;display:block;"/>`
      : "",
    "system.verifyBlock": buildVerifyBlock({ verifyUrl, verifyQrDataUrl, jobId }),
    // ZATCA invoice QR — rendered as <img> when the invoice carries a
    // zatcaQrImage data URL (data loader fills it from the stored TLV
    // base64). Phase-1 TLV is required on every B2C / B2B tax invoice
    // under ZATCA — without the QR the printed invoice is non-compliant.
    "entity.zatcaQr": (() => {
      const entity = data?.entity as Record<string, unknown> | undefined;
      const img = (entity?.zatcaQrImage as string | undefined) ?? "";
      return img
        ? `<img src="${img}" alt="ZATCA QR" style="width:140px;height:140px;display:block;border:1px solid #cbd5e1;padding:4px;background:#fff"/>`
        : "";
    })(),
    "entity.itemsTable": buildItemsTable((data as { items?: unknown }).items),
    "entity.linesTable": buildLinesTable((data as { lines?: unknown }).lines),
    "entity.movementsTable": buildMovementsTable((data as { movements?: unknown }).movements),
    // Umrah daily run-sheet has three independent sections — generic table
    // tokens so the same auto-builder handles them without bespoke code.
    "entity.arrivalsTable": buildItemsTable((data as { arrivals?: unknown }).arrivals),
    "entity.departuresTable": buildItemsTable((data as { departures?: unknown }).departures),
    "entity.overstaysTable": buildItemsTable((data as { overstays?: unknown }).overstays),
    "date.today": new Date().toLocaleDateString("ar-SA"),
    "date.now": new Date().toLocaleString("ar-SA"),
    "watermark": watermark ?? "",
  };

  for (const [key, val] of Object.entries(autoTokens)) {
    html = html.split(`{{${key}}}`).join(val);
  }

  // Expand {{#if path}}…{{/if}} blocks before {{#each}} so a conditional
  // wrapper around an each-block still works. Both helpers are non-greedy
  // single-pass — none of the existing presets nest them.
  html = expandIf(html, data);
  // Expand {{#each path}}…{{/each}} blocks
  html = expandEach(html, data);

  // Expand simple {{path.to.value}} placeholders.
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_m, path) => {
    const v = get(data, path);
    return escapeHtml(formatValue(v));
  });

  if (watermark) {
    html += `<div class="watermark" style="position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:84pt;color:rgba(220,38,38,0.16);font-weight:bold;pointer-events:none;z-index:9999;letter-spacing:8px">${escapeHtml(watermark)}</div>`;
  }
  return html;
}

export function renderContextToHtml(ctx: RenderContext): string {
  // Visual-mode templates store a block tree in layoutJson; convert it to the
  // same {{token}} HTML shape the preset templates use, then run substitution.
  let baseTemplate = ctx.template.mode === "visual" && ctx.template.layoutJson
    ? renderLayoutToHtml(ctx.template.layoutJson)
    : ctx.template.htmlContent ?? "";
  // BLANK-PAGE GUARD: a template can resolve to an empty body when the user
  // saves a draft with no htmlContent, or when a visual layout serialises
  // to an empty tree, or when a stub loader returns nothing for the items
  // table. Rendering empty bytes shows up as a fully-blank popup in the
  // browser — the SPA can't tell that apart from "popup-blocked" or
  // "Arabic mojibake", so users report "ما طبع شي".
  //
  // Fall back to a synthetic universal block: letterhead + meta-grid built
  // from whatever `data.entity` actually has + items table + footer. This
  // guarantees every render produces at least the branch header, the
  // entity id, and the verify block on the page.
  if (!baseTemplate.trim()) {
    baseTemplate = `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${escapeHtml(ctx.entityType)}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;
  }
  // Template-level overrides — the cliché editor lets users upload a custom
  // logo, override the company/branch header text, set a custom footer, and
  // attach a signature image per template. These win over the branch's
  // default letterhead so a single branch can have multiple presentations
  // (e.g. ZATCA invoice vs internal voucher).
  const headerOv = (ctx.template.headerOverride as Record<string, unknown>) ?? {};
  const footerOv = (ctx.template.footerOverride as Record<string, unknown>) ?? {};
  const mergedBranch = {
    ...ctx.branch,
    logoUrl: (headerOv.logoUrl as string) || ctx.branch.logoUrl,
    companyName: (headerOv.companyName as string) || ctx.branch.companyName,
    branchName: (headerOv.branchName as string) || ctx.branch.branchName,
    address: (headerOv.address as string) || ctx.branch.address,
    phone: (headerOv.phone as string) || ctx.branch.phone,
    email: (headerOv.email as string) || ctx.branch.email,
    website: (headerOv.website as string) || ctx.branch.website,
    taxNumber: (headerOv.taxNumber as string) || ctx.branch.taxNumber,
    crNumber: (headerOv.crNumber as string) || ctx.branch.crNumber,
    footerText: (footerOv.text as string) || ctx.branch.footerText,
  };
  const subOpts = {
    data: ctx.data,
    branch: mergedBranch,
    isThermal: ctx.template.isThermal || ctx.format.startsWith("thermal"),
    watermark: ctx.watermark,
    verifyUrl: ctx.verifyUrl ?? null,
    verifyQrDataUrl: ctx.verifyQrDataUrl ?? null,
    jobId: ctx.jobId ?? null,
  };
  let rendered = substitute({ template: baseTemplate, ...subOpts });

  // POST-SUBSTITUTION EMPTY-BODY GUARD: a template can be syntactically
  // non-empty but render to nothing visible — every {{token}} resolves to
  // an empty string because the data shape doesn't match the template's
  // expectations, or because branchContext returned empty letterhead, or
  // because a hand-saved template has bogus structure. The result is a
  // page with only the watermark overlay (which is layered on top via the
  // adapter wrapper, not from `rendered`) — users see a blank page and
  // file "ما يطبع شي" tickets.
  //
  // Strip the rendered HTML down to what the user actually sees (no
  // <style>, no <script>, no comments, no whitespace) and if the
  // remaining text + meaningful tag count is suspiciously low, fall back
  // to the universal preset. This is belt-and-suspenders on top of the
  // pre-substitution empty-template guard above — that one caught
  // `htmlContent=""`, this one catches `htmlContent="<div></div>"` and
  // every other "syntactically present but visually empty" case.
  const visibleLen = rendered
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim().length;
  if (visibleLen < 50) {
    // eslint-disable-next-line no-console
    console.warn(
      `[print/render] post-substitution body almost empty (visibleLen=${visibleLen}) — falling back to universal preset for ${ctx.entityType}/${ctx.entityId}`,
    );
    const universalTemplate = `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0;padding-bottom:8px;border-bottom:2px solid #334155">${escapeHtml(ctx.entityType)} — ${escapeHtml(String(ctx.entityId))}</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
  <div><strong>المعرّف:</strong> {{entity.id}}</div>
</div>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;
    rendered = substitute({ template: universalTemplate, ...subOpts });
  }
  return rendered;
}
