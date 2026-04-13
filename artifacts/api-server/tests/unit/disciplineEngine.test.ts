import { describe, it, expect } from "vitest";
import { parsePenaltyLabel } from "../../src/lib/disciplineEngine.js";

// Only the pure functions of disciplineEngine are covered here. `resolveArticle`,
// `resolvePenalty`, `countPriorOccurrences`, `getDailyWage`, `generateMemoNumber`
// and `ensureInquiryMemoForViolation` all hit the database and belong in the
// integration suite (blocked on the schema-baseline gap — see Phase 7 in
// docs/KNOWN_ISSUES.md).

describe("parsePenaltyLabel — empty/unknown inputs", () => {
  const wage = 300;

  it("returns zero for null / undefined / blank", () => {
    expect(parsePenaltyLabel(null, wage)).toEqual({
      amount: 0,
      warningOnly: false,
      termination: null,
    });
    expect(parsePenaltyLabel(undefined, wage)).toEqual({
      amount: 0,
      warningOnly: false,
      termination: null,
    });
    expect(parsePenaltyLabel("", wage)).toEqual({
      amount: 0,
      warningOnly: false,
      termination: null,
    });
    expect(parsePenaltyLabel("   ", wage)).toEqual({
      amount: 0,
      warningOnly: false,
      termination: null,
    });
  });

  it("treats a bare dash as 'no penalty' (regulation table uses '-' for empty tiers)", () => {
    expect(parsePenaltyLabel("-", wage)).toEqual({
      amount: 0,
      warningOnly: false,
      termination: null,
    });
  });

  it("returns zero for totally unrecognised labels (prevents accidental deduction)", () => {
    const result = parsePenaltyLabel("نص غير معروف ليس له معنى", wage);
    expect(result).toEqual({ amount: 0, warningOnly: false, termination: null });
  });
});

describe("parsePenaltyLabel — warning / non-monetary penalties", () => {
  const wage = 300;

  it("recognises written warning (إنذار كتابي) as warningOnly + zero amount", () => {
    const r = parsePenaltyLabel("إنذار كتابي", wage);
    expect(r.amount).toBe(0);
    expect(r.warningOnly).toBe(true);
    expect(r.termination).toBeNull();
  });

  it("recognises verbal warning (إنذار شفهي) as warningOnly", () => {
    const r = parsePenaltyLabel("إنذار شفهي", wage);
    expect(r.warningOnly).toBe(true);
    expect(r.amount).toBe(0);
  });

  it("treats denial-of-promotion as an administrative (non-monetary) penalty", () => {
    const r = parsePenaltyLabel("الحرمان من الترقيات لمدة سنة", wage);
    expect(r.amount).toBe(0);
    expect(r.warningOnly).toBe(false);
    expect(r.termination).toBeNull();
  });
});

describe("parsePenaltyLabel — termination variants", () => {
  const wage = 300;

  it("recognises termination with benefits (فصل مع المكافأة)", () => {
    const r = parsePenaltyLabel("الفصل مع المكافأة", wage);
    expect(r.termination).toBe("with_benefits");
    expect(r.amount).toBe(0);
    expect(r.warningOnly).toBe(false);
  });

  it("recognises termination without benefits (فصل بدون مكافأة)", () => {
    const r = parsePenaltyLabel("الفصل بدون مكافأة ومن دون إشعار", wage);
    expect(r.termination).toBe("without_benefits");
    expect(r.amount).toBe(0);
  });

  it("recognises termination without benefits with alternative phrasing (دون مكافأة)", () => {
    const r = parsePenaltyLabel("فصل دون مكافأة", wage);
    expect(r.termination).toBe("without_benefits");
  });

  it("defaults bare 'فصل' to termination with benefits (safer side)", () => {
    const r = parsePenaltyLabel("الفصل من الخدمة", wage);
    expect(r.termination).toBe("with_benefits");
  });
});

