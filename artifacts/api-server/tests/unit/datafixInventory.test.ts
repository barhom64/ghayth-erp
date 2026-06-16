// ─────────────────────────────────────────────────────────────────────────────
// datafixInventory.test.ts  (#2090 / FIN-DATAFIX / FIN-SUB-02)
// ─────────────────────────────────────────────────────────────────────────────
// Unit + static tests for the READ-ONLY misparented-subsidiary inventory:
//   - PURE: the wrong→correct control-parent mapping (the #2070 intent),
//   - PURE: severity + autoFixable classification,
//   - STATIC: the lib helper AND the route are read-only (no write SQL) and the
//     route is company-scoped.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORRECT_PARENT_INTENT,
  WRONG_PARENT_CODES,
  proposedParentIntent,
  classifySeverity,
  isAutoFixable,
  summarize,
  type MisparentedSubsidiaryRow,
} from "../../src/lib/finance/datafixInventory.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "../../src");

describe("#2090 datafix — wrong→correct control-parent mapping (live #2070 logic)", () => {
  it("client receivable → AR (1130 fallback, NOT 1111 cash)", () => {
    const intent = proposedParentIntent("client", "receivable");
    expect(intent).not.toBeNull();
    expect(intent!.type).toBe("asset");
    expect(intent!.fallbackCode).toBe("1130");
    expect(intent!.keywords).toContain("الذمم المدينة");
    // and the WRONG legacy parent was 1111 (main cash)
    expect(WRONG_PARENT_CODES).toContain("1111");
  });

  it("employee advance → advances (1140 fallback, NOT 1121 bank)", () => {
    const intent = proposedParentIntent("employee", "advance");
    expect(intent!.fallbackCode).toBe("1140");
    expect(intent!.type).toBe("asset");
    expect(WRONG_PARENT_CODES).toContain("1121");
  });

  it("employee/driver custody → custody (NOT 1131 clients)", () => {
    expect(proposedParentIntent("employee", "custody")!.fallbackCode).toBe("1142");
    expect(proposedParentIntent("driver", "custody")!.fallbackCode).toBe("1113");
    expect(WRONG_PARENT_CODES).toContain("1131");
  });

  it("vendor payable → AP (2110 fallback, NOT the nonexistent 2102)", () => {
    const intent = proposedParentIntent("vendor", "payable");
    expect(intent!.type).toBe("liability");
    expect(intent!.fallbackCode).toBe("2110");
    expect(intent!.keywords).toContain("الموردون");
    expect(WRONG_PARENT_CODES).toContain("2102");
  });

  it("returns null for an (entityType, accountType) with no provisioning rule", () => {
    expect(proposedParentIntent("client", "custody")).toBeNull();
    expect(proposedParentIntent("property", "anything")).toBeNull();
  });

  it("the intent table mirrors the live createSubsidiaryAccountsForEntity specs", () => {
    // Cross-check the lib mapping against the literal fallbackCodes hardcoded in
    // routes/accounting-engine.ts so the report's proposed parent never drifts
    // from the live provisioner.
    const engine = readFileSync(join(SRC, "routes/accounting-engine.ts"), "utf8");
    for (const [key, intent] of Object.entries(CORRECT_PARENT_INTENT)) {
      const [, accountType] = key.split(":");
      // every accountType + its fallback parentCode pair appears in the engine
      expect(engine).toContain(`accountType: "${accountType}"`);
      expect(engine).toContain(`parentCode: "${intent.fallbackCode}"`);
    }
  });
});

