import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 25 — settings-rules CreateRuleForm. 13-field IF-THEN business
 * rule builder.
 *
 * 39 of ~280 forms now on FormShell + zod.
 *
 * Was a single inline Card with raw <select> + Input + Label and an
 * imperative `if (!form.name || !form.triggerEvent || !form.actionType)`
 * toast guard. After: zod schema enforces all three at the boundary,
 * the manual toast guard is gone, and the priority field is properly
 * coerced + bounded (1-100 integer).
 *
 * §3.4 compliant (inline Card, no modal). The IF/THEN visual grouping
 * is preserved as nested blue/green divs around FormGrid blocks.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings-rules.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings-rules — CreateRuleForm on FormShell + zod", () => {
  it("imports the FormShell stack with FormSelectField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormGrid");
  });

  it("ruleSchema requires name + triggerEvent + actionType (was a manual toast guard)", () => {
    expect(SRC).toContain("ruleSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*triggerEvent:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*actionType:\s*z\.string\(\)\.min\(1/m);
  });

  it("priority is coerced + bounded 1..100", () => {
    expect(SRC).toMatch(/^\s*priority:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/m);
  });

  it("notifPriority is a real enum (was free-form raw <option>)", () => {
    expect(SRC).toMatch(/^\s*notifPriority:\s*z\.enum\(\["normal",\s*"high",\s*"urgent"\]\)/m);
  });

  it("removes the old useState({name, description, triggerEvent, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*description:\s*""\s*,\s*triggerEvent/);
  });

  it("removes the dead toast guard and the useToast import", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.name \|\| !form\.triggerEvent \|\| !form\.actionType\)/);
    expect(SRC).not.toContain('from "@/hooks/use-toast"');
  });

  it("removes dead Input/Label imports (FormShell renders them)", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
  });

  it("submit handler types values via z.infer and preserves the actionConfig nesting", () => {
    expect(SRC).toContain("type RuleForm = z.infer<typeof ruleSchema>");
    expect(SRC).toContain("actionConfig: {");
    expect(SRC).toContain("title: values.notifTitle || values.name");
  });
});
