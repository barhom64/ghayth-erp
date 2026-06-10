/**
 * HR-Wave-0 / 0.1 — ActiveContextGate smoke.
 *
 * Pins the structural contract so future PRs can't silently:
 *   1. Detach the gate from CreatePageLayout (which would mean some
 *      future create page renders WITHOUT a resolved active context —
 *      the entire IGOC «no action without active context» rule rides
 *      on this wiring).
 *   2. Stop checking any of (company / role / branch) — the three
 *      pillars must all be present before the form renders.
 *   3. Drop the multi-assignment instruction, which is the user-visible
 *      half of «one active assignment at a time».
 *   4. Lose the inputter-vs-subject doctrine comment — that comment
 *      keeps future maintainers from mistakenly inheriting the
 *      inputter's company onto the form's subject fields.
 *
 * Source-only smoke (no DB, no live React). Runs in <100ms.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const GATE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/active-context-gate.tsx"),
  "utf8",
);
const CPL_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/create-page-layout.tsx"),
  "utf8",
);

describe("HR-Wave-0 / 0.1 — ActiveContextGate component", () => {
  it("exports the gate as a named React component", () => {
    expect(GATE_SRC).toMatch(/export function ActiveContextGate\(/);
  });

  it("reads from useAuth (assignments) AND useAppContext (selectedRole / selectedCompanyIds / selectedBranchIds)", () => {
    expect(GATE_SRC).toMatch(/const \{ assignments \} = useAuth\(\)/);
    expect(GATE_SRC).toMatch(/selectedRole,\s*selectedCompanyIds,\s*selectedBranchIds,/);
  });

  it("blocks the form unless ALL three pillars (role + company + branch) are present", () => {
    expect(GATE_SRC).toMatch(/const hasRole = !!selectedRole\?\.roleKey/);
    expect(GATE_SRC).toMatch(/const hasCompany = selectedCompanyIds\.length > 0/);
    expect(GATE_SRC).toMatch(/const hasBranch = selectedBranchIds\.length > 0/);
  });

  it("multi-assignment instruction surfaces when assignments.length > 1", () => {
    expect(GATE_SRC).toMatch(/const multipleAssignments = assignments\.length > 1/);
    expect(GATE_SRC).toMatch(/\{multipleAssignments && \(/);
    expect(GATE_SRC).toMatch(/لديك <strong>\{assignments\.length\} تعيين<\/strong>/);
  });

  it("supports requireBranch opt-out for tenant-level admin forms", () => {
    expect(GATE_SRC).toMatch(/requireBranch = true,/);
    expect(GATE_SRC).toMatch(/!requireBranch \|\| hasBranch/);
  });

  it("renders children only when the gate passes (no css-hide cheat)", () => {
    // The doctrine forbids "render but hide" — the gate must return a
    // different tree, not the same tree with a hidden style.
    expect(GATE_SRC).toMatch(/if \(hasRole && hasCompany && \(!requireBranch \|\| hasBranch\)\) \{\s*return <>\{children\}<\/>/);
  });

  it("preserves the IGOC «inputter vs subject» doctrine comment", () => {
    // If this comment ever gets deleted, future maintainers will
    // start auto-filling the form's subject fields from the active
    // context — the exact bug the gate exists to prevent.
    expect(GATE_SRC).toMatch(/Important distinction \(مدخِل vs موضوع\):/);
    expect(GATE_SRC).toMatch(/active context belongs to the USER FILLING THE FORM/);
    expect(GATE_SRC).toMatch(/never inherited from the/);
  });

  it("emits data-testid + data-context-* selectors for E2E + a11y", () => {
    expect(GATE_SRC).toMatch(/data-testid="active-context-gate-block"/);
    expect(GATE_SRC).toMatch(/data-context-row=\{label\}/);
    expect(GATE_SRC).toMatch(/data-context-missing=\{missing\}/);
  });
});

describe("HR-Wave-0 / 0.1 — CreatePageLayout wraps with the gate by default", () => {
  it("imports ActiveContextGate", () => {
    expect(CPL_SRC).toMatch(/import \{ ActiveContextGate \} from "@\/components\/shared\/active-context-gate"/);
  });

  it("exposes requireBranch + skipContextGate props", () => {
    expect(CPL_SRC).toMatch(/requireBranch\?: boolean/);
    expect(CPL_SRC).toMatch(/skipContextGate\?: boolean/);
  });

  it("the gate is ENABLED by default (skipContextGate defaults to false, requireBranch to true)", () => {
    expect(CPL_SRC).toMatch(/requireBranch = true,/);
    expect(CPL_SRC).toMatch(/skipContextGate = false,/);
  });

  it("wraps the body with <ActiveContextGate requireBranch={requireBranch}>", () => {
    expect(CPL_SRC).toMatch(/<ActiveContextGate requireBranch=\{requireBranch\}>\{body\}<\/ActiveContextGate>/);
  });

  it("opt-out only fires when skipContextGate is explicitly true", () => {
    expect(CPL_SRC).toMatch(/\{skipContextGate \? \(\s*body\s*\) : \(/);
  });
});
