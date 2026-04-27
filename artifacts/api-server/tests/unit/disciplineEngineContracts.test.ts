import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/disciplineEngine.ts"),
  "utf8"
);

// ─── Discipline Engine Contract Tests ──────────────────────────────────────
// Pure structural analysis of disciplineEngine.ts — validates penalty parsing,
// article resolution boundaries, occurrence counting, and idempotency patterns.

// ─── parsePenaltyLabel contracts ────────────────────────────────────────────

describe("parsePenaltyLabel day token contracts", () => {
  it("DAY_TOKENS maps يوم/يوماً/يوما to 1 day", () => {
    expect(ENGINE_SRC).toContain('"يوم": 1');
    expect(ENGINE_SRC).toContain('"يوماً": 1');
    expect(ENGINE_SRC).toContain('"يوما": 1');
  });

  it("DAY_TOKENS maps يومان/يومين to 2 days", () => {
    expect(ENGINE_SRC).toContain('"يومان": 2');
    expect(ENGINE_SRC).toContain('"يومين": 2');
  });

  it("DAY_TOKENS maps 3-day variants (Arabic text, Arabic numeral, Latin numeral)", () => {
    expect(ENGINE_SRC).toContain('"ثلاثة أيام": 3');
    expect(ENGINE_SRC).toContain('"٣ أيام": 3');
    expect(ENGINE_SRC).toContain('"3 أيام": 3');
  });

  it("DAY_TOKENS maps 4-day variants", () => {
    expect(ENGINE_SRC).toContain('"أربعة أيام": 4');
    expect(ENGINE_SRC).toContain('"٤ أيام": 4');
    expect(ENGINE_SRC).toContain('"4 أيام": 4');
  });

  it("DAY_TOKENS maps 5-day variants", () => {
    expect(ENGINE_SRC).toContain('"خمسة أيام": 5');
    expect(ENGINE_SRC).toContain('"٥ أيام": 5');
    expect(ENGINE_SRC).toContain('"5 أيام": 5');
  });

  it("DAY_TOKENS_SORTED sorts longest token first to prevent substring matching", () => {
    expect(ENGINE_SRC).toContain("b[0].length - a[0].length");
  });
});

describe("parsePenaltyLabel percentage handling", () => {
  it("matches percentage pattern with regex (\\d{1,3})\\s*%", () => {
    expect(ENGINE_SRC).toContain("(\\d{1,3})\\s*%");
  });

  it("clamps percentage to 0-100 range", () => {
    expect(ENGINE_SRC).toContain("Math.min(100, Math.max(0,");
  });

  it("multiplies safeWage by percentage / 100 and rounds to 2 decimals", () => {
    const idx = ENGINE_SRC.indexOf("pctMatch");
    const section = ENGINE_SRC.slice(idx, idx + 300);
    expect(section).toContain("safeWage * pct");
    expect(section).toContain("/ 100 * 100) / 100");
  });
});

describe("parsePenaltyLabel warning detection", () => {
  it("detects إنذار (warning) and returns warningOnly=true", () => {
    expect(ENGINE_SRC).toContain("/إنذار/.test(t)");
    const idx = ENGINE_SRC.indexOf("/إنذار/.test(t)");
    const section = ENGINE_SRC.slice(idx, idx + 200);
    expect(section).toContain("warningOnly: true");
  });
});

describe("parsePenaltyLabel termination detection", () => {
  it("detects فصل (termination) keyword", () => {
    expect(ENGINE_SRC).toContain("/فصل/.test(t)");
  });

  it("distinguishes without_benefits (بدون مكافأة/دون مكافأة)", () => {
    expect(ENGINE_SRC).toContain("بدون مكافأة|دون مكافأة");
    const idx = ENGINE_SRC.indexOf("بدون مكافأة|دون مكافأة");
    const section = ENGINE_SRC.slice(idx, idx + 200);
    expect(section).toContain('"without_benefits"');
  });

  it("defaults to with_benefits when فصل is present without بدون", () => {
    const idx = ENGINE_SRC.indexOf("/فصل/.test(t)");
    const section = ENGINE_SRC.slice(idx, idx + 400);
    expect(section).toContain('"with_benefits"');
  });
});

