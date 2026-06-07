import { parseFirstSheetAOA } from "./excelCompat.js";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { emitEvent, createAuditLog, createGuardedJournalEntry, getAccountCodeFromMapping, toDateISO } from "./businessHelpers.js";
import { ValidationError } from "./errorHandler.js";
import type pg from "pg";
import { logger } from "./logger.js";
import { encryptField, blindIndex } from "./fieldEncryption.js";

// ---------------------------------------------------------------------------
// Arabic header → DB column mapping
// ---------------------------------------------------------------------------

export const MUTAMER_HEADER_MAP: Record<string, string> = {
  "رقم المعتمر في النظام": "nuskNumber",
  "رقم المعتمر": "nuskNumber",
  "رقم نسك": "nuskNumber",
  "اسم المعتمر": "fullName",
  "الاسم": "fullName",
  "الجنسية": "nationality",
  "الجنس": "gender",
  "رقم الجواز": "passportNumber",
  "صلاحية الجواز": "passportExpiry",
  "رقم التأشيرة": "visaNumber",
  "رقم المجموعة": "nuskGroupNumber",
  "اسم المجموعة": "groupName",
  "رقم الوكيل": "nuskAgentNumber",
  "اسم الوكيل": "agentName",
  "رمز المكتب": "nuskCode",
  "اسم المكتب": "subAgentName",
  "الحالة": "status",
  "تاريخ الدخول": "entryDate",
  "تاريخ الخروج": "exitDate",
  "ميناء الدخول": "entryPort",
  "رحلة الدخول": "entryFlight",
  "ميناء الخروج": "exitPort",
  "رحلة الخروج": "exitFlight",
  "رقم الحدود": "borderNumber",
  "رقم الموفا": "mofaNumber",
  "مدة البرنامج": "programDuration",
  "أيام الإقامة الفعلية": "actualStayDays",
  "أيام التجاوز": "overstayDays",
  "داخل المملكة": "isInsideKingdom",
  "لديه تصريح عمرة": "hasUmrahPermit",
  "الدولة": "country",
};

export const VOUCHER_HEADER_MAP: Record<string, string> = {
  "رقم الفاتورة": "nuskInvoiceNumber",
  "رقم فاتورة نسك": "nuskInvoiceNumber",
  "رقم المجموعة": "nuskGroupNumber",
  "اسم المجموعة": "groupName",
  "عدد المعتمرين": "mutamerCount",
  "خدمات أرضية": "groundServices",
  "رسوم إلكترونية": "electronicFees",
  "رسوم التأشيرة": "visaFees",
  "رسوم التأمين": "insuranceFees",
  "خدمات الإثراء": "enrichmentServices",
  "خدمات إضافية": "additionalServices",
  "إجمالي النقل": "transportTotal",
  "إجمالي الفنادق": "hotelTotal",
  "المبالغ المستردة": "refundAmount",
  "صافي التكلفة": "netCost",
  "الإجمالي": "totalAmount",
  "المبلغ الإجمالي": "totalAmount",
  "الحالة": "nuskStatus",
  "حالة الفاتورة": "nuskStatus",
  "تاريخ الإصدار": "issueDate",
  "تاريخ الانتهاء": "expiryDate",
  "مدة البرنامج": "programDuration",
  "رقم الوكيل": "nuskAgentNumber",
  "اسم الوكيل": "agentName",
  "رمز المكتب": "nuskCode",
  "اسم المكتب": "subAgentName",
};

// ---------------------------------------------------------------------------
// Canonical Arabic labels per engine field — the SINGLE SOURCE OF TRUTH
// for how each umrah import field is named to the (Arabic-first) operator.
//
// The forward maps above accept MANY Arabic spellings per field (vendor
// files vary). This map is the reverse, curated direction: ONE clean
// Arabic label per field, used to render the column-mapping dropdown and
// any other "pick a field" UI. Without it the dropdown showed raw English
// identifiers (nuskInvoiceNumber, mutamerCount, ...) — meaningless to an
// Arabic operator. Reported from a live screenshot of the import wizard.
//
// Keep this exhaustive over every distinct value in the two forward maps;
// the header-maps endpoint asserts coverage so a new field can't ship
// without its Arabic label.
// ---------------------------------------------------------------------------
export const UMRAH_FIELD_LABELS_AR: Record<string, string> = {
  // mutamers
  nuskNumber: "رقم المعتمر (نسك)",
  fullName: "اسم المعتمر",
  nationality: "الجنسية",
  gender: "الجنس",
  passportNumber: "رقم الجواز",
  passportExpiry: "صلاحية الجواز",
  visaNumber: "رقم التأشيرة",
  nuskGroupNumber: "رقم المجموعة",
  groupName: "اسم المجموعة",
  nuskAgentNumber: "رقم الوكيل",
  agentName: "اسم الوكيل",
  nuskCode: "رمز المكتب (الوكيل الفرعي)",
  subAgentName: "اسم المكتب (الوكيل الفرعي)",
  status: "الحالة",
  entryDate: "تاريخ الدخول",
  exitDate: "تاريخ الخروج",
  entryPort: "ميناء الدخول",
  entryFlight: "رحلة الدخول",
  exitPort: "ميناء الخروج",
  exitFlight: "رحلة الخروج",
  borderNumber: "رقم الحدود",
  mofaNumber: "رقم وزارة الخارجية (الموفا)",
  programDuration: "مدة البرنامج",
  actualStayDays: "أيام الإقامة الفعلية",
  overstayDays: "أيام التجاوز",
  isInsideKingdom: "داخل المملكة",
  hasUmrahPermit: "لديه تصريح عمرة",
  country: "الدولة",
  // vouchers
  nuskInvoiceNumber: "رقم فاتورة نسك",
  mutamerCount: "عدد المعتمرين",
  groundServices: "الخدمات الأرضية",
  electronicFees: "الرسوم الإلكترونية",
  visaFees: "رسوم التأشيرة",
  insuranceFees: "رسوم التأمين",
  enrichmentServices: "خدمات الإثراء",
  additionalServices: "خدمات إضافية",
  transportTotal: "إجمالي النقل",
  hotelTotal: "إجمالي الفنادق",
  refundAmount: "المبالغ المستردة",
  netCost: "صافي التكلفة",
  totalAmount: "المبلغ الإجمالي",
  nuskStatus: "حالة الفاتورة",
  issueDate: "تاريخ الإصدار",
  expiryDate: "تاريخ الانتهاء",
};

const STATUS_MAP: Record<string, string> = {
  "داخل المملكة": "arrived",
  "خرج": "departed",
  "متجاوز": "overstayed",
  "تم التبليغ": "violated",
  "هارب": "violated",
  "متوفي": "departed",
  "متوفى": "departed",
  "مرفوض": "cancelled",
  "تأشيرة مطبوعة": "active",
  "معلق": "pending",
  "نشط": "active",
  "ملغي": "cancelled",
  "ملغى": "cancelled",
};

