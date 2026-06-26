/**
 * financeImportParse — م٢-أ: بوابة الاستيراد، الطبقة الحتمية (Excel / CSV).
 *
 * المرجع: docs/finance-audit/25 §٧ (م٢) + §١١.٣ — «محرّك قراءة المستند الداخلي
 * (بلا تكلفة خارجية)»، الطبقة أ الحتمية ١٠٠٪ صفر تكلفة.
 *
 * مبدأ دستوري حاكم (docs/25 §١١.٣): «المستورد يمرّ على نفس محرّك الاشتقاق — لا
 * حساب خام لغير المحاسب». لذلك هذا الملف **لا يشتقّ قيدًا ولا يكتب شيئًا**: مهمته
 * الوحيدة تحويل بايتات الملف → **نفس شكل بنود POST /finance/documents**
 * (`documentLineSchema`). الاشتقاق + المعاينة + الحفظ + الأثر يبقى كلّه في
 * المنفذ القائم `/finance/documents` (محرّك واحد، لا ازدواج منطق).
 *
 * الوحدة **نقية + حتمية** → قابلة للاختبار بلا قاعدة بيانات
 * (tests/unit/financeImportParse.test.ts). تعيد استخدام `parseFirstSheetAOA`
 * (excelCompat) لقراءة Excel ونفس فكرة تطبيع الترويسة من genericImportEngine.
 */

// ───────────────────────────────────────────────────────────────────────────
// الأنواع
// ───────────────────────────────────────────────────────────────────────────

/** الحقول التي يفهمها المستورد المالي (مطابقة لـ documentLineSchema + اختصار amount). */
export type FinanceImportFieldKey =
  | "itemName"
  | "description"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "amount" // اختصار: سطر بمبلغ مفرد (الكمية = ١، سعر الوحدة = المبلغ)
  | "taxRatePercent"
  | "accountCode"
  | "costCenter";

export type FinanceImportTemplate = {
  key: string;
  title: string;
  direction: "receipt" | "payment";
  documentKind: "voucher" | "expense";
  note?: string;
  /** مجموعة أسماء (مفصولة بـ |) → حقل. التطبيع يطابق العربي/الإنجليزي. */
  headerMap: Record<string, FinanceImportFieldKey>;
  /** ترويسة المثال (لتنزيل القالب الجاهز) بالترتيب. */
  sampleHeaders: string[];
  /** صف بيانات مثال محاذٍ لـ sampleHeaders. */
  sampleRow: (string | number)[];
};

export type ParsedTable = { headers: string[]; rows: string[][] };

/** سطر مستند مُستورَد — مطابق لشكل documentLineSchema (بنود POST /finance/documents). */
export type ImportedDocLine = {
  lineNo: number;
  itemName?: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRatePercent: number;
  counterAccountCode?: string;
  costCenter?: string;
};

export type ImportWarning = {
  /** رقم السطر في الملف (1 = الترويسة). */
  rowIndex: number;
  message: string;
  severity: "skip" | "warn" | "info";
};

export type FinanceImportResult = {
  direction: "receipt" | "payment";
  documentKind: "voucher" | "expense";
  lines: ImportedDocLine[];
  warnings: ImportWarning[];
  stats: {
    totalRows: number;
    mappedRows: number;
    skippedRows: number;
    recognizedColumns: string[];
    unrecognizedColumns: string[];
  };
};

// ───────────────────────────────────────────────────────────────────────────
// تطبيع النص + الترويسة (نفس قاعدة genericImportEngine — نسخة مستقلّة عمدًا
// لتفادي التشابك بين المحرّكين، كما هو موثّق هناك).
// ───────────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/ى/g, "ي")
    .replace(/ة$/g, "ه")
    .trim();
}

