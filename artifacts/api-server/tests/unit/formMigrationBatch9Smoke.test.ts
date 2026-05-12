import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 9 of the forms migration. After this PR: 22 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migrations:
 *   finance/intercompany.tsx        intercompany transaction create
 *   finance/project-costing.tsx     project cost create
 *
 * Both pages used `UnifiedDateInput` directly. The FormShell stack
 * has a `FormDateField` that wraps the exact same UnifiedDateInput
 * via react-hook-form's Controller — so the migration is UX-neutral
 * but pulls the date value into the typed form payload.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("finance/intercompany — transaction-create on FormShell + zod with FormDateField", () => {
  const SRC = read("finance/intercompany.tsx");

  it("imports the FormShell stack with FormDateField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
  });

  it("schema requires toCompanyId + positive amount", () => {
    expect(SRC).toContain("intercompanySchema = z.object(");
    expect(SRC).toMatch(/^\s*toCompanyId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*amount:\s*z\.coerce\.number\(\)\.positive\(/m);
  });

  it("removes the raw <UnifiedDateInput> in favour of FormDateField (same widget under the hood)", () => {
    // The component still exists in the codebase; we just don't
    // import it here any more.
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
    expect(SRC).toContain("<FormDateField");
  });

  it("removes the inline <Input>/<Textarea>/<Select> usage now that FormShell renders them", () => {
    // Page used Input, Textarea, Select directly. After migration the
    // page's form fields all come from FormShell.
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/textarea"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
  });

  it("removes the legacy <form onSubmit={handleSubmit}> wrapping — FormShell owns the <form>", () => {
    expect(stripComments(SRC)).not.toMatch(/<form onSubmit=\{handleSubmit\}/);
  });
});

describe("finance/project-costing — cost-create on FormShell + zod with closed category enum", () => {
  const SRC = read("finance/project-costing.tsx");

  it("imports the FormShell stack with FormDateField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormDateField");
  });

  it("schema requires projectId + positive amount + closes category enum", () => {
    expect(SRC).toContain("costSchema = z.object(");
    expect(SRC).toMatch(/^\s*projectId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*amount:\s*z\.coerce\.number\(\)\.positive\(/m);
    expect(SRC).toContain('z.enum(["direct", "indirect", "overhead", "labor", "materials"])');
  });

  it("CATEGORY_OPTIONS reified as a named constant (was inline JSX SelectItems)", () => {
    expect(SRC).toContain("CATEGORY_OPTIONS = [");
    expect(stripComments(SRC)).not.toMatch(/<SelectItem value="direct">تكلفة مباشرة<\/SelectItem>/);
  });

  it("defaultValues uses `as const` on the category literal so type-narrowing succeeds", () => {
    expect(SRC).toContain('category: "direct" as const');
  });

  it("removes the Number(form.x) cast at submit (schema coerced)", () => {
    expect(stripComments(SRC)).not.toMatch(/amount:\s*Number\(costForm\.amount\)/);
  });
});