describe("parsePenaltyLabel administrative penalties", () => {
  it("detects حرمان من الترقيات/العلاوات as non-financial penalty", () => {
    expect(ENGINE_SRC).toContain("حرمان من الترقيات|حرمان من العلاوات");
  });

  it("returns amount: 0 for administrative penalties", () => {
    const idx = ENGINE_SRC.indexOf("حرمان من الترقيات|حرمان من العلاوات");
    const section = ENGINE_SRC.slice(idx, idx + 200);
    expect(section).toContain("amount: 0");
  });
});

describe("parsePenaltyLabel null/empty handling", () => {
  it("returns zeroed result for null/empty/dash labels", () => {
    const idx = ENGINE_SRC.indexOf("function parsePenaltyLabel");
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain('label.trim() === ""');
    expect(section).toContain('label.trim() === "-"');
    expect(section).toContain("amount: 0, warningOnly: false, termination: null");
  });

  it("protects dailyWage with Number.isFinite and > 0 check", () => {
    const idx = ENGINE_SRC.indexOf("function parsePenaltyLabel");
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain("Number.isFinite(dailyWage) && dailyWage > 0");
  });
});

// ─── resolveArticle contracts ──────────────────────────────────────────────

describe("resolveArticle late incident boundaries", () => {
  it("returns null for 0 or negative minutes", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "late"');
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain("if (mins <= 0) return null");
  });

  it("uses Math.max(0, Math.floor(...)) to sanitize durationMinutes", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "late"');
    const section = ENGINE_SRC.slice(idx, idx + 200);
    expect(section).toContain("Math.max(0, Math.floor(durationMinutes ?? 0))");
  });

  it("0-15 min: article 1 (normal) or 2 (disrupts others)", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "late"');
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain("if (mins <= 15)");
    expect(section).toContain("disrupts ? 2 : 1");
  });

  it("16-30 min: article 3 (normal) or 4 (disrupts)", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "late"');
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain("if (mins <= 30)");
    expect(section).toContain("disrupts ? 4 : 3");
  });

  it("31-60 min: article 5 (normal) or 6 (disrupts)", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "late"');
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain("if (mins <= 60)");
    expect(section).toContain("disrupts ? 6 : 5");
  });

  it("60+ min: article 7 (no disruption variant)", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "late"');
    const section = ENGINE_SRC.slice(idx, idx + 600);
    expect(section).toContain('"work_time", 7');
  });
});

describe("resolveArticle early_leave incident boundaries", () => {
  it("returns null for 0 or negative minutes", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "early_leave"');
    const section = ENGINE_SRC.slice(idx, idx + 300);
    expect(section).toContain("if (mins <= 0) return null");
  });

  it("0-15 min: article 8", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "early_leave"');
    const section = ENGINE_SRC.slice(idx, idx + 300);
    expect(section).toContain('"work_time", 8');
  });

  it("15+ min: article 9", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "early_leave"');
    const section = ENGINE_SRC.slice(idx, idx + 300);
    expect(section).toContain('"work_time", 9');
  });
});

describe("resolveArticle absence incident tiers", () => {
  it("returns null for 0 or negative days", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("if (days <= 0) return null");
  });

  it("defaults absenceDays to 1 when not provided", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 200);
    expect(section).toContain("absenceDays ?? 1");
  });

  it("1 day: article 11", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("days === 1");
    expect(section).toContain('"work_time", 11');
  });

  it("2-6 days: article 12", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("days <= 6");
    expect(section).toContain('"work_time", 12');
  });

  it("7-10 days: article 13", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("days <= 10");
    expect(section).toContain('"work_time", 13');
  });

  it("11-14 days: article 14", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain("days <= 14");
    expect(section).toContain('"work_time", 14');
  });

  it("15+ days: article 15", () => {
    const idx = ENGINE_SRC.indexOf('incidentType === "absence"');
    const section = ENGINE_SRC.slice(idx, idx + 500);
    expect(section).toContain('"work_time", 15');
  });
});