const NUSK_STATUS_MAP: Record<string, string> = {
  "مدفوع": "paid",
  "مدفوعة": "paid",
  "معلق": "pending",
  "معلقة": "pending",
  "منتهي": "expired",
  "منتهية": "expired",
  "قيد التنفيذ": "in_progress",
  "مسترد": "refunded",
  "مستردة": "refunded",
  "ملغي": "cancelled",
  "ملغى": "cancelled",
  "ملغية": "cancelled",
};

const BOOL_TRUE = new Set(["نعم", "yes", "true", "1", "صحيح"]);

// ---------------------------------------------------------------------------
// Text normalization (ي/ى, whitespace, NFC)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/ى/g, "ي")
    .replace(/ة$/g, "ه")
    .trim();
}

function normalizeHeader(h: string): string {
  return normalize(h).replace(/["']/g, "");
}

// ---------------------------------------------------------------------------
// Parse workbook → typed rows
// ---------------------------------------------------------------------------

export interface ParsedRow {
  [key: string]: string | number | boolean | null;
}

/**
 * Normalize Arabic-keyed rows (as the wizard ships them from client-side
 * XLSX parsing) into engine-readable rows whose keys are camelCase DB
 * field names.
 *
 * The built-in header map handles the standard NUSK / MOFA layouts.
 * `customMapping` overrides any header on a per-import basis — that's
 * the column-mapping UI's escape hatch when a partner's Excel uses
 * non-standard column titles (e.g. "ID Mu'tamir" instead of "رقم
 * المعتمر"). Custom always beats built-in.
 *
 * Keys that don't map (neither built-in nor custom) are dropped quietly
 * — the engine looks up by camelCase field name anyway, so unmapped
 * columns are simply invisible to the import logic (no harm done).
 */
// ---------------------------------------------------------------------------
// Smart column-mapping suggestion — fuzzy match for unknown headers
// ---------------------------------------------------------------------------
//
// The hardcoded dictionaries above cover the NUSK / MOFA standard layouts
// (the common case). When a vendor's Excel file labels the same data with
// a different header — typo, abbreviation, translated, or just a custom
// internal name — the operator hits the column-mapping step and has to
// pick the target field manually. This suggestion engine reduces that
// friction by computing the closest hardcoded-dictionary key for each
// unknown header and surfacing it as a suggestion the wizard can accept
// with one click.
//
// Algorithm: Levenshtein-distance-based similarity, normalised by the
// longer string's length. Below `MIN_CONFIDENCE` (currently 0.6) the
// suggestion is suppressed — better no suggestion than a wrong one that
// the operator might accept blindly.

const MIN_CONFIDENCE = 0.6;

/**
 * Lightweight Arabic-aware normaliser. Lowercases, trims, collapses
 * runs of whitespace, and folds common variants:
 *   - ـ (tatweel) stripped
 *   - أ إ آ → ا  (hamza-on-alif variants)
 *   - ى → ي    (alif maksura → ya)
 *   - ة → ه    (ta marbuta → ha)
 *
 * Without these folds, "رقم المعتمر" and "رقم المعتمرة" would compute
 * as 1-char distant (false positive) but "العمرة" vs "العمره" would
 * compute as 1-char distant (false negative — the operator obviously
 * means the same thing). The folds make the similarity score reflect
 * what the operator actually thinks of as "same word".
 */
function normaliseHeader(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * Classic 2-row Levenshtein distance — O(n×m) time, O(min(n,m)) space.
 * Iterative bottom-up DP; no recursion to keep the call stack flat
 * when the wizard suggests for 30+ headers at once.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Ensure `a` is the shorter to minimise memory.
  if (a.length > b.length) [a, b] = [b, a];
  let prev: number[] = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr: number[] = new Array(a.length + 1);
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,        // insertion
        prev[i] + 1,            // deletion
        prev[i - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length]!;
}

function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longer;
}

export interface MappingSuggestion {
  /** The engine field the unknown header is most likely meant for. */
  target: string;
  /** 0..1; suppressed below MIN_CONFIDENCE so callers never see a low-quality guess. */
  confidence: number;
  /** The dictionary entry that matched — surfaces context in the UI. */
  matchedKey: string;
  /** Where the suggestion came from. "exact" when the header IS a dict key (post-normalisation), "fuzzy" otherwise. */
  source: "exact" | "fuzzy";
}

/**
 * For each header in the file, returns the engine's best guess of which
 * field it represents, with a confidence score. Exact matches (after
 * normalisation) always win and carry confidence=1. Fuzzy matches scan
 * every dictionary key once and pick the highest similarity above
 * MIN_CONFIDENCE.
 *
 * Headers that ARE in the hardcoded dictionary post-normalisation are
 * still returned with source="exact" so the wizard can render them
 * with a "✓ exact match" badge — clearer than silently auto-mapping.
 */
export function suggestColumnMapping(
  headers: string[],
  fileType: "mutamers" | "vouchers",
): Record<string, MappingSuggestion> {
  const dict = fileType === "vouchers" ? VOUCHER_HEADER_MAP : MUTAMER_HEADER_MAP;
  // Pre-normalise the dictionary once so the inner loop stays cheap.
  const normalisedDict: Array<{ key: string; normalised: string; target: string }> = [];
  for (const [key, target] of Object.entries(dict)) {
    normalisedDict.push({ key, normalised: normaliseHeader(key), target });
  }

  const out: Record<string, MappingSuggestion> = {};
  for (const header of headers) {
    if (!header) continue;
    const normH = normaliseHeader(header);
    // Exact-match short-circuit — same algorithm the existing
    // normalizeImportRows uses post-trim, so the wizard and engine
    // agree on what counts as "known".
    const exact = normalisedDict.find((d) => d.normalised === normH);
    if (exact) {
      out[header] = { target: exact.target, confidence: 1, matchedKey: exact.key, source: "exact" };
      continue;
    }
    // Fuzzy scan — track the best score above MIN_CONFIDENCE.
    let best: MappingSuggestion | null = null;
    for (const d of normalisedDict) {
      const score = similarity(normH, d.normalised);
      if (score < MIN_CONFIDENCE) continue;
      if (best == null || score > best.confidence) {
        best = { target: d.target, confidence: score, matchedKey: d.key, source: "fuzzy" };
      }
    }
    if (best) out[header] = best;
  }
  return out;
}

export function normalizeImportRows(
  rows: Array<Record<string, unknown>>,
  fileType: "mutamers" | "vouchers",
  customMapping?: Record<string, string>,
): ParsedRow[] {
  const builtin = fileType === "vouchers" ? VOUCHER_HEADER_MAP : MUTAMER_HEADER_MAP;
  // Build a fast lookup whose keys are trimmed (Excel files often pad
  // headers with whitespace). Trim once here, then match against
  // pre-trimmed runtime keys below.
  const trimmedBuiltin: Record<string, string> = {};
  for (const [k, v] of Object.entries(builtin)) trimmedBuiltin[k.trim()] = v;
  const trimmedCustom: Record<string, string> = {};
  if (customMapping) {
    for (const [k, v] of Object.entries(customMapping)) {
      const trimmedKey = k.trim();
      // Ignore empty custom values — they signal "operator didn't pick
      // a target field for this column" and should fall through to the
      // built-in lookup or be dropped.
      if (trimmedKey && typeof v === "string" && v.trim()) {
        trimmedCustom[trimmedKey] = v.trim();
      }
    }
  }

  return rows.map((raw) => {
    const out: ParsedRow = {};
    for (const [origKey, val] of Object.entries(raw)) {
      const key = origKey.trim();
      // Custom mapping takes priority over built-in. If neither knows
      // the key, drop it — see the function-level comment.
      const target = trimmedCustom[key] ?? trimmedBuiltin[key];
      if (!target) continue;
      // Engine fields use camelCase strings/numbers; we coerce non-null
      // values to string to match the ParsedRow value shape (the engine
      // itself does Number(...) where it needs numeric).
      out[target] = val === null || val === undefined
        ? null
        : typeof val === "number" || typeof val === "boolean"
          ? val
          : String(val).trim();
    }
    return out;
  });
}

export function parseMutamersWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
  return parseWorkbook(buffer, MUTAMER_HEADER_MAP);
}

