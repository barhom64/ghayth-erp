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

export async function exportInvoicePdf(companyId: number, invoiceId: number): Promise<Buffer> {
  const [invoiceRow] = await rawQuery<Record<string, unknown>>(
    `SELECT i.*, c.name AS "clientName", c.phone AS "clientPhone",
            b.name AS "branchName", b.address AS "branchAddress", b.phone AS "branchPhone"
     FROM invoices i
     LEFT JOIN clients c ON c.id = i."clientId"
     LEFT JOIN branches b ON b.id = i."branchId"
     WHERE i.id = $1 AND i."companyId" = $2`,
    [invoiceId, companyId]
  );
  if (!invoiceRow) throw new NotFoundError("Invoice not found");
  const invoice = invoiceRow as Record<string, string | number | null | undefined> & {
    ref: string; createdAt: string | Date | null; dueDate: string | Date | null;
    clientName: string | null; clientPhone: string | null; status: string;
    branchName: string | null; branchAddress: string | null; branchPhone: string | null;
  };

  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT description, quantity, "unitPrice", "lineTotal", "vatAmount", "lineGross"
     FROM invoice_lines WHERE "invoiceId" = $1 ORDER BY id`,
    [invoiceId]
  );

  const doc = createDoc({ title: `Invoice ${invoice.ref}` });
  const buf = docToBuffer(doc);

  drawHeader(doc, {
    title: `فاتورة / Invoice: ${invoice.ref}`,
    companyName: invoice.branchName || "غيث ERP",
    phone: invoice.branchPhone || undefined,
    address: invoice.branchAddress || undefined,
    date: invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("en-SA") : "",
  });

  const y = doc.y;
  infoRow(doc, "Client", invoice.clientName || "-", 50, y);
  if (invoice.clientPhone) infoRow(doc, "Phone", invoice.clientPhone);
  infoRow(doc, "Status", invoice.status);
  infoRow(doc, "Due Date", invoice.dueDate ? new Date(invoice.dueDate as string | Date).toLocaleDateString("en-SA") : "-");
  doc.moveDown(0.5);

  const colWidths = [30, 200, 50, 60, 60, 60, 65];
  drawTable(
    doc,
    ["#", "Description", "Qty", "Unit Price", "Total", "VAT", "Gross"],
    [
      ...lines.map((l, i: number) => [
        i + 1,
        (l.description as string) || "",
        Number(l.quantity),
        Number(l.unitPrice).toFixed(2),
        Number(l.lineTotal).toFixed(2),
        Number(l.vatAmount || 0).toFixed(2),
        Number(l.lineGross || l.lineTotal).toFixed(2),
      ]),
    ],
    colWidths
  );

  doc.moveDown(0.3);
  const sx = 350;
  doc.fontSize(9).font("Helvetica").fillColor("#374151");
  const summaryItems = [
    ["Subtotal:", Number(invoice.subtotal || 0).toFixed(2)],
    [`VAT (${invoice.vatRate || 15}%):`, Number(invoice.vatAmount || 0).toFixed(2)],
    ["Total:", Number(invoice.total || 0).toFixed(2)],
    ["Paid:", Number(invoice.paidAmount || 0).toFixed(2)],
    ["Remaining:", (Number(invoice.total || 0) - Number(invoice.paidAmount || 0)).toFixed(2)],
  ];
  for (const [label, val] of summaryItems) {
    doc.text(String(label), sx, doc.y, { width: 100, align: "left" });
    doc.text(String(val), sx + 100, doc.y - 11, { width: 80, align: "right" });
    doc.moveDown(0.2);
  }

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}

export async function exportPurchaseOrderPdf(companyId: number, poId: number): Promise<Buffer> {
  const [poRow] = await rawQuery<Record<string, unknown>>(
    `SELECT po.*, s.name AS "supplierName", s.phone AS "supplierPhone",
            b.name AS "branchName", b.address AS "branchAddress", b.phone AS "branchPhone"
     FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po."supplierId"
     LEFT JOIN branches b ON b.id = po."branchId"
     WHERE po.id = $1 AND po."companyId" = $2`,
    [poId, companyId]
  );
  if (!poRow) throw new NotFoundError("Purchase order not found");
  const po = poRow as Record<string, string | number | null | undefined> & {
    id: number; ref: string | null; status: string | null;
    createdAt: string | Date | null; expectedDelivery: string | Date | null;
    supplierName: string | null; supplierPhone: string | null;
    branchName: string | null; branchAddress: string | null; branchPhone: string | null;
    totalAmount: number | null;
  };

  const lines = await rawQuery<Record<string, unknown>>(
    `SELECT description, quantity, "unitPrice", "totalPrice"
     FROM purchase_order_lines WHERE "purchaseOrderId" = $1 ORDER BY id`,
    [poId]
  );

  const doc = createDoc({ title: `PO ${po.ref}` });
  const buf = docToBuffer(doc);

  drawHeader(doc, {
    title: `أمر شراء / Purchase Order: ${po.ref || po.id}`,
    companyName: po.branchName || "غيث ERP",
    phone: po.branchPhone || undefined,
    address: po.branchAddress || undefined,
    date: po.createdAt ? new Date(po.createdAt).toLocaleDateString("en-SA") : "",
  });

  infoRow(doc, "Supplier", po.supplierName || "-");
  if (po.supplierPhone) infoRow(doc, "Phone", po.supplierPhone);
  infoRow(doc, "Status", po.status || "-");
  if (po.expectedDelivery) infoRow(doc, "Expected Delivery", new Date(po.expectedDelivery).toLocaleDateString("en-SA"));
  doc.moveDown(0.5);

  drawTable(
    doc,
    ["#", "Description", "Qty", "Unit Price", "Total"],
    [
      ...lines.map((l, i: number) => [
        i + 1,
        (l.description as string) || "",
        Number(l.quantity),
        Number(l.unitPrice || 0).toFixed(2),
        Number(l.totalPrice || Number(l.unitPrice) * Number(l.quantity) || 0).toFixed(2),
      ]),
      [null, "Total Amount", null, null, Number(po.totalAmount || 0).toFixed(2)],
    ],
    [30, 200, 60, 100, 105]
  );

  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}

export async function exportVoucherPdf(companyId: number, voucherId: number): Promise<Buffer> {
  const [voucherRow] = await rawQuery<Record<string, unknown>>(
    `SELECT v.*, b.name AS "branchName", b.address AS "branchAddress"
     FROM vouchers v LEFT JOIN branches b ON b.id = v."branchId"
     WHERE v.id = $1 AND v."companyId" = $2`,
    [voucherId, companyId]
  );
  if (!voucherRow) throw new NotFoundError("Voucher not found");
  const voucher = voucherRow as Record<string, string | number | null | undefined> & {
    id: number; ref: string | null; type: string | null;
    createdAt: string | Date | null; amount: number | null;
    paymentMethod: string | null; description: string | null;
    branchName: string | null; branchAddress: string | null;
  };

  const typeLabel = voucher.type === "receipt" ? "سند قبض / Receipt Voucher" : "سند صرف / Payment Voucher";

  const doc = createDoc({ title: typeLabel });
  const buf = docToBuffer(doc);

  drawHeader(doc, {
    title: `${typeLabel}: ${voucher.ref || voucher.id}`,
    companyName: voucher.branchName || "غيث ERP",
    address: voucher.branchAddress || undefined,
    date: voucher.createdAt ? new Date(voucher.createdAt).toLocaleDateString("en-SA") : "",
  });

  const y = doc.y;
  infoRow(doc, "Reference", voucher.ref || String(voucher.id), 50, y);
  infoRow(doc, "Type", typeLabel);
  infoRow(doc, "Amount", `${Number(voucher.amount || 0).toFixed(2)} SAR`);
  infoRow(doc, "Payment Method", voucher.paymentMethod || "-");
  if (voucher.description) infoRow(doc, "Description", voucher.description);

  doc.moveDown(2);
  const sigY = doc.y;
  doc.moveTo(50, sigY + 30).lineTo(180, sigY + 30).strokeColor("#111827").lineWidth(0.5).stroke();
  doc.moveTo(365, sigY + 30).lineTo(495, sigY + 30).strokeColor("#111827").lineWidth(0.5).stroke();
  doc.fontSize(8).fillColor("#374151").text("Received by / المستلم", 50, sigY + 34);
  doc.text("Authorized Signature / المفوض", 365, sigY + 34);

  doc.moveDown(4);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}

export async function exportPayrollSlipPdf(companyId: number, payrollId: number): Promise<Buffer> {
  const [recordRow] = await rawQuery<Record<string, unknown>>(
    `SELECT pr.*, e.name AS "employeeName", ea."jobTitle" AS position, ea.salary AS "baseSalary",
            b.name AS "branchName"
     FROM payroll_records pr
     JOIN employee_assignments ea ON ea.id = pr."employeeAssignmentId"
     JOIN employees e ON e.id = ea."employeeId"
     LEFT JOIN branches b ON b.id = ea."branchId"
     WHERE pr.id = $1 AND pr."companyId" = $2`,
    [payrollId, companyId]
  );
  if (!recordRow) throw new NotFoundError("Payroll record not found");
  const record = recordRow as Record<string, string | number | null | undefined> & {
    employeeName: string; position: string | null; period: string;
    branchName: string | null;
    baseSalary: number | null; housingAllowance: number | null; transportAllowance: number | null;
    overtime: number | null; grossSalary: number | null; totalDeductions: number | null;
    netSalary: number | null;
  };

  const doc = createDoc({ title: "Payroll Slip" });
  const buf = docToBuffer(doc);

  drawHeader(doc, {
    title: `كشف راتب / Payroll Slip — ${record.period}`,
    companyName: record.branchName || "غيث ERP",
    date: new Date().toLocaleDateString("en-SA"),
  });

  infoRow(doc, "Employee", record.employeeName);
  infoRow(doc, "Position", record.position || "-");
  infoRow(doc, "Period", record.period);
  doc.moveDown(0.5);

  drawTable(
    doc,
    ["Component", "Amount (SAR)"],
    [
      ["Basic Salary / الراتب الأساسي", Number(record.baseSalary || 0).toFixed(2)],
      ["Housing Allowance / بدل سكن", Number(record.housingAllowance || 0).toFixed(2)],
      ["Transport Allowance / بدل نقل", Number(record.transportAllowance || 0).toFixed(2)],
      ["Overtime / أوفرتايم", Number(record.overtime || 0).toFixed(2)],
      ["Gross Salary / الراتب الإجمالي", Number(record.grossSalary || 0).toFixed(2)],
      ["Deductions / الاستقطاعات", `-${Number(record.totalDeductions || 0).toFixed(2)}`],
      ["Net Salary / صافي الراتب", Number(record.netSalary || 0).toFixed(2)],
    ],
    [300, 195]
  );

  doc.moveDown(2);
  const sigY = doc.y;
  doc.moveTo(50, sigY + 30).lineTo(200, sigY + 30).strokeColor("#111827").lineWidth(0.5).stroke();
  doc.moveTo(345, sigY + 30).lineTo(495, sigY + 30).strokeColor("#111827").lineWidth(0.5).stroke();
  doc.fontSize(8).fillColor("#374151").text("Employee Signature / توقيع الموظف", 50, sigY + 34);
  doc.text("HR Manager / مدير الموارد البشرية", 345, sigY + 34);

  doc.moveDown(4);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}

export async function exportTrialBalancePdf(companyId: number, startDate?: string, endDate?: string): Promise<Buffer> {
  let dateFilter = "";
  const params: any[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name, coa.type,
            COALESCE(SUM(jl.debit), 0) AS "totalDebit",
            COALESCE(SUM(jl.credit), 0) AS "totalCredit",
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE coa."companyId" = $1
     GROUP BY coa.code, coa.name, coa.type ORDER BY coa.code`,
    params
  );

  const typeMap: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expense" };
  const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.totalDebit), 0);
  const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.totalCredit), 0);

  const doc = createDoc({ title: "Trial Balance" });
  const buf = docToBuffer(doc);

  const dateRange = startDate || endDate ? `${startDate || "Beginning"} to ${endDate || "Today"}` : "All Periods";
  drawHeader(doc, {
    title: "ميزان المراجعة / Trial Balance",
    subtitle: dateRange,
    date: new Date().toLocaleDateString("en-SA"),
  });

  drawTable(
    doc,
    ["Code", "Account Name", "Type", "Debit", "Credit", "Balance"],
    [
      ...rows.map((r: any) => [r.code, r.name, typeMap[r.type] || r.type, Number(r.totalDebit).toFixed(2), Number(r.totalCredit).toFixed(2), Number(r.balance).toFixed(2)]),
      [null, "Total / الإجمالي", null, totalDebit.toFixed(2), totalCredit.toFixed(2), (totalDebit - totalCredit).toFixed(2)],
    ],
    [50, 165, 70, 75, 75, 75]
  );

  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica-Bold").fillColor(balanced ? "#16a34a" : "#dc2626").text(
    balanced ? "✓ Balanced" : "✗ Not Balanced",
    { align: "center" }
  );

  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
}