describe("resolveArticle custom regulation", () => {
  it("prioritizes customRegulationId over type-based resolution", () => {
    const idx = ENGINE_SRC.indexOf("function resolveArticle");
    const section = ENGINE_SRC.slice(idx, idx + 1500);
    const customIdx = section.indexOf("customRegulationId");
    const lateIdx = section.indexOf('"late"');
    expect(customIdx).toBeLessThan(lateIdx);
  });

  it("looks up custom regulation by id + companyId + not deleted", () => {
    const idx = ENGINE_SRC.indexOf("input.customRegulationId");
    const section = ENGINE_SRC.slice(idx, idx + 400);
    expect(section).toContain("WHERE id = $1");
    expect(section).toContain('"companyId" = $2');
    expect(section).toContain('"deletedAt" IS NULL');
  });
});

describe("resolveArticle non-mappable types", () => {
  it("returns null for gps_out_of_range, behavior, organization, custom without customRegulationId", () => {
    expect(ENGINE_SRC).toContain("// gps_out_of_range / behavior / organization / custom");
    const idx = ENGINE_SRC.indexOf("// gps_out_of_range / behavior / organization / custom");
    const section = ENGINE_SRC.slice(idx, idx + 200);
    expect(section).toContain("return null");
  });
});

// ─── countPriorOccurrences contracts ────────────────────────────────────────

describe("countPriorOccurrences contracts", () => {
  it("defaults window to 365 days when not specified", () => {
    const idx = ENGINE_SRC.indexOf("function countPriorOccurrences");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("windowDays ?? 365");
  });

  it("only counts approved memos (status = 'approved')", () => {
    const idx = ENGINE_SRC.indexOf("function countPriorOccurrences");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("status = 'approved'");
  });

  it("filters by companyId, assignmentId, regulationId", () => {
    const idx = ENGINE_SRC.indexOf("function countPriorOccurrences");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain('"assignmentId" = $2');
    expect(section).toContain('"regulationId" = $3');
  });

  it("excludes soft-deleted records", () => {
    const idx = ENGINE_SRC.indexOf("function countPriorOccurrences");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("uses interval-based date window for contractual year", () => {
    const idx = ENGINE_SRC.indexOf("function countPriorOccurrences");
    const section = ENGINE_SRC.slice(idx, idx + 1200);
    expect(section).toContain("CURRENT_DATE - ($4 || ' days')::interval");
  });
});

// ─── resolvePenalty integration contracts ──────────────────────────────────

describe("resolvePenalty contracts", () => {
  it("caps occurrence count at 4 (penalty4 is max escalation)", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 1500);
    expect(section).toContain("Math.min(4, prior + 1)");
  });

  it("selects correct penalty tier based on occurrence count", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 1500);
    expect(section).toContain("occurrenceCount === 1 ? reg.penalty1");
    expect(section).toContain("occurrenceCount === 2 ? reg.penalty2");
    expect(section).toContain("occurrenceCount === 3 ? reg.penalty3");
    expect(section).toContain("reg.penalty4");
  });

  it("calculates extra deduction for late/early_leave using minuteRate = dailyWage/480", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 3500);
    expect(section).toContain("dailyWage / 480");
  });

  it("calculates extra deduction for absence using dailyWage * absenceDays", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 3500);
    expect(section).toContain("dailyWage * input.absenceDays");
  });

  it("protects both base and extra amounts from NaN/negative values", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 3500);
    expect(section).toContain("Number.isFinite(parsed.amount) && parsed.amount > 0");
    expect(section).toContain("Number.isFinite(extraDeductionAmount) && extraDeductionAmount > 0");
  });

  it("totalDeduction = base + extra, rounded to 2 decimals", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 3500);
    expect(section).toContain("Math.round((baseDeductionAmount + extraDeductionAmount) * 100) / 100");
  });

  it("includes human-readable reason with article ref and occurrence number", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 4500);
    expect(section).toContain("مادة ${reg.section}#${reg.articleNumber}");
    expect(section).toContain("التكرار رقم ${occurrenceCount}");
  });

  it("isTermination is true if regulation or parsed termination says so", () => {
    const idx = ENGINE_SRC.indexOf("function resolvePenalty");
    const section = ENGINE_SRC.slice(idx, idx + 3500);
    expect(section).toContain("reg.isTermination || parsed.termination !== null");
  });
});

