import PDFDocument from "pdfkit";
import { rawQuery } from "./rawdb.js";
import { NotFoundError } from "./errorHandler.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARABIC_FONT = resolve(__dirname, "../assets/NotoNaskhArabic-Regular.ttf");

interface PdfOptions {
  title: string;
  subtitle?: string;
  companyName?: string;
  date?: string;
}

function createDoc(opts: PdfOptions) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: opts.title, Author: opts.companyName || "Ghayth ERP" },
  });
  doc.registerFont("Arabic", ARABIC_FONT);
  return doc;
}

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function rtlText(doc: PDFKit.PDFDocument, text: string, opts?: PDFKit.Mixins.TextOptions) {
  doc.font("Arabic").text(text, { ...opts, align: "right" });
}

function drawHeader(doc: PDFKit.PDFDocument, opts: PdfOptions & { companyName?: string; phone?: string; address?: string }) {
  const margin = 50;
  const pageWidth = 495;

  doc.font("Arabic").fontSize(16).text(opts.companyName || "نظام غيث", margin, doc.y, {
    align: "center",
    width: pageWidth,
  });
  if (opts.phone) {
    doc.font("Helvetica").fontSize(9).text(opts.phone, margin, doc.y, { align: "center", width: pageWidth });
  }
  if (opts.address) {
    doc.font("Arabic").fontSize(9).text(opts.address, margin, doc.y, { align: "center", width: pageWidth });
  }
  doc.moveDown(0.3);
  doc.moveTo(margin, doc.y).lineTo(margin + pageWidth, doc.y).strokeColor("#334155").lineWidth(2).stroke();
  doc.moveDown(0.5);
  doc.font("Arabic").fontSize(13).text(opts.title, margin, doc.y, { align: "center", width: pageWidth });
  if (opts.subtitle) {
    doc.font("Arabic").fontSize(10).text(opts.subtitle, margin, doc.y, { align: "center", width: pageWidth });
  }
  if (opts.date) {
    doc.font("Helvetica").fontSize(9).text(`Date: ${opts.date}`, margin, doc.y, { align: "center", width: pageWidth });
  }
  doc.moveDown(0.5);
  doc.moveTo(margin, doc.y).lineTo(margin + pageWidth, doc.y).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: (string | number | null)[][],
  colWidths: number[],
  startX = 50
) {
  const rowHeight = 20;
  const headerHeight = 22;

  const totalW = colWidths.reduce((a, b) => a + b, 0);
  let x = startX;
  let y = doc.y;

  doc.rect(x, y, totalW, headerHeight).fillColor("#1e293b").fill();
  doc.fillColor("#ffffff").fontSize(8);

  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i] || "";
    const isArabic = /[\u0600-\u06FF]/.test(header);
    doc.font(isArabic ? "Arabic" : "Helvetica-Bold")
      .text(header, cx + 3, y + 6, { width: colWidths[i] - 6, align: "center" });
    cx += colWidths[i];
  }

  y += headerHeight;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row) continue;

    if (y + rowHeight > 760) {
      doc.addPage();
      y = 50;
    }

    const isLast = ri === rows.length - 1;
    const bg = isLast ? "#f1f5f9" : ri % 2 === 0 ? "#ffffff" : "#f8fafc";
    doc.rect(x, y, totalW, rowHeight).fillColor(bg).fill();
    doc.rect(x, y, totalW, rowHeight).strokeColor("#e2e8f0").lineWidth(0.5).stroke();

    doc.fillColor("#111827").fontSize(8);

    cx = x;
    for (let ci = 0; ci < headers.length; ci++) {
      const val = row[ci];
      const text = val === null || val === undefined ? "" : String(val);
      const isNum = typeof val === "number";
      const isArabic = /[\u0600-\u06FF]/.test(text);
      doc.font(isArabic ? "Arabic" : (isLast ? "Helvetica-Bold" : "Helvetica"))
        .text(text, cx + 3, y + 5, {
          width: colWidths[ci] - 6,
          align: isArabic ? "right" : (isNum ? "right" : "left"),
        });
      cx += colWidths[ci];
    }

    y += rowHeight;
  }

  doc.y = y + 8;
}

function infoRow(doc: PDFKit.PDFDocument, label: string, value: string, x = 50, y?: number) {
  const _y = y ?? doc.y;
  const isLabelArabic = /[\u0600-\u06FF]/.test(label);
  const isValueArabic = /[\u0600-\u06FF]/.test(value || "");
  doc.fontSize(9).font(isLabelArabic ? "Arabic" : "Helvetica-Bold").fillColor("#374151")
    .text(`${label}: `, x, _y, { continued: true });
  doc.font(isValueArabic ? "Arabic" : "Helvetica").fillColor("#111827").text(value || "-");
}

/**
 * Render an official_letters row to a printable Arabic PDF. Used by the
 * Umrah letter dispatcher + any other module that wants to ship the
 * letter to a printer / attach to an email. Plain content rendering;
 * the existing PdfOptions header (company name + phone + address) is
 * pulled from companies + branches.
 */
