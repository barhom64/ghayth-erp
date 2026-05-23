import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 29 — admin/roles newRole (create-custom-role) form. 45 of
 * ~280 forms now on FormShell + zod.
 *
 * Introduces the multi-select pattern: the schema declares
 * `modules: z.array(z.string())`, and a small ModulesPicker
 * subcomponent uses `useFormContext` + `watch/setValue` to drive
 * the existing button-grid UI verbatim (FormShell ships text/number
 * primitives only — multi-select isn't a built-in field type).
 *
 * The roleKey regex (^[a-z_]+$) used to be enforced in handleSubmit
 * via an imperative toast; it now lives in the schema so the submit
 * button can't fire with bad input and the error renders inline.
 *
 * §3.4 compliant (inline Card per tab, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "admin/roles.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("admin/roles — newRole form on FormShell + zod (multi-select)", () => {
  it("imports the FormShell stack + react-hook-form's useFormContext", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain('useFormContext } from "react-hook-form"');
  });

  it("newRoleSchema regex-enforces roleKey + caps level 1..100", () => {
    expect(SRC).toContain("newRoleSchema = z.object(");
    expect(SRC).toMatch(/^\s*roleKey:\s*z\.string\(\)\s*\n\s*\.min\(1/m);
    expect(SRC).toMatch(/\.regex\(\/\^\[a-z_\]\+\$\//);
    expect(SRC).toMatch(/^\s*level:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/m);
  });

  it("modules array is a schema field, not free-floating state", () => {
    expect(SRC).toMatch(/^\s*modules:\s*z\.array\(z\.string\(\)\)/m);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*roleKey:\s*""\s*,\s*label:\s*""\s*,\s*level:\s*"10"/);
  });

  it("ModulesPicker subcomponent drives the button grid via watch/setValue", () => {
    expect(SRC).toContain("function ModulesPicker()");
    expect(SRC).toContain('useFormContext<NewRoleForm>()');
    expect(SRC).toMatch(/setValue\(\s*"modules",/);
  });

  it("removes the imperative regex toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!\/\^\[a-z_\]\+\$\/\.test\(newRole\.roleKey\)\)/);
    expect(stripComments(SRC)).not.toMatch(/setNewRole\(/);
  });

  it("createNewRole takes a typed NewRoleForm (was reading useState)", () => {
    expect(SRC).toContain("type NewRoleForm = z.infer<typeof newRoleSchema>");
    expect(SRC).toContain("const createNewRole = async (values: NewRoleForm)");
  });

  it("Input import DROPPED — no <Input> remains", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
  });

  it("Label + Select imports PRESERVED — used by the permissions tab", () => {
    // The permissions tab still uses <Label> + <Select> for the
    // role picker (out of scope for this batch).
    expect(SRC).toContain('from "@/components/ui/label"');
    expect(SRC).toContain('from "@/components/ui/select"');
  });
});