describe("parsePenaltyLabel — percentage deductions", () => {
  const wage = 300;

  it("5% of the daily wage = 15", () => {
    const r = parsePenaltyLabel("5%", wage);
    expect(r.amount).toBe(15);
    expect(r.warningOnly).toBe(false);
    expect(r.termination).toBeNull();
  });

  it("10% with Arabic text around the number", () => {
    const r = parsePenaltyLabel("خصم 10% من الأجر اليومي", wage);
    expect(r.amount).toBe(30);
  });

  it("25% of the daily wage = 75", () => {
    const r = parsePenaltyLabel("25%", wage);
    expect(r.amount).toBe(75);
  });

  it("50% of the daily wage = 150", () => {
    const r = parsePenaltyLabel("خصم 50%", wage);
    expect(r.amount).toBe(150);
  });

  it("clamps percentages >100 to 100 (i.e. a full day)", () => {
    const r = parsePenaltyLabel("200%", wage);
    expect(r.amount).toBe(300);
  });

  it("rounds to 2dp", () => {
    // 33% of 100 = 33 — exactly, no rounding needed
    expect(parsePenaltyLabel("33%", 100).amount).toBe(33);
    // 33% of 123.45 = 40.7385 → 40.74
    expect(parsePenaltyLabel("33%", 123.45).amount).toBeCloseTo(40.74, 2);
  });
});

describe("parsePenaltyLabel — day-based deductions", () => {
  const wage = 300;

  it("'يوم' = one day's wage", () => {
    expect(parsePenaltyLabel("أجر يوم", wage).amount).toBe(300);
  });

  it("'يومان' = two days' wage", () => {
    expect(parsePenaltyLabel("أجر يومان", wage).amount).toBe(600);
  });

  it("'يومين' (dual accusative) = two days' wage", () => {
    expect(parsePenaltyLabel("أجر يومين", wage).amount).toBe(600);
  });

  it("'ثلاثة أيام' = three days' wage", () => {
    expect(parsePenaltyLabel("أجر ثلاثة أيام", wage).amount).toBe(900);
  });

  it("recognises Arabic numerals for day count ('٥ أيام')", () => {
    expect(parsePenaltyLabel("أجر ٥ أيام", wage).amount).toBe(1500);
  });

  it("recognises Western numerals for day count ('5 أيام')", () => {
    expect(parsePenaltyLabel("أجر 5 أيام", wage).amount).toBe(1500);
  });

  it("'أربعة أيام' = four days' wage", () => {
    expect(parsePenaltyLabel("أجر أربعة أيام", wage).amount).toBe(1200);
  });
});

describe("parsePenaltyLabel — wage-guard behaviour", () => {
  it("returns zero amount when wage is zero (no deduction against an unknown wage)", () => {
    expect(parsePenaltyLabel("5%", 0).amount).toBe(0);
    expect(parsePenaltyLabel("يوم", 0).amount).toBe(0);
  });

  it("returns zero amount when wage is negative (defensive)", () => {
    expect(parsePenaltyLabel("5%", -100).amount).toBe(0);
    expect(parsePenaltyLabel("يومين", -100).amount).toBe(0);
  });

  it("returns zero amount when wage is NaN / Infinity", () => {
    expect(parsePenaltyLabel("5%", NaN).amount).toBe(0);
    expect(parsePenaltyLabel("5%", Infinity).amount).toBe(0);
  });

  it("warningOnly result is unaffected by wage value", () => {
    expect(parsePenaltyLabel("إنذار كتابي", 0).warningOnly).toBe(true);
    expect(parsePenaltyLabel("إنذار كتابي", NaN).warningOnly).toBe(true);
  });

  it("termination result is unaffected by wage value", () => {
    expect(parsePenaltyLabel("فصل مع المكافأة", 0).termination).toBe("with_benefits");
    expect(parsePenaltyLabel("فصل بدون مكافأة", NaN).termination).toBe("without_benefits");
  });
});

describe("parsePenaltyLabel — ordering of rules (termination beats percentage)", () => {
  it("a label containing both 'فصل' and a percentage prefers termination", () => {
    // Real regulations don't combine these, but we want deterministic behaviour.
    const r = parsePenaltyLabel("الفصل مع خصم 10%", 300);
    expect(r.termination).toBe("with_benefits");
    expect(r.amount).toBe(0);
  });

  it("a label containing both 'إنذار' and a percentage prefers warning", () => {
    const r = parsePenaltyLabel("إنذار مع خصم 5%", 300);
    expect(r.warningOnly).toBe(true);
    expect(r.amount).toBe(0);
  });
});
