/**
 * HR-Wave-1/B / Group 2 — scaffold-adoption smoke for the second
 * refactor batch: exit-create (SENSITIVE — settlement/مخالصة) +
 * performance-create. Plus the structural cleanup this group shipped:
 * the per-form AssignmentReadOnlyBadge moved INTO the scaffold as the
 * default H3 body (DefaultAssignmentBadge), so forms now pass only
 * `selectedEmployee` and the scaffold renders the auto-bind badge.
 *
 * Scope notes (honest record of what this group does NOT cover):
 *   - training-create: creates a training PROGRAM (catalog entity —
 *     title/trainer/capacity). It has NO employee axis at all, so the
 *     HrCreateScaffold doesn't apply. Pinned below as an exclusion so
 *     nobody "migrates" it by mistake.
 *   - evaluation-360-create: already on the FormShell/react-hook-form
 *     architecture — needs separate treatment, deferred.
 *   - leaves/excuse: self-service — need the self-service scaffold
 *     variant, deferred (same hold as group 1).
 *
 * Source-only smoke; <100ms.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FORMS_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/hr");

const REFACTORED_FORMS = [
  { file: "exit-create.tsx", sensitivePerm: "hr.exit:create", saveLabel: "إنشاء طلب نهاية الخدمة", contextSection: "loans", hasImpact: true },
  { file: "performance-create.tsx", sensitivePerm: null, saveLabel: "حفظ التقييم", contextSection: "violations", hasImpact: false },
];

describe.each(REFACTORED_FORMS)("HR-Wave-1/B Group 2 — $file adopts HrCreateScaffold", ({ file, sensitivePerm, saveLabel, contextSection, hasImpact }) => {
  const src = readFileSync(join(FORMS_DIR, file), "utf8");

  it("imports HrCreateScaffold from the canonical path", () => {
    expect(src).toMatch(/import \{ HrCreateScaffold \} from "@\/components\/shared\/hr-create-scaffold"/);
  });

  it("renders <HrCreateScaffold> inside CreatePageLayout with follows=\"assignment\"", () => {
    expect(src).toMatch(/<HrCreateScaffold/);
    expect(src).toMatch(/follows="assignment"/);
    expect(src).toMatch(/<\/CreatePageLayout>/);
  });

  it("derives assignmentId from selected employee's activeAssignmentId (not from form state)", () => {
    expect(src).toMatch(/activeAssignmentId\s*\?\?\s*selected/);
    expect(src).toMatch(/assignmentId=\{assignmentId \? String\(assignmentId\) : undefined\}/);
  });

  it("submit handler blocks when no active assignment is resolved", () => {
    expect(src).toMatch(/لا يوجد تعيين فعّال لهذا الموظف/);
    expect(src).toMatch(/if \(!assignmentId\) \{/);
  });

  it("passes selectedEmployee for the scaffold's DefaultAssignmentBadge (no manual slot, no local badge)", () => {
    expect(src).toMatch(/selectedEmployee=\{selectedEmployee\}/);
    expect(src).not.toMatch(/assignmentSelectorSlot=/);
    expect(src).not.toMatch(/function AssignmentReadOnlyBadge/);
  });

  it("no longer imports the primitives the scaffold owns (EmployeeSelect / EmployeeContextCard / CreationDateField)", () => {
    expect(src).not.toMatch(/import \{[^}]*EmployeeSelect[^}]*\}/);
    expect(src).not.toMatch(/import \{[^}]*EmployeeContextCard[^}]*\}/);
    expect(src).not.toMatch(/import \{[^}]*CreationDateField[^}]*\}/);
  });

  it("passes saveLabel + saving + onSubmit to scaffold (the scaffold owns the button)", () => {
    expect(src).toMatch(new RegExp(`saveLabel="${saveLabel}"`));
    expect(src).toMatch(/saving=\{createMut\.isPending\}/);
    expect(src).toMatch(/onSubmit=\{handleSubmit\}/);
  });

  it(`passes contextSection="${contextSection}" so the 360 card emphasises the relevant history`, () => {
    expect(src).toMatch(new RegExp(`contextSection="${contextSection}"`));
  });

  if (sensitivePerm) {
    it(`opts in to sensitivePerm="${sensitivePerm}" (settlement estimate hides behind PermissionGate)`, () => {
      expect(src).toMatch(new RegExp(`sensitivePerm="${sensitivePerm.replace(/[.]/g, "\\$&")}"`));
    });
  } else {
    it("does NOT set sensitivePerm (this form is not sensitive)", () => {
      expect(src).not.toMatch(/sensitivePerm=/);
    });
  }

  if (hasImpact) {
    it("maps the settlement/gratuity estimate into impactPreviewSlot (H6)", () => {
      expect(src).toMatch(/impactPreviewSlot=\{/);
      expect(src).toMatch(/تقدير مبدئي للمستحقات/);
    });
  }
});

describe("HR-Wave-1/B Group 2 — exit-create keeps the Saudi labor-law estimate as display-only", () => {
  const src = readFileSync(join(FORMS_DIR, "exit-create.tsx"), "utf8");

  it("articles 84/85 estimate stays client-side DISPLAY ONLY — the server owns the real calculation", () => {
    // The form computes an estimate to show the operator; the payload
    // sent to /hr/exit contains NO gratuity figure (server computes it).
    // If the estimate ever leaks into the mutateAsync payload, the
    // client would be dictating a financial figure — forbidden.
    expect(src).toMatch(/الحساب الدقيق يتم في الخادم/);
    const payloadBlock = src.match(/mutateAsync\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(payloadBlock).not.toMatch(/gratuity/i);
    expect(payloadBlock).not.toMatch(/estimatedGratuity/);
  });

  it("termination warning surfaces inside detailsSlot", () => {
    expect(src).toMatch(/حالة فصل — يرجى التأكد من استكمال الإجراءات التأديبية/);
  });
});

describe("HR-Wave-1/B Group 2 — exclusions pinned (scope honesty)", () => {
  it("training-create is NOT on the scaffold — it creates a training PROGRAM (catalog), no employee axis", () => {
    const src = readFileSync(join(FORMS_DIR, "training-create.tsx"), "utf8");
    expect(src).not.toMatch(/HrCreateScaffold/);
    // Confirm the factual basis for the exclusion stays true: the form
    // has no employee picker and no assignment binding. If someone adds
    // an employee axis to this form later, this pin fails and forces a
    // re-evaluation of the exclusion.
    expect(src).not.toMatch(/EmployeeSelect/);
    expect(src).not.toMatch(/assignmentId/);
  });

  it("evaluation-360-create stays on FormShell (different architecture — deferred, not forgotten)", () => {
    const src = readFileSync(join(FORMS_DIR, "evaluation-360-create.tsx"), "utf8");
    expect(src).not.toMatch(/HrCreateScaffold/);
  });
});

describe("HR-Wave-1/B Group 2 — cumulative count snapshot", () => {
  it("5 admin-side forms now ride the scaffold (groups 1+2)", () => {
    const all = [
      "loans-create.tsx",
      "overtime-create.tsx",
      "contracts-create.tsx",
      "exit-create.tsx",
      "performance-create.tsx",
    ];
    let migrated = 0;
    for (const file of all) {
      const src = readFileSync(join(FORMS_DIR, file), "utf8");
      if (src.includes("HrCreateScaffold")) migrated += 1;
    }
    expect(migrated).toBe(5);
  });

  it("ZERO local AssignmentReadOnlyBadge copies remain across all 5 forms (badge lives in the scaffold)", () => {
    const all = [
      "loans-create.tsx",
      "overtime-create.tsx",
      "contracts-create.tsx",
      "exit-create.tsx",
      "performance-create.tsx",
    ];
    const offenders: string[] = [];
    for (const file of all) {
      const src = readFileSync(join(FORMS_DIR, file), "utf8");
      if (/AssignmentReadOnlyBadge/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
