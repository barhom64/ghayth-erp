import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 41 — create/hr/evaluation-360-create. 57 of ~280 forms now
 * on FormShell + zod.
 *
 * Introduces the **auto-draft pattern** with FormShell: replaces the
 * old useAutoDraft hook (which managed localStorage via useState) with
 * a `DraftPersist` subcomponent that subscribes via `useWatch` and
 * writes a debounced JSON snapshot to localStorage. Initial values
 * are loaded synchronously from localStorage and passed as
 * `defaultValues` — no useEffect → setForm round-trip on mount.
 *
 * The `ClearDraftButton`, `EmployeeContextOnSelected`, and
 * `ParticipantPicker` subcomponents all read form state via
 * useWatch / useFormContext.
 *
 * Schema enforces required `employeeId` + `period`; the old manual
 * useFieldErrors + validate({...}) toast guard is gone.
 *
 * §3.4 compliant (full-page CreatePageLayout, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "create/hr/evaluation-360-create.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("create/hr/evaluation-360-create — useAutoDraft → DraftPersist + FormShell", () => {
  it("imports the FormShell stack + useFormContext + useWatch", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain('useFormContext, useWatch } from "react-hook-form"');
  });

  it("evaluationSchema requires employeeId + period", () => {
    expect(SRC).toContain("evaluationSchema = z.object(");
    expect(SRC).toMatch(/^\s*employeeId:\s*z\.string\(\)\.min\(1,/m);
    expect(SRC).toMatch(/^\s*period:\s*z\.string\(\)\.trim\(\)\.min\(1,/m);
  });

  it("loadDraft synchronously hydrates from localStorage at module level", () => {
    expect(SRC).toContain("function loadDraft()");
    expect(SRC).toContain('localStorage.getItem(DRAFT_STORAGE)');
    expect(SRC).toContain("const [initialDraft] = useState(loadDraft)");
  });

  it("DraftPersist subcomponent debounces a localStorage write via useWatch", () => {
    expect(SRC).toContain("function DraftPersist(");
    expect(SRC).toContain("const values = useWatch<EvaluationForm>()");
    expect(SRC).toContain("localStorage.setItem(DRAFT_STORAGE,");
    expect(SRC).toContain("debounceMs = 1000");
  });

  it("ClearDraftButton resets the form AND clears localStorage", () => {
    expect(SRC).toContain("function ClearDraftButton(");
    expect(SRC).toContain('useFormContext<EvaluationForm>()');
    expect(SRC).toMatch(/reset\(\{\s*employeeId:\s*""/);
  });

  it("EmployeeContextOnSelected appears via useWatch on employeeId", () => {
    expect(SRC).toContain("function EmployeeContextOnSelected()");
    expect(SRC).toMatch(/useWatch<EvaluationForm,\s*"employeeId">/);
  });

  it("ParticipantPicker filters the target employee out via useWatch", () => {
    expect(SRC).toContain("function ParticipantPicker(");
    expect(SRC).toContain('String(e.id) !== targetEmployeeId');
  });

  it("removes the useAutoDraft + useFieldErrors hooks (imports + calls)", () => {
    expect(SRC).not.toContain('from "@/hooks/use-auto-draft"');
    expect(SRC).not.toContain('from "@/hooks/use-field-errors"');
    // The hook NAMES may still appear in code comments documenting
    // what they were replaced by — guard against runtime usage only.
    expect(stripComments(SRC)).not.toMatch(/\buseAutoDraft\s*\(/);
    expect(stripComments(SRC)).not.toMatch(/\buseFieldErrors\s*\(/);
  });

  it("removes the imperative validate({...}) toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/const firstError = validate\(\{/);
  });

  it("handleSave takes typed EvaluationForm + clears the draft on success", () => {
    expect(SRC).toContain("type EvaluationForm = z.infer<typeof evaluationSchema>");
    expect(SRC).toContain("const handleSave = async (values: EvaluationForm)");
    expect(SRC).toContain("clearDraftFromStorage()");
  });

  it("participants array preserved as parent useState (out of submit schema)", () => {
    // Participants are a dynamic side-panel list; not part of the
    // submitted-form schema. They get spread into the mutation
    // payload alongside the form values.
    expect(SRC).toMatch(/useState<\{ evaluatorId: string; evaluatorRole:/);
    expect(SRC).toContain("participants: participants.map(p");
  });

  it("drops legacy form-field-wrapper imports — replaced by FormShell primitives", () => {
    expect(SRC).not.toContain('from "@/components/shared/form-field-wrapper"');
  });

  it("stays full-page CreatePageLayout — §3.4 (no modal)", () => {
    expect(SRC).toContain("<CreatePageLayout");
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
