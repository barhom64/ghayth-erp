/**
 * documentOcrService — م٢-ج: خدمة قراءة المستند الداخلية (قدرة تقنية محايدة لمسار
 * الوثائق — لا تتّخذ قرار مسار، فهي Service لا Engine حسب حارس بيت المحرّكات). تملأ
 * سقالة الهجرة 171 (documents.ocr* + document_ocr_extractions) + stubs OCR.
 *
 * المرجع: docs/finance-audit/25 §١١.٣ — الطبقة ب (مساعِد): tesseract داخلي
 * (عربي+إنجليزي) بدرجة ثقة + **تأكيد بشري** (لا حفظ تلقائي). صفر تكلفة خارجية.
 *
 * بنيتان منفصلتان:
 *  - runOcr: غير نقي (يحمّل tesseract.js كسولًا، صورة → نص + ثقة). يتحقّق وقت التشغيل.
 *  - extractFields: **نقي + حتمي** (نص OCR → حقول مهيكلة بانتظامات عربية/إنجليزية).
 *    قابل للاختبار بلا tesseract (tests/unit/documentOcrExtract.test.ts).
 *
 * الناتج يدخل document_ocr_extractions بحالة pending → يراجعه بشر (confirm/reject).
 * tesseract.js يجلب نواة WASM + بيانات اللغة وقت التشغيل (يُخزَّن مؤقتًا)؛ في الإنتاج
 * تُحزَّم/تُخزَّن بيانات اللغة لتفادي جلب الشبكة عند كل تشغيل.
 */

export type OcrResult = { text: string; confidence: number };

/**
 * شغّل OCR على صورة (Buffer/مسار/URL) باللغتين. غير نقي (tesseract). يُحمَّل كسولًا
 * فلا يُثقِل الإقلاع، ويُنهى العامل دائمًا. للـPDF استخدم runOcrDocument.
 */
export async function runOcr(input: Buffer | string, langs = "ara+eng"): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(langs);
  try {
    const { data } = await worker.recognize(input as never);
    return { text: String(data?.text ?? ""), confidence: Math.round((Number(data?.confidence) || 0) * 100) / 100 };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * pdfToPngImages — يصيّر أوّل صفحات PDF صورًا PNG عبر mupdf (WASM، بلا ثنائي native،
 * نواة مضمّنة محليًّا فلا شبكة وقت التشغيل). الفواتير غالبًا صفحة واحدة، فنكتفي بأوّل
 * maxPages لتفادي تكلفة الملفات الطويلة. scale=2 يرفع الدقّة لتحسين دقّة القراءة.
 */
export async function pdfToPngImages(pdf: Buffer, maxPages = 3, scale = 2): Promise<Buffer[]> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdf, "application/pdf");
  const count = Math.min(doc.countPages(), Math.max(1, maxPages));
  const out: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
    out.push(Buffer.from(pix.asPNG()));
  }
  return out;
}

/**
 * runOcrDocument — يقرأ مستندًا (صورة أو PDF) باللغتين. صورة → runOcr مباشرة؛ PDF →
 * يُصيَّر لصفحات صور ثم تُقرأ كلها ويُدمج النص + تُتوسّط الثقة. غير نقي (tesseract+mupdf).
 */
