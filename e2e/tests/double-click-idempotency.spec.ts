// Task #244 — double-click submit on finance/umrah/payroll writes ONE DB row.
//
// Survives a freshly-seeded app: each test that needs a pre-existing target
// row (unpaid invoice, pending umrah penalty) self-skips when none is present
// instead of hard-failing, so a clean DB never produces a false red. The
// payroll test self-seeds its own period, so it always runs.

import { test, expect, type Page, request as pwRequest } from "@playwright/test";
import { pool, countRows, closeDb } from "./_helpers/db";
import { login } from "./_helpers/login";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:80";

let appReachable = false;

test.beforeAll(async () => {
  // Self-skip when the frontend isn't booted (lets guard.sh always
  // invoke the spec; runs for real in any CI lane that has the app up).
  try {
    const ctx = await pwRequest.newContext();
    const r = await ctx.get(BASE_URL, { timeout: 3_000 });
    appReachable = r.ok() || r.status() === 401 || r.status() === 302;
    await ctx.dispose();
  } catch {
    appReachable = false;
  }
});

test.afterAll(async () => {
  await closeDb();
});

function captureKeys(page: Page, pathRe: RegExp): string[] {
  const out: string[] = [];
  page.on("request", (req) => {
    const m = req.method();
    if ((m === "POST" || m === "PATCH") && pathRe.test(req.url())) {
      const k = req.headers()["idempotency-key"];
      if (k) out.push(k);
    }
  });
  return out;
}

async function doubleClick(submit: ReturnType<Page["getByRole"]>): Promise<void> {
  await Promise.all([submit.click(), submit.click().catch(() => undefined)]);
}