function normalizeHeader(h: string): string {
  return normalize(h).replace(/["']/g, "").toLowerCase();
}

/** تحويل نص رقمي (عربي/إنجليزي، مع %، فواصل آلاف، فاصلة عشرية عربية) → رقم. */
function toNumber(raw: string): number {
  if (!raw) return 0;
  const ascii = raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".") // الفاصلة العشرية العربية
    .replace(/[%،,٬\s]/g, "") // النِّسبة + فواصل الآلاف + المسافات
    .trim();
  const n = Number(ascii);
  return Number.isFinite(n) ? n : 0;
}

// ───────────────────────────────────────────────────────────────────────────
// قراءة CSV — مُحلِّل واعٍ بعلامات الاقتباس (يسمح بفواصل وأسطر داخل "...").
// ───────────────────────────────────────────────────────────────────────────

function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // تُعالَج \r\n عبر تجاهل \r وانتظار \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** نص CSV → جدول (ترويسة + صفوف). يتخطّى الفارغ والأسطر التي تبدأ بـ #. */
export function parseCsvTable(text: string): ParsedTable {
  const all = tokenizeCsv(text)
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== "") && !(r[0] ?? "").startsWith("#"));
  if (all.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = all;
  return { headers: headers!, rows };
}

/** مصفوفة-مصفوفات (مخرج parseFirstSheetAOA لـ Excel) → جدول. */
export function aoaToTable(aoa: unknown[][]): ParsedTable {
  const rows = aoa
    .map((r) =>
      r.map((c) =>
        c == null
          ? ""
          : c instanceof Date
            ? c.toISOString().slice(0, 10)
            : String(c).trim(),
      ),
    )
    .filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...data] = rows;
  return { headers: headers!, rows: data };
}

// ───────────────────────────────────────────────────────────────────────────
// التعيين: جدول مُحلَّل + قالب → بنود مستند بشكل POST /finance/documents.
// ───────────────────────────────────────────────────────────────────────────

export function mapTableToDocument(
  table: ParsedTable,
  template: FinanceImportTemplate,
  /**
   * تعيين محفوظ/يدوي يَجُبّ الكشف التلقائي لكل عمود (م٢-ب). المفتاح اسم عمود
   * المصدر (يُطبَّع)، والقيمة الحقل الهدف؛ القيمة الفارغة = «تجاهل هذا العمود».
   * عمود لا يظهر في التعيين يعود للكشف التلقائي من القالب.
   */
  overrideMapping?: Record<string, FinanceImportFieldKey | "">,
): FinanceImportResult {
  // بناء lookup: اسم العمود المُطبَّع → حقل، من خريطة القالب.
  const headerLookup = new Map<string, FinanceImportFieldKey>();
  for (const [aliases, field] of Object.entries(template.headerMap)) {
    for (const alias of aliases.split("|")) headerLookup.set(normalizeHeader(alias), field);
  }
  // تعيين يدوي/محفوظ يَجُبّ الكشف التلقائي (يُطبَّع المفتاح). "" = تجاهل صريح.
  const overrideLookup = new Map<string, FinanceImportFieldKey | "">();
  if (overrideMapping) {
    for (const [h, f] of Object.entries(overrideMapping)) overrideLookup.set(normalizeHeader(h), f);
  }

  const colField: (FinanceImportFieldKey | null)[] = table.headers.map((h) => {
    const nh = normalizeHeader(h);
    if (overrideLookup.has(nh)) return overrideLookup.get(nh) || null; // "" → تجاهل
    return headerLookup.get(nh) ?? null;
  });
  const recognizedColumns: string[] = [];
  const unrecognizedColumns: string[] = [];
  table.headers.forEach((h, i) => {
    (colField[i] ? recognizedColumns : unrecognizedColumns).push(h);
  });

  const lines: ImportedDocLine[] = [];
  const warnings: ImportWarning[] = [];
  let skipped = 0;

  const valueAt = (row: string[], field: FinanceImportFieldKey): string => {
    const idx = colField.indexOf(field);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  table.rows.forEach((row, ri) => {
    const rowNum = ri + 2; // +1 للترويسة، +1 للتأشير من 1
    if (row.every((c) => !c)) return; // صف فارغ تمامًا — تخطٍّ صامت

    const amountRaw = valueAt(row, "amount");
    const unitPriceRaw = valueAt(row, "unitPrice");
    const qtyRaw = valueAt(row, "quantity");

    const unitPrice = unitPriceRaw ? toNumber(unitPriceRaw) : toNumber(amountRaw);
    const quantity = qtyRaw ? toNumber(qtyRaw) : amountRaw || unitPriceRaw ? 1 : 0;

    if (!(quantity > 0 && unitPrice > 0)) {
      skipped++;
      warnings.push({
        rowIndex: rowNum,
        message: `السطر ${rowNum}: لا كمية/مبلغ صالح — تم تخطّيه`,
        severity: "skip",
      });
      return;
    }

    const taxRatePercent = toNumber(valueAt(row, "taxRatePercent"));
    lines.push({
      lineNo: lines.length + 1,
      itemName: valueAt(row, "itemName") || undefined,
      description: valueAt(row, "description") || undefined,
      quantity,
      unit: valueAt(row, "unit") || undefined,
      unitPrice,
      taxRatePercent: taxRatePercent > 0 ? taxRatePercent : 0,
      counterAccountCode: valueAt(row, "accountCode") || undefined,
      costCenter: valueAt(row, "costCenter") || undefined,
    });
  });

  if (recognizedColumns.length === 0) {
    warnings.push({
      rowIndex: 1,
      message:
        "لم يُتعرَّف على أي عمود — تحقّق من أسماء الأعمدة وطابقها مع القالب، أو نزّل القالب الجاهز.",
      severity: "warn",
    });
  }
  if (unrecognizedColumns.length > 0) {
    warnings.push({
      rowIndex: 1,
      message: `أعمدة غير معروفة (تم تجاهلها): ${unrecognizedColumns.join("، ")}`,
      severity: "info",
    });
  }

  return {
    direction: template.direction,
    documentKind: template.documentKind,
    lines,
    warnings,
    stats: {
      totalRows: table.rows.length,
      mappedRows: lines.length,
      skippedRows: skipped,
      recognizedColumns,
      unrecognizedColumns,
    },
  };
}

/** بناء نص CSV لقالب (ترويسة + صف مثال) — لتنزيل «قالب جاهز». */
export function templateToCsv(t: FinanceImportTemplate): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    [t.sampleHeaders.map(esc).join(","), t.sampleRow.map(esc).join(",")].join("\r\n") + "\r\n"
  );
}

