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
  amount: number | null;
  vatAmount: number | null;
  date: string | null;
  invoiceNo: string | null;
  taxNumber: string | null;
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

/**
 * استخرج الحقول المهيكلة من نص OCR. حتمي: نفس النص → نفس الحقول. الثقة = نسبة
 * الحقول الأساسية المُلتقطة (مبلغ/تاريخ على الأقل)، فيقرّر المراجع البشري.
 */
export function extractFields(ocrText: string, _docType = "invoice"): ExtractionResult {
  const text = ocrText || "";
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
