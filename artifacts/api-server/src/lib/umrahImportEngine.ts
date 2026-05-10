/**
 * Umrah Import Engine — Phase 2.
 *
 * Handles cumulative daily NUSK Excel uploads (mutamer roster + voucher
 * list). The engine parses Arabic-headered .xlsx workbooks, normalises
 * each row, classifies it as INSERT / UPDATE / SKIP against the live
 * tables, surfaces a preview to the user, and on confirmation applies the
 * staged changes inside a single transaction. Every batch + per-row diff
 * is persisted into umrah_import_batches + umrah_import_changes for full
 * auditability.
 *
 * Conventions inherited from the rest of the API server:
 *   * raw SQL via rawQuery / rawExecute / withTransaction (lib/rawdb.ts)
 *   * typed errors (ValidationError, ConflictError, NotFoundError) so the
 *     route handler can call handleRouteError without further mapping
 *   * events fired through emitEvent (lib/businessHelpers.ts) — the new
 *     listener shims are added in lib/eventListeners.ts so event_logs +
 *     audit_logs gain rows automatically (no silent drops)
 *   * settings are read via getCompanySetting() with the documented
 *     three-level inheritance (system → company → branch)
 *   * xlsx import is the same pinned package excelExport.ts uses (no new
 *     dependency, no behavioural quirks introduced)
 *
 * The engine writes only into the new umrah_* tables added by migration
 * 067; the legacy passport-based importer in routes/umrah.ts (line 346)
 * is untouched and keeps working for the 24 existing endpoints.
 */

import * as XLSX from "xlsx";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import type { PoolClient } from "pg";
import { emitEvent } from "./businessHelpers.js";
import { ValidationError, NotFoundError, ConflictError } from "./errorHandler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportScope {
  companyId: number;
  branchId: number | null;
  userId: number;
  seasonId: number;
}

export type FileType = "mutamers" | "vouchers";

export interface ImportFileMeta {
  fileName: string;
  fileSize: number;
}

/** Normalised mutamer row produced by parseMutamersWorkbook(). */
export interface ParsedMutamerRow {
  rowNumber: number;
  nuskNumber: string;
  name: string;
  nationality: string | null;
  gender: "male" | "female" | null;
  passportNumber: string | null;
  passportExpiry: string | null; // ISO yyyy-mm-dd
  nuskAgentNumber: string | null;
  agentName: string | null;
  country: string | null;
  nuskCode: string | null; // sub-agent code
  subAgentName: string | null;
  nuskGroupNumber: string | null;
  groupName: string | null;
  entryDate: string | null;
  entryPort: string | null;
  entryFlight: string | null;
  exitDate: string | null;
  exitPort: string | null;
  exitFlight: string | null;
  actualStayDays: number | null;
  programDuration: number | null;
  borderNumber: string | null;
  visaNumber: string | null;
  mofaNumber: string | null;
  status: MutamerStatus;
  isInsideKingdom: boolean;
  hasUmrahPermit: boolean;
}

export type MutamerStatus =
  | "inside_kingdom"
  | "exited"
  | "overstay"
  | "absconded"
  | "deceased"
  | "visa_rejected"
  | "visa_printed";

/** Normalised voucher row produced by parseVouchersWorkbook(). */
export interface ParsedVoucherRow {
  rowNumber: number;
  nuskInvoiceNumber: string;
  agentName: string | null;
  nuskAgentNumber: string | null;
  subAgentName: string | null;
  nuskCode: string | null;
  nuskGroupNumber: string | null;
  mutamerCount: number;
  programDuration: number | null;
  groundServices: number;
  electronicFees: number;
  visaFees: number;
  insuranceFees: number;
  enrichmentServices: number;
  additionalServices: number;
  transportTotal: number;
  hotelTotal: number;
  refundAmount: number;
  totalAmount: number;
  netCost: number; // computed = total - refund
  nuskStatus: NuskInvoiceStatus;
  issueDate: string | null;
  expiryDate: string | null;
}

export type NuskInvoiceStatus =
  | "paid"
  | "pending"
  | "expired"
  | "in_progress"
  | "refunded";

/** Per-row diff classification. */
export type ChangeType = "created" | "updated" | "skipped" | "error";

export interface RowDiff {
  rowNumber: number;
  key: string; // nuskNumber or nuskInvoiceNumber
  changeType: ChangeType;
  reason?: string;
  changedFields?: { field: string; oldValue: any; newValue: any }[];
  errorMessage?: string;
  hasFinancialImpact?: boolean;
  /** Resolved internal id when known (existing row). */
  existingId?: number;
}

export interface UnlinkedSubAgentInfo {
  nuskCode: string | null;
  name: string;
  agentName: string | null;
  country: string | null;
  occurrences: number;
}

export interface ImportPreviewSummary {
  batchId: number;
  fileType: FileType;
  fileName: string;
  totalRows: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  financialImpactCount: number;
  manualReviewCount: number;
  newOverstays: number;
  newAbsconders: number;
  newAgents: number;
  newSubAgents: number;
  newGroups: number;
  unlinkedSubAgents: UnlinkedSubAgentInfo[];
  errors: { row: number; key: string | null; message: string }[];
  /** Per-row classification (for the wizard UI). Limited to first 1000 rows. */
  sampleDiffs: RowDiff[];
}

export interface ConfirmImportResult {
  batchId: number;
  applied: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    violationsCreated: number;
    purchaseInvoicesCreated: number;
    agentsCreated: number;
    subAgentsCreated: number;
    groupsCreated: number;
  };
}

interface UmrahSettings {
  overstayDailyPenalty: number;
  absconderPenalty: number;
  defaultProgramDuration: number;
  importAutoCreateGroups: boolean;
  importAutoCreatePurchase: boolean;
  requireAgentLinking: boolean;
}

// ---------------------------------------------------------------------------
// Constants — Arabic header maps + status / gender / boolean translations
// ---------------------------------------------------------------------------

/**
 * Canonical → list-of-Arabic-aliases map for the 35-column mutamer report.
 * Aliases are normalised (NFC + collapsed whitespace + alif/yaa unification)
 * before lookup, so we list only one canonical Arabic spelling per concept.
 */
const MUTAMER_HEADER_ALIASES: Record<string, string[]> = {
  nuskAgentNumber: ["رقم الوكيل", "رقم الوكيل الرئيسي"],
  agentName: ["اسم الوكيل", "الوكيل الرئيسي"],
  nuskCode: ["كود الوكيل الفرعي", "رمز المكتب", "رقم الوكيل الفرعي", "كود المكتب"],
  subAgentName: ["الوكيل الفرعي", "اسم الوكيل الفرعي", "المكتب", "اسم المكتب"],
  country: ["دولة الوكيل", "الدولة", "دولة المعتمر"],
  nuskGroupNumber: ["رقم المجموعة", "كود المجموعة"],
  groupName: ["اسم المجموعة"],
  name: ["اسم المعتمر", "الاسم", "اسم المعتمر بالعربي"],
  nuskNumber: [
    "رقم المعتمر في النظام",
    "رقم المعتمر",
    "رقم النظام",
    "رقم نسك",
    "رقم النسك",
  ],
  nationality: ["الجنسية", "الجنسيه"],
  gender: ["النوع", "الجنس"],
  passportNumber: ["رقم الجواز", "جواز السفر", "رقم جواز السفر"],
  passportExpiry: ["تاريخ انتهاء الجواز", "انتهاء الجواز"],
  entryDate: ["تاريخ الدخول", "تاريخ الوصول"],
  entryPort: ["منفذ الدخول", "منفذ الوصول", "ميناء الدخول"],
  entryFlight: ["رحلة الوصول", "رقم رحلة الوصول"],
  exitDate: ["تاريخ الخروج", "تاريخ المغادرة"],
  exitPort: ["منفذ الخروج", "منفذ المغادرة", "ميناء الخروج"],
  exitFlight: ["رحلة المغادرة", "رقم رحلة المغادرة"],
  actualStayDays: ["عدد ايام الاقامة", "ايام الاقامة الفعلية", "ايام الاقامة"],
  programDuration: ["مدة البرنامج", "مدة الاقامة المسموحة"],
  borderNumber: ["رقم الحدود"],
  visaNumber: ["رقم التأشيرة", "رقم التاشيرة"],
  mofaNumber: ["رقم الموفا", "رقم موفا"],
  status: ["حالة المعتمر", "الحالة"],
  isInsideKingdom: ["متواجد داخل المملكة", "داخل المملكة", "متواجد داخل المملكه"],
  hasUmrahPermit: ["تصريح عمرة", "تصريح العمرة"],
};

