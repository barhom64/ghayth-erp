/**
 * HR-Wave-1/B / Group 1 — scaffold-adoption smoke for the first 3
 * admin-side, assignment-axis HR create forms: loans, overtime,
 * contracts.
 *
 * Pins:
 *   1. Each form imports HrCreateScaffold from the canonical path.
 *   2. Each form NO LONGER imports the primitives that the scaffold
 *      owns (EmployeeSelect / EmployeeContextCard / CreationDateField)
 *      — the scaffold renders them. If a refactored form keeps the
 *      old imports, we get drift between the form and the scaffold
 *      and the doctrine («reuse, not invent») cracks.
 *   3. Each form uses follows="assignment" — preserves the per-record
 *      assignment binding the API depends on.
 *   4. Each form derives assignmentId from the selected employee's
 *      activeAssignmentId, not from form state under a misleading
 *      variable name (pre-refactor bug: form.assignmentId held an
 *      employee id; the API then got the wrong number on multi-
 *      assignment shops).
 *   5. Sensitive forms (contracts → carries salary) opt in to
 *      sensitivePerm so the scaffold wraps the body in PermissionGate.
 *   6. The save handler blocks submit when no active assignment is
 *      resolved — surfaces the «no assignment, no record» rule that
 *      the data model otherwise can't enforce client-side.
 *
 * Source-only smoke; runs in <100ms.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FORMS_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/hr");

const REFACTORED_FORMS = [
  { file: "loans-create.tsx", sensitivePerm: null, saveLabel: "إرسال طلب السلفة", contextSection: "loans" },
  { file: "overtime-create.tsx", sensitivePerm: null, saveLabel: "إرسال الطلب", contextSection: "overtime" },
  { file: "contracts-create.tsx", sensitivePerm: "hr.contracts:create", saveLabel: "إنشاء العقد", contextSection: null },
];

describe.each(REFACTORED_FORMS)("HR-Wave-1/B Group 1 — $file adopts HrCreateScaffold", ({ file, sensitivePerm, saveLabel, contextSection }) => {
  const src = readFileSync(join(FORMS_DIR, file), "utf8");

  it("imports HrCreateScaffold from the canonical path", () => {
    expect(src).toMatch(/import \{ HrCreateScaffold \} from "@\/components\/shared\/hr-create-scaffold"/);
  });

  it("renders <HrCreateScaffold> inside CreatePageLayout", () => {
    expect(src).toMatch(/<HrCreateScaffold/);
    expect(src).toMatch(/<\/CreatePageLayout>/);
  });

  it("uses follows=\"assignment\" (preserves per-record assignment binding)", () => {
    expect(src).toMatch(/follows="assignment"/);
  });

  it("derives assignmentId from selected employee's activeAssignmentId (not from form state)", () => {
    expect(src).toMatch(/activeAssignmentId\s*\?\?\s*selected/);
    expect(src).toMatch(/assignmentId=\{assignmentId \? String\(assignmentId\) : undefined\}/);
  });

  it("submit handler blocks when no active assignment is resolved", () => {
    expect(src).toMatch(/لا يوجد تعيين فعّال لهذا الموظف/);
    expect(src).toMatch(/if \(!assignmentId\) \{/);
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

  it("passes selectedEmployee so the scaffold's DefaultAssignmentBadge renders (no manual slot)", () => {
    // Wave-1/B group 2 moved the badge INTO the scaffold. Forms now
    // pass only the employee row; the scaffold renders the auto-bind
    // badge by default. A form that re-introduces a local badge copy
    // (or a manual assignmentSelectorSlot for single-assignment use)
    // is regressing to the duplicated pattern.
    expect(src).toMatch(/selectedEmployee=\{(?:selectedEmp|selectedEmployee)\}/);
    expect(src).not.toMatch(/assignmentSelectorSlot=/);
    expect(src).not.toMatch(/function AssignmentReadOnlyBadge/);
  });

  if (sensitivePerm) {
    it(`opts in to sensitivePerm="${sensitivePerm}" (scaffold wraps body in PermissionGate)`, () => {
      expect(src).toMatch(new RegExp(`sensitivePerm="${sensitivePerm.replace(/[.]/g, "\\$&")}"`));
    });
  } else {
    it("does NOT set sensitivePerm (this form is not sensitive)", () => {
      expect(src).not.toMatch(/sensitivePerm=/);
    });
  }

  if (contextSection) {
    it(`passes contextSection="${contextSection}" so the 360 card emphasises the relevant history`, () => {
      expect(src).toMatch(new RegExp(`contextSection="${contextSection}"`));
    });
  }
});

describe("HR-Wave-1/B Group 1 — count snapshot (forms migrated this round)", () => {
  it("exactly 3 forms refactored (loans / overtime / contracts)", () => {
    let migrated = 0;
    for (const { file } of REFACTORED_FORMS) {
      const src = readFileSync(join(FORMS_DIR, file), "utf8");
      if (src.includes("HrCreateScaffold")) migrated += 1;
    }
    expect(migrated).toBe(3);
  });

  it("no form in the migrated set still inlines EmployeeContextCard manually", () => {
    // The 360 card now arrives via the scaffold's H2. If a form
    // still imports + renders it directly, we have two cards
    // stacked or the scaffold's gets skipped.
    const offenders: string[] = [];
    for (const { file } of REFACTORED_FORMS) {
      const src = readFileSync(join(FORMS_DIR, file), "utf8");
      if (/import \{[^}]*EmployeeContextCard[^}]*\}/.test(src)) offenders.push(file);
      if (/<EmployeeContextCard\b/.test(src)) offenders.push(`${file} (rendered)`);
    }
    expect(offenders).toEqual([]);
  });
});
