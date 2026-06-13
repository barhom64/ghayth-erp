// CI Guard #2197 — STATIC (no DB needed, always runs)
//
// These tests verify at import-time that the structural guarantees of
// Issue #2197 are in place:
//
//  1. assertPostableAccount is exported and is a function.
//  2. JournalEntryLine.analyticAccountId exists in the type (checked via
//     the compiled JS default — no DB needed).
//  3. MAPPING_INTENT has non-empty type + keywords for every entry.
//  4. The INSERT in createJournalEntry includes "analyticAccountId"
//     (checked via source-text grep of the compiled module).
//  5. resolveByIntent (via getAccountCodeFromMapping) does NOT fall back
//     silently — verified by checking that the source text no longer
//     contains the old "return fallbackCode" without a prior throw.
//
// None of these tests hit the database. They are always-on guards that
// fire in every CI environment with or without DATABASE_URL.

import { describe, it, expect } from "vitest";

describe("CI Guard #2197 — static structural guarantees", () => {

  it("assertPostableAccount is exported from businessHelpers as a function", async () => {
    const h = await import("../../src/lib/businessHelpers.js");
    expect(typeof h.assertPostableAccount).toBe("function");
  });

  it("preflightAccountCodes is exported from businessHelpers as a function", async () => {
    const h = await import("../../src/lib/businessHelpers.js");
    expect(typeof h.preflightAccountCodes).toBe("function");
  });

  it("getAccountCodeFromMapping is exported from businessHelpers as a function", async () => {
    const h = await import("../../src/lib/businessHelpers.js");
    expect(typeof h.getAccountCodeFromMapping).toBe("function");
  });

  it("resolveAnalyticAccount is exported from gl/analytic-accounts as a function", async () => {
    const aa = await import("../../src/lib/gl/analytic-accounts.js");
    expect(typeof aa.resolveAnalyticAccount).toBe("function");
    expect(typeof aa.linkAnalyticAccount).toBe("function");
    expect(typeof aa.getClassificationCenterSummary).toBe("function");
  });

  it("MAPPING_INTENT has non-empty type and keywords for every entry", async () => {
    const { MAPPING_INTENT } = await import("../../src/lib/businessHelpers.js");
    const bad: string[] = [];
    for (const [op, intent] of Object.entries(
      MAPPING_INTENT as Record<string, { type: string; keywords: string[] }>
    )) {
      if (!intent?.type || !Array.isArray(intent.keywords) || intent.keywords.length === 0) {
        bad.push(op);
      }
    }
    expect(
      bad,
      `MAPPING_INTENT entries missing type or keywords: ${bad.join(", ")}`
    ).toHaveLength(0);
  });

  it("JournalEntryLine interface includes analyticAccountId field (reflected in default value)", async () => {
    // We can't inspect TypeScript interfaces at runtime, but we can
    // verify the INSERT SQL in the compiled module includes the column.
    // Import the module as text and check the INSERT statement.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/businessHelpers.ts"),
      "utf8"
    );
    // The analyticAccountId field should appear in:
    //  1. The JournalEntryLine interface definition
    //  2. The INSERT INTO journal_lines column list
    expect(src).toContain("analyticAccountId");
    expect(src).toContain('"analyticAccountId"');
  });

  it("createJournalEntry INSERT includes analyticAccountId in the column list", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/businessHelpers.ts"),
      "utf8"
    );
    // The INSERT INTO journal_lines must include analyticAccountId
    const insertBlock = src.slice(src.indexOf("INSERT INTO journal_lines"));
    expect(insertBlock).toContain('"analyticAccountId"');
  });

  it("posting.ts INSERT includes analyticAccountId in the column list", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/gl/posting.ts"),
      "utf8"
    );
    expect(src).toContain('"analyticAccountId"');
  });

  it("financialEngine.resolveAccountCode calls assertPostableAccount after resolve", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/engines/financialEngine.ts"),
      "utf8"
    );
    // Both the import and the call must be present
    expect(src).toContain("assertPostableAccount");
    // Must be called inside resolveAccountCode (not just imported)
    const resolveBlock = src.slice(src.indexOf("async resolveAccountCode("));
    expect(resolveBlock).toContain("assertPostableAccount");
  });

  it("resolveByIntent no longer has a raw 'return fallbackCode' as last resort without throw", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/businessHelpers.ts"),
      "utf8"
    );
    // Extract the resolveByIntent function body
    const fnStart = src.indexOf("async function resolveByIntent(");
    const fnEnd = src.indexOf("\nasync function ", fnStart + 1);
    const fnBody = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

    // The function must NOT end with a bare "return fallbackCode" (the old unsafe path).
    // It must throw instead. We check the last meaningful statement is a throw.
    // Simple heuristic: the last "return" that returns fallbackCode should be gone,
    // replaced by a throw.
    const lastReturn = fnBody.lastIndexOf("return fallbackCode");
    const lastThrow  = fnBody.lastIndexOf("throw new ValidationError");
    expect(
      lastThrow,
      "resolveByIntent must throw ValidationError as last resort — not return unverified fallbackCode"
    ).toBeGreaterThan(-1);
    // If both exist, throw must come AFTER the last return (i.e. throw IS the last resort)
    if (lastReturn > -1) {
      expect(lastThrow).toBeGreaterThan(lastReturn);
    }
  });

  it("getAccountCodeFromMapping raises explicit error when mapping points at non-postable account", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/businessHelpers.ts"),
      "utf8"
    );
    // The mapping-exists-but-non-postable guard must be present in the source
    expect(src).toContain("debitAllows");
    expect(src).toContain("creditAllows");
    expect(src).toContain("حساب تجميعي/رئيسي أو محذوف");
  });
});