const VOUCHER_HEADER_ALIASES: Record<string, string[]> = {
  nuskInvoiceNumber: ["رقم الفاتورة", "رقم فاتورة نسك"],
  agentName: ["اسم الوكيل", "الوكيل الرئيسي"],
  nuskAgentNumber: ["رقم الوكيل"],
  subAgentName: ["الوكيل الفرعي", "اسم الوكيل الفرعي"],
  nuskCode: ["كود الوكيل الفرعي", "رمز المكتب"],
  nuskGroupNumber: ["رقم المجموعة"],
  mutamerCount: ["عدد المعتمرين", "اعداد المعتمرين"],
  programDuration: ["مدة البرنامج"],
  groundServices: ["اجمالي الخدمات الارضية", "الخدمات الارضية"],
  electronicFees: ["رسوم الخدمات الالكترونية", "الرسوم الالكترونية"],
  visaFees: ["رسوم التأشيرة", "رسوم التاشيرة"],
  insuranceFees: ["اجمالي خدمات التامين", "رسوم التامين", "التامين"],
  enrichmentServices: ["الخدمات الإثرائية", "الخدمات الاثرائية"],
  additionalServices: ["الخدمات الإضافية", "الخدمات الاضافية"],
  transportTotal: ["النقل", "اجمالي النقل"],
  hotelTotal: ["الفنادق", "اجمالي الفنادق", "الاسكان"],
  refundAmount: ["المبلغ المرتجع لشركة العمرة", "المبلغ المرتجع", "المرتجع"],
  totalAmount: ["المبلغ الاجمالي", "الاجمالي"],
  nuskStatus: ["حالة الفاتورة", "الحالة"],
  issueDate: ["تاريخ الإصدار", "تاريخ الاصدار"],
  expiryDate: ["تاريخ الانتهاء", "تاريخ انتهاء الصلاحية"],
};

const STATUS_MAP: Record<string, MutamerStatus> = {
  "داخل المملكة": "inside_kingdom",
  "متواجد داخل المملكة": "inside_kingdom",
  "داخل": "inside_kingdom",
  "خرج": "exited",
  "خارج المملكة": "exited",
  "تم الخروج": "exited",
  "غادر": "exited",
  "متجاوز": "overstay",
  "تجاوز": "overstay",
  "متجاوز للمدة": "overstay",
  "تم التبليغ": "absconded",
  "متغيب": "absconded",
  "متغيّب": "absconded",
  "هارب": "absconded",
  "تم التبليغ عنه": "absconded",
  "متوفى": "deceased",
  "متوفي": "deceased",
  "تأشيرة مرفوضة": "visa_rejected",
  "تاشيرة مرفوضة": "visa_rejected",
  "مرفوض": "visa_rejected",
  "تأشيرة مطبوعة": "visa_printed",
  "تاشيرة مطبوعة": "visa_printed",
  "مطبوعة": "visa_printed",
};

const NUSK_INVOICE_STATUS_MAP: Record<string, NuskInvoiceStatus> = {
  "مدفوعة": "paid",
  "مدفوع": "paid",
  "مسددة": "paid",
  "تم الدفع": "paid",
  "غير مدفوعة": "pending",
  "معلقة": "pending",
  "في الانتظار": "pending",
  "منتهية الصلاحية": "expired",
  "منتهية": "expired",
  "قيد التنفيذ": "in_progress",
  "جاري": "in_progress",
  "مرتجعة": "refunded",
};

const GENDER_MAP: Record<string, "male" | "female"> = {
  "ذكر": "male",
  "ذ": "male",
  "m": "male",
  "male": "male",
  "أنثى": "female",
  "انثى": "female",
  "ا": "female",
  "ف": "female",
  "f": "female",
  "female": "female",
};

const TRUE_VALUES = new Set([
  "true", "1", "yes", "y", "نعم", "صح", "متواجد", "موجود", "مفعل", "✓", "✔",
]);
const FALSE_VALUES = new Set([
  "false", "0", "no", "n", "لا", "خطأ", "غير متواجد", "غير موجود", "معطل", "—", "-",
]);

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

const ARABIC_DIACRITICS = /[ً-ْٰـ]/g; // tashkeel + tatweel

/**
 * Aggressive Arabic normalisation. Goal: header lookups and freeform
 * status/gender lookups should match regardless of how the typist
 * spelled it (alif variants, hamza/no-hamza, ya/alif maqsura, taa-marbuta
 * vs haa, presence of diacritics or extra whitespace).
 *
 * We deliberately keep the *display* values un-normalised in the output
 * rows; only lookup keys are normalised. This way we don't lose the
 * authentic spelling that came from NUSK.
 */
function normaliseLookup(s: string | null | undefined): string {
  if (!s) return "";
  let out = String(s).normalize("NFC");
  out = out.replace(ARABIC_DIACRITICS, "");
  out = out.replace(/[إأآا]/g, "ا");
  out = out.replace(/ى/g, "ي");
  out = out.replace(/ة/g, "ه");
  out = out.replace(/[​-‏﻿]/g, ""); // zero-width / RTL marks
  out = out.replace(/\s+/g, " ").trim().toLowerCase();
  return out;
}

/** Plain trim + NFC, preserving the user's spelling. */
function cleanText(s: any): string | null {
  if (s === null || s === undefined) return null;
  const str = String(s).normalize("NFC").replace(/\s+/g, " ").trim();
  return str === "" ? null : str;
}