export async function exportOfficialLetterPdf(companyId: number, letterId: number): Promise<Buffer> {
  const [letterRow] = await rawQuery<Record<string, unknown>>(
    `SELECT l.id, l.type, l.subject, l.content, l.status, l."createdAt",
            l."sentAt", l."dispatchedVia", l."approvedAt", l."approvedBy",
            c.name AS "companyName", c.phone, c.address
       FROM official_letters l
       LEFT JOIN companies c ON c.id = l."companyId"
      WHERE l.id = $1 AND l."companyId" = $2`,
    [letterId, companyId]
  );
  if (!letterRow) throw new NotFoundError("الخطاب غير موجود");
  const letter = letterRow as {
    id: number; type: string | null; subject: string | null; content: string | null;
    createdAt: string | Date; approvedAt: string | Date | null;
    companyName: string | null; phone: string | null; address: string | null;
  };

  const doc = createDoc({ title: letter.subject || "خطاب رسمي", companyName: letter.companyName || undefined });
  drawHeader(doc, {
    title: letter.subject || "خطاب رسمي",
    companyName: letter.companyName || undefined,
    phone: letter.phone || undefined,
    address: letter.address || undefined,
  });

  doc.moveDown(0.5);
  doc.font("Arabic").fontSize(12).fillColor("#111827");
  rtlText(doc, `رقم الخطاب: ${letter.id}`);
  rtlText(doc, `النوع: ${letter.type ?? "general"}`);
  rtlText(doc, `التاريخ: ${new Date(letter.createdAt).toISOString().slice(0, 10)}`);
  doc.moveDown(0.5);

  doc.font("Arabic").fontSize(14).fillColor("#111827");
  rtlText(doc, letter.subject || "");
  doc.moveDown(0.5);

  doc.font("Arabic").fontSize(11).fillColor("#1f2937");
  for (const line of String(letter.content ?? "").split("\n")) {
    rtlText(doc, line);
  }

  if (letter.approvedAt) {
    doc.moveDown(1);
    doc.font("Arabic").fontSize(10).fillColor("#6b7280");
    rtlText(doc, `معتمد بتاريخ ${new Date(letter.approvedAt).toISOString().slice(0, 10)}`);
  }

  return docToBuffer(doc);
}

