// #2837 — إثبات تكامل حيّ لعقد المالية createServiceInvoiceWithLines.
//
// يثبت على قاعدة بيانات حقيقية أن نقل كتابة الفاتورة من transport-pricing إلى
// عقد المالية (#2837) مكافئ سلوكيًا للطريقة المباشرة القديمة وذرّي:
//   (أ) التكافؤ: إدراج بنفس المدخلات عبر SQL القديم المباشر وعبر العقد الجديد
//       يُنتجان صفًّا متطابقًا عمودًا بعمود في invoices و invoice_lines
//       (مقارنة to_jsonb كاملة عدا id/ref/الطوابع) — يكشف أي انحراف في أي عمود.
//   (ب) الذرّية: فشل لاحق داخل withTransaction يتراجع عن الفاتورة وسطورها كاملة
//       (rawExecute داخل العقد ينضمّ لـtxStore الذي يربطه withTransaction).
//
// يستخدم الشركة المبذورة (2) كأقرانه من اختبارات .dynamic، وينشئ عميلًا حقيقيًا،
// ويترك أبعاد السطر (مركبة/سائق/مركز تكلفة) فارغة لتفادي الاعتماد على بذور FK.
// يعمل فقط حين يشير DATABASE_URL لعنقود اختبار (علامة _test / 54329).
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

const COMPANY = 2, BRANCH = 2, BY = 2;          // الديار (شركة مبذورة) — كأقرانه
const CLIENT_ID = 990028370;                     // عميل اختبار بمعرّف مرتفع ثابت
const PFX = "TEST2837-";

// أعمدة متغيّرة/مفتاحية تُستثنى من مقارنة التطابق.
const VOLATILE = new Set(["id", "ref", "createdAt", "updatedAt", "deletedAt"]);
const strip = (r: Record<string, unknown>, extra: string[] = []) => {
  const skip = new Set([...VOLATILE, ...extra]);
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(r)) if (!skip.has(k)) o[k] = r[k];
  return o;
};