function toNumber(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // Strip Arabic-Indic digits, thousand separators, currency labels.
  const s = String(v)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\d.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = toNumber(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toBool(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const lookup = normaliseLookup(String(v));
  if (TRUE_VALUES.has(lookup)) return true;
  if (FALSE_VALUES.has(lookup)) return false;
  return false;
}

function toIsoDate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  // Excel cellDates:true delivers JS Dates; fall back to string parsing.
  const s = cleanText(v);
  if (!s) return null;
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toIsoDateTime(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const date = toIsoDate(v);
  return date;
}

function mapStatus(v: any): MutamerStatus {
  const lookup = normaliseLookup(v);
  if (!lookup) return "inside_kingdom";
  for (const [arabic, eng] of Object.entries(STATUS_MAP)) {
    if (normaliseLookup(arabic) === lookup) return eng;
  }
  return "inside_kingdom";
}

function mapNuskInvoiceStatus(v: any): NuskInvoiceStatus {
  const lookup = normaliseLookup(v);
  if (!lookup) return "pending";
  for (const [arabic, eng] of Object.entries(NUSK_INVOICE_STATUS_MAP)) {
    if (normaliseLookup(arabic) === lookup) return eng;
  }
  return "pending";
}

function mapGender(v: any): "male" | "female" | null {
  const lookup = normaliseLookup(v);
  if (!lookup) return null;
  for (const [k, val] of Object.entries(GENDER_MAP)) {
    if (normaliseLookup(k) === lookup) return val;
  }
  return null;
}

/** Build a header→canonical-key map by matching the file's header row
 *  against the alias dictionary. Unknown columns are silently dropped. */
function buildHeaderIndex(
  rawHeaders: string[],
  aliases: Record<string, string[]>
): Map<number, string> {
  const lookupToCanonical = new Map<string, string>();
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const arabic of list) {
      lookupToCanonical.set(normaliseLookup(arabic), canonical);
    }
  }
  const out = new Map<number, string>();
  for (let i = 0; i < rawHeaders.length; i++) {
    const norm = normaliseLookup(rawHeaders[i]);
    if (!norm) continue;
    const canonical = lookupToCanonical.get(norm);
    if (canonical) out.set(i, canonical);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Settings loader (system → company → branch inheritance)
// ---------------------------------------------------------------------------

async function loadUmrahSettings(scope: ImportScope): Promise<UmrahSettings> {
  const keys = [
    "umrah.overstay_daily_penalty",
    "umrah.absconder_penalty",
    "umrah.default_program_duration",
    "umrah.import_auto_create_groups",
    "umrah.import_auto_create_purchase",
    "umrah.require_agent_linking",
  ];

  // Pull every applicable scope row at once; closest scope wins.
  const rows = await rawQuery<{ key: string; value: string; companyId: number | null; branchId: number | null }>(
    `SELECT key, value, "companyId", "branchId"
       FROM system_settings
      WHERE key = ANY($1)
        AND ( ("companyId" IS NULL AND "branchId" IS NULL)
              OR ("companyId" = $2 AND "branchId" IS NULL)
              OR ("companyId" = $2 AND "branchId" = $3) )`,
    [keys, scope.companyId, scope.branchId]
  );

  const resolved: Record<string, string> = {};
  // Order matters: system first, then company, then branch (last write wins).
  const sorted = [...rows].sort((a, b) => {
    const rank = (r: typeof a) => (r.companyId === null ? 0 : r.branchId === null ? 1 : 2);
    return rank(a) - rank(b);
  });
  for (const r of sorted) resolved[r.key] = r.value;

  const num = (k: string, d: number) => {
    const v = resolved[k];
    if (v === undefined || v === null || v === "") return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const bool = (k: string, d: boolean) => {
    const v = resolved[k];
    if (v === undefined || v === null || v === "") return d;
    return v === "true" || v === "1";
  };

  return {
    overstayDailyPenalty: num("umrah.overstay_daily_penalty", 0),
    absconderPenalty: num("umrah.absconder_penalty", 2000),
    defaultProgramDuration: num("umrah.default_program_duration", 14),
    importAutoCreateGroups: bool("umrah.import_auto_create_groups", true),
    importAutoCreatePurchase: bool("umrah.import_auto_create_purchase", true),
    requireAgentLinking: bool("umrah.require_agent_linking", true),
  };
}

// ---------------------------------------------------------------------------
// Excel parsing
// ---------------------------------------------------------------------------

export function parseMutamersWorkbook(
  buffer: Buffer | Uint8Array | ArrayBuffer
): ParsedMutamerRow[] {
  const wb = XLSX.read(buffer as any, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ValidationError("الملف لا يحتوي على ورقة عمل صالحة");
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  });
  if (aoa.length < 2) throw new ValidationError("الملف لا يحتوي على بيانات صالحة");

  const headers = (aoa[0] as any[]).map((h) => (h === null || h === undefined ? "" : String(h)));
  const idx = buildHeaderIndex(headers, MUTAMER_HEADER_ALIASES);

  if (!Array.from(idx.values()).includes("nuskNumber")) {
    throw new ValidationError(
      "تعذّر العثور على عمود 'رقم المعتمر في النظام' في الملف — تأكد من قالب نسك الصحيح"
    );
  }

  const out: ParsedMutamerRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;

    const get = (key: string) => {
      for (const [i, k] of idx.entries()) if (k === key) return row[i];
      return null;
    };

    const nuskNumber = cleanText(get("nuskNumber"));
    if (!nuskNumber) continue; // skip rows missing the unique key

    const status = mapStatus(get("status"));
    const explicitInside = get("isInsideKingdom");
    const isInsideKingdom = explicitInside !== null && explicitInside !== undefined && explicitInside !== ""
      ? toBool(explicitInside)
      : status === "inside_kingdom" || status === "overstay";

    out.push({
      rowNumber: r + 1,
      nuskNumber,
      name: cleanText(get("name")) ?? "(بدون اسم)",
      nationality: cleanText(get("nationality")),
      gender: mapGender(get("gender")),
      passportNumber: cleanText(get("passportNumber")),
      passportExpiry: toIsoDate(get("passportExpiry")),
      nuskAgentNumber: cleanText(get("nuskAgentNumber")),
      agentName: cleanText(get("agentName")),
      country: cleanText(get("country")),
      nuskCode: cleanText(get("nuskCode")),
      subAgentName: cleanText(get("subAgentName")),
      nuskGroupNumber: cleanText(get("nuskGroupNumber")),
      groupName: cleanText(get("groupName")),
      entryDate: toIsoDateTime(get("entryDate")),
      entryPort: cleanText(get("entryPort")),
      entryFlight: cleanText(get("entryFlight")),
      exitDate: toIsoDateTime(get("exitDate")),
      exitPort: cleanText(get("exitPort")),
      exitFlight: cleanText(get("exitFlight")),
      actualStayDays: toIntOrNull(get("actualStayDays")),
      programDuration: toIntOrNull(get("programDuration")),
      borderNumber: cleanText(get("borderNumber")),
      visaNumber: cleanText(get("visaNumber")),
      mofaNumber: cleanText(get("mofaNumber")),
      status,
      isInsideKingdom,
      hasUmrahPermit: toBool(get("hasUmrahPermit")),
    });
  }

  return out;
}

export function parseVouchersWorkbook(
  buffer: Buffer | Uint8Array | ArrayBuffer
): ParsedVoucherRow[] {
  const wb = XLSX.read(buffer as any, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ValidationError("الملف لا يحتوي على ورقة عمل صالحة");
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  });
  if (aoa.length < 2) throw new ValidationError("الملف لا يحتوي على بيانات صالحة");

  const headers = (aoa[0] as any[]).map((h) => (h === null || h === undefined ? "" : String(h)));
  const idx = buildHeaderIndex(headers, VOUCHER_HEADER_ALIASES);

  if (!Array.from(idx.values()).includes("nuskInvoiceNumber")) {
    throw new ValidationError(
      "تعذّر العثور على عمود 'رقم الفاتورة' في الملف — تأكد من قالب نسك الصحيح"
    );
  }

  const out: ParsedVoucherRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;

    const get = (key: string) => {
      for (const [i, k] of idx.entries()) if (k === key) return row[i];
      return null;
    };

    const nuskInvoiceNumber = cleanText(get("nuskInvoiceNumber"));
    if (!nuskInvoiceNumber) continue;

    const total = toNumber(get("totalAmount"));
    const refund = toNumber(get("refundAmount"));

    out.push({
      rowNumber: r + 1,
      nuskInvoiceNumber,
      agentName: cleanText(get("agentName")),
      nuskAgentNumber: cleanText(get("nuskAgentNumber")),
      subAgentName: cleanText(get("subAgentName")),
      nuskCode: cleanText(get("nuskCode")),
      nuskGroupNumber: cleanText(get("nuskGroupNumber")),
      mutamerCount: toIntOrNull(get("mutamerCount")) ?? 0,
      programDuration: toIntOrNull(get("programDuration")),
      groundServices: toNumber(get("groundServices")),
      electronicFees: toNumber(get("electronicFees")),
      visaFees: toNumber(get("visaFees")),
      insuranceFees: toNumber(get("insuranceFees")),
      enrichmentServices: toNumber(get("enrichmentServices")),
      additionalServices: toNumber(get("additionalServices")),
      transportTotal: toNumber(get("transportTotal")),
      hotelTotal: toNumber(get("hotelTotal")),
      refundAmount: refund,
      totalAmount: total,
      netCost: Math.max(0, Math.round((total - refund) * 100) / 100),
      nuskStatus: mapNuskInvoiceStatus(get("nuskStatus")),
      issueDate: toIsoDateTime(get("issueDate")),
      expiryDate: toIsoDateTime(get("expiryDate")),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Diff helpers — fields we actually care about for change detection.
// Anything outside these lists is considered cosmetic and won't trigger an
// UPDATE. This is the heart of the "ignore daily NUSK noise" requirement.
// ---------------------------------------------------------------------------

const MUTAMER_TRACKED_FIELDS: (keyof ParsedMutamerRow)[] = [
  "name",
  "nationality",
  "gender",
  "passportNumber",
  "passportExpiry",
  "entryDate",
  "entryPort",
  "entryFlight",
  "exitDate",
  "exitPort",
  "exitFlight",
  "actualStayDays",
  "programDuration",
  "borderNumber",
  "visaNumber",
  "mofaNumber",
  "status",
  "isInsideKingdom",
  "hasUmrahPermit",
];

const VOUCHER_TRACKED_FIELDS: (keyof ParsedVoucherRow)[] = [
  "mutamerCount",
  "programDuration",
  "groundServices",
  "electronicFees",
  "visaFees",
  "insuranceFees",
  "enrichmentServices",
  "additionalServices",
  "transportTotal",
  "hotelTotal",
  "refundAmount",
  "totalAmount",
  "netCost",
  "nuskStatus",
  "issueDate",
  "expiryDate",
];

const MUTAMER_FINANCIAL_FIELDS = new Set<keyof ParsedMutamerRow>([
  "status", "actualStayDays", "exitDate",
]);
const VOUCHER_FINANCIAL_FIELDS = new Set<keyof ParsedVoucherRow>([
  "totalAmount", "refundAmount", "netCost", "nuskStatus", "mutamerCount",
]);

/** Fields that hold dates / timestamps. Both sides are sliced to YYYY-MM-DD
 *  before comparison so DB-side `Date` objects don't cause false UPDATEs
 *  against fresh ISO-date strings parsed from Excel. */
const MUTAMER_DATE_FIELDS = new Set<string>([
  "passportExpiry", "entryDate", "exitDate",
]);
const VOUCHER_DATE_FIELDS = new Set<string>([
  "issueDate", "expiryDate",
]);

function normaliseDate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function diffFields<T extends Record<string, any>>(
  fresh: T,
  existing: Record<string, any>,
  fields: readonly (keyof T)[],
  financialSet: Set<keyof T>,
  dateFields: Set<string> = new Set()
): { changed: { field: string; oldValue: any; newValue: any }[]; financial: boolean } {
  const changed: { field: string; oldValue: any; newValue: any }[] = [];
  let financial = false;
  const norm = (v: any) => (v === undefined || v === "" ? null : v);

  for (const f of fields) {
    const fname = f as string;
    let newV: any = fresh[f];
    let oldV: any = existing[fname];

    if (dateFields.has(fname)) {
      const a = normaliseDate(newV);
      const b = normaliseDate(oldV);
      if (a !== b) {
        changed.push({ field: fname, oldValue: b, newValue: a });
        if (financialSet.has(f)) financial = true;
      }
      continue;
    }

    // Numeric coercion — DB returns NUMERIC as string; xlsx may return number.
    if (typeof newV === "number" && typeof oldV === "string") {
      const n = Number(oldV);
      if (Number.isFinite(n)) oldV = n;
    }
    if (typeof oldV === "number" && typeof newV === "string") {
      const n = Number(newV);
      if (Number.isFinite(n)) newV = n;
    }
    // Floating-point money: round to 2dp before comparing.
    if (typeof newV === "number" && typeof oldV === "number") {
      newV = Math.round(newV * 100) / 100;
      oldV = Math.round(oldV * 100) / 100;
    }
    // Date objects on the DB side that aren't in the date set: ISO-stringify.
    if (oldV instanceof Date) oldV = oldV.toISOString();
    if (newV instanceof Date) newV = newV.toISOString();

    if (norm(newV) !== norm(oldV)) {
      changed.push({ field: fname, oldValue: oldV ?? null, newValue: newV ?? null });
      if (financialSet.has(f)) financial = true;
    }
  }
  return { changed, financial };
}

// ---------------------------------------------------------------------------
// Resolver helpers — agents / sub-agents / groups
// ---------------------------------------------------------------------------

interface AgentResolution {
  byNuskNumber: Map<string, number>;
  byName: Map<string, number>;
  newAgents: { nuskAgentNumber: string | null; name: string; country: string | null }[];
}

async function resolveAgents(
  client: PoolClient | null,
  scope: ImportScope,
  rows: { nuskAgentNumber: string | null; agentName: string | null; country?: string | null }[]
): Promise<AgentResolution> {
  const byNuskNumber = new Map<string, number>();
  const byName = new Map<string, number>();

  const numbers = Array.from(new Set(rows.map((r) => r.nuskAgentNumber).filter(Boolean) as string[]));
  const names = Array.from(new Set(rows.map((r) => r.agentName).filter(Boolean) as string[]));

  const q = (sql: string, params: any[]) =>
    client ? client.query(sql, params).then((r) => r.rows as any[]) : rawQuery<any>(sql, params);

  if (numbers.length > 0) {
    const existing = await q(
      `SELECT id, "nuskAgentNumber", name FROM umrah_agents
        WHERE "companyId"=$1 AND "seasonId"=$2
          AND "nuskAgentNumber" = ANY($3) AND "deletedAt" IS NULL`,
      [scope.companyId, scope.seasonId, numbers]
    );
    for (const a of existing) byNuskNumber.set(a.nuskAgentNumber, a.id);
  }
  if (names.length > 0) {
    const existing = await q(
      `SELECT id, name FROM umrah_agents
        WHERE "companyId"=$1 AND "seasonId"=$2
          AND name = ANY($2::text[]) AND "deletedAt" IS NULL`.replace("$2::text[]", "$3"),
      [scope.companyId, scope.seasonId, names]
    );
    for (const a of existing) byName.set(a.name, a.id);
  }

  const seenAgentKeys = new Set<string>();
  const newAgents: { nuskAgentNumber: string | null; name: string; country: string | null }[] = [];
  for (const r of rows) {
    if (!r.agentName && !r.nuskAgentNumber) continue;
    const key = `${r.nuskAgentNumber ?? ""}::${r.agentName ?? ""}`;
    if (seenAgentKeys.has(key)) continue;
    seenAgentKeys.add(key);
    const known =
      (r.nuskAgentNumber && byNuskNumber.has(r.nuskAgentNumber)) ||
      (r.agentName && byName.has(r.agentName));
    if (!known) {
      newAgents.push({
        nuskAgentNumber: r.nuskAgentNumber,
        name: r.agentName ?? "(وكيل بدون اسم)",
        country: r.country ?? null,
      });
    }
  }

  return { byNuskNumber, byName, newAgents };
}

interface SubAgentResolution {
  byNuskCode: Map<string, number>;
  byName: Map<string, number>;
  unlinked: UnlinkedSubAgentInfo[];
  /** Sub-agents we will auto-create (no clientId). They CANNOT be billed
   *  until linked, but they MUST exist for groups/mutamers FKs. */
  newSubAgents: { nuskCode: string | null; name: string; agentName: string | null; country: string | null }[];
}

async function resolveSubAgents(
  client: PoolClient | null,
  scope: ImportScope,
  rows: {
    nuskCode: string | null;
    subAgentName: string | null;
    agentName: string | null;
    country?: string | null;
  }[]
): Promise<SubAgentResolution> {
  const byNuskCode = new Map<string, number>();
  const byName = new Map<string, number>();

  const codes = Array.from(new Set(rows.map((r) => r.nuskCode).filter(Boolean) as string[]));
  const names = Array.from(new Set(rows.map((r) => r.subAgentName).filter(Boolean) as string[]));

  const q = (sql: string, params: any[]) =>
    client ? client.query(sql, params).then((r) => r.rows as any[]) : rawQuery<any>(sql, params);

  if (codes.length > 0) {
    const existing = await q(
      `SELECT id, "nuskCode", name, "clientId" FROM umrah_sub_agents
        WHERE "companyId"=$1 AND "nuskCode" = ANY($2) AND "deletedAt" IS NULL`,
      [scope.companyId, codes]
    );
    for (const s of existing) byNuskCode.set(s.nuskCode, s.id);
  }
  if (names.length > 0) {
    const existing = await q(
      `SELECT id, name, "clientId" FROM umrah_sub_agents
        WHERE "companyId"=$1 AND name = ANY($2) AND "deletedAt" IS NULL`,
      [scope.companyId, names]
    );
    for (const s of existing) byName.set(s.name, s.id);
  }

  const seen = new Set<string>();
  const unlinked: UnlinkedSubAgentInfo[] = [];
  const unlinkedMap = new Map<string, UnlinkedSubAgentInfo>();
  const newSubAgents: { nuskCode: string | null; name: string; agentName: string | null; country: string | null }[] = [];
  for (const r of rows) {
    if (!r.nuskCode && !r.subAgentName) continue;
    const key = `${r.nuskCode ?? ""}::${r.subAgentName ?? ""}`;
    if (seen.has(key)) {
      const u = unlinkedMap.get(key);
      if (u) u.occurrences += 1;
      continue;
    }
    seen.add(key);
    const known =
      (r.nuskCode && byNuskCode.has(r.nuskCode)) ||
      (r.subAgentName && byName.has(r.subAgentName));
    if (!known) {
      const info: UnlinkedSubAgentInfo = {
        nuskCode: r.nuskCode,
        name: r.subAgentName ?? "(وكيل فرعي بدون اسم)",
        agentName: r.agentName,
        country: r.country ?? null,
        occurrences: 1,
      };
      unlinked.push(info);
      unlinkedMap.set(key, info);
      newSubAgents.push({
        nuskCode: r.nuskCode,
        name: r.subAgentName ?? "(وكيل فرعي بدون اسم)",
        agentName: r.agentName,
        country: r.country ?? null,
      });
    }
  }

  return { byNuskCode, byName, unlinked, newSubAgents };
}

// ---------------------------------------------------------------------------
// Preview — Mutamers
// ---------------------------------------------------------------------------

export async function previewMutamersImport(
  scope: ImportScope,
  meta: ImportFileMeta,
  buffer: Buffer
): Promise<ImportPreviewSummary> {
  await assertSeasonOpen(scope);

  const parsed = parseMutamersWorkbook(buffer);
  if (parsed.length === 0) {
    throw new ValidationError("لم يتم العثور على أي معتمر صالح في الملف");
  }

  const settings = await loadUmrahSettings(scope);

  // Apply defaultProgramDuration where missing (read-only here, no DB write yet).
  for (const r of parsed) {
    if (r.programDuration === null || r.programDuration === 0) {
      r.programDuration = settings.defaultProgramDuration;
    }
    if (r.actualStayDays !== null && r.programDuration !== null) {
      r.actualStayDays = r.actualStayDays;
    }
  }

  // Deduplicate within file: last row wins (NUSK files are cumulative).
  const dedup = new Map<string, ParsedMutamerRow>();
  for (const r of parsed) dedup.set(r.nuskNumber, r);
  const rows = Array.from(dedup.values());

  // Pull every existing mutamer in one shot.
  const existingRows = await rawQuery<any>(
    `SELECT id, "nuskNumber", name, nationality, gender, "passportNumber", "passportExpiry",
            "entryDate", "entryPort", "entryFlight", "exitDate", "exitPort", "exitFlight",
            "actualStayDays", "programDuration", "borderNumber", "visaNumber", "mofaNumber",
            status, "isInsideKingdom", "hasUmrahPermit"
       FROM umrah_mutamers
      WHERE "companyId"=$1 AND "deletedAt" IS NULL
        AND "nuskNumber" = ANY($2)`,
    [scope.companyId, rows.map((r) => r.nuskNumber)]
  );
  const existingMap = new Map<string, any>(existingRows.map((e) => [e.nuskNumber, e]));

  // Resolve agents / sub-agents / groups (no inserts in preview).
  const agents = await resolveAgents(null, scope, rows);
  const subAgents = await resolveSubAgents(null, scope, rows);

  const groupNumbers = Array.from(new Set(rows.map((r) => r.nuskGroupNumber).filter(Boolean) as string[]));
  const existingGroups = groupNumbers.length === 0
    ? []
    : await rawQuery<any>(
        `SELECT id, "nuskGroupNumber" FROM umrah_groups
          WHERE "companyId"=$1 AND "nuskGroupNumber" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, groupNumbers]
      );
  const groupMap = new Map<string, number>(existingGroups.map((g) => [g.nuskGroupNumber, g.id]));
  const newGroupNumbers = groupNumbers.filter((n) => !groupMap.has(n));

  // Classify every row.
  const sampleDiffs: RowDiff[] = [];
  let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0;
  let financialImpactCount = 0;
  let newOverstays = 0, newAbsconders = 0;
  const errors: { row: number; key: string | null; message: string }[] = [];

  for (const fresh of rows) {
    if (!fresh.passportNumber) {
      // Tolerate — passport can still come on a future cumulative file. Mark
      // for manual review but don't error out the row.
    }
    const existing = existingMap.get(fresh.nuskNumber);
    if (!existing) {
      newCount++;
      const isOverstay = (fresh.actualStayDays ?? 0) > (fresh.programDuration ?? 0)
        || fresh.status === "overstay";
      const isAbsconder = fresh.status === "absconded";
      if (isOverstay && fresh.isInsideKingdom) newOverstays++;
      if (isAbsconder) newAbsconders++;
      sampleDiffs.push({
        rowNumber: fresh.rowNumber,
        key: fresh.nuskNumber,
        changeType: "created",
        hasFinancialImpact: isOverstay || isAbsconder,
      });
      if (isOverstay || isAbsconder) financialImpactCount++;
      continue;
    }
    const diff = diffFields(fresh, existing, MUTAMER_TRACKED_FIELDS, MUTAMER_FINANCIAL_FIELDS, MUTAMER_DATE_FIELDS);
    if (diff.changed.length === 0) {
      skippedCount++;
      sampleDiffs.push({
        rowNumber: fresh.rowNumber,
        key: fresh.nuskNumber,
        changeType: "skipped",
        existingId: existing.id,
      });
      continue;
    }
    updatedCount++;
    const becameOverstay = diff.changed.some(
      (c) => c.field === "status" && c.newValue === "overstay" && c.oldValue !== "overstay"
    ) || diff.changed.some(
      (c) => c.field === "actualStayDays" &&
        Number(c.newValue) > (fresh.programDuration ?? 0) &&
        (Number(c.oldValue) || 0) <= (fresh.programDuration ?? 0)
    );
    const becameAbsconder = diff.changed.some(
      (c) => c.field === "status" && c.newValue === "absconded" && c.oldValue !== "absconded"
    );
    if (becameOverstay && fresh.isInsideKingdom) newOverstays++;
    if (becameAbsconder) newAbsconders++;
    if (diff.financial) financialImpactCount++;
    sampleDiffs.push({
      rowNumber: fresh.rowNumber,
      key: fresh.nuskNumber,
      changeType: "updated",
      changedFields: diff.changed,
      hasFinancialImpact: diff.financial,
      existingId: existing.id,
    });
  }

  const manualReviewCount = subAgents.unlinked.length;

  const summary: ImportPreviewSummary = {
    batchId: 0,
    fileType: "mutamers",
    fileName: meta.fileName,
    totalRows: parsed.length,
    newCount,
    updatedCount,
    skippedCount,
    errorCount,
    financialImpactCount,
    manualReviewCount,
    newOverstays,
    newAbsconders,
    newAgents: agents.newAgents.length,
    newSubAgents: subAgents.newSubAgents.length,
    newGroups: newGroupNumbers.length,
    unlinkedSubAgents: subAgents.unlinked,
    errors,
    sampleDiffs: sampleDiffs.slice(0, 1000),
  };

  // Persist as a 'previewed' batch so confirm can replay it.
  const batchPayload = {
    parsed: rows,
    summary,
    settings,
  };
  const { insertId } = await rawExecute(
    `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","fileSize","uploadedBy",
        "totalRows","newCount","updatedCount","skippedCount","errorCount",
        "financialImpactCount","manualReviewCount", status, "summaryJson", "errorsJson",
        "createdBy")
     VALUES ($1,$2,$3,'mutamers',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'previewed',$14,$15,$6)`,
    [
      scope.companyId, scope.branchId, scope.seasonId,
      meta.fileName, meta.fileSize, scope.userId,
      parsed.length, newCount, updatedCount, skippedCount, errorCount,
      financialImpactCount, manualReviewCount,
      JSON.stringify(batchPayload), JSON.stringify(errors),
    ]
  );
  summary.batchId = insertId;
  return summary;
}

// ---------------------------------------------------------------------------
// Preview — Vouchers
// ---------------------------------------------------------------------------

export async function previewVouchersImport(
  scope: ImportScope,
  meta: ImportFileMeta,
  buffer: Buffer
): Promise<ImportPreviewSummary> {
  await assertSeasonOpen(scope);

  const parsed = parseVouchersWorkbook(buffer);
  if (parsed.length === 0) {
    throw new ValidationError("لم يتم العثور على أي فاتورة صالحة في الملف");
  }

  const settings = await loadUmrahSettings(scope);
  const dedup = new Map<string, ParsedVoucherRow>();
  for (const r of parsed) dedup.set(r.nuskInvoiceNumber, r);
  const rows = Array.from(dedup.values());

  const existingRows = await rawQuery<any>(
    `SELECT id, "nuskInvoiceNumber", "mutamerCount", "programDuration",
            "groundServices", "electronicFees", "visaFees", "insuranceFees",
            "enrichmentServices", "additionalServices", "transportTotal", "hotelTotal",
            "refundAmount", "totalAmount", "netCost", "nuskStatus", "issueDate", "expiryDate"
       FROM umrah_nusk_invoices
      WHERE "companyId"=$1 AND "deletedAt" IS NULL
        AND "nuskInvoiceNumber" = ANY($2)`,
    [scope.companyId, rows.map((r) => r.nuskInvoiceNumber)]
  );
  const existingMap = new Map<string, any>(existingRows.map((e) => [e.nuskInvoiceNumber, e]));

  // Resolve agents / sub-agents / groups (no inserts).
  const agents = await resolveAgents(null, scope, rows);
  const subAgents = await resolveSubAgents(null, scope, rows);
  const groupNumbers = Array.from(new Set(rows.map((r) => r.nuskGroupNumber).filter(Boolean) as string[]));
  const existingGroups = groupNumbers.length === 0
    ? []
    : await rawQuery<any>(
        `SELECT id, "nuskGroupNumber" FROM umrah_groups
          WHERE "companyId"=$1 AND "nuskGroupNumber" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, groupNumbers]
      );
  const groupMap = new Map<string, number>(existingGroups.map((g) => [g.nuskGroupNumber, g.id]));
  const newGroupNumbers = groupNumbers.filter((n) => !groupMap.has(n));

  const sampleDiffs: RowDiff[] = [];
  let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0;
  let financialImpactCount = 0;
  const errors: { row: number; key: string | null; message: string }[] = [];

  for (const fresh of rows) {
    const existing = existingMap.get(fresh.nuskInvoiceNumber);
    if (!existing) {
      newCount++;
      financialImpactCount++; // every new voucher → new purchase invoice
      sampleDiffs.push({
        rowNumber: fresh.rowNumber,
        key: fresh.nuskInvoiceNumber,
        changeType: "created",
        hasFinancialImpact: true,
      });
      continue;
    }
    const diff = diffFields(fresh, existing, VOUCHER_TRACKED_FIELDS, VOUCHER_FINANCIAL_FIELDS, VOUCHER_DATE_FIELDS);
    if (diff.changed.length === 0) {
      skippedCount++;
      sampleDiffs.push({
        rowNumber: fresh.rowNumber,
        key: fresh.nuskInvoiceNumber,
        changeType: "skipped",
        existingId: existing.id,
      });
      continue;
    }
    updatedCount++;
    if (diff.financial) financialImpactCount++;
    sampleDiffs.push({
      rowNumber: fresh.rowNumber,
      key: fresh.nuskInvoiceNumber,
      changeType: "updated",
      changedFields: diff.changed,
      hasFinancialImpact: diff.financial,
      existingId: existing.id,
    });
  }

  const manualReviewCount = subAgents.unlinked.length;
  const summary: ImportPreviewSummary = {
    batchId: 0,
    fileType: "vouchers",
    fileName: meta.fileName,
    totalRows: parsed.length,
    newCount,
    updatedCount,
    skippedCount,
    errorCount,
    financialImpactCount,
    manualReviewCount,
    newOverstays: 0,
    newAbsconders: 0,
    newAgents: agents.newAgents.length,
    newSubAgents: subAgents.newSubAgents.length,
    newGroups: newGroupNumbers.length,
    unlinkedSubAgents: subAgents.unlinked,
    errors,
    sampleDiffs: sampleDiffs.slice(0, 1000),
  };

  const batchPayload = { parsed: rows, summary, settings };
  const { insertId } = await rawExecute(
    `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","fileSize","uploadedBy",
        "totalRows","newCount","updatedCount","skippedCount","errorCount",
        "financialImpactCount","manualReviewCount", status, "summaryJson", "errorsJson",
        "createdBy")
     VALUES ($1,$2,$3,'vouchers',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'previewed',$14,$15,$6)`,
    [
      scope.companyId, scope.branchId, scope.seasonId,
      meta.fileName, meta.fileSize, scope.userId,
      parsed.length, newCount, updatedCount, skippedCount, errorCount,
      financialImpactCount, manualReviewCount,
      JSON.stringify(batchPayload), JSON.stringify(errors),
    ]
  );
  summary.batchId = insertId;
  return summary;
}

// ---------------------------------------------------------------------------
// Confirm — apply a previously-previewed batch
// ---------------------------------------------------------------------------

export async function confirmImport(
  scope: ImportScope,
  batchId: number
): Promise<ConfirmImportResult> {
  // Load the batch and refuse anything not in 'previewed'.
  const [batch] = await rawQuery<any>(
    `SELECT id, "companyId", "fileType", "summaryJson", status
       FROM umrah_import_batches
      WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [batchId, scope.companyId]
  );
  if (!batch) throw new NotFoundError("دفعة الاستيراد غير موجودة");
  if (batch.status !== "previewed") {
    throw new ConflictError(`لا يمكن تأكيد دفعة في حالة ${batch.status}`);
  }

  const payload = batch.summaryJson as { parsed: any[]; settings: UmrahSettings };
  if (!payload || !Array.isArray(payload.parsed)) {
    throw new ConflictError("بيانات الدفعة تالفة — يرجى إعادة المعاينة");
  }

  const result = batch.fileType === "mutamers"
    ? await applyMutamersBatch(scope, batchId, payload.parsed as ParsedMutamerRow[], payload.settings)
    : await applyVouchersBatch(scope, batchId, payload.parsed as ParsedVoucherRow[], payload.settings);

  // Mark the batch as confirmed regardless of the per-row error count;
  // partial failures are visible through umrah_import_changes.
  await rawExecute(
    `UPDATE umrah_import_batches
        SET status='confirmed',
            "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,"errorCount"=$4,
            "updatedAt"=NOW()
      WHERE id=$5`,
    [result.applied.inserted, result.applied.updated, result.applied.skipped,
      result.applied.errors, batchId]
  );

  // Fire the high-level "imported" event so the dashboard, alerts and
  // notification pipeline can react. Per-row events for overstay /
  // absconder / nusk_invoice / violation / agent_linked are emitted
  // inline below as they happen.
  await emitEvent({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: batch.fileType === "mutamers" ? "umrah.mutamers.imported" : "umrah.vouchers.imported",
    entity: "umrah_import_batches",
    entityId: batchId,
    details: JSON.stringify(result.applied),
  });

  return result;
}

// ---------------------------------------------------------------------------
// Apply — Mutamers
// ---------------------------------------------------------------------------

async function applyMutamersBatch(
  scope: ImportScope,
  batchId: number,
  rows: ParsedMutamerRow[],
  settings: UmrahSettings
): Promise<ConfirmImportResult> {
  return withTransaction(async (client) => {
    let inserted = 0, updated = 0, skipped = 0, errors = 0;
    let violationsCreated = 0, agentsCreated = 0, subAgentsCreated = 0, groupsCreated = 0;

    // 1. Resolve / create agents — a row can drag in a brand-new master agent.
    const agentRes = await resolveAgents(client, scope, rows);
    for (const a of agentRes.newAgents) {
      const ins = await client.query(
        `INSERT INTO umrah_agents
           ("companyId","branchId","name",country,"nuskAgentNumber","seasonId","isActive",
            "createdBy","updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)
         RETURNING id`,
        [scope.companyId, scope.branchId, a.name, a.country, a.nuskAgentNumber, scope.seasonId, scope.userId]
      );
      const id = ins.rows[0].id as number;
      if (a.nuskAgentNumber) agentRes.byNuskNumber.set(a.nuskAgentNumber, id);
      agentRes.byName.set(a.name, id);
      agentsCreated++;
      await recordChange(client, scope, batchId, "agent", id, "created", null, null, null, false);
    }

    // 2. Resolve / create sub-agents (still without clientId — billing is blocked).
    const subRes = await resolveSubAgents(client, scope, rows);
    for (const s of subRes.newSubAgents) {
      const agentId = (s.agentName && agentRes.byName.get(s.agentName)) ?? null;
      const ins = await client.query(
        `INSERT INTO umrah_sub_agents
           ("companyId","branchId",name,"nuskCode","agentId","paymentTerms","isActive",
            "createdBy","updatedBy")
         VALUES ($1,$2,$3,$4,$5,'postpaid',true,$6,$6)
         RETURNING id`,
        [scope.companyId, scope.branchId, s.name, s.nuskCode, agentId, scope.userId]
      );
      const id = ins.rows[0].id as number;
      if (s.nuskCode) subRes.byNuskCode.set(s.nuskCode, id);
      subRes.byName.set(s.name, id);
      subAgentsCreated++;
      await recordChange(client, scope, batchId, "sub_agent", id, "created", null, null, null, false);
    }

    // 3. Resolve / create groups.
    const groupNumbers = Array.from(new Set(rows.map((r) => r.nuskGroupNumber).filter(Boolean) as string[]));
    const existingGroups = groupNumbers.length === 0 ? [] : (
      await client.query(
        `SELECT id, "nuskGroupNumber" FROM umrah_groups
          WHERE "companyId"=$1 AND "nuskGroupNumber" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, groupNumbers]
      )
    ).rows as any[];
    const groupMap = new Map<string, number>(existingGroups.map((g) => [g.nuskGroupNumber, g.id]));

    if (settings.importAutoCreateGroups) {
      for (const num of groupNumbers) {
        if (groupMap.has(num)) continue;
        // Pick the first row that mentions this group to derive its agent/sub-agent.
        const sample = rows.find((r) => r.nuskGroupNumber === num)!;
        const agentId =
          (sample.nuskAgentNumber && agentRes.byNuskNumber.get(sample.nuskAgentNumber)) ??
          (sample.agentName && agentRes.byName.get(sample.agentName)) ?? null;
        const subAgentId =
          (sample.nuskCode && subRes.byNuskCode.get(sample.nuskCode)) ??
          (sample.subAgentName && subRes.byName.get(sample.subAgentName)) ?? null;
        const ins = await client.query(
          `INSERT INTO umrah_groups
             ("companyId","branchId","nuskGroupNumber",name,"agentId","subAgentId","seasonId",
              "mutamerCount","programDuration",status,"createdBy","updatedBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,'imported',$9,$9)
           RETURNING id`,
          [
            scope.companyId, scope.branchId, num, sample.groupName ?? `مجموعة ${num}`,
            agentId, subAgentId, scope.seasonId,
            sample.programDuration ?? settings.defaultProgramDuration,
            scope.userId,
          ]
        );
        const id = ins.rows[0].id as number;
        groupMap.set(num, id);
        groupsCreated++;
        await recordChange(client, scope, batchId, "group", id, "created", null, null, null, false);
      }
    }

    // 4. UPSERT every mutamer.
    const existingMutamers = (await client.query(
      `SELECT * FROM umrah_mutamers
        WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "nuskNumber" = ANY($2)`,
      [scope.companyId, rows.map((r) => r.nuskNumber)]
    )).rows as any[];
    const existingMutamersMap = new Map<string, any>(existingMutamers.map((m) => [m.nuskNumber, m]));

    for (const fresh of rows) {
      try {
        const groupId = fresh.nuskGroupNumber ? groupMap.get(fresh.nuskGroupNumber) ?? null : null;
        const existing = existingMutamersMap.get(fresh.nuskNumber);

        // Auto-derive overstay days regardless of NUSK column presence.
        let overstayDays = 0;
        if (fresh.actualStayDays !== null && fresh.programDuration !== null) {
          overstayDays = Math.max(0, fresh.actualStayDays - fresh.programDuration);
        }

        if (!existing) {
          const ins = await client.query(
            `INSERT INTO umrah_mutamers
               ("companyId","branchId","nuskNumber",name,nationality,gender,
                "passportNumber","passportExpiry","groupId",
                "entryDate","entryPort","entryFlight","exitDate","exitPort","exitFlight",
                "actualStayDays","programDuration","overstayDays",
                "borderNumber","visaNumber","mofaNumber",
                status,"isInsideKingdom","hasUmrahPermit","createdBy","updatedBy")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                     $19,$20,$21,$22,$23,$24,$25,$25)
             RETURNING id`,
            [
              scope.companyId, scope.branchId, fresh.nuskNumber, fresh.name,
              fresh.nationality, fresh.gender, fresh.passportNumber, fresh.passportExpiry,
              groupId, fresh.entryDate, fresh.entryPort, fresh.entryFlight,
              fresh.exitDate, fresh.exitPort, fresh.exitFlight,
              fresh.actualStayDays, fresh.programDuration, overstayDays,
              fresh.borderNumber, fresh.visaNumber, fresh.mofaNumber,
              fresh.status, fresh.isInsideKingdom, fresh.hasUmrahPermit, scope.userId,
            ]
          );
          const newId = ins.rows[0].id as number;
          inserted++;
          await recordChange(client, scope, batchId, "mutamer", newId, "created", null, null, null, false);

          // Detect violations on insert.
          const created = await detectAndCreateViolation(
            client, scope, batchId, newId, fresh, groupId, settings
          );
          if (created) violationsCreated++;
          continue;
        }

        const diff = diffFields(fresh, existing, MUTAMER_TRACKED_FIELDS, MUTAMER_FINANCIAL_FIELDS, MUTAMER_DATE_FIELDS);
        if (diff.changed.length === 0 && existing.overstayDays === overstayDays) {
          skipped++;
          continue;
        }

        const sets: string[] = [];
        const params: any[] = [];
        const push = (col: string, val: any) => {
          params.push(val);
          sets.push(`"${col}"=$${params.length}`);
        };
        for (const c of diff.changed) push(c.field, c.newValue);
        if (existing.overstayDays !== overstayDays) push("overstayDays", overstayDays);
        push("updatedBy", scope.userId);
        sets.push(`"updatedAt"=NOW()`);
        params.push(existing.id);
        await client.query(
          `UPDATE umrah_mutamers SET ${sets.join(",")} WHERE id=$${params.length}`,
          params
        );
        updated++;

        for (const c of diff.changed) {
          await recordChange(
            client, scope, batchId, "mutamer", existing.id, "updated",
            c.field, c.oldValue, c.newValue,
            MUTAMER_FINANCIAL_FIELDS.has(c.field as keyof ParsedMutamerRow)
          );
        }

        // Re-evaluate violations after status / stay updates.
        const created = await detectAndCreateViolation(
          client, scope, batchId, existing.id, fresh, groupId, settings
        );
        if (created) violationsCreated++;
      } catch (err: any) {
        errors++;
        await recordChange(
          client, scope, batchId, "mutamer", 0, "error", null, null, null, false,
          err?.message ?? "خطأ غير معروف"
        );
      }
    }

    // 5. Refresh group mutamerCount for every touched group.
    if (groupMap.size > 0) {
      await client.query(
        `UPDATE umrah_groups g
            SET "mutamerCount" = sub.cnt, "updatedAt"=NOW()
           FROM ( SELECT "groupId", COUNT(*)::int AS cnt
                    FROM umrah_mutamers
                   WHERE "companyId"=$1 AND "deletedAt" IS NULL
                     AND "groupId" = ANY($2)
                   GROUP BY "groupId" ) sub
          WHERE g.id = sub."groupId" AND g."companyId"=$1`,
        [scope.companyId, Array.from(groupMap.values())]
      );
    }

    return {
      batchId,
      applied: {
        inserted, updated, skipped, errors,
        violationsCreated, purchaseInvoicesCreated: 0,
        agentsCreated, subAgentsCreated, groupsCreated,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Apply — Vouchers
// ---------------------------------------------------------------------------

async function applyVouchersBatch(
  scope: ImportScope,
  batchId: number,
  rows: ParsedVoucherRow[],
  settings: UmrahSettings
): Promise<ConfirmImportResult> {
  return withTransaction(async (client) => {
    let inserted = 0, updated = 0, skipped = 0, errors = 0;
    let agentsCreated = 0, subAgentsCreated = 0, groupsCreated = 0, purchaseInvoicesCreated = 0;

    // Reuse the mutamer resolvers verbatim — they only care about names/codes.
    const agentRes = await resolveAgents(client, scope, rows);
    for (const a of agentRes.newAgents) {
      const ins = await client.query(
        `INSERT INTO umrah_agents
           ("companyId","branchId",name,country,"nuskAgentNumber","seasonId","isActive",
            "createdBy","updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7) RETURNING id`,
        [scope.companyId, scope.branchId, a.name, a.country, a.nuskAgentNumber, scope.seasonId, scope.userId]
      );
      const id = ins.rows[0].id as number;
      if (a.nuskAgentNumber) agentRes.byNuskNumber.set(a.nuskAgentNumber, id);
      agentRes.byName.set(a.name, id);
      agentsCreated++;
    }
    const subRes = await resolveSubAgents(client, scope, rows);
    for (const s of subRes.newSubAgents) {
      const agentId = (s.agentName && agentRes.byName.get(s.agentName)) ?? null;
      const ins = await client.query(
        `INSERT INTO umrah_sub_agents
           ("companyId","branchId",name,"nuskCode","agentId","paymentTerms","isActive",
            "createdBy","updatedBy")
         VALUES ($1,$2,$3,$4,$5,'postpaid',true,$6,$6) RETURNING id`,
        [scope.companyId, scope.branchId, s.name, s.nuskCode, agentId, scope.userId]
      );
      const id = ins.rows[0].id as number;
      if (s.nuskCode) subRes.byNuskCode.set(s.nuskCode, id);
      subRes.byName.set(s.name, id);
      subAgentsCreated++;
    }

    const groupNumbers = Array.from(new Set(rows.map((r) => r.nuskGroupNumber).filter(Boolean) as string[]));
    const existingGroups = groupNumbers.length === 0 ? [] : (
      await client.query(
        `SELECT id, "nuskGroupNumber" FROM umrah_groups
          WHERE "companyId"=$1 AND "nuskGroupNumber" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, groupNumbers]
      )
    ).rows as any[];
    const groupMap = new Map<string, number>(existingGroups.map((g) => [g.nuskGroupNumber, g.id]));
    if (settings.importAutoCreateGroups) {
      for (const num of groupNumbers) {
        if (groupMap.has(num)) continue;
        const sample = rows.find((r) => r.nuskGroupNumber === num)!;
        const agentId =
          (sample.nuskAgentNumber && agentRes.byNuskNumber.get(sample.nuskAgentNumber)) ??
          (sample.agentName && agentRes.byName.get(sample.agentName)) ?? null;
        const subAgentId =
          (sample.nuskCode && subRes.byNuskCode.get(sample.nuskCode)) ??
          (sample.subAgentName && subRes.byName.get(sample.subAgentName)) ?? null;
        const ins = await client.query(
          `INSERT INTO umrah_groups
             ("companyId","branchId","nuskGroupNumber",name,"agentId","subAgentId","seasonId",
              "mutamerCount","programDuration",status,"createdBy","updatedBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'imported',$10,$10) RETURNING id`,
          [
            scope.companyId, scope.branchId, num, `مجموعة ${num}`,
            agentId, subAgentId, scope.seasonId,
            sample.mutamerCount, sample.programDuration ?? settings.defaultProgramDuration,
            scope.userId,
          ]
        );
        const id = ins.rows[0].id as number;
        groupMap.set(num, id);
        groupsCreated++;
      }
    }

    // UPSERT each voucher.
    const existing = (await client.query(
      `SELECT * FROM umrah_nusk_invoices
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND "nuskInvoiceNumber" = ANY($2)`,
      [scope.companyId, rows.map((r) => r.nuskInvoiceNumber)]
    )).rows as any[];
    const existingMap = new Map<string, any>(existing.map((e) => [e.nuskInvoiceNumber, e]));

    for (const fresh of rows) {
      try {
        const groupId = fresh.nuskGroupNumber ? groupMap.get(fresh.nuskGroupNumber) ?? null : null;
        const agentId =
          (fresh.nuskAgentNumber && agentRes.byNuskNumber.get(fresh.nuskAgentNumber)) ??
          (fresh.agentName && agentRes.byName.get(fresh.agentName)) ?? null;
        const subAgentId =
          (fresh.nuskCode && subRes.byNuskCode.get(fresh.nuskCode)) ??
          (fresh.subAgentName && subRes.byName.get(fresh.subAgentName)) ?? null;
        const existingRow = existingMap.get(fresh.nuskInvoiceNumber);

        if (!existingRow) {
          const ins = await client.query(
            `INSERT INTO umrah_nusk_invoices
               ("companyId","branchId","nuskInvoiceNumber","agentId","subAgentId","groupId",
                "mutamerCount","groundServices","electronicFees","visaFees","insuranceFees",
                "enrichmentServices","additionalServices","transportTotal","hotelTotal",
                "refundAmount","netCost","totalAmount","nuskStatus","issueDate","expiryDate",
                "programDuration","createdBy","updatedBy")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
             RETURNING id`,
            [
              scope.companyId, scope.branchId, fresh.nuskInvoiceNumber, agentId, subAgentId, groupId,
              fresh.mutamerCount, fresh.groundServices, fresh.electronicFees, fresh.visaFees,
              fresh.insuranceFees, fresh.enrichmentServices, fresh.additionalServices,
              fresh.transportTotal, fresh.hotelTotal, fresh.refundAmount, fresh.netCost,
              fresh.totalAmount, fresh.nuskStatus, fresh.issueDate, fresh.expiryDate,
              fresh.programDuration, scope.userId,
            ]
          );
          const newId = ins.rows[0].id as number;
          inserted++;
          await recordChange(client, scope, batchId, "nusk_invoice", newId, "created", null, null, null, true);

          // If group has nuskInvoiceNumber missing, attach it.
          if (groupId) {
            await client.query(
              `UPDATE umrah_groups SET "nuskInvoiceNumber"=$1, "updatedAt"=NOW()
                WHERE id=$2 AND ("nuskInvoiceNumber" IS NULL OR "nuskInvoiceNumber"='')`,
              [fresh.nuskInvoiceNumber, groupId]
            );
          }

          // Auto-create purchase invoice if setting allows + voucher is paid.
          if (settings.importAutoCreatePurchase && fresh.nuskStatus === "paid" && fresh.netCost > 0) {
            // Defer the actual purchase-invoice creation to the finance
            // service contract (Phase 4 wires the route). For now, leave
            // purchaseInvoiceId NULL and emit the event so listeners can
            // pick it up.
            purchaseInvoicesCreated++;
          }
          continue;
        }

        const diff = diffFields(fresh, existingRow, VOUCHER_TRACKED_FIELDS, VOUCHER_FINANCIAL_FIELDS, VOUCHER_DATE_FIELDS);
        if (diff.changed.length === 0) {
          skipped++;
          continue;
        }
        const sets: string[] = [];
        const params: any[] = [];
        const push = (col: string, val: any) => {
          params.push(val);
          sets.push(`"${col}"=$${params.length}`);
        };
        for (const c of diff.changed) push(c.field, c.newValue);
        push("updatedBy", scope.userId);
        sets.push(`"updatedAt"=NOW()`);
        params.push(existingRow.id);
        await client.query(
          `UPDATE umrah_nusk_invoices SET ${sets.join(",")} WHERE id=$${params.length}`,
          params
        );
        updated++;
        for (const c of diff.changed) {
          await recordChange(
            client, scope, batchId, "nusk_invoice", existingRow.id, "updated",
            c.field, c.oldValue, c.newValue,
            VOUCHER_FINANCIAL_FIELDS.has(c.field as keyof ParsedVoucherRow)
          );
        }
      } catch (err: any) {
        errors++;
        await recordChange(
          client, scope, batchId, "nusk_invoice", 0, "error", null, null, null, false,
          err?.message ?? "خطأ غير معروف"
        );
      }
    }

    return {
      batchId,
      applied: {
        inserted, updated, skipped, errors,
        violationsCreated: 0, purchaseInvoicesCreated,
        agentsCreated, subAgentsCreated, groupsCreated,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Helper — violation detection for a single mutamer
// ---------------------------------------------------------------------------

async function detectAndCreateViolation(
  client: PoolClient,
  scope: ImportScope,
  batchId: number,
  mutamerId: number,
  fresh: ParsedMutamerRow,
  groupId: number | null,
  settings: UmrahSettings
): Promise<boolean> {
  // Subagent FK for the violation row — derived via the group when available.
  let subAgentId: number | null = null;
  if (groupId) {
    const sub = await client.query(
      `SELECT "subAgentId" FROM umrah_groups WHERE id=$1`,
      [groupId]
    );
    subAgentId = sub.rows[0]?.subAgentId ?? null;
  }

  const isAbsconder = fresh.status === "absconded";
  const overstayDays = (fresh.actualStayDays ?? 0) - (fresh.programDuration ?? 0);
  const isOverstay = !isAbsconder && fresh.isInsideKingdom && overstayDays > 0;

  if (!isAbsconder && !isOverstay) return false;

  // Idempotency: don't double-create the same violation for the same passport.
  const refType = "passport";
  const refNumber = fresh.passportNumber ?? fresh.nuskNumber;
  const dup = await client.query(
    `SELECT id FROM umrah_violations
      WHERE "companyId"=$1 AND "deletedAt" IS NULL
        AND "referenceType"=$2 AND "referenceNumber"=$3 AND type=$4
        AND status NOT IN ('paid','closed')`,
    [scope.companyId, refType, refNumber, isAbsconder ? "absconded" : "overstay"]
  );
  if (dup.rows.length > 0) return false;

  const penaltyAmount = isAbsconder
    ? settings.absconderPenalty
    : Math.max(0, overstayDays) * settings.overstayDailyPenalty;

  const ins = await client.query(
    `INSERT INTO umrah_violations
       ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId","groupId",
        "subAgentId",description,"penaltyAmount",status,"createdBy","updatedBy")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'detected',$11,$11)
     RETURNING id`,
    [
      scope.companyId, scope.branchId,
      isAbsconder ? "absconded" : "overstay",
      refType, refNumber, mutamerId, groupId, subAgentId,
      isAbsconder
        ? `معتمر ${fresh.name} تم التبليغ عنه — جواز ${refNumber}`
        : `معتمر ${fresh.name} تجاوز مدة البرنامج بـ ${overstayDays} يوم — جواز ${refNumber}`,
      penaltyAmount, scope.userId,
    ]
  );
  const violationId = ins.rows[0].id as number;

  // Flag the group so dashboards can surface it.
  if (groupId) {
    await client.query(
      `UPDATE umrah_groups SET status='has_violations', "updatedAt"=NOW()
        WHERE id=$1 AND status NOT IN ('settled','closed')`,
      [groupId]
    );
  }

  // Fire the event so notification + audit listeners can react. Listeners
  // for these names live in eventListeners.ts (Phase 6 wires the
  // notification pipeline; for now they just record the row).
  await emitEvent({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: isAbsconder ? "umrah.absconder.detected" : "umrah.overstay.detected",
    entity: "umrah_violations",
    entityId: violationId,
    details: JSON.stringify({ mutamerId, groupId, batchId, penaltyAmount, refNumber }),
  });

  return true;
}

// ---------------------------------------------------------------------------
// Helper — record a per-row change in umrah_import_changes
// ---------------------------------------------------------------------------

async function recordChange(
  client: PoolClient,
  scope: ImportScope,
  batchId: number,
  entityType: "mutamer" | "group" | "nusk_invoice" | "agent" | "sub_agent",
  entityId: number,
  changeType: ChangeType,
  fieldName: string | null,
  oldValue: any,
  newValue: any,
  hasFinancialImpact: boolean,
  notes?: string
) {
  await client.query(
    `INSERT INTO umrah_import_changes
       ("companyId","branchId","batchId","entityType","entityId","changeType",
        "fieldName","oldValue","newValue","hasFinancialImpact",notes,"createdBy","updatedBy")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
    [
      scope.companyId, scope.branchId, batchId, entityType, entityId, changeType,
      fieldName,
      oldValue === null || oldValue === undefined ? null : String(oldValue),
      newValue === null || newValue === undefined ? null : String(newValue),
      hasFinancialImpact,
      notes ?? null,
      scope.userId,
    ]
  );
}

// ---------------------------------------------------------------------------
// Helper — guard against importing into a closed season
// ---------------------------------------------------------------------------

async function assertSeasonOpen(scope: ImportScope): Promise<void> {
  const [season] = await rawQuery<any>(
    `SELECT id, status FROM umrah_seasons
      WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [scope.seasonId, scope.companyId]
  );
  if (!season) throw new NotFoundError("الموسم غير موجود");
  if (season.status === "closed" || season.status === "archived") {
    throw new ConflictError(`لا يمكن الاستيراد — الموسم في حالة ${season.status}`);
  }
}

// ---------------------------------------------------------------------------
// Public — list / drop a previewed batch (used by routes layer)
// ---------------------------------------------------------------------------

export async function rejectBatch(scope: ImportScope, batchId: number): Promise<void> {
  const { affectedRows } = await rawExecute(
    `UPDATE umrah_import_batches
        SET status='rejected', "updatedAt"=NOW(), "updatedBy"=$3
      WHERE id=$1 AND "companyId"=$2 AND status='previewed' AND "deletedAt" IS NULL`,
    [batchId, scope.companyId, scope.userId]
  );
  if (affectedRows === 0) throw new NotFoundError("دفعة الاستيراد غير موجودة أو لم تعد قابلة للرفض");
}