// ─── getDailyWage contracts ────────────────────────────────────────────────

describe("getDailyWage contracts", () => {
  it("fetches salary from employee_assignments", () => {
    const idx = ENGINE_SRC.indexOf("function getDailyWage");
    const section = ENGINE_SRC.slice(idx, idx + 800);
    expect(section).toContain("SELECT salary FROM employee_assignments WHERE id = $1");
  });

  it("divides monthly salary by 30 for daily wage", () => {
    const idx = ENGINE_SRC.indexOf("function getDailyWage");
    const section = ENGINE_SRC.slice(idx, idx + 800);
    expect(section).toContain("monthly / 30");
  });

  it("returns 0 for non-finite or zero/negative salary", () => {
    const idx = ENGINE_SRC.indexOf("function getDailyWage");
    const section = ENGINE_SRC.slice(idx, idx + 800);
    expect(section).toContain("!Number.isFinite(monthly) || monthly <= 0");
    expect(section).toContain("return 0");
  });
});

// ─── generateMemoNumber contracts ──────────────────────────────────────────

describe("generateMemoNumber contracts", () => {
  it("generates MEMO-{year}-{5-digit seq} format", () => {
    expect(ENGINE_SRC).toContain('`MEMO-${year}-${String(seq).padStart(5, "0")}`');
  });

  it("counts existing memos in the same year for sequencing", () => {
    const idx = ENGINE_SRC.indexOf("function generateMemoNumber");
    const section = ENGINE_SRC.slice(idx, idx + 400);
    expect(section).toContain("COUNT(*)::int AS cnt");
    expect(section).toContain("hr_inquiry_memos");
    expect(section).toContain('EXTRACT(YEAR FROM "createdAt")');
  });
});

// ─── ensureInquiryMemoForViolation idempotency contracts ────────────────────

describe("ensureInquiryMemoForViolation contracts", () => {
  it("checks for existing memo with same violationId (idempotency)", () => {
    const idx = ENGINE_SRC.indexOf("function ensureInquiryMemoForViolation");
    const section = ENGINE_SRC.slice(idx, idx + 2000);
    expect(section).toContain("params.violationId");
    expect(section).toContain("SELECT id FROM hr_inquiry_memos");
    expect(section).toContain('"violationId" = $2');
  });

  it("returns {created: false} when memo already exists", () => {
    const idx = ENGINE_SRC.indexOf("function ensureInquiryMemoForViolation");
    const section = ENGINE_SRC.slice(idx, idx + 2000);
    expect(section).toContain("created: false");
  });

  it("inserts new memo with status pending_employee", () => {
    const idx = ENGINE_SRC.indexOf("function ensureInquiryMemoForViolation");
    const section = ENGINE_SRC.slice(idx, idx + 1500);
    expect(section).toContain("INSERT INTO hr_inquiry_memos");
    expect(section).toContain("'pending_employee'");
  });

  it("links memo back to violation (updates employee_violations)", () => {
    const idx = ENGINE_SRC.indexOf("function ensureInquiryMemoForViolation");
    const section = ENGINE_SRC.slice(idx, idx + 2000);
    expect(section).toContain("UPDATE employee_violations");
    expect(section).toContain('"inquiryMemoId" = $1');
    expect(section).toContain("status = 'pending_inquiry'");
  });

  it("records creation event in timeline", () => {
    const idx = ENGINE_SRC.indexOf("function ensureInquiryMemoForViolation");
    const section = ENGINE_SRC.slice(idx, idx + 2500);
    expect(section).toContain("INSERT INTO hr_inquiry_memo_events");
    expect(section).toContain("'system'");
    expect(section).toContain("'created'");
  });

  it("defaults source to 'auto' when not specified", () => {
    const idx = ENGINE_SRC.indexOf("function ensureInquiryMemoForViolation");
    const section = ENGINE_SRC.slice(idx, idx + 2500);
    expect(section).toContain('params.source ?? "auto"');
  });
});

