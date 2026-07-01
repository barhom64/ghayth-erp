import { parseFirstSheetAOA } from "./excelCompat.js";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { emitEvent, createAuditLog, createGuardedJournalEntry, getAccountCodeFromMapping, toDateISO } from "./businessHelpers.js";
import { ValidationError } from "./errorHandler.js";
import type pg from "pg";
import { logger } from "./logger.js";
import { encryptField, blindIndex } from "./fieldEncryption.js";
import { resolveSettings } from "./settings.js";
import { overstayPenaltyAmount } from "./umrahPenaltyMath.js";

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
  "رقم الوكيل الرئيسي": "nuskAgentNumber",
  "كود الوكيل": "nuskAgentNumber",
  "رمز الوكيل": "nuskAgentNumber",
  "اسم الوكيل": "agentName",
  "الوكيل": "agentName",
  "الوكيل الرئيسي": "agentName",
  "اسم الوكيل الرئيسي": "agentName",
  "رمز المكتب": "nuskCode",
  "كود المكتب": "nuskCode",
  "رمز الوكيل الفرعي": "nuskCode",
  "كود الوكيل الفرعي": "nuskCode",
  "اسم المكتب": "subAgentName",
  "المكتب": "subAgentName",
  "الوكيل الفرعي": "subAgentName",
  "اسم الوكيل الفرعي": "subAgentName",
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
  "إجمالي المعتمرين": "mutamerCount",
  "اجمالي المعتمرين": "mutamerCount",
  "عدد المعتمرين في الفاتورة": "mutamerCount",
  "عدد الحجاج": "mutamerCount",
  "العدد": "mutamerCount",
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
  "رقم الوكيل الرئيسي": "nuskAgentNumber",
  "كود الوكيل": "nuskAgentNumber",
  "رمز الوكيل": "nuskAgentNumber",
  "اسم الوكيل": "agentName",
  "الوكيل": "agentName",
  "الوكيل الرئيسي": "agentName",
  "اسم الوكيل الرئيسي": "agentName",
  "رمز المكتب": "nuskCode",
  "كود المكتب": "nuskCode",
  "رمز الوكيل الفرعي": "nuskCode",
  "كود الوكيل الفرعي": "nuskCode",
  "اسم المكتب": "subAgentName",
  "المكتب": "subAgentName",
  "الوكيل الفرعي": "subAgentName",
  "اسم الوكيل الفرعي": "subAgentName",
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

// ---------------------------------------------------------------------------
// Field-group catalog — used by the wizard's column-mapping dropdown to
// render headings (المعتمر / الوكيل / الفنادق ...) instead of a flat
// 50-item alphabetical list. Each engine field maps to exactly one
// group. Groups are ordered logically (pilgrim → identity → agent →
// travel → status → finance) so the dropdown reads top-down the way an
// operator skims the file from left to right.
// ---------------------------------------------------------------------------
export const UMRAH_FIELD_GROUP_LABELS_AR: Record<string, string> = {
  pilgrim: "بيانات المعتمر",
  identity: "الجواز والتأشيرة",
  agent: "الوكيل والمكتب",
  group: "المجموعة",
  travel: "الدخول والخروج",
  status: "الحالة والإقامة",
  finance: "المالية",
};