export async function exportFleetTripsPdf(companyId: number, startDate?: string, endDate?: string): Promise<Buffer> {
  let dateFilter = "";
  const params: any[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND t."startTime" >= $${params.length}`; }
  if (endDate) { params.push(endDate); dateFilter += ` AND t."startTime" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT t.id, v."plateNumber", d.name AS "driverName",
            t."fromLocation", t."toLocation",
            COALESCE(t.distance, 0) AS distance,
            COALESCE(t.cost, 0) AS cost,
            t.status, t."startTime", t."endTime"
     FROM fleet_trips t
     LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId"
     LEFT JOIN fleet_drivers d ON d.id = t."driverId"
     WHERE t."companyId" = $1 AND t."deletedAt" IS NULL ${dateFilter}
     ORDER BY t."startTime" DESC
     LIMIT 1000`,
    params
  );

  const totalDistance = rows.reduce((s: number, r: any) => s + Number(r.distance), 0);
  const totalCost = rows.reduce((s: number, r: any) => s + Number(r.cost), 0);

  const doc = createDoc({ title: "Fleet Trip Report" });
  const buf = docToBuffer(doc);

  const dateRange = startDate || endDate ? `${startDate || "Beginning"} – ${endDate || "Today"}` : "All Periods";
  drawHeader(doc, {
    title: "تقرير رحلات الأسطول / Fleet Trip Report",
    subtitle: dateRange,
    date: new Date().toLocaleDateString("en-SA"),
  });

  drawTable(
    doc,
    ["Trip #", "Vehicle", "Driver", "From", "To", "Distance (km)", "Cost (SAR)", "Status"],
    [
      ...rows.map((r: any) => [
        String(r.id),
        r.plateNumber || "-",
        r.driverName || "-",
        r.fromLocation || "-",
        r.toLocation || "-",
        Number(r.distance).toFixed(1),
        Number(r.cost).toFixed(2),
        r.status,
      ]),
      [null, null, "Total / الإجمالي", null, null, totalDistance.toFixed(1), totalCost.toFixed(2), null],
    ],
    [35, 65, 65, 75, 75, 55, 60, 50]
  );

  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").fillColor("#6b7280").text("Generated by Ghayth ERP", { align: "center" });

  return buf;
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