export async function runOcrDocument(input: Buffer, mimeType: string | null, langs = "ara+eng"): Promise<OcrResult> {
  if (!(mimeType && /pdf/i.test(mimeType))) return runOcr(input, langs);
  const pages = await pdfToPngImages(input);
  if (!pages.length) return { text: "", confidence: 0 };
  const results: OcrResult[] = [];
  for (const p of pages) results.push(await runOcr(p, langs));
  return {
    text: results.map((r) => r.text).join("\n\n"),
    confidence: Math.round((results.reduce((s, r) => s + r.confidence, 0) / results.length) * 100) / 100,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// extractFields — نقي + حتمي: نص OCR → حقول مهيكلة (مبلغ/تاريخ/رقم فاتورة/ضريبة).
// انتظامات عربية/إنجليزية + أرقام عربية. لا يخمّن الطرف (NER) — يبقى للمراجع البشري.
// ───────────────────────────────────────────────────────────────────────────

export type ExtractedFields = {
  // فاتورة (نوع invoice)
  amount?: number | null;
  vatAmount?: number | null;
  date?: string | null;
  invoiceNo?: string | null;
  taxNumber?: string | null;
  // وثائق الهوية (نوع iqama/الهوية الوطنية) — رقم ١٠ خانات + تاريخ انتهاء
  idNumber?: string | null;
  expiryDate?: string | null;
  // استمارة المركبة (نوع vehicle_registration) — لوحة + هيكل + انتهاء الاستمارة
  plateNumber?: string | null;
  vinNumber?: string | null;
  registrationExpiry?: string | null;
  // رخصة القيادة (نوع driving_license) — رقم الرخصة + الفئة (+expiryDate أعلاه)
  licenseNumber?: string | null;
  licenseClass?: string | null;
  // السجل التجاري (نوع commercial_registration) — رقم السجل + جهة الإصدار
  crNumber?: string | null;
  issuingAuthority?: string | null;
};

export type ExtractionResult = {
  fields: ExtractedFields;
  /** ثقة الاستخراج 0..100 (نسبة الحقول المُلتقطة) — منفصلة عن ثقة OCR الخام. */
  fieldConfidence: number;
};

/** تطبيع الأرقام العربية + الفواصل → ascii قابل للتحويل لرقم. */
function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function parseAmount(raw: string): number | null {
  // أزل النِسب المئوية (مثل «15%» أو «١٥٪») أولًا حتى لا تُلتقط نسبة الضريبة بدل
  // مبلغها (سطر «ضريبة 15%: 150» يجب أن يُعيد 150 لا 15). ثم وحّد الفواصل والأرقام.
  const ascii = toAsciiDigits(raw).replace(/\d[\d.,٬]*\s*[%٪]/g, " ");
  const cleaned = ascii.replace(/[,٬\s]/g, "").replace(/٫/g, ".");
  const m = cleaned.match(/-?\d+(?:\.\d{1,3})?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** أول مبلغ يلي كلمة مفتاحية (الإجمالي/المجموع/المبلغ/total/amount). */
function findLabeledAmount(text: string, labels: RegExp): number | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(labels);
    if (!m) continue;
    // حلّل ما بعد الكلمة المفتاحية أولًا (النمط الغالب: تسمية ← قيمة، فلا يُلتقط رقم
    // فاتورة سابق على نفس السطر)، ثم السطر كاملًا احتياطًا (قيمة قبل التسمية).
    const amt = parseAmount(line.slice((m.index ?? 0) + m[0].length)) ?? parseAmount(line);
    if (amt != null && amt > 0) return amt;
  }
  return null;
}

/** تاريخ بصيَغ شائعة → YYYY-MM-DD (أو يُعاد كما هو إن لم يُحلَّل آمنًا). */
function findDate(text: string): string | null {
  const t = toAsciiDigits(text);
  // YYYY-MM-DD أو YYYY/MM/DD
  let m = t.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  // DD-MM-YYYY أو DD/MM/YYYY
  m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

function findFirst(text: string, re: RegExp): string | null {
  const m = toAsciiDigits(text).match(re);
  return m ? (m[1] ?? m[0]).trim() : null;
}

/** تاريخ على سطر يحمل كلمة مفتاحية (انتهاء/صلاحية/expiry) → YYYY-MM-DD. */
function findLabeledDate(text: string, labels: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (labels.test(line)) {
      const d = findDate(line);
      if (d) return d;
    }
  }
  return null;
}

/**
 * وثائق الهوية (إقامة/هوية وطنية): رقم ١٠ خانات (يبدأ ١ مواطن / ٢ مقيم) + تاريخ
 * انتهاء — لا حقول فاتورة. حتمي؛ يبقى الاسم للمراجع البشري (لا NER، لا تخمين هوية).
 */
function extractIdentityFields(text: string): ExtractionResult {
  const idNumber =
    findFirst(
      text,
      /(?:رقم\s*(?:الهوية|الإقامة|الاقامة)|id\s*(?:no\.?|number)?|iqama\s*(?:no\.?|number)?)\s*[:#]?\s*([12]\d{9})/i,
    ) ?? findFirst(text, /\b([12]\d{9})\b/);
  const expiryDate =
    findLabeledDate(text, /(انتهاء|الصلاحية|صلاحية|expiry|expir|valid\s*until|\bexp\b)/i) ?? findDate(text);
  const fields: ExtractedFields = { idNumber, expiryDate };
  // ثقة الاستخراج: وزن أعلى لرقم الهوية ثم تاريخ الانتهاء (الحقلان الحرجان للوثيقة).
  let score = 0;
  if (idNumber != null) score += 60;
  if (expiryDate != null) score += 40;
  return { fields, fieldConfidence: score };
}

/**
 * استمارة المركبة (vehicle_registration): رقم الهيكل VIN (١٧ خانة بلا I/O/Q) + رقم
 * اللوحة + تاريخ انتهاء الاستمارة. حتمي؛ يصحّحه المراجع البشري قبل التطبيق على المركبة.
 */
function extractVehicleFields(text: string): ExtractionResult {
  const vinNumber =
    findFirst(text, /(?:رقم\s*الهيكل|vin|chassis)\s*(?:no\.?|number)?\s*[:#]?\s*([A-HJ-NPR-Za-hj-npr-z0-9]{17})/i) ??
    findFirst(text, /\b([A-HJ-NPR-Z0-9]{17})\b/);
  const plateNumber = findFirst(
    text,
    /(?:رقم\s*اللوحة|اللوحة|plate\s*(?:no\.?|number)?)\s*[:#]?\s*([A-Za-zء-ي0-9][A-Za-zء-ي0-9 \-]{2,11})/i,
  );
  const registrationExpiry =
    findLabeledDate(text, /(انتهاء|الصلاحية|صلاحية|expiry|expir|valid\s*until|\bexp\b)/i) ?? findDate(text);
  const fields: ExtractedFields = { plateNumber, vinNumber, registrationExpiry };
  let score = 0;
  if (vinNumber != null) score += 40;
  if (plateNumber != null) score += 35;
  if (registrationExpiry != null) score += 25;
  return { fields, fieldConfidence: score };
}

/** رخصة القيادة (driving_license): رقم الرخصة + تاريخ الانتهاء + الفئة. */
function extractLicenseFields(text: string): ExtractionResult {
  const licenseNumber =
    findFirst(text, /(?:رقم\s*الرخصة|license\s*(?:no\.?|number)?)\s*[:#]?\s*([A-Za-z0-9\-]{4,})/i) ??
    findFirst(text, /\b(\d{10})\b/);
  const expiryDate =
    findLabeledDate(text, /(انتهاء|الصلاحية|صلاحية|expiry|expir|valid\s*until|\bexp\b)/i) ?? findDate(text);
  const licenseClass = findFirst(text, /(?:الفئة|الدرجة|class)\s*[:#]?\s*([A-Za-zء-ي0-9]{1,12})/i);
  const fields: ExtractedFields = { licenseNumber, expiryDate, licenseClass };
  let score = 0;
  if (licenseNumber != null) score += 50;
  if (expiryDate != null) score += 35;
  if (licenseClass != null) score += 15;
  return { fields, fieldConfidence: score };
}

/** السجل التجاري (commercial_registration): رقم السجل (١٠ خانات) + جهة الإصدار. */
function extractCommercialRegFields(text: string): ExtractionResult {
  const crNumber =
    findFirst(text, /(?:رقم\s*السجل|سجل\s*تجاري|c\.?r\.?\s*(?:no\.?|number)?|commercial\s*reg)\s*[:#]?\s*(\d{10})/i) ??
    findFirst(text, /\b(\d{10})\b/);
  const issuingAuthority = findFirst(text, /(?:جهة\s*الإصدار|أصدرها|issued\s*by|issuing\s*authority)\s*[:#]?\s*([^\n]{2,60})/i);
  const fields: ExtractedFields = { crNumber, issuingAuthority };
  let score = 0;
  if (crNumber != null) score += 70;
  if (issuingAuthority != null) score += 30;
  return { fields, fieldConfidence: score };
}

/**
 * استخرج الحقول المهيكلة من نص OCR. حتمي: نفس النص → نفس الحقول. يتفرّع حسب النوع:
 * هوية(إقامة)→رقم+انتهاء؛ رخصة→رقم+فئة+انتهاء؛ سجل تجاري→رقم+جهة؛ استمارة مركبة→
 * لوحة+هيكل+انتهاء؛ غيرها→فاتورة. الثقة = نسبة الحقول، فيقرّر المراجع قبل التطبيق.
 */
export function extractFields(ocrText: string, docType = "invoice"): ExtractionResult {
  const text = ocrText || "";
  // وثيقة هوية (إقامة/هوية وطنية): استخراج مختلف عن الفاتورة.
  if (/iqama|residence|الإقامة|الاقامة|هوية|national/i.test(docType)) {
    return extractIdentityFields(text);
  }
  // رخصة قيادة.
  if (/driving_license|driving|license|رخصة/i.test(docType)) {
    return extractLicenseFields(text);
  }
  // سجل تجاري — قبل المركبة (كلاهما يحوي "registration").
  if (/commercial|سجل\s*تجاري|cr_?reg|commercial_registration/i.test(docType)) {
    return extractCommercialRegFields(text);
  }
  // استمارة مركبة: لوحة/هيكل/انتهاء.
  if (/vehicle|registration|استمارة|مركبة|سيارة/i.test(docType)) {
    return extractVehicleFields(text);
  }
  const amount =
    findLabeledAmount(text, /(الإجمالي|الاجمالي|المجموع|الإجمالي شامل|grand total|total amount|total)/i) ??
    findLabeledAmount(text, /(المبلغ|القيمة|amount|value)/i);
  const vatAmount = findLabeledAmount(text, /(ضريبة القيمة المضافة|الضريبة|ضريبة|vat|tax)/i);
  const date = findDate(text);
  // رقم الفاتورة: بعد «رقم الفاتورة/فاتورة رقم/invoice no/#».
  const invoiceNo = findFirst(text, /(?:رقم\s*الفاتورة|فاتورة\s*رقم|invoice\s*(?:no\.?|#|number))\s*[:#]?\s*([A-Za-z0-9\-/]{2,})/i);
  // الرقم الضريبي: ١٥ رقمًا (تنسيق ZATCA) أو بعد «الرقم الضريبي».
  const taxNumber =
    findFirst(text, /(?:الرقم\s*الضريبي|tax\s*number|vat\s*(?:no\.?|number))\s*[:#]?\s*(\d{10,15})/i) ??
    findFirst(text, /\b(\d{15})\b/);

  const fields: ExtractedFields = { amount, vatAmount, date, invoiceNo, taxNumber };
  // ثقة الاستخراج: وزن أعلى للمبلغ والتاريخ (الحقلان الحرجان).
  let score = 0;
  if (amount != null) score += 40;
  if (date != null) score += 25;
  if (invoiceNo != null) score += 15;
  if (vatAmount != null) score += 10;
  if (taxNumber != null) score += 10;
  return { fields, fieldConfidence: score };
}