export const UMRAH_FIELD_GROUPS: Record<string, keyof typeof UMRAH_FIELD_GROUP_LABELS_AR> = {
  // pilgrim
  nuskNumber: "pilgrim", fullName: "pilgrim", nationality: "pilgrim",
  gender: "pilgrim", country: "pilgrim",
  // identity
  passportNumber: "identity", passportExpiry: "identity", visaNumber: "identity",
  borderNumber: "identity", mofaNumber: "identity",
  // agent / sub-agent
  nuskAgentNumber: "agent", agentName: "agent",
  nuskCode: "agent", subAgentName: "agent",
  // group
  nuskGroupNumber: "group", groupName: "group",
  // travel
  entryDate: "travel", exitDate: "travel",
  entryPort: "travel", entryFlight: "travel",
  exitPort: "travel", exitFlight: "travel",
  // status / stay
  status: "status", isInsideKingdom: "status", hasUmrahPermit: "status",
  programDuration: "status", actualStayDays: "status", overstayDays: "status",
  // finance (vouchers)
  nuskInvoiceNumber: "finance", mutamerCount: "finance",
  groundServices: "finance", electronicFees: "finance",
  visaFees: "finance", insuranceFees: "finance",
  enrichmentServices: "finance", additionalServices: "finance",
  transportTotal: "finance", hotelTotal: "finance",
  refundAmount: "finance", netCost: "finance", totalAmount: "finance",
  nuskStatus: "finance", issueDate: "finance", expiryDate: "finance",
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
 * Folded header key for tolerant matching in `normalizeImportRows`. Same
 * Arabic folds as `normaliseHeader` (hamza / alif-maksura / ta-marbuta /
 * tatweel / whitespace / case) plus quote-stripping. Lets a vendor file
 * whose column is written "الوكيل الرئيسي" / "إجمالى المعتمرين" still
 * resolve against the dictionary even though the exact (trim-only) key
 * differs — the silent-drop that left agentId/subAgentId NULL and
 * mutamerCount 0 on import.
 */
function foldHeaderKey(s: string): string {
  return normaliseHeader(s).replace(/["']/g, "");
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
  // Build two lookups per source: a trim-only exact map (Excel files often
  // pad headers with whitespace) AND an Arabic-folded map (hamza /
  // ta-marbuta / alif-maksura / tatweel / case variants). The folded layer
  // is what lets "الوكيل الرئيسي" / "إجمالى المعتمرين" resolve against the
  // dictionary's canonical key — without it those columns silently dropped,
  // landing agentId/subAgentId NULL and mutamerCount 0 on import.
  const trimmedBuiltin: Record<string, string> = {};
  const foldedBuiltin: Record<string, string> = {};
  for (const [k, v] of Object.entries(builtin)) {
    trimmedBuiltin[k.trim()] = v;
    foldedBuiltin[foldHeaderKey(k)] = v;
  }
  const trimmedCustom: Record<string, string> = {};
  const foldedCustom: Record<string, string> = {};
  if (customMapping) {
    for (const [k, v] of Object.entries(customMapping)) {
      const trimmedKey = k.trim();
      // Ignore empty custom values — they signal "operator didn't pick
      // a target field for this column" and should fall through to the
      // built-in lookup or be dropped.
      if (trimmedKey && typeof v === "string" && v.trim()) {
        trimmedCustom[trimmedKey] = v.trim();
        foldedCustom[foldHeaderKey(k)] = v.trim();
      }
    }
  }

  return rows.map((raw) => {
    const out: ParsedRow = {};
    for (const [origKey, val] of Object.entries(raw)) {
      const key = origKey.trim();
      const folded = foldHeaderKey(origKey);
      // Resolution order: custom-exact → custom-folded → builtin-exact →
      // builtin-folded. Custom (operator) mapping always beats built-in;
      // exact always beats folded. If nothing knows the key, drop it.
      const target =
        trimmedCustom[key] ?? foldedCustom[folded] ??
        trimmedBuiltin[key] ?? foldedBuiltin[folded];
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
   * `umrah_nusk_cost`/debit, then to the hard default `5120` (تكلفة
   * الخدمات — a postable leaf seeded in every company's chart). Lets the
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
  /**
   * Rows with no `nuskGroupNumber` — same shape as `rowsWithoutAgent`
   * but for the group dimension. They save with `groupId = NULL` and
   * are invisible on agent → group → pilgrim rollups. Recoverable via
   * the /umrah/import/:batchId/unlinked screen.
   */
  rowsWithoutGroup: number;
  /**
   * Rows with no `nuskCode` — same shape, sub-agent dimension. They
   * save with `subAgentId = NULL` and don't appear on sub-agent
   * statements. Recoverable via the same screen.
   */
  rowsWithoutSubAgent: number;
  totalRows: number;
  financialImpactCount: number;
  /**
   * U-11 Phase 3a (#2080) — detection-only enrichment.
   *
   * The active `umrah.auto_link.clientLinkagePolicy` value at preview
   * time. Surfaced verbatim so the FE banner can name the company's
   * declared stance ("operational_until_linked" by default). The
   * preview engine NEVER acts on the policy — it does not auto-link,
   * does not auto-create clients, does not change behaviour by
   * policy. The value is purely informational; Phase 3b will decide
   * whether to use the policy for operator-confirmed suggestions.
   */
  clientLinkagePolicy: string;
  /**
   * BILL-MAIN P6 (#2080) — main-agent linkage detection. Lists the
   * main agents referenced by this import file that exist in
   * `umrah_agents` but carry `clientId = NULL`. Surfaced so the
   * operator preparing to switch the company to `main_agent_client`
   * mode (a future hard-pause phase) can see which main agents
   * still need an explicit `PUT /umrah/agents/:id/link-client` call
   * before invoicing in that mode would succeed. The preview engine
   * NEVER acts on this list — no auto-link, no client creation, no
   * behaviour change.
   */
  unlinkedMainAgents: {
    agentId: number;
    name: string;
    nuskAgentNumber: string | null;
  }[];
  /**
   * Non-null when the import would create or reference sub-agents
   * that lack a `clientId`. Tells the operator BEFORE confirm that
   * invoicing on these rows will fail at `generateSalesInvoice` until
   * the sub-agent is explicitly linked. The hint NEVER triggers a
   * linkage — surfacing is the whole point of Phase 3a.
   */
  unlinkedSubAgentInvoicingHint:
    | {
        willBlockInvoicing: boolean;
        unlinkedSubAgentCount: number;
        activePolicy: string;
        arabicHint: string;
      }
    | null;
}

export async function previewMutamersImport(scope: ImportScope, rows: ParsedRow[]): Promise<ImportDiff> {
  return previewImport(scope, rows, "mutamers");
}

export async function previewVouchersImport(scope: ImportScope, rows: ParsedRow[]): Promise<ImportDiff> {
  return previewImport(scope, rows, "vouchers");
}

async function previewImport(scope: ImportScope, rows: ParsedRow[], fileType: "mutamers" | "vouchers"): Promise<ImportDiff> {
  // U-11 Phase 3a — resolve the active client-linkage policy ONCE,
  // up front, and stash it on the diff. The preview engine is
  // deliberately read-only on the policy: the value is surfaced for
  // the operator's banner, never used to mutate import behaviour.
  // Same `umrah.auto_link.clientLinkagePolicy` key as the invoicing
  // engine reads — single source of truth, no rival key.
  let policyRaw: unknown;
  try {
    policyRaw = await resolveSettings(
      "umrah.auto_link.clientLinkagePolicy",
      scope.companyId,
    );
  } catch {
    policyRaw = undefined;
  }
  const activePolicy =
    typeof policyRaw === "string" && policyRaw.length > 0
      ? policyRaw
      : "operational_until_linked";

  const diff: ImportDiff = {
    newRows: [],
    updatedRows: [],
    skippedCount: 0,
    errorRows: [],
    unlinkedSubAgents: [],
    newAgentsToCreate: [],
    rowsWithoutAgent: 0,
    rowsWithoutGroup: 0,
    rowsWithoutSubAgent: 0,
    totalRows: rows.length,
    financialImpactCount: 0,
    clientLinkagePolicy: activePolicy,
    unlinkedSubAgentInvoicingHint: null,
    unlinkedMainAgents: [],
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
          `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber", "passportNumber_hash",
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
    // BILL-MAIN P6 — track every referenced main agent's clientId so
    // the preview can list main agents that are still unlinked. The
    // map is keyed by `umrah_agents.id` so a duplicate-by-name +
    // duplicate-by-nuskNumber match collapses to one entry.
    const matchedMainAgents = new Map<
      number,
      { agentId: number; name: string; nuskAgentNumber: string | null; clientId: number | null }
    >();
    if (agentNuskNumbers.size > 0) {
      const found = await rawQuery<{ id: number; name: string; contractRef: string | null; clientId: number | null }>(
        `SELECT id, name, "contractRef", "clientId" FROM umrah_agents WHERE "companyId" = $1 AND "contractRef" = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, [...agentNuskNumbers]]
      );
      for (const r of found) {
        knownByNuskNumber.add(String(r.contractRef));
        matchedMainAgents.set(r.id, {
          agentId: r.id,
          name: String(r.name ?? ""),
          nuskAgentNumber: r.contractRef ?? null,
          clientId: r.clientId,
        });
      }
    }
    if (agentNames.size > 0) {
      const found = await rawQuery<{ id: number; name: string; contractRef: string | null; clientId: number | null }>(
        `SELECT id, name, "contractRef", "clientId" FROM umrah_agents WHERE "companyId" = $1 AND name = ANY($2) AND "deletedAt" IS NULL`,
        [scope.companyId, [...agentNames]]
      );
      for (const r of found) {
        knownByName.add(String(r.name));
        if (!matchedMainAgents.has(r.id)) {
          matchedMainAgents.set(r.id, {
            agentId: r.id,
            name: String(r.name ?? ""),
            nuskAgentNumber: r.contractRef ?? null,
            clientId: r.clientId,
          });
        }
      }
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
          const newVal = row[f] ?? null;
          if (f === "passportNumber") {
            // The stored passportNumber is ENCRYPTED, so a plaintext-vs-ciphertext
            // compare always reports a phantom change — re-importing the same file
            // would perpetually classify every passport-bearing pilgrim as
            // "updated", breaking import idempotency. Compare via the deterministic
            // blind index instead; report the change with the old value masked.
            if (newVal === null) continue;
            const newHash = blindIndex(String(newVal));
            if (newHash !== (ex.passportNumber_hash ?? null)) {
              changes.push({ field: f, oldValue: ex.passportNumber_hash ? "***" : null, newValue: newVal });
            }
            continue;
          }
          const oldVal = ex[f] ?? null;
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

      // Group / sub-agent dimensions: same fallback shape as agent.
      // resolveGroup returns null when `nuskGroupNumber` is missing
      // → groupId = NULL on insert; same for resolveSubAgent vs
      // `nuskCode`. Surface counts so the operator decides whether
      // to (a) abort + re-prep the file, or (b) confirm and recover
      // via /umrah/import/:batchId/unlinked.
      if (!row.nuskGroupNumber) diff.rowsWithoutGroup++;
      if (!row.nuskCode) diff.rowsWithoutSubAgent++;

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

    // BILL-MAIN P6 — main agents this file references that already
    // exist in `umrah_agents` but have `clientId IS NULL`. Sorted by
    // name for stable display. Only matters in `main_agent_client`
    // policy mode (engine fallback still hard-pause); surfaced
    // unconditionally so the operator can prep linkage ahead of any
    // future mode switch.
    diff.unlinkedMainAgents = [...matchedMainAgents.values()]
      .filter((a) => a.clientId == null)
      .map((a) => ({
        agentId: a.agentId,
        name: a.name,
        nuskAgentNumber: a.nuskAgentNumber,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // U-11 Phase 3a — invoicing-block hint. The message is the SAME
    // signal the operator will eventually receive from
    // `generateSalesInvoice`'s ConflictError, surfaced UP-front so
    // the operator can link before confirming, not after a failed
    // invoice draft. The hint is non-null whenever the import would
    // create/reference any sub-agent that lacks a clientId.
    if (diff.unlinkedSubAgents.length > 0) {
      diff.unlinkedSubAgentInvoicingHint = {
        willBlockInvoicing: true,
        unlinkedSubAgentCount: diff.unlinkedSubAgents.length,
        activePolicy,
        arabicHint:
          "السياسة الحالية للربط: " + activePolicy + ". الاستيراد سيُنشئ/يُحدِّث هؤلاء الوكلاء الفرعيين ككيانات تشغيلية فقط (بلا عميل مالي تلقائي وبلا ربط صامت). محاولة إصدار فاتورة عليهم ستفشل حتى يتم الربط الصريح عبر PUT /umrah/sub-agents/:id/link.",
      };
    }
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
  /**
   * Number of inserted/updated pilgrims that landed with `agentId = NULL`
   * because resolveAgent couldn't match (no nuskAgentNumber + no
   * agentName). They are recoverable via the
   * /umrah/import/:batchId/unlinked screen. Vouchers imports always
   * return 0 here — the dimension only applies to mutamers.
   */
  unlinkedAgentCount: number;
  /** Same shape, group dimension (groupId NULL). */
  unlinkedGroupCount: number;
  /** Same shape, sub-agent dimension (subAgentId NULL). */
  unlinkedSubAgentCount: number;
}

export async function confirmMutamersImport(
  scope: ImportScope,
  rows: ParsedRow[],
  fileName: string,
): Promise<ImportResult> {
  // Overstay penalty config — read the SAME three company settings the daily
  // auto-detection cron (umrahDailyOverstayScan) uses, so an overstay billed
  // by import matches one billed by the cron exactly. Resolved ONCE per import
  // (not per row). Replaces the former hard-coded flat `days × 200`.
  const overstayCfg = {
    perDay: Number((await resolveSettings("umrah.overstay_daily_penalty", scope.companyId)) ?? 0),
    tierDays: Number((await resolveSettings("umrah.overstay_tier_days", scope.companyId)) ?? 0),
    tierAmount: Number((await resolveSettings("umrah.overstay_tier_amount", scope.companyId)) ?? 0),
  };
  return withTransaction(async (client) => {
    const batchRes = await client.query(
      `INSERT INTO umrah_import_batches
       ("companyId","branchId","seasonId","fileType","fileName","uploadedBy","totalRows",status)
       VALUES ($1,$2,$3,'mutamers',$4,$5,$6,'confirmed') RETURNING id`,
      [scope.companyId, scope.branchId, scope.seasonId, fileName, scope.userId, rows.length]
    );
    const batchId = batchRes.rows[0].id;

    let newCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0, financialImpactCount = 0;
    let unlinkedAgentCount = 0, unlinkedGroupCount = 0, unlinkedSubAgentCount = 0;
    const touchedGroupIds = new Set<number>();
    const BATCH_SIZE = 200;

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const nuskNumbers = batch.map((r) => r.nuskNumber).filter(Boolean) as string[];

      const existing = nuskNumbers.length > 0
        ? (await client.query(
            `SELECT id, "nuskNumber", "fullName", nationality, status, "passportNumber", "passportNumber_hash",
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
          // Resolve agent + sub-agent BEFORE the group so the group row
          // can be created/backfilled already linked to them.
          const agentId = await resolveAgent(client, scope, row);
          const subAgentId = await resolveSubAgent(client, scope, row, agentId);
          const groupId = await resolveGroup(client, scope, row, agentId, subAgentId);
          if (groupId) touchedGroupIds.add(groupId);

          // Track unlinkage so the operator gets a precise count on
          // the batch detail row + can drill into the recovery page.
          // Counted before the upsert branches so updates and creates
          // both contribute (an UPDATE that doesn't fix the FK still
          // leaves the row unlinked).
          if (agentId === null) unlinkedAgentCount++;
          if (groupId === null) unlinkedGroupCount++;
          if (subAgentId === null) unlinkedSubAgentCount++;

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
              await detectViolation(client, scope, row, res.rows[0].id, groupId, subAgentId, agentId, overstayCfg);
            }
          } else {
            const FIELDS = ["fullName", "nationality", "status", "passportNumber", "entryPort", "exitPort", "overstayDays", "actualStayDays", "entryDate", "exitDate"];
            const changes: string[] = [];
            const vals: any[] = [];
            let hasFinancial = false;

            for (const f of FIELDS) {
              const newVal = row[f] ?? null;
              if (f === "passportNumber") {
                // The stored value is ENCRYPTED — compare via the deterministic
                // blind index so re-confirming the same passport is NOT a phantom
                // update (the false-success the import contract guards against).
                // On a real change, update BOTH the ciphertext and its index.
                if (newVal === null) continue;
                const newHash = blindIndex(String(newVal));
                if (newHash !== (ex.passportNumber_hash ?? null)) {
                  vals.push(encryptField(String(newVal)));
                  changes.push(`"passportNumber"=$${vals.length}`);
                  vals.push(newHash);
                  changes.push(`"passportNumber_hash"=$${vals.length}`);
                  await logChange(client, batchId, "mutamer", ex.id, "updated", "passportNumber", "***", "***", false);
                }
                continue;
              }
              const oldVal = ex[f] ?? null;
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
                await detectViolation(client, scope, row, ex.id, groupId, subAgentId, agentId, overstayCfg);
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

    // Backfill each touched group's agent / sub-agent (and mutamerCount)
    // from the pilgrims actually linked to it — covers groups whose source
    // row lacked agent info. Savepoint-guarded so a backfill hiccup can't
    // roll back the import work already committed in this transaction.
    try {
      await client.query("SAVEPOINT sp_group_backfill");
      await backfillGroupLinks(client, scope, Array.from(touchedGroupIds), { syncCounts: true });
      await client.query("RELEASE SAVEPOINT sp_group_backfill");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT sp_group_backfill");
      await client.query("RELEASE SAVEPOINT sp_group_backfill");
      logger.error(e, "umrah mutamers import group backfill failed");
    }

    await client.query(
      `UPDATE umrah_import_batches SET "newCount"=$1,"updatedCount"=$2,"skippedCount"=$3,
       "errorCount"=$4,"financialImpactCount"=$5,
       "unlinkedAgentCount"=$6,"unlinkedGroupCount"=$7,"unlinkedSubAgentCount"=$8,
       "updatedAt"=NOW() WHERE id=$9 AND "companyId"=$10`,
      [newCount, updatedCount, skippedCount, errorCount, financialImpactCount,
       unlinkedAgentCount, unlinkedGroupCount, unlinkedSubAgentCount,
       batchId, scope.companyId]
    );

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.mutamers.imported", entity: "umrah_import_batches", entityId: batchId,
      after: { newCount, updatedCount, skippedCount, errorCount,
               unlinkedAgentCount, unlinkedGroupCount, unlinkedSubAgentCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

    // Extra signal so audit dashboards can wake operators on batches
    // that mass-orphan rows. Only emitted when something is actually
    // unlinked — quiet by default. Matches the §10 events catalog.
    if (unlinkedAgentCount > 0 || unlinkedGroupCount > 0 || unlinkedSubAgentCount > 0) {
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "umrah.import.unlinked_rows_detected", entity: "umrah_import_batches", entityId: batchId,
        after: { batchId, unlinkedAgentCount, unlinkedGroupCount, unlinkedSubAgentCount },
      }).catch((e) => logger.error(e, "umrah import event emit failed"));
    }

    // §10 of #1870 — canonical event. Emitted ALONGSIDE the legacy
    // `umrah.mutamers.imported` event so existing listeners keep
    // firing; future code should subscribe to the canonical name.
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.confirmed", entity: "umrah_import_batches", entityId: batchId,
      after: { batchId, fileType: "mutamers", newCount, updatedCount, skippedCount, errorCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

    return {
      batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount,
      unlinkedAgentCount, unlinkedGroupCount, unlinkedSubAgentCount,
    };
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
    const touchedGroupIds = new Set<number>();

    for (const row of rows) {
      if (!row.nuskInvoiceNumber) { errorCount++; continue; }
      await client.query("SAVEPOINT sp_row");
      try {
        // Resolve agent + sub-agent BEFORE the group so the group row can
        // be created/backfilled already linked to them.
        const agentId = await resolveAgent(client, scope, row);
        const subAgentId = await resolveSubAgent(client, scope, row, agentId);
        const groupId = await resolveGroup(client, scope, row, agentId, subAgentId);
        if (groupId) touchedGroupIds.add(groupId);

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
          if (agentId && ex.agentId !== agentId) { vals.push(agentId); changes.push(`"agentId"=$${vals.length}`); }

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

    // Backfill each touched group's agent / sub-agent from the nusk
    // invoices linked to it — covers groups whose source row lacked agent
    // info. syncCounts:true keeps mutamerCount honest from the linked nusk
    // invoices (vouchers don't seed pilgrim rows, so without this the group
    // "معتمرون" count is stuck at 0 even though the invoices carry the real
    // mutamer count). Savepoint-guarded so a backfill hiccup can't roll back
    // committed import work.
    try {
      await client.query("SAVEPOINT sp_group_backfill");
      await backfillGroupLinks(client, scope, Array.from(touchedGroupIds), { syncCounts: true });
      await client.query("RELEASE SAVEPOINT sp_group_backfill");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT sp_group_backfill");
      await client.query("RELEASE SAVEPOINT sp_group_backfill");
      logger.error(e, "umrah vouchers import group backfill failed");
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

    // §10 of #1870 — canonical event. Emitted ALONGSIDE the legacy
    // `umrah.vouchers.imported` event; the catalog entry documents
    // this as the spec-mandated name.
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.confirmed", entity: "umrah_import_batches", entityId: batchId,
      after: { batchId, fileType: "vouchers", newCount, updatedCount, skippedCount, errorCount },
    }).catch((e) => logger.error(e, "umrah import event emit failed"));

    return {
      batchId, newCount, updatedCount, skippedCount, errorCount, financialImpactCount,
      // Vouchers don't carry agent/group/sub-agent FK linkage on the
      // pilgrim, so the dimensions don't apply here. Zero out for
      // type-shape parity with confirmMutamersImport.
      unlinkedAgentCount: 0, unlinkedGroupCount: 0, unlinkedSubAgentCount: 0,
    };
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
/**
 * Posts AP + (optional) refund-reversal journal entries for a NUSK
 * invoice. Idempotent via the createGuardedJournalEntry sourceKey,
 * so it's safe to call on:
 *   - the row's first creation (existingApJeId = null),
 *   - any later update that flips status to/from refunded,
 *   - a backfill pass over historical rows where the JE was lost.
 *
 * Exported so the entities route's manual /nusk-invoices CREATE
 * path can post the AP JE on first insert instead of writing the
 * invoice row in isolation — without this call the NUSK obligation
 * never lands in the trial balance and finance can't see what the
 * company owes the NUSK vendor.
 */
export async function postNuskJournalEntries(
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

  // §6.2 of #1870 — every NUSK purchase JE line now carries the FULL
  // cycle dimensions per operator directive:
  //   1) umrahAgentId   — the main NUSK agent (from umrah_nusk_invoices.agentId).
  //                       "الوكيل الرئيسي في نسك" the operator drills by.
  //   2) umrahSeasonId  — resolved via the NUSK row's groupId → group.seasonId.
  //                       Lets purchase cost roll up to the season's
  //                       margin report alongside the matching sales.
  //   3) vendorId       — companies.nuskSupplierId on the AP line so the
  //                       supplier sub-ledger ("ذمم المورد — وزارة الحج عبر
  //                       نسك") reconciles end-to-end. Cost line stays
  //                       vendor-less (it's the company's own expense).
  // All three are looked up in a SINGLE round-trip; failures are
  // non-fatal (the JE still posts, just without the dimension).
  const [dims] = await rawQuery<{
    agentId: number | null;
    seasonId: number | null;
    nuskSupplierId: number | null;
  }>(
    // Season comes via the group (umrah_nusk_invoices has no own seasonId
    // column). If the NUSK row isn't linked to a group, season stays null
    // — the JE still posts; only the drill-by-season slice is degraded
    // until the import flow links the group.
    `SELECT ni."agentId",
            g."seasonId",
            c."nuskSupplierId"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_groups g ON g.id = ni."groupId" AND g."companyId" = ni."companyId"
       LEFT JOIN companies c    ON c.id = ni."companyId"
      WHERE ni.id = $1 AND ni."companyId" = $2`,
    [nuskId, scope.companyId]
  );
  const purchaseDims = {
    umrahAgentId: dims?.agentId ?? undefined,
    umrahSeasonId: dims?.seasonId ?? undefined,
  };
  const vendorId = dims?.nuskSupplierId ?? undefined;

  if (totalAmount > 0 && nuskStatus !== "cancelled" && !existingApJeId) {
    try {
      const expCode = scope.purchaseAccountCode
        || await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "debit", "5120");
      const apCode = await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "credit", "2111");
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
          { accountCode: expCode, debit: totalAmount, credit: 0, description: "تكلفة خدمات نسك", ...purchaseDims },
          { accountCode: apCode, debit: 0, credit: totalAmount, description: "مستحقات نسك", ...purchaseDims, vendorId },
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
        || await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "debit", "5120");
      const apCode = await getAccountCodeFromMapping(scope.companyId, "umrah_nusk_cost", "credit", "2111");
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
          { accountCode: apCode, debit: refundAmount, credit: 0, description: "عكس مستحقات نسك — إرجاع", ...purchaseDims, vendorId },
          { accountCode: expCode, debit: 0, credit: refundAmount, description: "عكس تكلفة خدمات نسك — إرجاع", ...purchaseDims },
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
  // Accept a name-only sub-agent (اسم المكتب without رمز المكتب). Pre-fix
  // the engine returned null when nuskCode was missing, so a partner file
  // that named the office but had no NUSK code never created the sub-agent
  // — it vanished from the الوكلاء الفرعيين tab AND left the group/pilgrim
  // FK blank.
  if (!row.nuskCode && !row.subAgentName) return null;
  if (row.nuskCode) {
    const [ex] = (await client.query(
      `SELECT id, "agentId" FROM umrah_sub_agents WHERE "companyId"=$1 AND "nuskCode"=$2 AND "deletedAt" IS NULL`,
      [scope.companyId, row.nuskCode]
    )).rows;
    if (ex) {
      if (agentId && !ex.agentId) {
        await client.query(
          `UPDATE umrah_sub_agents SET "agentId"=$1,"updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`,
          [agentId, ex.id, scope.companyId]
        );
      }
      return ex.id;
    }
  }
  if (row.subAgentName) {
    const [exByName] = (await client.query(
      `SELECT id, "agentId" FROM umrah_sub_agents WHERE "companyId"=$1 AND name=$2 AND "deletedAt" IS NULL`,
      [scope.companyId, row.subAgentName]
    )).rows;
    if (exByName) {
      if (agentId && !exByName.agentId) {
        await client.query(
          `UPDATE umrah_sub_agents SET "agentId"=$1,"updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`,
          [agentId, exByName.id, scope.companyId]
        );
      }
      return exByName.id;
    }
  }
  const res = await client.query(
    `INSERT INTO umrah_sub_agents ("companyId","branchId","nuskCode",name,"agentId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
    [scope.companyId, scope.branchId, row.nuskCode || null, row.subAgentName || `فرعي ${row.nuskCode}`, agentId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveGroup(
  client: pg.PoolClient,
  scope: ImportScope,
  row: ParsedRow,
  agentId: number | null = null,
  subAgentId: number | null = null,
): Promise<number | null> {
  if (!row.nuskGroupNumber) return null;
  const [ex] = (await client.query(
    `SELECT id, "agentId", "subAgentId" FROM umrah_groups WHERE "companyId"=$1 AND "nuskGroupNumber"=$2 AND "deletedAt" IS NULL`,
    [scope.companyId, row.nuskGroupNumber]
  )).rows;
  if (ex) {
    // Backfill the group's agent / sub-agent link when the existing row is
    // still unlinked. An import that first sees a row without agent info
    // (group created blank) and later one that carries it ends up linked.
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (agentId && !ex.agentId) { vals.push(agentId); sets.push(`"agentId"=$${vals.length}`); }
    if (subAgentId && !ex.subAgentId) { vals.push(subAgentId); sets.push(`"subAgentId"=$${vals.length}`); }
    if (sets.length > 0) {
      sets.push(`"updatedAt"=NOW()`);
      vals.push(ex.id);
      vals.push(scope.companyId);
      await client.query(
        `UPDATE umrah_groups SET ${sets.join(",")} WHERE id=$${vals.length - 1} AND "companyId"=$${vals.length}`,
        vals
      );
    }
    return ex.id;
  }
  const res = await client.query(
    `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber",name,"agentId","subAgentId","seasonId","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING id`,
    [scope.companyId, scope.branchId, row.nuskGroupNumber, row.groupName || `مجموعة ${row.nuskGroupNumber}`, agentId, subAgentId, scope.seasonId, scope.userId]
  );
  return res.rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Backfill a group's agent / sub-agent (and, for the mutamers path, its
// mutamerCount) from the children actually linked to it. Handles the case
// where the source row that created the group lacked agent info but its
// pilgrims / nusk-invoices carry it. Runs once per import over the set of
// groups the batch touched.
// ---------------------------------------------------------------------------
async function backfillGroupLinks(
  client: pg.PoolClient,
  scope: ImportScope,
  groupIds: number[],
  opts: { syncCounts?: boolean } = {},
): Promise<void> {
  if (groupIds.length === 0) return;
  await client.query(
    `UPDATE umrah_groups g
        SET "agentId" = COALESCE(g."agentId", src."agentId"),
            "subAgentId" = COALESCE(g."subAgentId", src."subAgentId"),
            "updatedAt" = NOW()
       FROM (
         SELECT DISTINCT ON ("groupId") "groupId", "agentId", "subAgentId"
           FROM umrah_pilgrims
          WHERE "companyId" = $1 AND "groupId" = ANY($2::int[]) AND "deletedAt" IS NULL
            AND ("agentId" IS NOT NULL OR "subAgentId" IS NOT NULL)
          ORDER BY "groupId", "agentId" NULLS LAST, "subAgentId" NULLS LAST
       ) src
      WHERE g.id = src."groupId" AND g."companyId" = $1
        AND (g."agentId" IS NULL OR g."subAgentId" IS NULL)`,
    [scope.companyId, groupIds]
  );
  await client.query(
    `UPDATE umrah_groups g
        SET "agentId" = COALESCE(g."agentId", src."agentId"),
            "subAgentId" = COALESCE(g."subAgentId", src."subAgentId"),
            "updatedAt" = NOW()
       FROM (
         SELECT DISTINCT ON ("groupId") "groupId", "agentId", "subAgentId"
           FROM umrah_nusk_invoices
          WHERE "companyId" = $1 AND "groupId" = ANY($2::int[]) AND "deletedAt" IS NULL
            AND ("agentId" IS NOT NULL OR "subAgentId" IS NOT NULL)
          ORDER BY "groupId", "agentId" NULLS LAST, "subAgentId" NULLS LAST
       ) src
      WHERE g.id = src."groupId" AND g."companyId" = $1
        AND (g."agentId" IS NULL OR g."subAgentId" IS NULL)`,
    [scope.companyId, groupIds]
  );
  if (opts.syncCounts) {
    // Keep mutamerCount honest so the groups list "معتمرون" column, the
    // delete-guard, and the merge dialog all read the real number after an
    // import. The count is pilgrim-or-invoice aware: a group with real
    // pilgrim rows (the mutamers path) uses COUNT(pilgrims); a voucher-only
    // group (no pilgrims) falls back to SUM(nusk_invoices.mutamerCount) so
    // the count is never stuck at 0 just because vouchers don't seed pilgrims.
    await client.query(
      `UPDATE umrah_groups g
          SET "mutamerCount" = src.cnt, "updatedAt" = NOW()
         FROM (
           SELECT grp.id AS "groupId",
                  COALESCE(NULLIF(pil.cnt, 0), nusk.cnt, grp."mutamerCount", 0) AS cnt
             FROM umrah_groups grp
             LEFT JOIN (
               SELECT "groupId", COUNT(*)::int AS cnt
                 FROM umrah_pilgrims
                WHERE "companyId" = $1 AND "groupId" = ANY($2::int[]) AND "deletedAt" IS NULL
                GROUP BY "groupId"
             ) pil ON pil."groupId" = grp.id
             LEFT JOIN (
               SELECT "groupId", COALESCE(SUM("mutamerCount"), 0)::int AS cnt
                 FROM umrah_nusk_invoices
                WHERE "companyId" = $1 AND "groupId" = ANY($2::int[]) AND "deletedAt" IS NULL
                  AND "nuskStatus" != 'cancelled'
                GROUP BY "groupId"
             ) nusk ON nusk."groupId" = grp.id
            WHERE grp.id = ANY($2::int[]) AND grp."companyId" = $1
         ) src
        WHERE g.id = src."groupId" AND g."companyId" = $1
          AND g."mutamerCount" IS DISTINCT FROM src.cnt`,
      [scope.companyId, groupIds]
    );
  }
}

// ---------------------------------------------------------------------------
// Violation detection
// ---------------------------------------------------------------------------

async function detectViolation(
  client: pg.PoolClient, scope: ImportScope, row: ParsedRow,
  mutamerId: number, groupId: number | null, subAgentId: number | null, agentId: number | null,
  overstayCfg: { perDay: number; tierDays: number; tierAmount: number },
) {
  const type = row.status === "violated" ? "absconded" : "overstay";
  const [exists] = (await client.query(
    `SELECT id FROM umrah_violations
     WHERE "companyId"=$1 AND "mutamerId"=$2 AND type=$3 AND "deletedAt" IS NULL`,
    [scope.companyId, mutamerId, type]
  )).rows;
  if (exists) return;

  // Overstay uses the company's configured (tiered or per-day) rate — the SAME
  // shared formula the daily cron uses — so the invoiced amount agrees no
  // matter which path detected the overstay. Absconded stays a flat 2000.
  const penalty = type === "absconded" ? 2000 : overstayPenaltyAmount(row.overstayDays, overstayCfg);

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