// ───────────────────────────────────────────────────────────────────────────
// القوالب الجاهزة (قوالب أمثلة — docs/25 §١١.٣).
// ───────────────────────────────────────────────────────────────────────────

export const FINANCE_IMPORT_TEMPLATES: FinanceImportTemplate[] = [
  {
    key: "expense-detailed",
    title: "مصروفات — بنود مفصّلة (صرف)",
    direction: "payment",
    documentKind: "expense",
    note: "كل سطر بند مصروف: الصنف/الخدمة + الكمية × سعر الوحدة + الضريبة. الحساب ومركز التكلفة اختياريان (يُشتقّان إن تُركا).",
    headerMap: {
      "الصنف|الصنف/الخدمة|الخدمة|item|itemname|item name": "itemName",
      "الوصف|البيان|description|desc": "description",
      "الكمية|الكميه|qty|quantity": "quantity",
      "الوحدة|الوحده|unit": "unit",
      "سعر الوحدة|سعر الوحده|السعر|price|unitprice|unit price": "unitPrice",
      "الضريبة|نسبة الضريبة|ضريبة %|tax|vat|taxrate|tax rate": "taxRatePercent",
      "الحساب|رمز الحساب|account|accountcode|account code": "accountCode",
      "مركز التكلفة|مركز التكلفه|costcenter|cost center": "costCenter",
    },
    sampleHeaders: [
      "الصنف/الخدمة",
      "الوصف",
      "الكمية",
      "الوحدة",
      "سعر الوحدة",
      "نسبة الضريبة",
      "الحساب",
      "مركز التكلفة",
    ],
    sampleRow: ["وقود", "تعبئة ديزل", 200, "لتر", 2.3, 15, "", ""],
  },
  {
    key: "payment-simple",
    title: "صرف بسيط — بيان ومبلغ",
    direction: "payment",
    documentKind: "voucher",
    note: "لكل سطر بيان + مبلغ مفرد (الكمية تُعتبر ١). للمصروفات السريعة بلا كميات.",
    headerMap: {
      "البيان|الوصف|البند|description|desc|memo": "description",
      "المبلغ|القيمة|القيمه|amount|value|total": "amount",
      "الضريبة|نسبة الضريبة|ضريبة %|tax|vat|taxrate": "taxRatePercent",
      "الحساب|رمز الحساب|account|accountcode": "accountCode",
    },
    sampleHeaders: ["البيان", "المبلغ", "نسبة الضريبة", "الحساب"],
    sampleRow: ["إيجار مكتب", 5000, 0, ""],
  },
  {
    key: "receipt-simple",
    title: "قبض بسيط — بيان ومبلغ",
    direction: "receipt",
    documentKind: "voucher",
    note: "لكل سطر بيان + مبلغ مقبوض مفرد (الكمية تُعتبر ١). للمقبوضات السريعة.",
    headerMap: {
      "البيان|الوصف|البند|description|desc|memo": "description",
      "المبلغ|القيمة|القيمه|amount|value|total": "amount",
      "الضريبة|نسبة الضريبة|ضريبة %|tax|vat|taxrate": "taxRatePercent",
      "الحساب|رمز الحساب|account|accountcode": "accountCode",
    },
    sampleHeaders: ["البيان", "المبلغ", "نسبة الضريبة", "الحساب"],
    sampleRow: ["إيراد خدمات", 1200, 15, ""],
  },
];