export function parseVouchersWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
  return parseWorkbook(buffer, VOUCHER_HEADER_MAP);
}

async function parseWorkbook(buffer: Buffer, headerMap: Record<string, string>): Promise<ParsedRow[]> {
  const raw: any[][] = await parseFirstSheetAOA(buffer);
  if (raw.length < 2) throw new ValidationError("الملف لا يحتوي على بيانات");

  const headerRow = raw[0]!;
  const colMap: { idx: number; field: string }[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(String(headerRow[i] ?? ""));
    for (const [arabic, field] of Object.entries(headerMap)) {
      if (h === normalizeHeader(arabic)) {
        colMap.push({ idx: i, field });
        break;
      }
    }
  }

  if (colMap.length === 0) throw new ValidationError("لم يتم التعرف على أي أعمدة في الملف");

  const rows: ParsedRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const dataRow = raw[r]!;
    if (!dataRow || dataRow.every((c: any) => c === "" || c == null)) continue;

    const row: ParsedRow = {};
    for (const { idx, field } of colMap) {
      let val: any = dataRow[idx];
      if (val instanceof Date) {
        val = toDateISO(val);
      } else {
        val = String(val ?? "").trim();
      }

      if (field === "status") {
        row[field] = STATUS_MAP[val] ?? val;
      } else if (field === "nuskStatus") {
        row[field] = NUSK_STATUS_MAP[val] ?? val;
      } else if (field === "gender") {
        row[field] = val === "ذكر" || val === "male" ? "male" : val === "أنثى" || val === "female" ? "female" : val;
      } else if (field === "isInsideKingdom" || field === "hasUmrahPermit") {
        row[field] = BOOL_TRUE.has(String(val).toLowerCase());
      } else if (["programDuration", "actualStayDays", "overstayDays", "mutamerCount"].includes(field)) {
        row[field] = val ? Number(val) || 0 : null;
      } else if ([
        "groundServices", "electronicFees", "visaFees", "insuranceFees",
        "enrichmentServices", "additionalServices", "transportTotal",
        "hotelTotal", "refundAmount", "netCost", "totalAmount",
      ].includes(field)) {
        row[field] = val ? Number(val) || 0 : 0;
      } else {
        row[field] = val || null;
      }
    }
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Import scope
// ---------------------------------------------------------------------------

export interface ImportScope {
  companyId: number;
  branchId: number;
  userId: number;
  seasonId: number;
  /**
   * Optional treasury (cash-box) the NUSK AP journal entry will reference
   * via the `treasuryId` column on the JE row. Used by the import wizard
   * dropdown so the operator can pick which cash box this batch ties to
   * — otherwise the JE is unlinked and downstream payment routing has to
   * guess.
   */
  treasuryId?: number | null;
  /**
   * Optional override for the umrah-nusk-cost (DR) account code. When
   * unset the engine falls back to the `account_mappings` row for
   * `umrah_nusk_cost`/debit, then to the hard default `5201`. Lets the
   * operator route a specific batch to a different cost account (e.g.
   * to separate Umrah hotels vs. transport accounting).
   */
  purchaseAccountCode?: string | null;
}

// ---------------------------------------------------------------------------
// Preview (dry run) — returns diff without writing
// ---------------------------------------------------------------------------

export interface ImportDiff {
  newRows: ParsedRow[];
  updatedRows: { row: ParsedRow; changes: { field: string; oldValue: any; newValue: any }[] }[];
  skippedCount: number;
  /**
   * Each rejected row carries:
   *   - rowIndex: 0-based position in the parsed sheet (UI adds +1 for
   *     "Row N" display so it lines up with Excel's row numbers).
   *   - error: human-readable Arabic reason.
   *   - fieldName: which engine field failed (lets the UI pinpoint the
   *     column that the operator needs to fix in the source file).
   *   - sample: a few operator-recognizable values from the row so the
   *     reviewer can locate it in Excel without re-cross-referencing
   *     by row number alone (helpful when the source file has been
   *     sorted or filtered between export + import).
   */
  errorRows: {
    rowIndex: number;
    error: string;
    fieldName?: string;
    sample?: Record<string, unknown>;
  }[];
  unlinkedSubAgents: { nuskCode: string; name: string; rowCount: number }[];
  /**
   * Primary agents that will be **auto-created** on confirm because the
   * file references an agent (by nuskAgentNumber or name) that doesn't
   * exist in `umrah_agents`. We surface this before the user confirms so
   * they can review or rename rather than silently growing the directory.
   */
  newAgentsToCreate: { nuskAgentNumber: string | null; agentName: string; rowCount: number }[];
  /**
   * Rows that name no agent at all (neither nuskAgentNumber nor
   * agentName populated). On confirm these save with `agentId = NULL`,
   * meaning they won't appear on any agent statement. The wizard shows
   * a banner so the operator notices.
   */
  rowsWithoutAgent: number;
  totalRows: number;
  financialImpactCount: number;
}

export async function previewMutamersImport(scope: ImportScope, rows: ParsedRow[]): Promise<ImportDiff> {
  return previewImport(scope, rows, "mutamers");
}

export async function previewVouchersImport(scope: ImportScope, rows: ParsedRow[]): Promise<ImportDiff> {
  return previewImport(scope, rows, "vouchers");
}

async function previewImport(scope: ImportScope, rows: ParsedRow[], fileType: "mutamers" | "vouchers"): Promise<ImportDiff> {
  const diff: ImportDiff = {
    newRows: [],
    updatedRows: [],
    skippedCount: 0,
    errorRows: [],
    unlinkedSubAgents: [],
    newAgentsToCreate: [],
    rowsWithoutAgent: 0,
    totalRows: rows.length,
    financialImpactCount: 0,
  };

  if (fileType === "mutamers") {
    const nuskNumbers = rows.map((r) => r.nuskNumber).filter(Boolean) as string[];

    // Skip the round-trip when no row carries a nuskNumber, but DO NOT
    // skip the error-bucketing loop below — the operator needs to see
    // a rejection row for every missing-key entry, not a silent
    // "0 new / 0 errors" result.
    const existing = nuskNumbers.length === 0
      ? []
      : await rawQuery<Record<string, unknown>>(
          `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber",
                  "entryPort", "exitPort", "overstayDays", "actualStayDays",
                  "entryDate", "exitDate"
           FROM umrah_pilgrims
           WHERE "companyId" = $1 AND "nuskNumber" = ANY($2) AND "deletedAt" IS NULL`,
          [scope.companyId, nuskNumbers]
        );
    const existMap = new Map(existing.map((e: any) => [e.nuskNumber, e]));

    const subAgentCodes = new Set<string>();
    rows.forEach((r) => { if (r.nuskCode) subAgentCodes.add(String(r.nuskCode)); });
    const linkedSubs = subAgentCodes.size > 0
      ? await rawQuery<Record<string, unknown>>(
          `SELECT "nuskCode" FROM umrah_sub_agents WHERE "companyId" = $1 AND "nuskCode" = ANY($2) AND "clientId" IS NOT NULL AND "deletedAt" IS NULL`,
          [scope.companyId, [...subAgentCodes]]
        )
      : [];
    const linkedSet = new Set(linkedSubs.map((s: any) => s.nuskCode));

    // Mirror resolveAgent's matching logic so the preview can flag rows
    // that will trigger auto-creation. Match either by NUSK agent number
    // (umrah_agents.contractRef) or by name. The set is keyed by the
    // string we'd look up, so the preview and the confirm phase agree.
    const agentNuskNumbers = new Set<string>();
    const agentNames = new Set<string>();
    for (const r of rows) {
      if (r.nuskAgentNumber) agentNuskNumbers.add(String(r.nuskAgentNumber));
      if (r.agentName) agentNames.add(String(r.agentName));
    }
    const knownByNuskNumber = new Set<string>();
    const knownByName = new Set<string>();
    if (agentNuskNumbers.size > 0) {
      const found = await rawQuery<Record<string, unknown>>(
        `SELECT "contractRef" FROM umrah_agents WHERE "companyId" = $1 AND "contractRef" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, [...agentNuskNumbers]]
      );
      for (const r of found) knownByNuskNumber.add(String(r.contractRef));
    }
    if (agentNames.size > 0) {
      const found = await rawQuery<Record<string, unknown>>(
        `SELECT name FROM umrah_agents WHERE "companyId" = $1 AND name = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, [...agentNames]]
      );
      for (const r of found) knownByName.add(String(r.name));
    }

    const unlinkedMap = new Map<string, { name: string; count: number }>();
    const newAgentsMap = new Map<string, { nuskAgentNumber: string | null; agentName: string; count: number }>();

    const COMPARE_FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays", "entryDate", "exitDate"];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.nuskNumber) {
        diff.errorRows.push({
          rowIndex: i,
          error: "رقم المعتمر مفقود",
          fieldName: "nuskNumber",
          sample: {
            fullName: row.fullName ?? null,
            passportNumber: row.passportNumber ?? null,
            nationality: row.nationality ?? null,
          },
        });
        continue;
      }
      const ex = existMap.get(String(row.nuskNumber));
      if (!ex) {
        diff.newRows.push(row);
      } else {
        const changes: { field: string; oldValue: any; newValue: any }[] = [];
        for (const f of COMPARE_FIELDS) {
          const oldVal = ex[f] ?? null;
          const newVal = row[f] ?? null;
          if (String(oldVal) !== String(newVal) && newVal !== null) {
            changes.push({ field: f, oldValue: oldVal, newValue: newVal });
            if (f === "overstayDays" || f === "actualStayDays") diff.financialImpactCount++;
          }
        }
        if (changes.length > 0) {
          diff.updatedRows.push({ row, changes });
        } else {
          diff.skippedCount++;
        }
      }

      if (row.nuskCode && !linkedSet.has(String(row.nuskCode))) {
        const code = String(row.nuskCode);
        const entry = unlinkedMap.get(code);
        if (entry) entry.count++;
        else unlinkedMap.set(code, { name: String(row.subAgentName ?? row.nuskCode), count: 1 });
      }

      // Agent tracking — mirrors resolveAgent's match priority. Any row
      // that names an agent (number or name) which DOESN'T match an
      // existing umrah_agents row will trigger auto-creation on confirm.
      // Rows with no agent info at all save with agentId=null and won't
      // appear on any agent statement.
      const nuskNum = row.nuskAgentNumber ? String(row.nuskAgentNumber) : null;
      const aName = row.agentName ? String(row.agentName) : null;
      if (!nuskNum && !aName) {
        diff.rowsWithoutAgent++;
      } else {
        const matchesByNuskNumber = nuskNum != null && knownByNuskNumber.has(nuskNum);
        const matchesByName = aName != null && knownByName.has(aName);
        if (!matchesByNuskNumber && !matchesByName) {
          // The synthetic key matches the upsert key resolveAgent uses
          // when no match exists, so re-imports of the same file aggregate
          // into one entry instead of duplicating.
          const finalName = aName ?? `وكيل ${nuskNum}`;
          const key = `${nuskNum ?? ""}::${finalName}`;
          const entry = newAgentsMap.get(key);
          if (entry) entry.count++;
          else newAgentsMap.set(key, { nuskAgentNumber: nuskNum, agentName: finalName, count: 1 });
        }
      }
    }

    diff.unlinkedSubAgents = [...unlinkedMap.entries()].map(([nuskCode, { name, count }]) => ({
      nuskCode, name, rowCount: count,
    }));
    diff.newAgentsToCreate = [...newAgentsMap.values()].map((v) => ({
      nuskAgentNumber: v.nuskAgentNumber,
      agentName: v.agentName,
      rowCount: v.count,
    }));
  } else {
    const invoiceNumbers = rows.map((r) => r.nuskInvoiceNumber).filter(Boolean) as string[];

    // Same shape as the mutamers branch — skip the round-trip when no
    // row has an invoice number, but still walk the loop so each
    // missing-key row gets surfaced to the operator as a rejection.
    const existing = invoiceNumbers.length === 0
      ? []
      : await rawQuery<Record<string, unknown>>(
          `SELECT id, "nuskInvoiceNumber", "totalAmount", "netCost", "nuskStatus"
           FROM umrah_nusk_invoices
           WHERE "companyId" = $1 AND "nuskInvoiceNumber" = ANY($2) AND "deletedAt" IS NULL`,
          [scope.companyId, invoiceNumbers]
        );
    const existMap = new Map(existing.map((e: any) => [e.nuskInvoiceNumber, e]));

    const COMPARE_FIELDS = ["totalAmount", "netCost", "nuskStatus", "mutamerCount"];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.nuskInvoiceNumber) {
        diff.errorRows.push({
          rowIndex: i,
          error: "رقم الفاتورة مفقود",
          fieldName: "nuskInvoiceNumber",
          sample: {
            totalAmount: row.totalAmount ?? null,
            mutamerCount: row.mutamerCount ?? null,
            nuskStatus: row.nuskStatus ?? null,
          },
        });
        continue;
      }
      const ex = existMap.get(String(row.nuskInvoiceNumber));
      if (!ex) {
        diff.newRows.push(row);
      } else {
        const changes: { field: string; oldValue: any; newValue: any }[] = [];
        for (const f of COMPARE_FIELDS) {
          const oldVal = ex[f] ?? null;
          const newVal = row[f] ?? null;
          if (String(oldVal) !== String(newVal) && newVal !== null) {
            changes.push({ field: f, oldValue: oldVal, newValue: newVal });
            if (f === "totalAmount" || f === "netCost") diff.financialImpactCount++;
          }
        }
        if (changes.length > 0) diff.updatedRows.push({ row, changes });
        else diff.skippedCount++;
      }
    }
  }

  return diff;
}

