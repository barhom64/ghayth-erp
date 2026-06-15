import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-19-P4 — journey step indicator FE smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-19 audit §3.4):
 *   - New shared component `journey-step-indicator.tsx` renders the
 *     4-stage stepper from the U-19-P1 / U-19-P1b helper API.
 *   - Sub-agent detail page renders the indicator with
 *     `currentStage="linked"` (we're on the sub-agent page → linked
 *     stage is the current focus).
 *   - Group detail page renders the indicator with
 *     `currentStage="invoiced"` (group pages are typically reached
 *     once the group has been invoiced).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch / no migration / no API change.
 *   - Pure FE component reading the existing read-only API.
 *
 * Failure modes pinned:
 *   - Component file is removed → §A fails.
 *   - Component drops one of the 4 stage entries → §B fails.
 *   - A page stops mounting the indicator → §C fails (the stepper
 *     disappears from the journey).
 *   - Component starts writing (POST/PUT/DELETE) → §D fails (broken
 *     read-only contract).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const COMPONENT = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/journey-step-indicator.tsx"),
  "utf8",
);
const SUB_AGENT_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/details/umrah-sub-agent-detail.tsx"),
  "utf8",
);
const GROUP_PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/details/umrah-group-detail.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Component file exists + exports the right symbols
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P4 §A — journey-step-indicator component exists + exports symbols", () => {
  it("exports JourneyStepIndicator", () => {
    expect(COMPONENT).toMatch(/export\s+function\s+JourneyStepIndicator\(/);
  });

  it("exports JourneyStage type", () => {
    expect(COMPONENT).toMatch(/export\s+type\s+JourneyStage\s*=/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Component renders all 4 stages
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P4 §B — component covers all 4 stages", () => {
  for (const stage of ["imported", "linked", "invoiced", "collected"]) {
    it(`STAGES list includes '${stage}'`, () => {
      expect(COMPONENT).toMatch(new RegExp(`key:\\s*["']${stage}["']`));
    });
  }

  it("reads from the journey helper API path", () => {
    expect(COMPONENT).toMatch(/\/umrah\/sub-agents\/\$\{subjectId\}\/journey/);
    expect(COMPONENT).toMatch(/\/umrah\/groups\/\$\{subjectId\}\/journey/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Indicator mounted on both detail pages
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P4 §C — sub-agent + group detail pages render the indicator", () => {
  it("sub-agent detail imports JourneyStepIndicator", () => {
    expect(SUB_AGENT_PAGE).toMatch(
      /import\s+\{\s*JourneyStepIndicator\s*\}\s+from\s+"@\/components\/shared\/journey-step-indicator"/,
    );
  });

  it("sub-agent detail renders the indicator with subjectKind=\"sub-agent\"", () => {
    expect(SUB_AGENT_PAGE).toMatch(
      /<JourneyStepIndicator[\s\S]{0,200}?subjectKind=["']sub-agent["']/,
    );
  });

  it("group detail imports JourneyStepIndicator", () => {
    expect(GROUP_PAGE).toMatch(
      /import\s+\{\s*JourneyStepIndicator\s*\}\s+from\s+"@\/components\/shared\/journey-step-indicator"/,
    );
  });

  it("group detail renders the indicator with subjectKind=\"group\"", () => {
    expect(GROUP_PAGE).toMatch(
      /<JourneyStepIndicator[\s\S]{0,200}?subjectKind=["']group["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Component is read-only (no mutations)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-19-P4 §D — component makes ZERO writes", () => {
  it("does not import useApiMutation", () => {
    expect(COMPONENT).not.toMatch(/useApiMutation/);
  });

  it("does not call apiFetch with non-GET method", () => {
    expect(COMPONENT).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  });
});