test.describe("Double-click submit → exactly ONE DB row", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!appReachable, `frontend unreachable at ${BASE_URL} — boot the app to enforce this guard`);
    await login(page);
  });

  test("/finance/invoices/:id payment dialog writes ONE invoice_payments row", async ({
    page,
  }) => {
    const target = await pool.query<{ id: number }>(
      `SELECT id FROM invoices
         WHERE "deletedAt" IS NULL
           AND COALESCE("paidAmount", 0) < COALESCE(total, 0)
         ORDER BY id DESC LIMIT 1`
    );
    // Freshly-seeded app may have no business data. The idempotency guard
    // needs a real target row to exercise the double-click; when none exists
    // we skip rather than hard-fail (a clean DB must not produce a false red).
    test.skip(
      (target.rowCount ?? 0) === 0,
      "no unpaid invoice present — the double-click idempotency check needs a seeded target row",
    );
    const invoiceId = target.rows[0].id;
    await page.goto(`/finance/invoices/${invoiceId}`);

    const before = await countRows(
      `SELECT COUNT(*)::text AS c FROM invoice_payments
         WHERE "invoiceId" = $1 AND "deletedAt" IS NULL`,
      [invoiceId]
    );

    await page
      .getByRole("button", { name: /تسجيل دفعة|سداد|دفع|payment/i })
      .first()
      .click();
    const amount = page.getByLabel(/المبلغ|amount/i).first();
    await amount.waitFor({ state: "visible", timeout: 5_000 });
    await amount.fill("1");

    const keys = captureKeys(page, /\/invoices\/\d+\/payment/);
    const submit = page
      .getByRole("button", { name: /حفظ|تأكيد|save|submit/i })
      .last();
    await doubleClick(submit);
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    expect(keys.length).toBeGreaterThanOrEqual(1);
    if (keys.length >= 2) expect(keys[0]).toBe(keys[1]);

    const after = await countRows(
      `SELECT COUNT(*)::text AS c FROM invoice_payments
         WHERE "invoiceId" = $1 AND "deletedAt" IS NULL`,
      [invoiceId]
    );
    expect(after - before).toBe(1);
  });

  test("/umrah/penalties single waive flips ONE umrah_penalties row", async ({
    page,
  }) => {
    const targetRow = await pool.query<{ id: number }>(
      `SELECT id FROM umrah_penalties
         WHERE status = 'pending' AND "deletedAt" IS NULL
         ORDER BY id DESC LIMIT 1`
    );
    test.skip(
      (targetRow.rowCount ?? 0) === 0,
      "no pending umrah penalty present — the single-waive idempotency check needs a seeded target row",
    );
    const targetId = targetRow.rows[0].id;

    await page.goto("/umrah/penalties");

    const row = page.locator(`tr[data-row-id="${targetId}"]`);
    await row.waitFor({ state: "visible", timeout: 10_000 });
    await row.getByRole("button", { name: /^إعفاء$|^waive$/i }).click();
    await page.getByLabel(/السبب|reason/i).fill("اختبار النقر المزدوج");

    const keys = captureKeys(page, /\/penalties\/\d+\/waive$/);
    const submit = page.getByRole("button", { name: /تأكيد|confirm|حفظ/i }).last();
    await doubleClick(submit);
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    expect(keys.length).toBeGreaterThanOrEqual(1);
    if (keys.length >= 2) expect(keys[0]).toBe(keys[1]);

    const flipped = await pool.query<{ status: string }>(
      `SELECT status FROM umrah_penalties WHERE id = $1`,
      [targetId]
    );
    expect(flipped.rowCount).toBe(1);
    expect(flipped.rows[0].status).toBe("waived");

    // Duplicate-write proof: the captured key persists exactly once in
    // idempotency_keys (0 = middleware removed; 2 = key re-minted per click).
    const captured = keys[0];
    const idemRows = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM idempotency_keys
         WHERE method = 'PATCH' AND path = $1 AND key = $2`,
      [`/api/umrah/penalties/${targetId}/waive`, captured]
    );
    expect(Number(idemRows.rows[0].c)).toBe(1);
  });

  test("/umrah/penalties bulk waive flips exactly N rows for N selected", async ({
    page,
  }) => {
    const targets = await pool.query<{ id: number }>(
      `SELECT id FROM umrah_penalties
         WHERE status = 'pending' AND "deletedAt" IS NULL
         ORDER BY id DESC LIMIT 2`
    );
    const targetIds = targets.rows.map((r) => r.id);
    const n = targetIds.length;
    test.skip(
      n === 0,
      "no pending umrah penalty present — the bulk-waive idempotency check needs seeded target rows",
    );

    await page.goto("/umrah/penalties");

    for (const id of targetIds) {
      await page
        .locator(`tr[data-row-id="${id}"]`)
        .getByRole("checkbox")
        .check();
    }
    await page
      .getByRole("button", { name: /إعفاء جماعي|bulk waive|إعفاء/i })
      .first()
      .click();
    await page.getByLabel(/السبب|reason/i).fill("اختبار جماعي");

    const keys = captureKeys(page, /\/penalties\/waive-bulk$/);
    const submit = page.getByRole("button", { name: /تأكيد|confirm|حفظ/i }).last();
    await doubleClick(submit);
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    expect(keys.length).toBeGreaterThanOrEqual(1);
    if (keys.length >= 2) expect(keys[0]).toBe(keys[1]);

    const flipped = await pool.query<{ id: number }>(
      `SELECT id FROM umrah_penalties
         WHERE id = ANY($1::int[]) AND status = 'waived'`,
      [targetIds]
    );
    expect(flipped.rowCount).toBe(n);

    const captured = keys[0];
    const idemRows = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM idempotency_keys
         WHERE method = 'POST'
           AND path = '/api/umrah/penalties/waive-bulk'
           AND key = $1`,
      [captured]
    );
    expect(Number(idemRows.rows[0].c)).toBe(1);

    const evt = await pool
      .query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM event_logs
          WHERE entity = 'umrah_penalties'
            AND "entityId" = ANY($1::text[])
            AND action LIKE 'umrah.penalty.waive%'
          GROUP BY "entityId"`,
        [targetIds.map(String)]
      )
      .catch(() => ({ rows: [] as { c: string }[] }));
    for (const r of evt.rows) {
      expect(Number(r.c)).toBe(1);
    }
  });

  test("/hr/payroll/create creates ONE payroll_runs row for the period", async ({
    page,
  }) => {
    const period = process.env.E2E_PAYROLL_MONTH ?? "2099-12";

    await pool.query(
      `DELETE FROM payroll_runs WHERE period = $1 AND "deletedAt" IS NULL`,
      [period]
    );

    await page.goto("/hr/payroll/create");
    const monthInput = page.getByLabel(/الشهر|month|الفترة/i).first();
    if ((await monthInput.count()) > 0) await monthInput.fill(period);

    const keys = captureKeys(page, /\/api\/hr\/payroll\b/);
    const submit = page
      .getByRole("button", { name: /تشغيل|إنشاء|run|create|حفظ/i })
      .last();
    await doubleClick(submit);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    expect(keys.length).toBeGreaterThanOrEqual(1);
    if (keys.length >= 2) expect(keys[0]).toBe(keys[1]);

    const created = await countRows(
      `SELECT COUNT(*)::text AS c FROM payroll_runs
         WHERE period = $1 AND "deletedAt" IS NULL`,
      [period]
    );
    expect(created).toBe(1);
  });
});
