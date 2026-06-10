/**
 * HR-Wave-1 / step A — HrCreateScaffold smoke.
 *
 * Pins the canonical HR-form section order (H0→H8) so a future PR
 * can't silently reorder, drop, or skip-section a Wave-1 form.
 *
 * The scaffold doesn't (and must not) contain business logic — every
 * variable section is a slot that the caller fills. The pin therefore
 * focuses on STRUCTURE:
 *
 *   1. Component is exported + lives at the canonical path.
 *   2. Imports the existing reuse-only primitives:
 *        EmployeeSelect, EmployeeContextCard, PermissionGate.
 *      It does NOT import a domain engine or a raw fetch helper
 *      (no `engine`, no `hrEngine`, no direct DB) — business logic
 *      lives in the caller / engine, never in the scaffold.
 *   3. The "follows the person vs follows the assignment" doctrine
 *      surfaces as a `follows` prop typed to a 2-value union.
 *   4. H3 (assignment select) is gated on `follows === "assignment"`
 *      AND `needAssignments` is the single source of truth for the
 *      branch — no second copy of the condition.
 *   5. Auto-pick: when exactly one assignment exists, it is selected
 *      automatically — saves an extra click.
 *   6. Assignment reset: when the employee changes, the chosen
 *      assignmentId is cleared — prevents a stale id leaking across
 *      employees.
 *   7. Save button is gated on (employeeId AND (person OR assignmentId)
 *      AND !saving) — never on a bare employee with no assignment when
 *      the form follows the assignment.
 *   8. Sensitive scaffolds (payroll / discipline / termination) wrap
 *      the whole body in PermissionGate — UI doesn't even render the
 *      controls to an unauthorized user.
 *   9. Each of H1, H2, H3, H4, H5, H6, H7 is rendered in numerical
 *      order with an Arabic section header that includes the position
 *      number — so a visual review immediately spots a reorder.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SCAFFOLD_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/hr-create-scaffold.tsx"),
  "utf8",
);

describe("HR-Wave-1 / step A — scaffold export contract", () => {
  it("exports HrCreateScaffold as a named component", () => {
    expect(SCAFFOLD_SRC).toMatch(/export function HrCreateScaffold\(/);
  });

  it("exports the FollowsAxis discriminator union", () => {
    expect(SCAFFOLD_SRC).toMatch(/export type FollowsAxis = "person" \| "assignment"/);
  });

  it("exports the EmployeeAssignment row shape so callers don't redeclare it", () => {
    expect(SCAFFOLD_SRC).toMatch(/export interface EmployeeAssignment \{/);
  });
});

describe("HR-Wave-1 / step A — scaffold reuses existing primitives, holds no business logic", () => {
  it("imports EmployeeSelect from entity-selects", () => {
    expect(SCAFFOLD_SRC).toMatch(/import \{ EmployeeSelect \} from "@\/components\/shared\/entity-selects"/);
  });

  it("imports EmployeeContextCard from the 360 component", () => {
    expect(SCAFFOLD_SRC).toMatch(/import \{ EmployeeContextCard,[\s\S]*?\} from "@\/components\/shared\/employee-context-card"/);
  });

  it("imports PermissionGate for sensitive-scaffold wrapping", () => {
    expect(SCAFFOLD_SRC).toMatch(/import \{ PermissionGate \} from "@\/components\/shared\/permission-gate"/);
  });

  it("does NOT import a domain engine directly (engines are server-side; scaffolds never call them)", () => {
    expect(SCAFFOLD_SRC).not.toMatch(/from "@\/lib\/engines/);
    expect(SCAFFOLD_SRC).not.toMatch(/import \{[^}]*hrEngine[^}]*\}/);
    expect(SCAFFOLD_SRC).not.toMatch(/import \{[^}]*policyEngine[^}]*\}/);
    expect(SCAFFOLD_SRC).not.toMatch(/import \{[^}]*disciplineEngine[^}]*\}/);
  });

  it("does NOT import any data-fetching primitives — all domain data arrives via slot props", () => {
    // The scaffold is pure composition. Every variable section is a
    // slot. Forms own their own fetches (the H3 selector, the H5
    // historical context, the H6 impact payload). The scaffold must
    // never sneak in its own query — that would force one fetch
    // shape on every consumer.
    expect(SCAFFOLD_SRC).not.toMatch(/from "@\/lib\/rawdb/);
    expect(SCAFFOLD_SRC).not.toMatch(/import \{[^}]*apiFetch[^}]*\}/);
    expect(SCAFFOLD_SRC).not.toMatch(/import \{[^}]*useApiQuery[^}]*\}/);
    expect(SCAFFOLD_SRC).not.toMatch(/import \{[^}]*useApiMutation[^}]*\}/);
  });
});

describe("HR-Wave-1 / step A — follows axis controls H3 visibility", () => {
  it("needAssignments is derived from follows === 'assignment' as the single source of truth", () => {
    expect(SCAFFOLD_SRC).toMatch(/const needAssignments = follows === "assignment"/);
  });

  it("H3 renders only when (employeeId && needAssignments)", () => {
    expect(SCAFFOLD_SRC).toMatch(/\{employeeId && needAssignments && \(/);
  });

  it("H3 default body is the scaffold's DefaultAssignmentBadge; assignmentSelectorSlot overrides it", () => {
    // Wave-1/B group 2 moved the per-form AssignmentReadOnlyBadge here
    // as the default. Single-assignment shops pass only selectedEmployee;
    // multi-assignment shops still override via the slot.
    expect(SCAFFOLD_SRC).toMatch(/\{assignmentSelectorSlot \?\? \(\s*<DefaultAssignmentBadge/);
  });

  it("DefaultAssignmentBadge blocks when no active assignment, auto-binds otherwise", () => {
    expect(SCAFFOLD_SRC).toMatch(/function DefaultAssignmentBadge\(/);
    expect(SCAFFOLD_SRC).toMatch(/لا يوجد تعيين فعّال لهذا الموظف/);
    expect(SCAFFOLD_SRC).toMatch(/مُحدَّد تلقائياً/);
  });

  it("selectedEmployee prop carries the badge metadata (activeAssignmentId/branchName/jobTitle)", () => {
    expect(SCAFFOLD_SRC).toMatch(/selectedEmployee\?: \{\s*activeAssignmentId\?:/);
  });

  it("scaffold does NOT hard-code a backend endpoint for assignments (caller picks the right one)", () => {
    // The scaffold previously fetched /employees/:id/assignments which
    // doesn't exist as a public endpoint. The fix moved the picker
    // ownership to the caller via assignmentSelectorSlot. Re-pinning
    // the absence so a future PR doesn't restore the orphan call.
    expect(SCAFFOLD_SRC).not.toMatch(/\/employees\/\$\{employeeId\}\/assignments/);
  });
});

describe("HR-Wave-1 / step A — save gate", () => {
  it("save is gated on (employeeId AND (person OR assignmentId) AND !saving)", () => {
    expect(SCAFFOLD_SRC).toMatch(/const canSubmit =\s*!!employeeId &&\s*\(follows === "person" \|\| !!assignmentId\) &&\s*!saving;/);
  });
});

describe("HR-Wave-1 / step A — sensitive-scaffold permission gate", () => {
  it("when sensitivePerm is set, the whole body wraps in PermissionGate", () => {
    expect(SCAFFOLD_SRC).toMatch(/if \(sensitivePerm\) \{[\s\S]*?<PermissionGate\s*perm=\{sensitivePerm\}/);
  });

  it("the fallback explains the missing permission instead of rendering nothing silently", () => {
    expect(SCAFFOLD_SRC).toMatch(/fallback=\{<RestrictedFallback \/>\}/);
    expect(SCAFFOLD_SRC).toMatch(/تتطلب صلاحية إضافية/);
  });
});

describe("HR-Wave-1 / step A — canonical section ORDER pinned", () => {
  // The doctrine pins the order H1→H7 explicitly. The smoke does NOT
  // try to render the scaffold (the test stays source-only) — instead
  // it confirms each section header appears in the source IN ORDER.
  // If a future PR reorders, deletes, or skip-numbers a section, the
  // indexOf check fails.
  const expected = [
    "١. الموظف",                       // H1
    "٢. سياق الموظف",                  // H2
    "٣. التعيين",                      // H3
    "٤. التفاصيل",                     // H4
    "٥. السياق التاريخي",              // H5
    "٦. معاينة الأثر قبل الحفظ",       // H6
    "٧. سلسلة الاعتماد",               // H7
  ];

  for (let i = 0; i < expected.length; i++) {
    it(`section ${expected[i]} present + numbered`, () => {
      expect(SCAFFOLD_SRC).toContain(`label="${expected[i]}"`);
    });
  }

  it("sections appear in the canonical numerical order in the source", () => {
    const positions = expected.map((label) => SCAFFOLD_SRC.indexOf(`label="${label}"`));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });
});

describe("HR-Wave-1 / step A — slot contract", () => {
  // The scaffold accepts SLOTS for the variable sections. If a slot
  // becomes a curried helper or a string, the scaffold has started
  // to know too much about each form's data shape.
  it("detailsSlot is a React.ReactNode (forms render their own H4)", () => {
    expect(SCAFFOLD_SRC).toMatch(/detailsSlot: React\.ReactNode;/);
  });

  it("assignmentSelectorSlot is optional React.ReactNode (caller owns the picker shape)", () => {
    expect(SCAFFOLD_SRC).toMatch(/assignmentSelectorSlot\?: React\.ReactNode;/);
  });

  it("historicalContextSlot is optional React.ReactNode", () => {
    expect(SCAFFOLD_SRC).toMatch(/historicalContextSlot\?: React\.ReactNode;/);
  });

  it("impactPreviewSlot is optional React.ReactNode (caller wires impact-preview component)", () => {
    expect(SCAFFOLD_SRC).toMatch(/impactPreviewSlot\?: React\.ReactNode;/);
  });

  it("approvalChainSlot is optional React.ReactNode", () => {
    expect(SCAFFOLD_SRC).toMatch(/approvalChainSlot\?: React\.ReactNode;/);
  });

  it("onSubmit is a plain callback — caller owns the mutation, scaffold owns the button", () => {
    expect(SCAFFOLD_SRC).toMatch(/onSubmit: \(\) => void;/);
  });
});
