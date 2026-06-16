// #1945 item 6 — خريطة إيراد المنتج: end-to-end over HTTP on the live
// head-of-main DB. A sales-invoice line carrying a productId whose product
// maps a revenue account (products.defaultRevenueAccountId) must post its
// CR to THAT account (with the productId dim), while unmapped lines fall
// back to the engine-resolved generic invoice_revenue — and the
// preview-posting endpoint must show exactly what approval will post.
// Exercises the REAL routes (authorize → lifecycle → resolver → engine),
// not the lib in isolation. Activates only when DATABASE_URL points at the
// test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;
const BRANCH = 2;
const PRODUCT_REVENUE = "4130"; // إيرادات الخدمات — postable, ≠ the generic sales leaf
const PFX = "test-item6-";
const CSRF = "test-item6-csrf-token";

d("item 6 — product revenue account map (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  let token: string;
  let clientId: number;
  let productId: number;
  let invoiceId: number;
  let genericRevenue: string; // what the engine resolves for invoice_revenue
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
    const { signToken } = await import("../../src/lib/auth.js");
    const { financialEngine } = await import("../../src/lib/engines/index.js");

    await cleanup();

    // Non-destructive auth fixture: an owner of the seeded company 2.
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1, $2) RETURNING id`,
      [PFX + "owner", PFX + "owner@test.local"],
    );
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`,
      [emp.id, COMPANY, BRANCH],
    );
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
       VALUES ($1, $2, 'x', TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"],
    );
    created.userId = usr.id;
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "owner" });

    genericRevenue = await financialEngine.resolveAccountCode(COMPANY, "invoice_revenue", "credit", "4000");

    // Product mapped to its own revenue account (إيرادات الخدمات).
    const [acc] = await rawQuery<{ id: number }>(
      `SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL`,
      [COMPANY, PRODUCT_REVENUE],
    );
    const [prod] = await rawQuery<{ id: number }>(
      `INSERT INTO products ("companyId", name, "defaultRevenueAccountId") VALUES ($1,$2,$3) RETURNING id`,
      [COMPANY, PFX + "service", acc.id],
    );
    productId = prod.id;

    const [cl] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name, type) VALUES ($1,$2,'individual') RETURNING id`,
      [COMPANY, PFX + "client"],
    );
    clientId = cl.id;

    // Draft invoice: line1 = product-mapped 100, line2 = bare 50. VAT 0 to
    // keep the JE to AR + the two revenue legs.
    const [inv] = await rawQuery<{ id: number }>(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,subtotal,"vatRate","vatAmount",total,"paidAmount",status,"createdBy")
       VALUES ($1,$2,$3,$4,150,0,0,150,0,'draft',$5) RETURNING id`,
      [COMPANY, BRANCH, clientId, PFX + "inv", created.assignmentId],
    );
    invoiceId = inv.id;
    await rawExecute(
      `INSERT INTO invoice_lines ("invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross","productId","allocationStatus")
       VALUES ($1,'خدمة منتج مُخرَّط',1,100,100,0,100,$2,'unmapped'),
              ($1,'بند عام بلا منتج',1,50,50,0,50,NULL,'unmapped')`,
      [invoiceId, productId],
    );
  }, 60_000);

  async function cleanup() {
    if (!rawExecute) return;
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey" IN
         (SELECT 'finance:invoice_approval:'||id::text FROM invoices WHERE "companyId"=$1 AND ref LIKE $2)`,
      [COMPANY, PFX + "%"],
    );
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* not applied */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
    await rawExecute(`DELETE FROM invoice_lines WHERE "invoiceId" IN (SELECT id FROM invoices WHERE "companyId"=$1 AND ref LIKE $2)`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM invoices WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM products WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM clients WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }
  afterAll(cleanup);

  const post = (path: string, body: any = {}) =>
    request(app)
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send(body);

  it("sanity: the product account differs from the engine's generic revenue", () => {
    expect(genericRevenue).not.toBe(PRODUCT_REVENUE);
  });

  it("preview-posting shows the product's revenue account for the mapped line", async () => {
    const res = await post(`/api/finance/invoices/${invoiceId}/preview-posting`);
    expect(res.status).toBe(200);
    const lines: any[] = res.body?.journalLines ?? [];
    const productLeg = lines.find((l) => l.accountCode === PRODUCT_REVENUE);
    expect(productLeg, "preview must carry the product-mapped CR leg").toBeTruthy();
    expect(Number(productLeg.credit)).toBe(100);
    expect(Number(productLeg.dimensions?.productId)).toBe(productId);
    const genericLeg = lines.find((l) => l.accountCode === genericRevenue && Number(l.credit) === 50);
    expect(genericLeg, "the bare line falls back to the generic revenue account").toBeTruthy();
  });

  it("approval posts the exact JE: DR AR 150 / CR product-revenue 100 (+productId) / CR generic 50", async () => {
    const res = await post(`/api/finance/invoices/${invoiceId}/approve`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `finance:invoice_approval:${invoiceId}`],
    );
    expect(je, "approval must post a JE").toBeTruthy();

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string; productId: number | null }>(
      `SELECT "accountCode", debit::text, credit::text, "productId" FROM journal_lines
        WHERE "journalId"=$1 ORDER BY debit DESC, credit DESC`,
      [je.id],
    );
    // DR ذمم 150
    expect(Number(lines[0].debit)).toBe(150);
    // CR product revenue 100 carrying the product dim
    const productLeg = lines.find((l) => l.accountCode === PRODUCT_REVENUE);
    expect(productLeg, "JE must credit the product's mapped revenue account").toBeTruthy();
    expect(Number(productLeg!.credit)).toBe(100);
    expect(Number(productLeg!.productId)).toBe(productId);
    // CR generic revenue 50 (engine-resolved, postable — not the 4000 header)
    const genericLeg = lines.find((l) => l.accountCode === genericRevenue && Number(l.credit) === 50);
    expect(genericLeg).toBeTruthy();
    // balanced
    const [sums] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [je.id]);
    expect(Number(sums.d)).toBe(150);
    expect(Number(sums.c)).toBe(150);

    const [inv] = await rawQuery<{ status: string }>(`SELECT status FROM invoices WHERE id=$1`, [invoiceId]);
    expect(inv.status).toBe("approved");
  });
});