// ─── Type exports ──────────────────────────────────────────────────────────

describe("disciplineEngine type exports", () => {
  it("exports IncidentType with 7 variants", () => {
    expect(ENGINE_SRC).toContain("export type IncidentType");
    expect(ENGINE_SRC).toContain('"late"');
    expect(ENGINE_SRC).toContain('"early_leave"');
    expect(ENGINE_SRC).toContain('"absence"');
    expect(ENGINE_SRC).toContain('"behavior"');
    expect(ENGINE_SRC).toContain('"organization"');
    expect(ENGINE_SRC).toContain('"gps_out_of_range"');
    expect(ENGINE_SRC).toContain('"custom"');
  });

  it("exports PenaltyResolution with all required fields", () => {
    expect(ENGINE_SRC).toContain("export interface PenaltyResolution");
    expect(ENGINE_SRC).toContain("regulation: RegulationRow");
    expect(ENGINE_SRC).toContain("occurrenceCount: number");
    expect(ENGINE_SRC).toContain("penaltyLabel: string");
    expect(ENGINE_SRC).toContain("baseDeductionAmount: number");
    expect(ENGINE_SRC).toContain("extraDeductionAmount: number");
    expect(ENGINE_SRC).toContain("totalDeductionAmount: number");
    expect(ENGINE_SRC).toContain("isTermination: boolean");
    expect(ENGINE_SRC).toContain("warningOnly: boolean");
  });

  it("exports IncidentInput with all optional fields", () => {
    expect(ENGINE_SRC).toContain("export interface IncidentInput");
    expect(ENGINE_SRC).toContain("durationMinutes?: number");
    expect(ENGINE_SRC).toContain("absenceDays?: number");
    expect(ENGINE_SRC).toContain("disruptsOthers?: boolean");
    expect(ENGINE_SRC).toContain("customRegulationId?: number");
  });

  it("exports RegulationRow with 4 penalty tiers", () => {
    expect(ENGINE_SRC).toContain("export interface RegulationRow");
    expect(ENGINE_SRC).toContain("penalty1: string | null");
    expect(ENGINE_SRC).toContain("penalty2: string | null");
    expect(ENGINE_SRC).toContain("penalty3: string | null");
    expect(ENGINE_SRC).toContain("penalty4: string | null");
  });
});

// ─── SQL security contracts ────────────────────────────────────────────────

describe("disciplineEngine SQL security", () => {
  it("all queries use parameterized values ($1, $2, etc.)", () => {
    const queries = ENGINE_SRC.matchAll(/rawQuery|rawExecute/g);
    let count = 0;
    for (const _m of queries) count++;
    expect(count).toBeGreaterThanOrEqual(6);

    const rawCalls = [...ENGINE_SRC.matchAll(/(rawQuery|rawExecute)\(\s*`([^`]+)`/gs)];
    for (const call of rawCalls) {
      expect(call[2]).toMatch(/\$\d/);
    }
  });

  it("getRegulationByArticle filters by isActive and deletedAt", () => {
    const idx = ENGINE_SRC.indexOf("function getRegulationByArticle");
    const section = ENGINE_SRC.slice(idx, idx + 1000);
    expect(section).toContain('"isActive" = TRUE');
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("all regulation lookups scope by companyId", () => {
    const idx = ENGINE_SRC.indexOf("function getRegulationByArticle");
    const section = ENGINE_SRC.slice(idx, idx + 1000);
    expect(section).toContain('"companyId" = $1');
  });
});
