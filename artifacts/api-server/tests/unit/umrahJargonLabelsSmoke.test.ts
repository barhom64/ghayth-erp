import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-18-P3 — replace raw API jargon in UI labels.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-18 audit §3.3 +
 * UMRAH_CANONICAL_GLOSSARY.md):
 *   - The 4 raw API field names listed in the glossary as
 *     "technical jargon that should NOT leak to UI" must not
 *     appear as the literal LABEL of a table column or form field.
 *   - The canonical Arabic labels per the glossary:
 *       nuskCode          → رمز الوكيل الفرعي
 *       nuskAgentNumber   → رقم وكيل نُسُك
 *       nuskGroupNumber   → رقم المجموعة في نُسُك
 *       contractRef       → رقم العقد
 *
 * Non-goals (Permanent Hard Rails):
 *   - No API contract change — the FIELD KEYS stay
 *     `nuskCode`/`nuskAgentNumber`/`nuskGroupNumber`/`contractRef`.
 *   - No engine touch, no migration.
 *   - Only the display LABEL is replaced.
 *
 * Failure modes pinned:
 *   - A page re-introduces a raw label for one of these 4 fields → §A fails.
 *   - The canonical Arabic label disappears from the right page → §B fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PAGES = [
  "artifacts/ghayth-erp/src/pages/finance/umrah-group-portfolio.tsx",
  "artifacts/ghayth-erp/src/pages/umrah/reports/subagent-balances.tsx",
  "artifacts/ghayth-erp/src/pages/umrah/reports/agent-balances.tsx",
  "artifacts/ghayth-erp/src/pages/umrah/agents.tsx",
].map((p) => readFileSync(join(REPO_ROOT, p), "utf8"));

const COMBINED = PAGES.join("\n----PAGE BOUNDARY----\n");

// ─────────────────────────────────────────────────────────────────────────────
// §A — No raw API jargon as a label value
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P3 §A — no raw API field name appears as a label value", () => {
  for (const field of ["nuskCode", "nuskAgentNumber", "nuskGroupNumber"]) {
    it(`label: "${field}" is NOT present in any of the 4 pages`, () => {
      // The label can be: `label: "<x>"` or `header: "<x>"`.
      // We only match the LITERAL field name as the entire label value
      // (no Arabic accompanying text).
      expect(COMBINED).not.toMatch(
        new RegExp(`(?:label|header):\\s*["']${field}["']`),
      );
    });
  }

  it("contractRef header was upgraded from \"مرجع العقد\" to the canonical \"رقم العقد\"", () => {
    // Old colloquial form must be gone.
    expect(COMBINED).not.toMatch(/header:\s*["']مرجع العقد["']/);
    // New canonical form must be present.
    expect(COMBINED).toMatch(/header:\s*["']رقم العقد["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Canonical Arabic labels per the glossary are present
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P3 §B — canonical Arabic labels are used on the right pages", () => {
  it("nuskGroupNumber → 'رقم المجموعة في نُسُك' (group portfolio)", () => {
    expect(PAGES[0]).toMatch(/label:\s*["']رقم المجموعة في نُسُك["']/);
  });

  it("nuskCode → 'رمز الوكيل الفرعي' (subagent balances)", () => {
    expect(PAGES[1]).toMatch(/label:\s*["']رمز الوكيل الفرعي["']/);
  });

  it("nuskAgentNumber → 'رقم وكيل نُسُك' (agent balances)", () => {
    expect(PAGES[2]).toMatch(/label:\s*["']رقم وكيل نُسُك["']/);
  });

  it("contractRef → 'رقم العقد' (agents list)", () => {
    expect(PAGES[3]).toMatch(/header:\s*["']رقم العقد["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — The FIELD KEYS stay unchanged (API contract preserved)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P3 §C — API field keys are preserved", () => {
  for (const field of ["nuskCode", "nuskAgentNumber", "nuskGroupNumber", "contractRef"]) {
    it(`key: "${field}" is still present in at least one page`, () => {
      expect(COMBINED).toMatch(new RegExp(`key:\\s*["']${field}["']`));
    });
  }
});