export function findTemplate(key: string): FinanceImportTemplate | undefined {
  return FINANCE_IMPORT_TEMPLATES.find((t) => t.key === key);
}

// ───────────────────────────────────────────────────────────────────────────
// م٢-ب — التعيين اليدوي/المحفوظ: كتالوج الحقول + كشف التعيين الافتراضي للمحرّر.
// ───────────────────────────────────────────────────────────────────────────

/** الحقول التي يمكن للمستخدم ربط أعمدة ملفه بها (لمنسدلة محرّر التعيين). */
export const FINANCE_IMPORT_FIELDS: { key: FinanceImportFieldKey; label: string }[] = [
  { key: "itemName", label: "الصنف / الخدمة" },
  { key: "description", label: "الوصف / البيان" },
  { key: "quantity", label: "الكمية" },
  { key: "unit", label: "الوحدة" },
  { key: "unitPrice", label: "سعر الوحدة" },
  { key: "amount", label: "المبلغ (كمية ١)" },
  { key: "taxRatePercent", label: "نسبة الضريبة %" },
  { key: "accountCode", label: "الحساب" },
  { key: "costCenter", label: "مركز التكلفة" },
];

const FINANCE_IMPORT_FIELD_KEYS = new Set<string>(FINANCE_IMPORT_FIELDS.map((f) => f.key));

/** هل القيمة حقل استيراد معروف؟ (تنقية تعيين قادم من الواجهة/التخزين). */
export function isFinanceImportField(v: unknown): v is FinanceImportFieldKey {
  return typeof v === "string" && FINANCE_IMPORT_FIELD_KEYS.has(v);
}

/**
 * الكشف الافتراضي: لكل ترويسة في الملف، الحقل المُكتشَف من القالب ("" إن لم
 * يُعرَف). يملأ محرّر التعيين في الواجهة ليُظهر للمستخدم ما فهمه النظام ويعدّله.
 */
export function detectMapping(
  table: ParsedTable,
  template: FinanceImportTemplate,
): Record<string, FinanceImportFieldKey | ""> {
  const headerLookup = new Map<string, FinanceImportFieldKey>();
  for (const [aliases, field] of Object.entries(template.headerMap)) {
    for (const alias of aliases.split("|")) headerLookup.set(normalizeHeader(alias), field);
  }
  const out: Record<string, FinanceImportFieldKey | ""> = {};
  for (const h of table.headers) out[h] = headerLookup.get(normalizeHeader(h)) ?? "";
  return out;
}

/** تنقية تعيين قادم من الخارج: يُسقِط القيم غير المعروفة، يُبقي "" (تجاهل). */
export function sanitizeMapping(raw: unknown): Record<string, FinanceImportFieldKey | ""> {
  const out: Record<string, FinanceImportFieldKey | ""> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === "" || v == null) out[k] = "";
      else if (isFinanceImportField(v)) out[k] = v;
    }
  }
  return out;
}
