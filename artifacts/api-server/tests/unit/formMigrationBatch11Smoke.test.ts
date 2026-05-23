import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 11 of the forms migration. After this PR: 24 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migration:
 *   hr/idp.tsx     individual development plan create
 *
 * First page in this migration sweep to switch off `<DatePicker>` to
 * `FormDateField`. FormDateField wraps `UnifiedDateInput` which
 * exposes the SAME dual Hijri/Gregorian calendar via DayPicker plus
 * presets — the migration is a functional upgrade, not a downgrade.
 *
 * Multi-line textareas (goals, skills) keep their newline-separated
 * format. The split-on-newline happens in the submit handler so the
 * server gets a string array.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("hr/idp — IDP create on FormShell + zod with FormDateField", () => {
  const SRC = read("hr/idp.tsx");

  it("imports the FormShell stack with FormDateField + FormTextareaField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormTextareaField");
  });

  it("schema requires employeeId — was `if (!form.employeeId)` toast guard", () => {
    expect(SRC).toContain("idpSchema = z.object(");
    expect(SRC).toMatch(/^\s*employeeId:\s*z\.string\(\)\.min\(1/m);
  });

  it("removes the inline <DatePicker> import in favour of FormDateField", () => {
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
    expect(SRC).toContain("<FormDateField");
  });

  it("preserves the goals/skills newline-split at submit (not in the schema)", () => {
    // The textarea stores `"goal 1\ngoal 2"` — the schema validates
    // it as a string. The handler splits into an array right before
    // the API call. Without this, the typeahead/preview would have to
    // do the same split client-side.
    expect(SRC).toMatch(/values\.goals \? values\.goals\.split\("\\n"\)\.filter\(Boolean\) : \[\]/);
    expect(SRC).toMatch(/values\.skills \? values\.skills\.split\("\\n"\)\.filter\(Boolean\) : \[\]/);
  });

  it("keeps the Select imports — used by the table's inline status-update widget", () => {
    // The DataTable's status column has its OWN inline <Select> (not
    // part of the migrated form). Verify the imports survived so
    // typecheck stays clean.
    expect(SRC).toContain('Select, SelectContent, SelectItem, SelectTrigger, SelectValue');
  });

  it("removes the bare `if (!form.employeeId)` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.employeeId\) \{ toast/);
  });

  it("removes the manual `disabled={createIdpMut.isPending}` + label swap", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{createIdpMut\.isPending\}/);
  });
});
