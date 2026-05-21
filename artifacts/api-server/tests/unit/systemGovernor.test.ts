import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");

describe("System Governor guard structure", () => {
  const source = readFileSync(join(API_SRC, "lib/systemGovernor.ts"), "utf8");

  it("exports GuardResult interface", () => {
    expect(source).toContain("export interface GuardResult");
  });

  it("exports GuardFn type", () => {
    expect(source).toContain("export type GuardFn");
  });

  it("exports checkSystemGuards function", () => {
    expect(source).toContain("export async function checkSystemGuards");
  });

  it("exports requireGuards middleware factory", () => {
    expect(source).toContain("export function requireGuards");
  });

  it("exports registerGuard for extensibility", () => {
    expect(source).toContain("export function registerGuard");
  });

  it("defines all 5 core guards", () => {
    const guardNames = [
      "financialPeriodGuard",
      "companyActiveGuard",
      "trialLimitsGuard",
      "postingFailuresGuard",
      "auditViolationsGuard",
    ];
    for (const name of guardNames) {
      expect(source, `Missing guard: ${name}`).toContain(name);
    }
  });

  it("registers guards with correct scopes", () => {
    expect(source).toContain('{ guard: companyActiveGuard, scope: "all" }');
    expect(source).toContain(
      '{ guard: financialPeriodGuard, scope: "financial" }'
    );
    expect(source).toContain('{ guard: trialLimitsGuard, scope: "all" }');
    expect(source).toContain(
      '{ guard: postingFailuresGuard, scope: "financial" }'
    );
    expect(source).toContain(
      '{ guard: auditViolationsGuard, scope: "financial" }'
    );
  });
});

describe("requireGuards middleware behavior", () => {
  const source = readFileSync(join(API_SRC, "lib/systemGovernor.ts"), "utf8");

  it("skips GET/HEAD/OPTIONS requests", () => {
    expect(source).toContain('req.method === "GET"');
    expect(source).toContain('req.method === "HEAD"');
    expect(source).toContain('req.method === "OPTIONS"');
  });

  it("returns 403 with SYSTEM_GUARD_BLOCK code on violation", () => {
    expect(source).toContain("status(403)");
    expect(source).toContain('"SYSTEM_GUARD_BLOCK"');
  });

  it("includes violation reasons in response", () => {
    expect(source).toContain("violations: result.violations");
  });
});

describe("Guard business rules", () => {
  const source = readFileSync(join(API_SRC, "lib/systemGovernor.ts"), "utf8");

  it("financial period guard blocks both closed and locked periods", () => {
    expect(source).toContain('period.status === "closed"');
    expect(source).toContain('period.status === "locked"');
  });

  it("company active guard checks for suspended and inactive", () => {
    expect(source).toContain('company.status === "suspended"');
    expect(source).toContain('company.status === "inactive"');
  });

  it("trial limits guard enforces 25 employee limit", () => {
    expect(source).toContain("count.cnt >= 25");
  });

  it("posting failures guard threshold is 25", () => {
    expect(source).toContain("result.cnt >= 25");
  });

  it("audit violations guard blocks on 10+ critical violations with role bypass", () => {
    expect(source).toContain("result.cnt >= 10");
    expect(source).toContain("'critical'");
    expect(source).toContain('context?.role === "owner"');
  });
});

describe("Guard scope types", () => {
  const source = readFileSync(join(API_SRC, "lib/systemGovernor.ts"), "utf8");

  it("defines financial, hr, operational, and all scopes", () => {
    expect(source).toMatch(
      /GuardScope\s*=\s*"financial"\s*\|\s*"hr"\s*\|\s*"operational"\s*\|\s*"all"/
    );
  });

  it("checkSystemGuards defaults to 'all' scope", () => {
    expect(source).toContain('scope: GuardScope = "all"');
  });

  it("requireGuards defaults to 'financial' scope", () => {
    expect(source).toContain('scope: GuardScope = "financial"');
  });
});