// ---------------------------------------------------------------------------
// Confirm import — UPSERT with batch tracking
// ---------------------------------------------------------------------------

export interface ImportResult {
  batchId: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  financialImpactCount: number;
}

export async function confirmMutamersImport(
  scope: ImportScope,
  rows: ParsedRow[],
  fileName: string,
): Promise<ImportResult> {
  return withTransaction(async (client) => {
    const batchRes = await client.query(
      `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","uploadedBy","totalRows",status)
       VALUES ($1,$2,$3,'mutamers',$4,$5,$6,'confirmed') RETURNING id`,
      [scope.companyId, scope.branchId, scope.seasonId, fileName, scope.userId, rows.length]
    );
    const batchId = batchRes.rows[0].id;

    let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0, financialImpactCount = 0;
    const BATCH_SIZE = 200;

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const nuskNumbers = batch.map((r) => r.nuskNumber).filter(Boolean) as string[];

      const existing = nuskNumbers.length > 0
        ? (await client.query(
            `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber",
                    "entryPort", "exitPort", "overstayDays", "actualStayDays",
                    "entryDate", "exitDate"
             FROM umrah_pilgrims
             WHERE "companyId" = $1 AND "nuskNumber" = ANY($2) AND "deletedAt" IS NULL`,
            [scope.companyId, nuskNumbers]
          )).rows
        : [];
      const existMap = new Map(existing.map((e: any) => [e.nuskNumber, e]));

      for (const row of batch) {
        if (!row.nuskNumber) { errorCount++; continue; }
        await client.query("SAVEPOINT sp_row");
        try {
          const groupId = await resolveGroup(client, scope, row);
          const agentId = await resolveAgent(client, scope, row);
          const subAgentId = await resolveSubAgent(client, scope, row, agentId);

          const ex = existMap.get(String(row.nuskNumber));
          if (!ex) {
            const ppEnc = row.passportNumber ? encryptField(String(row.passportNumber)) : null;
            const ppHash = row.passportNumber ? blindIndex(String(row.passportNumber)) : null;
            const visaEnc = row.visaNumber ? encryptField(String(row.visaNumber)) : null;
            const visaHash = row.visaNumber ? blindIndex(String(row.visaNumber)) : null;
            const mofaEnc = row.mofaNumber ? encryptField(String(row.mofaNumber)) : null;
            const mofaHash = row.mofaNumber ? blindIndex(String(row.mofaNumber)) : null;
            const borderEnc = row.borderNumber ? encryptField(String(row.borderNumber)) : null;
            const borderHash = row.borderNumber ? blindIndex(String(row.borderNumber)) : null;
            const res = await client.query(
              `INSERT INTO umrah_pilgrims
               ("companyId","branchId","seasonId","nuskNumber","fullName",nationality,gender,
                "passportNumber","passportNumber_hash","passportExpiry","visaNumber","visaNumber_hash",
                "groupId","subAgentId","agentId",
                status,"entryDate","exitDate","entryPort","entryFlight","exitPort","exitFlight",
                "actualStayDays","programDuration","overstayDays",
                "borderNumber","borderNumber_hash","mofaNumber","mofaNumber_hash",
                "isInsideKingdom","hasUmrahPermit","createdBy","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW(),NOW())
               RETURNING id`,
              [
                scope.companyId, scope.branchId, scope.seasonId,
                row.nuskNumber, row.fullName, row.nationality, row.gender,
                ppEnc, ppHash, row.passportExpiry || null, visaEnc, visaHash,
                groupId, subAgentId, agentId,
                row.status || "pending",
                row.entryDate || null, row.exitDate || null,
                row.entryPort || null, row.entryFlight || null,
                row.exitPort || null, row.exitFlight || null,
                row.actualStayDays ?? null, row.programDuration ?? 14, row.overstayDays ?? 0,
                borderEnc, borderHash, mofaEnc, mofaHash,
                row.isInsideKingdom ?? false, row.hasUmrahPermit ?? false,
                scope.userId,
              ]
            );
            await logChange(client, batchId, "mutamer", res.rows[0].id, "created");
            newCount++;

            if (row.status === "overstayed" || row.status === "violated") {
              await detectViolation(client, scope, row, res.rows[0].id, groupId, subAgentId, agentId);
            }
          } else {
            const FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays", "entryDate", "exitDate"];
            const changes: string[] = [];
            const vals: any[] = [];
            let hasFinancial = false;

            for (const f of FIELDS) {
              const oldVal = ex[f] ?? null;
              const newVal = row[f] ?? null;
              if (String(oldVal) !== String(newVal) && newVal !== null) {
                vals.push(newVal);
                changes.push(`"${f}"=$${vals.length}`);
                await logChange(client, batchId, "mutamer", ex.id, "updated", f, oldVal, newVal,
                  f === "overstayDays" || f === "actualStayDays");
                if (f === "overstayDays" || f === "actualStayDays") hasFinancial = true;
              }
            }

            if (groupId) { vals.push(groupId); changes.push(`"groupId"=$${vals.length}`); }
            if (subAgentId) { vals.push(subAgentId); changes.push(`"subAgentId"=$${vals.length}`); }
            if (agentId) { vals.push(agentId); changes.push(`"agentId"=$${vals.length}`); }

            if (changes.length > 0) {
              changes.push(`"updatedAt"=NOW()`);
              vals.push(ex.id);
              vals.push(scope.companyId);
              await client.query(
                `UPDATE umrah_pilgrims SET ${changes.join(",")} WHERE id=$${vals.length - 1} AND "companyId"=$${vals.length}`,
                vals
              );
              updatedCount++;
              if (hasFinancial) financialImpactCount++;

              if ((row.status === "overstayed" || row.status === "violated") && ex.status !== row.status) {
                await detectViolation(client, scope, row, ex.id, groupId, subAgentId, agentId);
              }
            } else {
              await logChange(client, batchId, "mutamer", ex.id, "skipped");
              skippedCount++;
            }
          }
          await client.query("RELEASE SAVEPOINT sp_row");
        } catch (err: any) {
          await client.query("ROLLBACK TO SAVEPOINT sp_row");
          await client.query("RELEASE SAVEPOINT sp_row");
          const msg = String(err?.message || "");
          // Treat duplicate (companyId, passportNumber, seasonId) as skipped (idempotent)
          if (/duplicate key|unique constraint|already exists/i.test(msg) && /passport/i.test(msg)) {
            skippedCount++;
            try { await logChange(client, batchId, "mutamer", 0, "skipped", null, null, "duplicate"); } catch (e) { logger.error(e, "umrah import logChange failed"); }
          } else {
            errorCount++;
            try { await logChange(client, batchId, "mutamer", 0, "error", null, null, msg); } catch (e) { logger.error(e, "umrah import logChange failed"); }
          }
        }
      }
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,"updatedAt"=NOW() WHERE id=$6 AND "companyId"=$7`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount, batchId, scope.companyId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.mutamers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

    return { batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount };
  });
}

export async function confirmVouchersImport(
  scope: ImportScope,
  rows: ParsedRow[],
  fileName: string,
  options: { allowOverdraft?: boolean } = {},
): Promise<ImportResult> {
  return withTransaction(async (client) => {
    // Wallet-overdraft guardrail — the hard form of PR #1464's
    // soft red banner. Refuses the entire import if the cumulative
    // new obligations would push the NUSK supplier wallet below
    // zero. Matches the operator rule:
    //   "لا يمكن نشتري تأشيرة الا وفي فلوس في الحساب"
    //
    // Skipped when:
    //   - The company hasn't configured nuskSupplierId yet (settings
    //     unset → wallet view also shows configured:false, consistent)
    //   - The operator explicitly passed allowOverdraft=true (logged
    //     to audit for compliance review)
    //
    // Computed inside the transaction so a concurrent NUSK invoice
    // import can't slip past the check. The query shapes match the
    // /umrah/nusk-wallet endpoint exactly so the guardrail and the
    // display reconcile on the same number.
    if (!options.allowOverdraft) {
      const cfgRes = await client.query(
        `SELECT "nuskSupplierId" FROM companies WHERE id = $1`,
        [scope.companyId],
      );
      const nuskSupplierId = cfgRes.rows[0]?.nuskSupplierId ?? null;
      if (nuskSupplierId != null) {
        const depRes = await client.query(
          `SELECT COALESCE(SUM(spa.amount), 0) AS total
             FROM supplier_payment_allocations spa
             JOIN journal_entries je ON je.id = spa."journalEntryId"
             JOIN purchase_orders po ON po.id = spa."obligationId"
            WHERE spa."companyId" = $1
              AND spa."deletedAt" IS NULL
              AND spa."obligationType" = 'purchase_order'
              AND po."supplierId" = $2
              AND je."deletedAt" IS NULL
              AND je."balancesApplied" = true
              AND je."reversedById" IS NULL`,
          [scope.companyId, nuskSupplierId],
        );
        const oblRes = await client.query(
          `SELECT COALESCE(SUM("totalAmount"), 0) AS total,
                  COALESCE(SUM("refundAmount"), 0) AS refunds
             FROM umrah_nusk_invoices
            WHERE "companyId" = $1
              AND "deletedAt" IS NULL
              AND "nuskStatus" NOT IN ('cancelled')`,
          [scope.companyId],
        );
        const currentBalance =
          Number(depRes.rows[0]?.total ?? 0)
          - (Number(oblRes.rows[0]?.total ?? 0) - Number(oblRes.rows[0]?.refunds ?? 0));
        const newObligations = rows.reduce((sum, r) => {
          // Match the schema columns the row INSERT below uses.
          // `refundAmount` isn't a column on the imported row;
          // refunds happen post-import via a separate flow.
          const t = Number((r as any).totalAmount ?? 0);
          return sum + (Number.isFinite(t) && t > 0 ? t : 0);
        }, 0);
        const projectedBalance = currentBalance - newObligations;
        if (projectedBalance < 0) {
          const shortfall = Math.abs(projectedBalance);
          throw new ValidationError(
            `الاستيراد سيتجاوز رصيد محفظة نسك بـ ${shortfall.toFixed(2)} ر.س`,
            {
              field: "wallet",
              fix:
                `حوّل ${shortfall.toFixed(2)} ر.س على الأقل إلى مورد نسك ثم أعد المحاولة، ` +
                `أو ابعث allowOverdraft=true إذا كان التحويل في الطريق وتريد التسجيل الآن`,
            },
          );
        }
      }
    }

    const batchRes = await client.query(
      `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","uploadedBy","totalRows",status)
       VALUES ($1,$2,$3,'vouchers',$4,$5,$6,'confirmed') RETURNING id`,
      [scope.companyId, scope.branchId, scope.seasonId, fileName, scope.userId, rows.length]
    );
    const batchId = batchRes.rows[0].id;

    let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0, financialImpactCount = 0;

    for (const row of rows) {
      if (!row.nuskInvoiceNumber) { errorCount++; continue; }
      await client.query("SAVEPOINT sp_row");
      try {
        const groupId = await resolveGroup(client, scope, row);
        const agentId = await resolveAgent(client, scope, row);
        const subAgentId = await resolveSubAgent(client, scope, row, agentId);

        const [ex] = (await client.query(
          `SELECT * FROM umrah_nusk_invoices WHERE "companyId"=$1 AND "nuskInvoiceNumber"=$2 AND "deletedAt" IS NULL`,
          [scope.companyId, row.nuskInvoiceNumber]
        )).rows;

        if (!ex) {
          const res = await client.query(
            `INSERT INTO umrah_nusk_invoices
             ("companyId","branchId","nuskInvoiceNumber","agentId","subAgentId","groupId",
              "mutamerCount","groundServices","electronicFees","visaFees","insuranceFees",
              "enrichmentServices","additionalServices","transportTotal","hotelTotal",
              "refundAmount","netCost","totalAmount","nuskStatus","issueDate","expiryDate",
              "programDuration","treasuryId","createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW(),NOW())
             RETURNING id`,
            [
              scope.companyId, scope.branchId, row.nuskInvoiceNumber,
              agentId, subAgentId, groupId,
              row.mutamerCount ?? 0,
              row.groundServices ?? 0, row.electronicFees ?? 0, row.visaFees ?? 0,
              row.insuranceFees ?? 0, row.enrichmentServices ?? 0, row.additionalServices ?? 0,
              row.transportTotal ?? 0, row.hotelTotal ?? 0, row.refundAmount ?? 0,
              row.netCost ?? 0, row.totalAmount ?? 0,
              row.nuskStatus || "pending",
              row.issueDate || null, row.expiryDate || null,
              row.programDuration ?? null,
              scope.treasuryId ?? null,
              scope.userId,
            ]
          );
          await logChange(client, batchId, "nusk_invoice", res.rows[0].id, "created");

          const nuskId = res.rows[0].id;
          await postNuskJournalEntries(client, scope, {
            nuskId,
            nuskInvoiceNumber: String(row.nuskInvoiceNumber),
            totalAmount: Number(row.totalAmount ?? 0),
            refundAmount: Number(row.refundAmount ?? 0),
            nuskStatus: String(row.nuskStatus || "pending").toLowerCase(),
            existingApJeId: null,
            existingRefundJeId: null,
          });

          newCount++;
        } else {
          const FIELDS = ["totalAmount", "netCost", "nuskStatus", "mutamerCount", "refundAmount"];
          const changes: string[] = [];
          const vals: any[] = [];
          let hasFinancial = false;

          for (const f of FIELDS) {
            const oldVal = ex[f] ?? null;
            const newVal = row[f] ?? null;
            if (String(oldVal) !== String(newVal) && newVal !== null) {
              vals.push(newVal);
              changes.push(`"${f}"=$${vals.length}`);
              await logChange(client, batchId, "nusk_invoice", ex.id, "updated", f, oldVal, newVal,
                f === "totalAmount" || f === "netCost" || f === "refundAmount");
              if (f === "totalAmount" || f === "netCost" || f === "refundAmount") hasFinancial = true;
            }
          }

          if (groupId && ex.groupId !== groupId) { vals.push(groupId); changes.push(`"groupId"=$${vals.length}`); }
          if (subAgentId && ex.subAgentId !== subAgentId) { vals.push(subAgentId); changes.push(`"subAgentId"=$${vals.length}`); }

          if (changes.length > 0) {
            vals.push(scope.userId);
            changes.push(`"updatedBy"=$${vals.length}`);
            changes.push(`"updatedAt"=NOW()`);
            vals.push(ex.id);
            vals.push(scope.companyId);
            await client.query(
              `UPDATE umrah_nusk_invoices SET ${changes.join(",")} WHERE id=$${vals.length - 1} AND "companyId"=$${vals.length}`,
              vals
            );
            updatedCount++;
            if (hasFinancial) financialImpactCount++;
          } else {
            skippedCount++;
          }

          // Always re-evaluate journal entries — backfills legacy rows missing AP,
          // and posts the refund reversal the first time status transitions to 'refunded'.
          // postNuskJournalEntries is idempotent via sourceKey + existing-id guards.
          await postNuskJournalEntries(client, scope, {
            nuskId: ex.id,
            nuskInvoiceNumber: String(row.nuskInvoiceNumber),
            totalAmount: Number(row.totalAmount ?? ex.totalAmount ?? 0),
            refundAmount: Number(row.refundAmount ?? ex.refundAmount ?? 0),
            nuskStatus: String(row.nuskStatus ?? ex.nuskStatus ?? "pending").toLowerCase(),
            existingApJeId: ex.purchaseInvoiceId ?? null,
            existingRefundJeId: ex.journalEntryId ?? null,
          });
        }
        await client.query("RELEASE SAVEPOINT sp_row");
      } catch (err: any) {
        await client.query("ROLLBACK TO SAVEPOINT sp_row");
        await client.query("RELEASE SAVEPOINT sp_row");
        const msg = String(err?.message || "");
        if (/duplicate key|unique constraint|already exists/i.test(msg)) {
          skippedCount++;
          try { await logChange(client, batchId, "nusk_invoice", 0, "skipped", null, null, "duplicate"); } catch (e) { logger.error(e, "umrah import logChange failed"); }
        } else {
          errorCount++;
          try { await logChange(client, batchId, "nusk_invoice", 0, "error", null, null, msg); } catch (e) { logger.error(e, "umrah import logChange failed"); }
        }
      }
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,"updatedAt"=NOW() WHERE id=$6 AND "companyId"=$7`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount, batchId, scope.companyId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.vouchers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

    return { batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount };
  });
}

// ---------------------------------------------------------------------------
// Helper: post NUSK invoice journal entries (AP on receipt + refund reversal)
// ---------------------------------------------------------------------------
//
// Accounting rules:
//   * AP (DR cost / CR nusk payables) posts on receipt for ANY status that
//     represents a real obligation — i.e. anything except 'cancelled'. The
//     prior behaviour gated this on status='paid' which left pending/issued
//     invoices unbooked and silently understated AP on the trial balance.
//   * Refund reversal (DR nusk payables / CR cost) posts when status is
//     'refunded' AND refundAmount > 0. It cancels the original obligation
//     up to the refund amount.
//
// Idempotency: caller passes the row's existingApJeId / existingRefundJeId;
//   we skip posting when they are already set. createGuardedJournalEntry
//   itself also dedupes via sourceKey, so a re-run is always safe.
async function postNuskJournalEntries(
  client: pg.PoolClient,
  scope: ImportScope,
  params: {
    nuskId: number;
    nuskInvoiceNumber: string;
    totalAmount: number;
    refundAmount: number;
    nuskStatus: string;
    existingApJeId: number | null;
    existingRefundJeId: number | null;
  },
): Promise<void> {
  const { nuskId, nuskInvoiceNumber, totalAmount, refundAmount, nuskStatus, existingApJeId, existingRefundJeId } = params;

  if (totalAmount > 0 && nuskStatus !== "cancelled" && !existingApJeId) {
    try {
      const expCode = scope.purchaseAccountCode
        || await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "debit", "5201");
      const apCode = await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "credit", "2101");
      const apJeId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        createdBy: scope.userId,
        ref: `NUSK-JE-${nuskInvoiceNumber}`,
        description: `قيد فاتورة نسك ${nuskInvoiceNumber}`,
        type: "purchase",
        sourceType: "umrah_nusk_invoices",
        sourceId: nuskId,
        sourceKey: `umrah_nusk_ap_${nuskId}`,
        lines: [
          { accountCode: expCode, debit: totalAmount, credit: 0, description: "تكلفة خدمات نسك" },
          { accountCode: apCode, debit: 0, credit: totalAmount, description: "مستحقات نسك" },
        ],
      }, { table: "umrah_nusk_invoices", id: nuskId });
      if (apJeId) {
        await client.query(
          `UPDATE umrah_nusk_invoices SET "purchaseInvoiceId"=$1 WHERE id=$2 AND "companyId"=$3`,
          [apJeId, nuskId, scope.companyId]
        );
      }
    } catch (jeErr) {
      logger.error(jeErr, `[UmrahImport] AP journal entry failed for NUSK ${nuskInvoiceNumber}`);
    }
  }

  if (nuskStatus === "refunded" && refundAmount > 0 && !existingRefundJeId) {
    try {
      const expCode = scope.purchaseAccountCode
        || await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "debit", "5201");
      const apCode = await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "credit", "2101");
      const refundJeId = await createGuardedJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        createdBy: scope.userId,
        ref: `NUSK-RFD-${nuskInvoiceNumber}`,
        description: `قيد إرجاع فاتورة نسك ${nuskInvoiceNumber}`,
        type: "purchase",
        sourceType: "umrah_nusk_invoices",
        sourceId: nuskId,
        sourceKey: `umrah_nusk_refund_${nuskId}`,
        lines: [
          { accountCode: apCode, debit: refundAmount, credit: 0, description: "عكس مستحقات نسك — إرجاع" },
          { accountCode: expCode, debit: 0, credit: refundAmount, description: "عكس تكلفة خدمات نسك — إرجاع" },
        ],
      }, { table: "umrah_nusk_invoices", id: nuskId });
      if (refundJeId) {
        await client.query(
          `UPDATE umrah_nusk_invoices SET "journalEntryId"=$1 WHERE id=$2 AND "companyId"=$3`,
          [refundJeId, nuskId, scope.companyId]
        );
      }
    } catch (jeErr) {
      logger.error(jeErr, `[UmrahImport] Refund reversal journal entry failed for NUSK ${nuskInvoiceNumber}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers: auto-resolve agent / sub-agent / group
// ---------------------------------------------------------------------------

async function resolveAgent(client: pg.PoolClient, scope: ImportScope, row: ParsedRow): Promise<number | null> {
  if (!row.nuskAgentNumber && !row.agentName) return null;
  if (row.nuskAgentNumber) {
    const [ex] = (await client.query(
      `SELECT id FROM umrah_agents WHERE "companyId"=$1 AND "contractRef"=$2 AND "deletedAt" IS NULL`,
      [scope.companyId, row.nuskAgentNumber]
    )).rows;
    if (ex) return ex.id;
  }
  const agentName = row.agentName || `وكيل ${row.nuskAgentNumber}`;
  const [exByName] = (await client.query(
    `SELECT id FROM umrah_agents WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, agentName]
  )).rows;
  if (exByName) return exByName.id;
  const res = await client.query(
    `INSERT INTO umrah_agents ("companyId",name,"contractRef","createdAt","updatedAt")
     VALUES ($1,$2,$3,NOW(),NOW())
     RETURNING id`,
    [scope.companyId, agentName, row.nuskAgentNumber || null]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveSubAgent(client: pg.PoolClient, scope: ImportScope, row: ParsedRow, agentId: number | null): Promise<number | null> {
  if (!row.nuskCode) return null;
  const [ex] = (await client.query(
    `SELECT id FROM umrah_sub_agents WHERE "companyId"=$1 AND "nuskCode"=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, row.nuskCode]
  )).rows;
  if (ex) return ex.id;
  const res = await client.query(
    `INSERT INTO umrah_sub_agents ("companyId","branchId","nuskCode",name,"agentId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
    [scope.companyId, scope.branchId, row.nuskCode, row.subAgentName || `فرعي ${row.nuskCode}`, agentId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveGroup(client: pg.PoolClient, scope: ImportScope, row: ParsedRow): Promise<number | null> {
  if (!row.nuskGroupNumber) return null;
  const [ex] = (await client.query(
    `SELECT id FROM umrah_groups WHERE "companyId"=$1 AND "nuskGroupNumber"=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, row.nuskGroupNumber]
  )).rows;
  if (ex) return ex.id;
  const res = await client.query(
    `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber",name,"seasonId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
    [scope.companyId, scope.branchId, row.nuskGroupNumber, row.groupName || `مجموعة ${row.nuskGroupNumber}`, scope.seasonId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Violation detection
// ---------------------------------------------------------------------------

async function detectViolation(
  client: pg.PoolClient, scope: ImportScope, row: ParsedRow,
  mutamerId: number, groupId: number | null, subAgentId: number | null, agentId: number | null,
) {
  const type = row.status === "violated" ? "absconded" : "overstay";
  const [exists] = (await client.query(
    `SELECT id FROM umrah_violations
     WHERE "companyId"=$1 AND "mutamerId"=$2 AND type=$3 AND "deletedAt" IS NULL`,
    [scope.companyId, mutamerId, type]
  )).rows;
  if (exists) return;

  const penalty = type === "absconded" ? 2000 : (Number(row.overstayDays) || 0) * 200;

  await client.query(
    `INSERT INTO umrah_violations
     ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId","groupId","subAgentId","agentId",
      description,"penaltyAmount",status,"createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,'mutamer',$4,$5,$6,$7,$8,$9,$10,'detected',$11,NOW(),NOW())`,
    [
      scope.companyId, scope.branchId, type,
      String(row.nuskNumber), mutamerId, groupId, subAgentId, agentId,
      type === "absconded" ? `هروب معتمر: ${row.fullName}` : `تجاوز مدة: ${row.fullName} (${row.overstayDays} يوم)`,
      penalty, scope.userId,
    ]
  );

  const eventName = type === "absconded" ? "umrah.absconder.detected" : "umrah.overstay.detected";
  emitEvent({
    companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
    action: eventName, entity: "umrah_violations", entityId: mutamerId,
    after: { nuskNumber: row.nuskNumber, type, overstayDays: row.overstayDays },
  }).catch((e) => logger.error(e, "umrah import event emit failed"));
}

// ---------------------------------------------------------------------------
// Change log helper
// ---------------------------------------------------------------------------

async function logChange(
  client: pg.PoolClient, batchId: number, entityType: string, entityId: number,
  changeType: string, fieldName?: string | null, oldValue?: any, newValue?: any, hasFinancialImpact?: boolean,
) {
  await client.query(
    `INSERT INTO umrah_import_changes
     ("batchId","entityType","entityId","changeType","fieldName","oldValue","newValue","hasFinancialImpact","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [batchId, entityType, entityId, changeType, fieldName ?? null,
     oldValue != null ? String(oldValue) : null, newValue != null ? String(newValue) : null,
     hasFinancialImpact ?? false]
  );
}