describe("#2090 datafix — severity + autoFixable classification (PURE)", () => {
  it("zero balance + zero posted lines + zero linked → low + autoFixable", () => {
    expect(classifySeverity({ currentBalance: 0, postedLines: 0, linkedLines: 0 })).toBe("low");
    expect(isAutoFixable({ currentBalance: 0, postedLines: 0 })).toBe(true);
  });

  it("non-zero balance → high + NOT autoFixable (needs finance-reviewed transfer)", () => {
    expect(classifySeverity({ currentBalance: 1500, postedLines: 0, linkedLines: 0 })).toBe("high");
    expect(isAutoFixable({ currentBalance: 1500, postedLines: 0 })).toBe(false);
  });

  it("posted lines → high + NOT autoFixable even at zero balance", () => {
    expect(classifySeverity({ currentBalance: 0, postedLines: 3, linkedLines: 3 })).toBe("high");
    expect(isAutoFixable({ currentBalance: 0, postedLines: 3 })).toBe(false);
  });

  it("zero balance/posting but has linked (draft/unposted) lines → medium, still autoFixable", () => {
    expect(classifySeverity({ currentBalance: 0, postedLines: 0, linkedLines: 2 })).toBe("medium");
    expect(isAutoFixable({ currentBalance: 0, postedLines: 0 })).toBe(true);
  });

  it("negative balance counts as money at risk → high + NOT autoFixable", () => {
    expect(classifySeverity({ currentBalance: -42, postedLines: 0, linkedLines: 0 })).toBe("high");
    expect(isAutoFixable({ currentBalance: -42, postedLines: 0 })).toBe(false);
  });
});

describe("#2090 datafix — summary roll-up (PURE)", () => {
  const mk = (over: Partial<MisparentedSubsidiaryRow>): MisparentedSubsidiaryRow => ({
    subsidiaryId: 1, accountId: 1, accountCode: "1111-0001", accountName: "x",
    entityType: "client", accountType: "receivable", entityId: 1, entityName: "c",
    currentParentCode: "1111", currentParentName: "cash",
    proposedParentCode: "1130", proposedParentName: "AR",
    currentBalance: 0, postedLines: 0, linkedLines: 0,
    suspicionReason: "r", severity: "low", autoFixable: true,
    ...over,
  });

  it("counts total, autoFixable, needsReview, severities, and balance-at-risk", () => {
    const rows = [
      mk({ severity: "low", autoFixable: true, currentBalance: 0 }),
      mk({ severity: "high", autoFixable: false, currentBalance: 1000 }),
      mk({ severity: "high", autoFixable: false, currentBalance: -250 }),
      mk({ severity: "medium", autoFixable: true, currentBalance: 0 }),
    ];
    const s = summarize(rows);
    expect(s.total).toBe(4);
    expect(s.autoFixable).toBe(2);
    expect(s.needsReview).toBe(2);
    expect(s.bySeverity).toEqual({ high: 2, medium: 1, low: 1 });
    // |1000| + |-250| = 1250 at risk
    expect(s.totalBalanceAtRisk).toBe(1250);
  });
});

describe("#2090 datafix — STATIC read-only + company-scope guarantees", () => {
  const WRITE_SQL = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|MERGE\s+INTO)\b/i;

  it("the lib helper contains NO write SQL", () => {
    const lib = readFileSync(join(SRC, "lib/finance/datafixInventory.ts"), "utf8");
    // strip comments so prose mentioning INSERT/UPDATE doesn't false-positive
    const code = lib.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(WRITE_SQL.test(code)).toBe(false);
    // and it never imports rawExecute / withTransaction (write primitives)
    expect(lib).not.toMatch(/rawExecute|withTransaction/);
  });

  it("the route file contains NO write SQL and NO mutation verbs", () => {
    const route = readFileSync(join(SRC, "routes/finance-datafix.ts"), "utf8");
    const code = route.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(WRITE_SQL.test(code)).toBe(false);
    // only a GET handler — no POST/PUT/PATCH/DELETE route registrations
    expect(code).not.toMatch(/\.(post|put|patch|delete)\s*\(/);
    expect(code).toMatch(/\.get\s*\(/);
  });

  it("the route is company-scoped (uses scope.companyId)", () => {
    const route = readFileSync(join(SRC, "routes/finance-datafix.ts"), "utf8");
    expect(route).toContain("scope.companyId");
  });

  it("the route is guarded (authMiddleware + requireMinLevel(70) + authorize)", () => {
    const route = readFileSync(join(SRC, "routes/finance-datafix.ts"), "utf8");
    expect(route).toContain("authMiddleware");
    expect(route).toContain("requireMinLevel(70)");
    expect(route).toMatch(/authorize\(\{\s*feature:\s*"finance\.accounts"/);
  });
});
