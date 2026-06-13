// CI Guard — Issue #2197
// مسار العمرة: استيراد مشتريات دون وكيل لا يوقف النظام،
// بل يفتح حساباً تحليلياً مؤقتاً needsLinking.
//
// Activates only against the live test DB.

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

d("Umrah analytic account — auto-create when agent missing (Issue #2197)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let rawQuery:   typeof import("../../src/lib/rawdb.js").rawQuery;
  let resolveAnalyticAccount: typeof import("../../src/lib/gl/analytic-accounts.js").resolveAnalyticAccount;
  let linkAnalyticAccount:    typeof import("../../src/lib/gl/analytic-accounts.js").linkAnalyticAccount;

  const createdIds: number[] = [];

  beforeAll(async () => {
    const rdb  = await import("../../src/lib/rawdb.js");
    rawExecute = rdb.rawExecute;
    rawQuery   = rdb.rawQuery;
    const aa   = await import("../../src/lib/gl/analytic-accounts.js");
    resolveAnalyticAccount = aa.resolveAnalyticAccount;
    linkAnalyticAccount    = aa.linkAnalyticAccount;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await rawExecute(
        `DELETE FROM analytic_accounts WHERE id = ANY($1::int[])`,
        [createdIds]
      );
    }
  });

  it("creates a needs_linking analytic account when no partyId given", async () => {
    const acc = await resolveAnalyticAccount({
      dims: {
        companyId:    COMPANY,
        sourceModule: "umrah",
        serviceType:  "visa",
        seasonId:     1447,
        // partyId intentionally omitted — simulating import without agent
      },
      label: "نسك / مشتريات تأشيرات / موسم 1447 / غير مصنف",
      createdBy: 1,
    });

    createdIds.push(acc.id);
    expect(acc.id).toBeGreaterThan(0);
    expect(acc.needsLinking).toBe(true);
    expect(acc.status).toBe("needs_linking");
    expect(acc.name).toContain("غير مصنف");
  });

  it("re-resolving with same dims returns the same account (no duplicate)", async () => {
    const acc1 = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "umrah", serviceType: "visa", seasonId: 1447 },
    });
    const acc2 = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "umrah", serviceType: "visa", seasonId: 1447 },
    });
    expect(acc1.id).toBe(acc2.id);
  });

  it("linking the account clears needsLinking", async () => {
    const acc = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "umrah", serviceType: "visa", seasonId: 1447 },
    });
    createdIds.push(acc.id);

    await linkAnalyticAccount({
      analyticAccountId: acc.id,
      companyId: COMPANY,
      updatedBy: 1,
      reason: "ربط وكيل فرعي بعد استيراد الملف",
      updates: { partyId: 999, partyRole: "sub_agent", status: "active" },
    });

    const [updated] = await rawQuery<{ needsLinking: boolean; status: string }>(
      `SELECT "needsLinking", status FROM analytic_accounts WHERE id = $1`, [acc.id]
    );
    expect(updated.needsLinking).toBe(false);
    expect(updated.status).toBe("active");
  });

  it("classification center summary includes needs_linking count", async () => {
    const { getClassificationCenterSummary } = await import("../../src/lib/gl/analytic-accounts.js");
    const summary = await getClassificationCenterSummary(COMPANY);
    expect(typeof summary.needsLinkingCount).toBe("number");
    expect(typeof summary.postingFailuresUnresolved).toBe("number");
    expect(Array.isArray(summary.analyticNeedsLinking)).toBe(true);
  });
});

// ── Custody guard: employee in multiple branches uses analytic dims, not GL dupe ──

d("Custody analytic — one employee in multiple branches (Issue #2197)", () => {
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let resolveAnalyticAccount: typeof import("../../src/lib/gl/analytic-accounts.js").resolveAnalyticAccount;

  const createdIds: number[] = [];

  beforeAll(async () => {
    rawExecute = (await import("../../src/lib/rawdb.js")).rawExecute;
    resolveAnalyticAccount = (await import("../../src/lib/gl/analytic-accounts.js")).resolveAnalyticAccount;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await rawExecute(`DELETE FROM analytic_accounts WHERE id = ANY($1::int[])`, [createdIds]);
    }
  });

  it("creates separate analytic accounts per branch for the same employee — no GL duplication", async () => {
    const emp = 42; // synthetic employee id

    const accBranch1 = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "custody", employeeId: emp, branchId: 1 },
    });
    const accBranch2 = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "custody", employeeId: emp, branchId: 2 },
    });

    createdIds.push(accBranch1.id, accBranch2.id);

    // Different branches → different analytic accounts
    expect(accBranch1.id).not.toBe(accBranch2.id);

    // Both active (employee is known — no needsLinking)
    expect(accBranch1.status).toBe("active");
    expect(accBranch2.status).toBe("active");
    expect(accBranch1.needsLinking).toBe(false);
    expect(accBranch2.needsLinking).toBe(false);
  });

  it("same dims returns same analytic account (no duplicate per re-call)", async () => {
    const emp = 43;
    const a = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "custody", employeeId: emp, branchId: 1 },
    });
    const b = await resolveAnalyticAccount({
      dims: { companyId: COMPANY, sourceModule: "custody", employeeId: emp, branchId: 1 },
    });
    createdIds.push(a.id);
    expect(a.id).toBe(b.id);
  });
});
