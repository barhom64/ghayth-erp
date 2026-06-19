/**
 * IGOC-003 — Employee Creation Wizard nav smoke.
 *
 * The IGOC plan kept the existing single-form structure intact (the
 * server-side transaction is atomic + creates 18 things in one POST).
 * The wizard improvement is a sticky step-indicator overlay:
 *   1. 4 logical phases (personal / job / accounts / attachments)
 *   2. Click a step → scrolls to it (smooth)
 *   3. Scroll auto-highlights the visible step (IntersectionObserver)
 *   4. Each step shows ✓ when its required fields are filled
 *   5. Progress counter "step X of N — Y/N complete"
 *
 * This file pins the wizard's static structure so future PRs can't
 * silently delete the anchors or break the step matrix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/employee-create-form.tsx"),
  "utf8",
);

describe("IGOC-003 — WIZARD_STEPS matrix", () => {
  it("defines exactly 4 steps (personal / job / accounts / attachments)", () => {
    expect(PAGE_SRC).toMatch(/WIZARD_STEPS: WizardStep\[\] = \[/);
    expect(PAGE_SRC).toMatch(/key: "personal"/);
    expect(PAGE_SRC).toMatch(/key: "job"/);
    expect(PAGE_SRC).toMatch(/key: "accounts"/);
    expect(PAGE_SRC).toMatch(/key: "attachments"/);
  });

  it("each step has an Arabic label", () => {
    expect(PAGE_SRC).toMatch(/label: "البيانات الشخصية"/);
    expect(PAGE_SRC).toMatch(/label: "الوظيفة والعقد"/);
    expect(PAGE_SRC).toMatch(/label: "الحسابات والربط المالي"/);
    expect(PAGE_SRC).toMatch(/label: "المرفقات والإقامة"/);
  });

  it("personal step requires name + nationalId + nationality + phone", () => {
    const personalBlock = PAGE_SRC.match(/key: "personal"[\s\S]*?isComplete:[\s\S]*?\},/)?.[0] ?? "";
    expect(personalBlock).toMatch(/f\.name/);
    expect(personalBlock).toMatch(/f\.nationalId/);
    expect(personalBlock).toMatch(/f\.nationality/);
    expect(personalBlock).toMatch(/f\.phone/);
  });

  it("job step requires contractType + positive salary", () => {
    const jobBlock = PAGE_SRC.match(/key: "job"[\s\S]*?isComplete:[\s\S]*?\},/)?.[0] ?? "";
    expect(jobBlock).toMatch(/f\.contractType/);
    expect(jobBlock).toMatch(/f\.salary && Number\(f\.salary\) > 0/);
  });
});

describe("IGOC-003 — WizardStepNav component", () => {
  it("uses IntersectionObserver for scroll-tracking", () => {
    expect(PAGE_SRC).toMatch(/new IntersectionObserver/);
    expect(PAGE_SRC).toMatch(/observer\.observe\(el\)/);
    expect(PAGE_SRC).toMatch(/observer\.disconnect\(\)/);
  });

  it("scrollTo() uses smooth behavior + block:start", () => {
    expect(PAGE_SRC).toMatch(/scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  });

  it("shows step counter 'step X of N — Y/N complete' (Arabic)", () => {
    expect(PAGE_SRC).toMatch(/خطوة \{[\s\S]*?\} من \{WIZARD_STEPS\.length\}/);
    expect(PAGE_SRC).toMatch(/\{completedCount\}\/\{WIZARD_STEPS\.length\} مكتمل/);
  });

  it("step button renders done ✓ vs index N", () => {
    expect(PAGE_SRC).toMatch(/isDone && !isActive \? "✓" : idx \+ 1/);
  });

  it("sticky positioning keeps nav visible while scrolling", () => {
    expect(PAGE_SRC).toMatch(/Card className="mb-4 sticky top-0 z-10/);
  });
});

describe("IGOC-003 — anchor ids exist in the form for each step", () => {
  for (const key of ["personal", "job", "accounts", "attachments"]) {
    it(`section anchor wizard-step-${key} exists`, () => {
      expect(PAGE_SRC).toMatch(new RegExp(`id="wizard-step-${key}"`));
    });
    it(`section anchor wizard-step-${key} uses scroll-mt-24 for sticky offset`, () => {
      expect(PAGE_SRC).toMatch(new RegExp(`id="wizard-step-${key}"[^>]*scroll-mt-24`));
    });
  }
});

describe("IGOC-003 — wizard is non-blocking", () => {
  it("WizardStepNav rendered as overlay; the underlying form structure is unchanged", () => {
    // The component is rendered BEFORE the form fields, but the form
    // submission goes through the existing handleSubmit (one POST to
    // /employees, the atomic transaction stays intact).
    expect(PAGE_SRC).toMatch(/<WizardStepNav form=\{form as unknown as Record<string, string>\}/);
    expect(PAGE_SRC).toMatch(/Button onClick=\{handleSubmit\}/);
  });

  it("does NOT introduce gating logic that blocks submit until all steps complete", () => {
    // The submit button stays disabled only on missing name (the
    // existing minimum check) + mutation pending. No wizard-state
    // disable that would re-implement form-level validation.
    expect(PAGE_SRC).toMatch(/disabled=\{!form\.name \|\| createMut\.isPending\}/);
    expect(PAGE_SRC).not.toMatch(/disabled=\{[^}]*completedCount[^}]*\}/);
  });
});
