import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isGccNationality,
  gccExclusionSqlFragment,
  GCC_NATIONALITY_TOKENS,
} from "../../src/lib/umrahNationalityRules.js";

/**
 * Pin the GCC visa-exemption rule:
 *
 *   KSA grants visa-free entry to nationals of Bahrain, Kuwait, Oman,
 *   Qatar, and the UAE. Their `umrah_pilgrims.visaExpiry` is typically
 *   NULL (correct — they entered on a national ID). But operator data
 *   entry from a different jurisdiction sometimes leaves a stray date
 *   in that field, and the compliance dashboard's "visa expiring in
 *   7 days" alert fires on it. The morning ops chase a non-issue.
 *
 *   The helper centralises the GCC token list so every visa-expiring
 *   query reads from the same source, and so the same list can be
 *   expanded later (e.g. waivers for other treaty nationalities)
 *   without a search-and-replace across the codebase.
 */

describe("isGccNationality — text-tolerant matching", () => {
  it("matches the five GCC states by Arabic name", () => {
    expect(isGccNationality("البحرين")).toBe(true);
    expect(isGccNationality("الكويت")).toBe(true);
    expect(isGccNationality("عمان")).toBe(true);
    expect(isGccNationality("عُمان")).toBe(true);
    expect(isGccNationality("قطر")).toBe(true);
    expect(isGccNationality("الإمارات")).toBe(true);
    expect(isGccNationality("الامارات")).toBe(true);
  });

  it("matches by English name (case-insensitive, with whitespace)", () => {
    expect(isGccNationality("Bahrain")).toBe(true);
    expect(isGccNationality(" KUWAIT ")).toBe(true);
    expect(isGccNationality("Oman")).toBe(true);
    expect(isGccNationality("qatar")).toBe(true);
    expect(isGccNationality("UAE")).toBe(true);
    expect(isGccNationality("United Arab Emirates")).toBe(true);
  });

  it("matches by ISO codes (BH/KW/OM/QA/AE)", () => {
    expect(isGccNationality("BH")).toBe(true);
    expect(isGccNationality("kw")).toBe(true);
    expect(isGccNationality("OM")).toBe(true);
    expect(isGccNationality("qa")).toBe(true);
    expect(isGccNationality("AE")).toBe(true);
  });

  it("rejects Saudi (locals — different track) and other nationalities", () => {
    expect(isGccNationality("Saudi Arabia")).toBe(false);
    expect(isGccNationality("KSA")).toBe(false);
    expect(isGccNationality("السعودية")).toBe(false);
    // Non-GCC examples — common pilgrim nationalities.
    expect(isGccNationality("Pakistan")).toBe(false);
    expect(isGccNationality("Egypt")).toBe(false);
    expect(isGccNationality("Indonesia")).toBe(false);
    expect(isGccNationality("Yemen")).toBe(false);
  });

  it("rejects nullish + empty", () => {
    expect(isGccNationality(null)).toBe(false);
    expect(isGccNationality(undefined)).toBe(false);
    expect(isGccNationality("")).toBe(false);
    expect(isGccNationality("   ")).toBe(false);
  });

  it("covers all five states with both Arabic + English + ISO entries", () => {
    // Sanity: every nationality should have at least 3 representations
    // in the token set (Arabic name, English name, ISO code). If the
    // list shrinks below the 5-state coverage, this assertion catches it.
    const representationsBahrain = ["bahrain", "bh", "البحرين"];
    const representationsKuwait = ["kuwait", "kw", "الكويت"];
    const representationsOman = ["oman", "om", "عمان"];
    const representationsQatar = ["qatar", "qa", "قطر"];
    const representationsUae = ["uae", "ae", "الإمارات"];
    for (const tokens of [
      representationsBahrain,
      representationsKuwait,
      representationsOman,
      representationsQatar,
      representationsUae,
    ]) {
      for (const t of tokens) expect(GCC_NATIONALITY_TOKENS.has(t)).toBe(true);
    }
  });
});

describe("gccExclusionSqlFragment — composable SQL", () => {
  it("returns a parameter-free fragment (composable with arbitrary param offsets)", () => {
    const frag = gccExclusionSqlFragment(`p."nationality"`);
    // The fragment uses literal-quoted strings, not $N placeholders,
    // so the caller doesn't have to renumber its own params.
    expect(frag).not.toMatch(/\$\d/);
    expect(frag).toContain("LOWER(TRIM(p.\"nationality\"))");
  });

  it("permits NULL nationality (alert still fires for unknown origin)", () => {
    const frag = gccExclusionSqlFragment(`p."nationality"`);
    expect(frag).toMatch(/p\.\"nationality\"\s+IS NULL\s+OR/);
  });

  it("interpolates the column expression literally (caller-trusted)", () => {
    // The helper is intentionally low-level — the caller controls the
    // column reference. Documented contract: never pass user input.
    const frag = gccExclusionSqlFragment(`p."nationality"`);
    expect(frag).toContain(`p."nationality"`);
  });
});

const UMRAH_ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const UMRAH_ENTITIES = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
// U-07 Phase 13 — the compliance report (which applies the GCC fragment to
// p."nationality") was carved into umrah-reports.ts.
const UMRAH_REPORTS = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const CRON = readFileSync(
  join(import.meta.dirname!, "../../src/lib/cronScheduler.ts"),
  "utf8",
);

describe("visa-expiring queries call the GCC exclusion", () => {
  it("umrah.ts season-detail KPI excludes GCC", () => {
    // The season-detail KPI query is right after the visa-expiring
    // counter — assert it has the GCC fragment applied.
    expect(UMRAH_ROUTE).toMatch(/AND \$\{gccExclusionSqlFragment\(`"nationality"`\)\}/);
  });

  it("umrah.ts pilgrims list filter excludes GCC", () => {
    expect(UMRAH_ROUTE).toMatch(/AND \$\{gccExclusionSqlFragment\(`p\.\"nationality\"`\)\}/);
  });

  it("umrah-entities.ts uses the GCC fragment too", () => {
    expect(UMRAH_ENTITIES).toMatch(/gccExclusionSqlFragment\(`"nationality"`\)/);
  });

  it("umrah-reports.ts compliance report applies the GCC fragment (U-07 Phase 13)", () => {
    expect(UMRAH_REPORTS).toMatch(/gccExclusionSqlFragment\(`p\.\"nationality\"`\)/);
  });

  it("cronScheduler.ts visa-expiry cron excludes GCC", () => {
    // The cron previously alerted on every row with a visa expiring;
    // now it filters via the same helper so the morning notification
    // doesn't surface false positives.
    expect(CRON).toMatch(/await import\("\.\/umrahNationalityRules\.js"\)/);
    expect(CRON).toMatch(/gccExclusionSqlFragment\(`p\.\"nationality\"`\)/);
  });
});