// ─── Umrah sub-agent statement of account ──────────────────────────────────
//
// Mirrors the JSON shape returned by generateStatement() in
// umrahInvoicingEngine.ts — invoice / violation / payment ledger rolled
// into a single running-balance table. Used by the umrah module to ship
// a printable statement to the sub-agent via WhatsApp / email / hand.
export async function exportUmrahStatementPdf(
  companyId: number,
  subAgentId: number,
  data: {
    openingBalance: number;
    entries: Array<{
      date: string | null;
      description: string;
      reference: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
    closingBalance: number;
  },
  range: { from?: string; to?: string },
): Promise<Buffer> {
  const [subAgentRow] = await rawQuery<Record<string, unknown>>(
    `SELECT sa.id, sa.name, sa."nuskCode", sa."paymentTerms",
            c.name AS "companyName", c.phone, c.address
       FROM umrah_sub_agents sa
       LEFT JOIN companies c ON c.id = sa."companyId"
      WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL`,
    [subAgentId, companyId]
  );
  if (!subAgentRow) throw new NotFoundError("الوكيل الفرعي غير موجود");
  const subAgent = subAgentRow as {
    id: number; name: string; nuskCode: string | null; paymentTerms: string | null;
    companyName: string | null; phone: string | null; address: string | null;
  };

  const doc = createDoc({ title: "كشف حساب وكيل فرعي", companyName: subAgent.companyName || undefined });
  const buf = docToBuffer(doc);

  const rangeText = range.from && range.to
    ? `${range.from} → ${range.to}`
    : "كل الفترات";
  drawHeader(doc, {
    title: "كشف حساب وكيل فرعي — عمرة",
    subtitle: `${subAgent.name} • ${subAgent.nuskCode || ""} • ${rangeText}`,
    companyName: subAgent.companyName || undefined,
    phone: subAgent.phone || undefined,
    address: subAgent.address || undefined,
    date: new Date().toLocaleDateString("en-SA"),
  });

  doc.moveDown(0.3);
  infoRow(doc, "الوكيل الفرعي", subAgent.name);
  infoRow(doc, "رمز نسك", subAgent.nuskCode || "-");
  infoRow(doc, "شروط الدفع", subAgent.paymentTerms === "prepaid" ? "مقدم" : subAgent.paymentTerms === "postpaid" ? "آجل" : (subAgent.paymentTerms || "-"));
  doc.moveDown(0.5);

  const totalDebit = data.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
  const totalCredit = data.entries.reduce((s, e) => s + Number(e.credit || 0), 0);

  drawTable(
    doc,
    ["التاريخ", "الوصف", "المرجع", "مدين", "دائن", "الرصيد"],
    [
      ...data.entries.map((e) => [
        e.date ? String(e.date).slice(0, 10) : "-",
        e.description,
        e.reference || "-",
        Number(e.debit || 0).toFixed(2),
        Number(e.credit || 0).toFixed(2),
        Number(e.balance || 0).toFixed(2),
      ]),
      [null, "الإجمالي", null, totalDebit.toFixed(2), totalCredit.toFixed(2), Number(data.closingBalance).toFixed(2)],
    ],
    [60, 175, 70, 60, 60, 70]
  );

  doc.moveDown(0.5);
  const balanceText = data.closingBalance > 0
    ? `الرصيد الختامي (مستحق على الوكيل): ${Number(data.closingBalance).toFixed(2)} ر.س`
    : data.closingBalance < 0
      ? `الرصيد الختامي (دفعة مقدمة من الوكيل): ${Math.abs(Number(data.closingBalance)).toFixed(2)} ر.س`
      : "الرصيد الختامي: مسوّى";
  doc.fontSize(11).font("Arabic").fillColor("#111827").text(balanceText, { align: "right" });

  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}

// ─── Umrah daily run-sheet (arrivals + departures + overstays) ─────────────
//
// Returns a printable list of: who arrives today, who departs today, who
// is currently overstaying. Used by ops first thing in the morning to plan
// transport / hotel allocations and follow up on overstayers.
export async function exportUmrahDailyRunsheetPdf(
  companyId: number,
  date: string,
  data: {
    arrivals: Array<{ nuskNumber: string; fullName: string; nationality: string; groupName: string | null; subAgentName: string | null; entryPort: string | null; entryFlight: string | null }>;
    departures: Array<{ nuskNumber: string; fullName: string; nationality: string; groupName: string | null; subAgentName: string | null; exitPort: string | null; exitFlight: string | null }>;
    overstays: Array<{ nuskNumber: string; fullName: string; nationality: string; groupName: string | null; subAgentName: string | null; overstayDays: number }>;
  },
): Promise<Buffer> {
  const [companyRow] = await rawQuery<Record<string, unknown>>(
    `SELECT name AS "companyName", phone, address FROM companies WHERE id = $1`,
    [companyId]
  );
  const company = companyRow as { companyName: string | null; phone: string | null; address: string | null } | undefined;

  const doc = createDoc({ title: "كشف اليوم التشغيلي — عمرة", companyName: company?.companyName || undefined });
  const buf = docToBuffer(doc);

  drawHeader(doc, {
    title: "كشف اليوم التشغيلي — عمرة",
    subtitle: `تاريخ التشغيل: ${date}`,
    companyName: company?.companyName || undefined,
    phone: company?.phone || undefined,
    address: company?.address || undefined,
    date: new Date().toLocaleDateString("en-SA"),
  });

  doc.moveDown(0.3);
  doc.font("Arabic").fontSize(11).fillColor("#1e293b").text(
    `وصول: ${data.arrivals.length}   |   مغادرة: ${data.departures.length}   |   متجاوزون: ${data.overstays.length}`,
    { align: "right" }
  );
  doc.moveDown(0.3);

  const renderSection = (title: string, headers: string[], rows: (string | number | null)[][], widths: number[]) => {
    if (doc.y > 700) doc.addPage();
    doc.font("Arabic").fontSize(12).fillColor("#0f172a").text(title, { align: "right" });
    doc.moveDown(0.2);
    if (rows.length === 0) {
      doc.font("Arabic").fontSize(9).fillColor("#94a3b8").text("— لا يوجد —", { align: "right" });
      doc.moveDown(0.5);
      return;
    }
    drawTable(doc, headers, rows, widths);
    doc.moveDown(0.3);
  };

  renderSection(
    `الوصول اليوم (${data.arrivals.length})`,
    ["رقم نسك", "الاسم", "الجنسية", "المجموعة", "الوكيل الفرعي", "ميناء", "رحلة"],
    data.arrivals.map((r) => [r.nuskNumber, r.fullName, r.nationality || "-", r.groupName || "-", r.subAgentName || "-", r.entryPort || "-", r.entryFlight || "-"]),
    [60, 110, 60, 75, 80, 50, 60]
  );

  renderSection(
    `المغادرة اليوم (${data.departures.length})`,
    ["رقم نسك", "الاسم", "الجنسية", "المجموعة", "الوكيل الفرعي", "ميناء", "رحلة"],
    data.departures.map((r) => [r.nuskNumber, r.fullName, r.nationality || "-", r.groupName || "-", r.subAgentName || "-", r.exitPort || "-", r.exitFlight || "-"]),
    [60, 110, 60, 75, 80, 50, 60]
  );

  renderSection(
    `المتجاوزون حالياً (${data.overstays.length})`,
    ["رقم نسك", "الاسم", "الجنسية", "المجموعة", "الوكيل الفرعي", "أيام التجاوز"],
    data.overstays.map((r) => [r.nuskNumber, r.fullName, r.nationality || "-", r.groupName || "-", r.subAgentName || "-", r.overstayDays]),
    [60, 130, 65, 90, 90, 60]
  );

  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}
