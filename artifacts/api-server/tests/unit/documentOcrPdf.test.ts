import { describe, it, expect } from "vitest";
import { pdfToPngImages } from "../../src/lib/documentOcrService.js";

/**
 * البند ١ — تصيير PDF→صورة (mupdf WASM). نثبت أن خط تحويل PDF لصور PNG يعمل حتميًّا
 * (بلا tesseract وبلا قاعدة بيانات)، فالـrerun يقرأ فواتير PDF لا الصور فقط. الناتج
 * يدخل نفس tesseract+extractFields المُختبَرين في documentOcrExtract.test.ts.
 */

// PDF صغير بصفحة واحدة. MuPDF يصلح بنية الـxref تلقائيًا (نراه يُصلح ثم يصيّر).
const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 46 >>
stream
BT /F1 28 Tf 20 50 Td (Total 500) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`,
  "latin1",
);

// توقيع ملف PNG القياسي (الثماني بايتات الأولى).
const PNG_SIGNATURE = "89504e470d0a1a0a";

describe("pdfToPngImages (mupdf WASM)", () => {
  it("renders the first PDF page to a real PNG buffer", async () => {
    const pngs = await pdfToPngImages(MINIMAL_PDF);
    expect(pngs.length).toBeGreaterThanOrEqual(1);
    expect(pngs[0]!.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
    expect(pngs[0]!.length).toBeGreaterThan(100);
  });

  it("caps rendered pages at maxPages (avoids long-file cost)", async () => {
    const pngs = await pdfToPngImages(MINIMAL_PDF, 1);
    expect(pngs.length).toBe(1);
  });
});
