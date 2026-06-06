import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P0 — week-1 security stop-the-bleeding contract ───────────────────────
//
// Locks the three week-1 security fixes from the senior architectural
// review (claude/hr-driver-integrated-view branch):
//   P0.1 — authMiddleware MUST NOT silently fall back to branchId = 0
//   P0.2 — scopedQuery emits a runtime warn when neither
//          enforceBranchScope nor disableBranchScope is declared
//   P0.3 — orderBy + extraConditions are validated against SQL-injection
//
// Static smoke style — reads source as text. Cheap, fast, fails loudly the
// moment a regression PR removes the guards.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const AUTH = read("artifacts/api-server/src/middlewares/authMiddleware.ts");
const SCOPED = read("artifacts/api-server/src/lib/scopedQuery.ts");

describe("P0.1 — authMiddleware branch resolution must not fall back to 0", () => {
  it("does NOT assign effectiveBranchId = 0 silently", () => {
    expect(AUTH).not.toMatch(/effectiveBranchId\s*=\s*0\s*;/);
  });

  it("throws a typed NO_BRANCH_RESOLVED error when no branch can be found", () => {
    expect(AUTH).toContain("_noBranchResolved");
    expect(AUTH).toContain("auth_no_branch_resolved");
  });

  it("middleware catch block translates _noBranchResolved to 403", () => {
    expect(AUTH).toContain('"NO_BRANCH_RESOLVED"');
    expect(AUTH).toMatch(/res\.status\(403\)/);
  });

  it("first-allowed and first-active-branch fallbacks remain (legitimate cases)", () => {
    expect(AUTH).toContain("allowedBranches[0]");
    expect(AUTH).toContain('SELECT id FROM branches WHERE "companyId"');
  });
});

describe("P0.2 — scopedQuery warns when scope flags aren't declared", () => {
  it("emits a logger.warn with scope_branch_not_declared marker", () => {
    expect(SCOPED).toContain("scope_branch_not_declared");
    expect(SCOPED).toMatch(/logger\.warn/);
  });

  it("warn fires only for non-owner non-GM users (scoped roles)", () => {
    const warnIdx = SCOPED.indexOf("scope_branch_not_declared");
    expect(warnIdx).toBeGreaterThan(-1);
    const block = SCOPED.slice(Math.max(0, warnIdx - 600), warnIdx);
    expect(block).toContain("!scope.isOwner");
    expect(block).toContain("BRANCH_SCOPE_EXEMPT_ROLES");
  });

  it("warn only fires when BOTH flags are undefined (explicit false is OK)", () => {
    expect(SCOPED).toContain("enforceBranchScope === undefined");
  });
});

describe("P0.3 — orderBy whitelist validator", () => {
  it("declares the SAFE_ORDER_BY_REGEX structural guard", () => {
    expect(SCOPED).toContain("SAFE_ORDER_BY_REGEX");
    const regexLine = SCOPED.match(/const SAFE_ORDER_BY_REGEX.*$/m)?.[0] ?? "";
    expect(regexLine).toContain("ASC|DESC");
  });

  it("validateOrderBy throws when whitelist is empty + value is supplied", () => {
    expect(SCOPED).toContain("orderByAllowed whitelist is empty");
  });

  it("validateOrderBy throws when value is not in whitelist", () => {
    expect(SCOPED).toContain("is not in orderByAllowed");
  });

  it("scopedQuery applies validateOrderBy before interpolating", () => {
    const idx = SCOPED.indexOf("validateOrderBy(options.orderBy");
    expect(idx).toBeGreaterThan(-1);
    const orderByIdx = SCOPED.indexOf("` ORDER BY ${options.orderBy}`");
    expect(orderByIdx).toBeGreaterThan(idx);
  });

  it("opt-out exists via orderByTrusted for internal hard-coded strings", () => {
    expect(SCOPED).toContain("orderByTrusted");
  });
});

describe("P0.3 — extraConditions safety validator", () => {
  it("declares PLACEHOLDER_REGEX and constant-predicate validators", () => {
    expect(SCOPED).toContain("PLACEHOLDER_REGEX");
    expect(SCOPED).toContain("CONSTANT_PREDICATE_REGEX");
    expect(SCOPED).toContain("SAFE_CONSTANT_VALUE_REGEX");
  });

  it("rejects fragments with quoted literals that aren't safe constants", () => {
    expect(SCOPED).toContain("literal/semicolon/comment");
  });

  it("buildScopedWhere calls validateExtraCondition for every supplied fragment", () => {
    expect(SCOPED).toContain("validateExtraCondition(cond)");
    const loopStart = SCOPED.indexOf("if (options.extraConditions)");
    const loopBlock = SCOPED.slice(loopStart, loopStart + 400);
    expect(loopBlock).toContain("validateExtraCondition(cond)");
    expect(loopBlock).toContain("conditions.push(cond)");
    // Validator must run BEFORE the push.
    expect(loopBlock.indexOf("validateExtraCondition"))
      .toBeLessThan(loopBlock.indexOf("conditions.push"));
  });
});

describe("P0 runtime — validators behave correctly at runtime too", () => {
  it("scopedQuery + buildScopedWhere are still exported and importable", async () => {
    const mod = await import("../../src/lib/scopedQuery.js");
    expect(typeof mod.buildScopedWhere).toBe("function");
    expect(typeof mod.scopedQuery).toBe("function");
    expect(typeof mod.scopedCount).toBe("function");
  });
});
