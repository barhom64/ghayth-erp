/**
 * HR input validation — caps + trim behavior.
 *
 * Closes audit findings VAL-1, VAL-2, VAL-3, VAL-4: whitespace-only
 * strings used to pass min(1) checks; text fields had no max length;
 * loan amount and violation deduction had no upper bound.
 *
 * The helpers live in src/lib/hrValidation.ts. This suite exercises
 * them behaviorally — passes good inputs, expects clean rejection of
 * the failure cases the audit flagged. Static-grep tests are kept
 * separately in hrSecurityHardeningSmoke (where schema text appears in
 * the route source).
 */
import { describe, it, expect } from "vitest";
import {
  HR_TEXT_LIMITS,
  HR_MONEY_CAPS,
  trimmedRequired,
  trimmedOptional,
  moneyAmount,
  positiveMoneyAmount,
  SUPPORTED_NATIONALITIES,
} from "../../src/lib/hrValidation.js";

// ─── VAL-2: trimmedRequired rejects whitespace-only ────────────────────────

describe("trimmedRequired — VAL-2 (whitespace-only must fail)", () => {
  const schema = trimmedRequired("الحقل مطلوب");

  it("accepts a normal value", () => {
    expect(schema.parse("hello")).toBe("hello");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(schema.parse("  hi  ")).toBe("hi");
  });

  it("REJECTS whitespace-only (used to slip through)", () => {
    expect(() => schema.parse("   ")).toThrow(/الحقل مطلوب/);
    expect(() => schema.parse("\t\n")).toThrow(/الحقل مطلوب/);
  });

  it("REJECTS empty string", () => {
    expect(() => schema.parse("")).toThrow(/الحقل مطلوب/);
  });

  it("REJECTS values past the cap (default 2,000)", () => {
    expect(() => schema.parse("a".repeat(HR_TEXT_LIMITS.TEXT + 1))).toThrow();
  });

  it("custom max overrides the default cap", () => {
    const short = trimmedRequired("short", 10);
    expect(short.parse("ten chars!")).toBe("ten chars!");
    expect(() => short.parse("eleven chars!")).toThrow();
  });
});

// ─── trimmedOptional — null/empty becomes undefined ────────────────────────

describe("trimmedOptional", () => {
  const schema = trimmedOptional();

  it("accepts undefined and returns undefined", () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("collapses null to undefined (single 'missing' sentinel)", () => {
    expect(schema.parse(null)).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(schema.parse("  notes  ")).toBe("notes");
  });

  it("coerces whitespace-only to undefined", () => {
    expect(schema.parse("   ")).toBeUndefined();
  });

  it("rejects values past the cap", () => {
    expect(() => schema.parse("a".repeat(HR_TEXT_LIMITS.TEXT + 1))).toThrow();
  });
});

// ─── VAL-3 / VAL-4: money caps reject implausible amounts ──────────────────

describe("moneyAmount — VAL-3/VAL-4 (caps + non-negative)", () => {
  const schema = moneyAmount("الخصم", HR_MONEY_CAPS.DEDUCTION_MAX);

  it("accepts a normal deduction", () => {
    expect(schema.parse(500)).toBe(500);
  });

  it("accepts zero", () => {
    expect(schema.parse(0)).toBe(0);
  });

  it("REJECTS negative", () => {
    expect(() => schema.parse(-50)).toThrow(/يجب أن يكون رقمًا موجبًا/);
  });

  it("REJECTS over-cap (one extra zero typo)", () => {
    expect(() => schema.parse(HR_MONEY_CAPS.DEDUCTION_MAX + 1)).toThrow(
      /لا يمكن أن يتجاوز/,
    );
  });

  it("coerces numeric string", () => {
    expect(schema.parse("100")).toBe(100);
  });
});

describe("positiveMoneyAmount — VAL-3 (strictly > 0)", () => {
  const schema = positiveMoneyAmount("المبلغ", HR_MONEY_CAPS.LOAN_MAX);

  it("accepts a positive loan principal", () => {
    expect(schema.parse(50_000)).toBe(50_000);
  });

  it("REJECTS zero (a loan of 0 is meaningless)", () => {
    expect(() => schema.parse(0)).toThrow(/يجب أن يكون أكبر من صفر/);
  });

  it("REJECTS over LOAN_MAX (default 200k)", () => {
    expect(() => schema.parse(HR_MONEY_CAPS.LOAN_MAX + 1)).toThrow(
      /لا يمكن أن يتجاوز/,
    );
  });
});

// ─── VAL-1 — character bands match policy ──────────────────────────────────

describe("HR_TEXT_LIMITS — character bands", () => {
  it("SHORT < NAME < TEXT < LONG_TEXT", () => {
    expect(HR_TEXT_LIMITS.SHORT).toBeLessThan(HR_TEXT_LIMITS.NAME);
    expect(HR_TEXT_LIMITS.NAME).toBeLessThan(HR_TEXT_LIMITS.TEXT);
    expect(HR_TEXT_LIMITS.TEXT).toBeLessThan(HR_TEXT_LIMITS.LONG_TEXT);
  });

  it("LONG_TEXT caps the official-letter body at 10K (was unbounded)", () => {
    expect(HR_TEXT_LIMITS.LONG_TEXT).toBe(10_000);
  });
});

// ─── VAL-5 — nationality enum is non-empty + includes Saudi ────────────────

describe("SUPPORTED_NATIONALITIES — VAL-5 (Nitaqat needs a closed set)", () => {
  it("includes Saudi (SA) as the first entry", () => {
    expect(SUPPORTED_NATIONALITIES[0]).toBe("SA");
  });

  it("includes the full GCC set", () => {
    for (const cc of ["AE", "KW", "BH", "OM", "QA"]) {
      expect(SUPPORTED_NATIONALITIES).toContain(cc);
    }
  });

  it("has an OTHER fallback for new countries", () => {
    expect(SUPPORTED_NATIONALITIES).toContain("OTHER");
  });
});

// ─── Route schema integration — violation deduction cap is wired up ────────

describe("violationSchema uses the new moneyAmount() helper", () => {
  it("violation deduction cannot exceed HR_MONEY_CAPS.DEDUCTION_MAX", async () => {
    // Re-import is dynamic so the test doesn't need to mock express.
    const src = await import("node:fs").then((m) =>
      m.readFileSync(
        new URL(
          "../../src/routes/hr.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(src).toContain(
      'deduction: moneyAmount("قيمة الخصم", HR_MONEY_CAPS.DEDUCTION_MAX).optional()',
    );
  });
});