d("#2837 — عقد فاتورة الخدمة: تكافؤ سلوكي + ذرّية (DB حيّ)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;
  let createServiceInvoiceWithLines:
    typeof import("../../src/routes/finance-invoices.js").createServiceInvoiceWithLines;

  const header = {
    subtotal: 1000, vatRate: 15, vatAmount: 150, total: 1150,
    description: "دفعة فوترة نقل — بندان", notes: "ملاحظة اختبار", taxCode: "VAT15",
  };
  // أبعاد فارغة (FK-safe)؛ تمرير الأبعاد غير الفارغة مثبت في الراتشيت الثابت.
  const LINES = [
    { description: "خط نقل ١", quantity: "1", unitPrice: "600", lineTotal: 600, vatAmount: 90, lineGross: 690, accountCode: "4151", costCenterId: null as number | null, vehicleId: null as number | null, driverId: null as number | null, taxCode: "VAT15" as string | null },
    { description: "خط نقل ٢", quantity: "2", unitPrice: "200", lineTotal: 400, vatAmount: 60, lineGross: 460, accountCode: "4152", costCenterId: null as number | null, vehicleId: null as number | null, driverId: null as number | null, taxCode: null as string | null },
  ];

  // الطريقة القديمة المباشرة — SQL النقل الأصلي حرفيًا (قبل #2837).
  async function legacyInsert(ref: string): Promise<{ invoiceId: number; lineIds: number[] }> {
    const inv = await rawExecute(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
              subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate","createdBy",notes,
              "isTaxLinked","invoiceTypeCode","taxCategoryCode","exemptionReason","costCenter",
              "taxCode","taxInclusive","discountAmount","discountPercent")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [COMPANY, BRANCH, CLIENT_ID, ref, header.description,
       header.subtotal, header.vatRate, header.vatAmount, header.total, null, BY, header.notes,
       true, "388", "S", null, null, header.taxCode, false, 0, 0],
    );
    const invoiceId = inv.insertId;
    const lineIds: number[] = [];
    for (const p of LINES) {
      const lr = await rawExecute(
        `INSERT INTO invoice_lines (
           "invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross",
           "accountId","accountCode","costCenterId","activityType",
           "projectId","vehicleId","propertyId","unitId","assetId",
           "employeeId","driverId","contractId","umrahSeasonId","umrahAgentId",
           "productId","taxCode","taxInclusive","allocationRuleId","allocationStatus",
           "dimensionJson","manualOverrideReason"
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
         RETURNING id`,
        [invoiceId, p.description, p.quantity, p.unitPrice, p.lineTotal, p.vatAmount, p.lineGross,
         null, p.accountCode, p.costCenterId, null,
         null, p.vehicleId, null, null, null,
         null, p.driverId, null, null, null,
         null, p.taxCode, false, null, "resolved",
         null, null],
      );
      lineIds.push(lr.insertId);
    }
    return { invoiceId, lineIds };
  }

  const readInvoice = (id: number) =>
    rawQuery<{ j: Record<string, unknown> }>(`SELECT to_jsonb(i) AS j FROM invoices i WHERE id=$1`, [id]);
  const readLines = (invId: number) =>
    rawQuery<{ j: Record<string, unknown> }>(
      `SELECT to_jsonb(l) AS j FROM invoice_lines l WHERE "invoiceId"=$1 ORDER BY id`, [invId]);

  async function cleanup() {
    await rawExecute(
      `DELETE FROM invoice_lines WHERE "invoiceId" IN
         (SELECT id FROM invoices WHERE "companyId"=$1 AND ref LIKE $2)`, [COMPANY, `${PFX}%`]);
    await rawExecute(`DELETE FROM invoices WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, `${PFX}%`]);
    await rawExecute(`DELETE FROM clients WHERE id=$1`, [CLIENT_ID]);
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute; withTransaction = rawdb.withTransaction;
    ({ createServiceInvoiceWithLines } = await import("../../src/routes/finance-invoices.js"));
    await cleanup();
    // عميل اختبار حقيقي (يفي بـFK clientId في بيئة CI المبذورة).
    await rawExecute(
      `INSERT INTO clients (id, "companyId", name) VALUES ($1,$2,$3)`,
      [CLIENT_ID, COMPANY, "عميل اختبار #2837"]);
  });

  afterAll(async () => { await cleanup(); });

  it("التكافؤ: العقد الجديد يُنتج فاتورة وسطورًا مطابقة عمودًا بعمود للطريقة القديمة", async () => {
    const oldRes = await legacyInsert(`${PFX}OLD`);
    const newRes = await createServiceInvoiceWithLines({
      companyId: COMPANY, branchId: BRANCH, clientId: CLIENT_ID, ref: `${PFX}NEW`,
      description: header.description, subtotal: header.subtotal, vatRate: header.vatRate,
      vatAmount: header.vatAmount, total: header.total, dueDate: null, createdBy: BY,
      notes: header.notes, taxCode: header.taxCode, lines: LINES,
    });

    const [oldInv] = await readInvoice(oldRes.invoiceId);
    const [newInv] = await readInvoice(newRes.invoiceId);
    expect(strip(newInv.j)).toEqual(strip(oldInv.j)); // رأس متطابق عمودًا بعمود
    // ثوابت الفاتورة المسوّدة المملوكة للمالية + القيم المحسوبة فعليًا.
    expect(newInv.j.status).toBe("draft");
    expect(Number(newInv.j.paidAmount)).toBe(0);
    expect(newInv.j.invoiceTypeCode).toBe("388");
    expect(newInv.j.taxCategoryCode).toBe("S");
    expect(newInv.j.isTaxLinked).toBe(true);
    expect(Number(newInv.j.total)).toBe(1150);
    expect(Number(newInv.j.vatAmount)).toBe(150);

    const oldLines = await readLines(oldRes.invoiceId);
    const newLines = await readLines(newRes.invoiceId);
    expect(newLines.length).toBe(2);
    expect(newRes.lineIds.length).toBe(2);
    // كل سطر متطابق عمودًا بعمود (عدا id/invoiceId/الطوابع)، بالترتيب نفسه.
    expect(newLines.map((r) => strip(r.j, ["invoiceId"])))
      .toEqual(oldLines.map((r) => strip(r.j, ["invoiceId"])));
    expect(newLines[0]!.j.allocationStatus).toBe("resolved");
  });

  it("الذرّية: فشل لاحق داخل المعاملة يتراجع عن الفاتورة وسطورها كاملة", async () => {
    const REF = `${PFX}ATOMIC`;
    let threw = false;
    try {
      await withTransaction(async () => {
        await createServiceInvoiceWithLines({
          companyId: COMPANY, branchId: BRANCH, clientId: CLIENT_ID, ref: REF,
          description: header.description, subtotal: header.subtotal, vatRate: header.vatRate,
          vatAmount: header.vatAmount, total: header.total, dueDate: null, createdBy: BY,
          notes: header.notes, taxCode: header.taxCode, lines: LINES,
        });
        throw new Error("boom — تراجع مقصود بعد إنشاء الفاتورة");
      });
    } catch { threw = true; }
    expect(threw).toBe(true);
    const rows = await rawQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM invoices WHERE ref=$1 AND "companyId"=$2`, [REF, COMPANY]);
    expect(Number(rows[0]!.n)).toBe(0); // لا فاتورة بقيت
    const lrows = await rawQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM invoice_lines l
        JOIN invoices i ON i.id=l."invoiceId" WHERE i.ref=$1`, [REF]);
    expect(Number(lrows[0]!.n)).toBe(0); // ولا سطور يتيمة
  });
});
