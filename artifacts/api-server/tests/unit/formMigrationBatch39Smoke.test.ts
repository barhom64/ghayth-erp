import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 39 — settings/workflow-definitions-tab SLA form. 55 of ~280
 * forms now on FormShell + zod.
 *
 * Partial migration of the tab: the SLA-definition form (6 fields,
 * flat) is migrated; the workflow-definition form (with its nested
 * `steps` array) is intentionally left on useState — useFieldArray
 * is a separate pattern that warrants its own batch.
 *
 * The page already used inline Cards (no Dialog), so this is a pure
 * useState → FormShell migration. The toast guard at submit is
 * replaced by zod refinements (deadlineHours > 0, request type
 * required).
 *
 * §3.4 compliant (inline Cards, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings/workflow-definitions-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/workflow-definitions-tab — SLA form on FormShell + zod", () => {
  it("imports the FormShell stack + useFormContext + useWatch", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("useFormContext, useWatch");
  });

  it("slaDefSchema requires requestType + positive deadline + non-negative hours", () => {
    expect(SRC).toContain("slaDefSchema = z.object(");
    expect(SRC).toMatch(/^\s*requestType:\s*z\.string\(\)\.min\(1\)/m);
    expect(SRC).toMatch(/^\s*deadlineHours:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)/m);
    expect(SRC).toMatch(/^\s*warningHours:\s*z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/m);
    expect(SRC).toMatch(/^\s*autoApproveOnTimeout:\s*z\.boolean\(\)/m);
  });

  it("AutoApproveToggle subcomponent drives the boolean via useFormContext", () => {
    expect(SRC).toContain("function AutoApproveToggle()");
    expect(SRC).toContain('useFormContext<SlaDefForm>()');
    expect(SRC).toMatch(/useWatch<SlaDefForm,\s*"autoApproveOnTimeout">/);
    expect(SRC).toMatch(/setValue\(\s*"autoApproveOnTimeout",/);
  });

  it("removes the slaForm useState({requestType, warningHours, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*requestType:\s*"leave"\s*,\s*warningHours:\s*24/);
  });

  it("removes the imperative slaForm setter calls", () => {
    expect(stripComments(SRC)).not.toMatch(/setSlaForm\(\{\s*\.\.\.slaForm/);
  });

  it("handleSaveSla takes typed SlaDefForm + POSTs to /workflows/sla-definitions", () => {
    expect(SRC).toContain("type SlaDefForm = z.infer<typeof slaDefSchema>");
    expect(SRC).toContain("const handleSaveSla = async (values: SlaDefForm)");
    expect(SRC).toContain('apiFetch("/workflows/sla-definitions"');
  });

  it("workflow-definition form (with nested `steps` array) INTENTIONALLY preserved", () => {
    // useFieldArray pattern out of scope — that form still uses
    // useState({...form, steps: [...]}). The page's Input/Label
    // imports survive because of it.
    expect(SRC).toContain("steps: [");
    expect(SRC).toContain('from "@/components/ui/input"');
    expect(SRC).toContain('from "@/components/ui/label"');
  });

  it("stays inline Cards — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
    // ConfirmDeleteDialog is allowed (destructive confirm, not edit):
    expect(SRC).toContain("ConfirmDeleteDialog");
  });
});
