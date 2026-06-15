import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOperationallyLinkedEntry,
  assertOperationalManualApprovalAllowed,
  OPERATIONAL_LINE_DIMENSIONS,
} from "../../src/lib/financePostingPolicy.js";

/**
 * FIN-OPERATIONAL-MANUAL-JOURNAL-GUARD (#2239) — حوكمة القيد اليدوي المرتبط تشغيليًا.
 *
 * Deferred governance item from #2239's mandatory comment: a MANUAL journal
 * entry that is operationally LINKED (its lines carry an operational dimension
 * — vehicle/property/asset/employee/driver/unit/contract — or the header has a
 * related operational entity) must enter a SPECIAL approval path:
 *  (1) reason MANDATORY, (2) object link MANDATORY (it IS the dimension),
 *  (3) approval requires GM / elevated authority, (4) every decision audits.
 *
 * Ordinary GL-only manual JEs must behave exactly as before.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8",
);

// ── Pure predicate ───────────────────────────────────────────────────────
describe("#2239 isOperationallyLinkedEntry — pure operational-link detection", () => {
  it("true when a line carries vehicleId", () => {
    expect(isOperationallyLinkedEntry([{ vehicleId: 12 }, {}])).toBe(true);
  });

  it("true for propertyId / assetId / employeeId / driverId / unitId / contractId", () => {
    for (const dim of OPERATIONAL_LINE_DIMENSIONS) {
      expect(isOperationallyLinkedEntry([{ [dim]: 7 }])).toBe(true);
    }
  });

  it("true when the header relatedEntityType is operational (e.g. vehicle)", () => {
    expect(isOperationallyLinkedEntry([{}], { relatedEntityType: "vehicle", relatedEntityId: 3 })).toBe(true);
    expect(isOperationallyLinkedEntry([{}], { relatedEntityType: "Employee" })).toBe(true); // case-insensitive
  });

  it("false for a plain GL-only entry (no operational dimension, no header link)", () => {
    expect(
      isOperationallyLinkedEntry(
        [
          { accountCode: "1100", debit: 100 },
          { accountCode: "4100", credit: 100, projectId: 5, vendorId: 9 },
        ] as any,
        { relatedEntityType: null },
      ),
    ).toBe(false);
  });

  it("false when dimension keys are present but null/empty (not a real link)", () => {
    expect(isOperationallyLinkedEntry([{ vehicleId: null, propertyId: "" }] as any)).toBe(false);
  });

  it("false for empty / missing inputs", () => {
    expect(isOperationallyLinkedEntry([])).toBe(false);
    expect(isOperationallyLinkedEntry(null)).toBe(false);
    expect(isOperationallyLinkedEntry(undefined)).toBe(false);
  });
});

// ── Pure approval decision ───────────────────────────────────────────────
describe("#2239 assertOperationalManualApprovalAllowed — elevated approval decision", () => {
  it("no-op when the entry is not operationally linked (ordinary manual JE)", () => {
    expect(() => assertOperationalManualApprovalAllowed({ linked: false, elevated: false })).not.toThrow();
  });

  it("DENIES (403) a linked entry when the caller is not GM/owner (elevated=false)", () => {
    expect(() =>
      assertOperationalManualApprovalAllowed({ linked: true, elevated: false, reason: "x" }),
    ).toThrow(/المدير العام/);
  });

  it("DENIES (422) a linked entry approved by GM with no reason", () => {
    expect(() =>
      assertOperationalManualApprovalAllowed({ linked: true, elevated: true, reason: "  " }),
    ).toThrow(/سبب اعتماد القيد/);
  });

  it("ALLOWS a linked entry approved by GM/owner with a reason", () => {
    expect(() =>
      assertOperationalManualApprovalAllowed({ linked: true, elevated: true, reason: "تسوية مركبة" }),
    ).not.toThrow();
  });
});

// ── Static / contract assertions on the route wiring ─────────────────────
describe("#2239 backend contract (finance-journal route wiring)", () => {
  it("imports the guard helpers from financePostingPolicy", () => {
    expect(ROUTE).toContain("isOperationallyLinkedEntry");
    expect(ROUTE).toContain("assertOperationalManualApprovalAllowed");
    expect(ROUTE).toContain('from "../lib/financePostingPolicy.js"');
  });

  it("CREATE requires a reason/description when the manual JE is operationally linked", () => {
    expect(ROUTE).toContain("const operationallyLinked = isOperationallyLinkedEntry(lines);");
    expect(ROUTE).toContain("سبب القيد اليدوي المرتبط بكائن تشغيلي مطلوب");
  });

  it("APPROVE classifies linkage from the loaded header + lines and enforces the elevated path", () => {
    expect(ROUTE).toContain("isOperationallyLinkedEntry(linkLines as any, header ?? null)");
    expect(ROUTE).toMatch(/assertOperationalManualApprovalAllowed\(\{[\s\S]*?elevated: scope\.isOwner \|\| OWNER_GM_ROLES\.includes\(scope\.role\)/);
    expect(ROUTE).toContain("approveJournalSchema");
  });

  it("both CREATE and APPROVE write an audit row carrying the operational-link flag", () => {
    // create audit
    expect(ROUTE).toMatch(/action: "create"[\s\S]*?operationallyLinked/);
    // approve audit
    expect(ROUTE).toMatch(/action: "approve"[\s\S]*?operationallyLinked/);
  });

  it("ordinary approve still floors at level 60 (no engine rewrite, gate preserved)", () => {
    expect(ROUTE).toContain('journalRouter.post("/journal/:id/approve", requireMinLevel(60)');
  });
});
