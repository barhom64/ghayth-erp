// CI Guard — Issue #2197
// "منع الترحيل على الحسابات الرئيسية في كامل النظام"
//
// These tests verify the core invariants that prevent parent/grouping accounts
// from ever being used in a journal entry, and that resolveByIntent /
// getAccountCodeFromMapping never silently return a non-postable code.
//
// Activates only against the live test DB (same pattern as postingEnginePins).

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Al-Diyaa (seeded contracting company — has a full posting-enabled chart)
const COMPANY = 2;
const BRANCH  = 2;
const BY      = 2;
const LEAF_CASH   = "1111";  // الصندوق الرئيسي — postable
const LEAF_CASH2  = "1112";  // صناديق فرعية  — postable
const PARENT_1100 = "1100";  // الأصول المتداولة — grouping, NOT postable
const PARENT_1000 = "1000";  // الأصول           — grouping, NOT postable
const REF_PRE     = "ci-guard-2197-";

d("CI Guard #2197 — parent-account posting prevention", () => {
  let rawQuery:    typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute:  typeof import("../../src/lib/rawdb.js").rawExecute;
  let createJournalEntry: typeof import("../../src/lib/businessHelpers.js").createJournalEntry;
  let assertPostableAccount: typeof import("../../src/lib/businessHelpers.js").assertPostableAccount;
  let getAccountCodeFromMapping: typeof import("../../src/lib/businessHelpers.js").getAccountCodeFromMapping;
  let preflightAccountCodes: typeof import("../../src/lib/businessHelpers.js").preflightAccountCodes;

  beforeAll(async () => {
    const rdb = await import("../../src/lib/rawdb.js");
    rawQuery   = rdb.rawQuery;
    rawExecute = rdb.rawExecute;
    const h = await import("../../src/lib/businessHelpers.js");
    createJournalEntry       = h.createJournalEntry;
    assertPostableAccount    = h.assertPostableAccount;
    getAccountCodeFromMapping = h.getAccountCodeFromMapping;
    preflightAccountCodes    = h.preflightAccountCodes;
  });

  async function cleanup() {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2)`,
      [COMPANY, REF_PRE + "%"]
    );
    await rawExecute(
      `DELETE FROM journal_entries WHERE "companyId"=$1 AND ref LIKE $2`,
      [COMPANY, REF_PRE + "%"]
    );
  }
  afterEach(cleanup);
  afterAll(cleanup);

  // ── createJournalEntry guards ─────────────────────────────────────────────

  it("createJournalEntry rejects a grouping account (allowPosting=false)", async () => {
    await expect(
      createJournalEntry({
        companyId: COMPANY, branchId: BRANCH, createdBy: BY,
        ref: REF_PRE + "parent-dr",
        description: "CI guard: post on parent",
        sourceKey: REF_PRE + "parent-dr",
        lines: [
          { accountCode: PARENT_1100, debit: 100, credit: 0 },
          { accountCode: LEAF_CASH2,  debit: 0,   credit: 100 },
        ],
      })
    ).rejects.toThrow(/تجميعي|رئيسي|allowPosting|postable/i);
  });

  it("createJournalEntry rejects even a top-level parent account", async () => {
    await expect(
      createJournalEntry({
        companyId: COMPANY, branchId: BRANCH, createdBy: BY,
        ref: REF_PRE + "top-parent",
        description: "CI guard: top-level parent",
        sourceKey: REF_PRE + "top-parent",
        lines: [
          { accountCode: PARENT_1000, debit: 200, credit: 0 },
          { accountCode: LEAF_CASH,   debit: 0,   credit: 200 },
        ],
      })
    ).rejects.toThrow(/تجميعي|رئيسي|allowPosting|postable/i);
  });

  it("createJournalEntry succeeds with two leaf accounts", async () => {
    const id = await createJournalEntry({
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      ref: REF_PRE + "leaf-ok",
      description: "CI guard: leaf OK",
      sourceKey: REF_PRE + "leaf-ok",
      lines: [
        { accountCode: LEAF_CASH,  debit: 50, credit: 0 },
        { accountCode: LEAF_CASH2, debit: 0,  credit: 50 },
      ],
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  // ── assertPostableAccount ─────────────────────────────────────────────────

  it("assertPostableAccount passes on a leaf account", async () => {
    await expect(assertPostableAccount(COMPANY, LEAF_CASH)).resolves.toBeUndefined();
  });

  it("assertPostableAccount throws on a grouping account", async () => {
    await expect(assertPostableAccount(COMPANY, PARENT_1100)).rejects.toThrow(
      /تجميعي|رئيسي|allowPosting/i
    );
  });

  it("assertPostableAccount throws with empty code", async () => {
    await expect(assertPostableAccount(COMPANY, "")).rejects.toThrow(/لم يُحدَّد|لم يُعثر/i);
  });

  it("assertPostableAccount throws on a non-existent code", async () => {
    // 2026-06-15: "9999" was the old "definitely absent" sentinel, but
    // the company COA now seeds 9999 (فروقات التقريب / Rounding
    // Differences) as a real postable account — in BOTH the production
    // DEFAULT_CHART_OF_ACCOUNTS and the Al-Diyaa seed. Use a code that
    // genuinely doesn't exist anywhere in the chart.
    await expect(assertPostableAccount(COMPANY, "8888")).rejects.toThrow(/غير موجود/i);
  });

  // ── preflightAccountCodes ─────────────────────────────────────────────────

  it("preflightAccountCodes passes on an array of leaf codes", async () => {
    await expect(preflightAccountCodes(COMPANY, [LEAF_CASH, LEAF_CASH2])).resolves.toBeUndefined();
  });

  it("preflightAccountCodes fails when one code is a grouping account", async () => {
    await expect(
      preflightAccountCodes(COMPANY, [LEAF_CASH, PARENT_1100])
    ).rejects.toThrow(/تجميعي|رئيسي/i);
  });

  // ── getAccountCodeFromMapping — mapping pointing at parent → explicit config error ──

  it("getAccountCodeFromMapping: a mapping that points at a non-postable debitAccountId raises a clear config ValidationError — NOT a silent fallback", async () => {
    const [parentRow] = await rawQuery<{ id: number }>(
      `SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [COMPANY, PARENT_1100]
    );
    expect(parentRow).toBeDefined();

    const [badMapping] = await rawQuery<{ id: number }>(
      // operationLabel is NOT NULL on accounting_mappings — supply it
      // (the test predates the constraint).
      `INSERT INTO accounting_mappings ("companyId","operationType","operationLabel","debitAccountId","creditAccountId","isActive")
       VALUES ($1,'ci_guard_bad_debit_2197','CI guard bad-debit #2197',$2,(SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code=$3 AND "deletedAt" IS NULL LIMIT 1),true)
       RETURNING id`,
      [COMPANY, parentRow.id, LEAF_CASH2]
    );

    try {
      // Must THROW a ValidationError mentioning "تجميعي" or "إعداد" or "parent"
      // — NOT silently fall back to another account.
      await expect(
        getAccountCodeFromMapping(COMPANY, "ci_guard_bad_debit_2197", "debit", LEAF_CASH)
      ).rejects.toThrow(/تجميعي|إعداد|رئيسي|non-postable|parent/i);
    } finally {
      await rawExecute(`DELETE FROM accounting_mappings WHERE id=$1`, [badMapping.id]);
    }
  });

  it("getAccountCodeFromMapping: a mapping pointing at a non-postable creditAccountId raises a clear config error", async () => {
    const [parentRow] = await rawQuery<{ id: number }>(
      `SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [COMPANY, PARENT_1100]
    );

    const [badMapping] = await rawQuery<{ id: number }>(
      // operationLabel is NOT NULL on accounting_mappings — supply it.
      `INSERT INTO accounting_mappings ("companyId","operationType","operationLabel","debitAccountId","creditAccountId","isActive")
       VALUES ($1,'ci_guard_bad_credit_2197','CI guard bad-credit #2197',(SELECT id FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL LIMIT 1),$3,true)
       RETURNING id`,
      [COMPANY, LEAF_CASH, parentRow.id]
    );

    try {
      await expect(
        getAccountCodeFromMapping(COMPANY, "ci_guard_bad_credit_2197", "credit", LEAF_CASH2)
      ).rejects.toThrow(/تجميعي|إعداد|رئيسي|non-postable|parent/i);
    } finally {
      await rawExecute(`DELETE FROM accounting_mappings WHERE id=$1`, [badMapping.id]);
    }
  });
});

// ── Static guards: no parent-account fallback codes in seed/bootstrap ─────────
// These run without a DB so they are always active.

describe("CI Guard #2197 — static: no non-postable fallback codes in MAPPING_INTENT", () => {
  // MAPPING_INTENT is a pure data structure — we import it directly.
  // We only verify that every entry has a type AND keywords (non-empty).
  // We cannot verify allowPosting without a DB; that's the dynamic test's job.
  it("MAPPING_INTENT has non-empty type and keywords for all entries", async () => {
    const { MAPPING_INTENT } = await import("../../src/lib/businessHelpers.js");
    const bad: string[] = [];
    for (const [op, intent] of Object.entries(MAPPING_INTENT as Record<string, { type: string; keywords: string[] }>)) {
      if (!intent.type || intent.keywords.length === 0) {
        bad.push(op);
      }
    }
    expect(bad, `MAPPING_INTENT entries with missing type/keywords: ${bad.join(", ")}`).toHaveLength(0);
  });
});

describe("CI Guard #2197 — static: posting_config_requirements exists as a concept", () => {
  it("assertPostableAccount is exported from businessHelpers", async () => {
    const h = await import("../../src/lib/businessHelpers.js");
    expect(typeof h.assertPostableAccount).toBe("function");
  });

  it("preflightAccountCodes is exported from businessHelpers", async () => {
    const h = await import("../../src/lib/businessHelpers.js");
    expect(typeof h.preflightAccountCodes).toBe("function");
  });
});
