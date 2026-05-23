import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 8 of the forms migration. After this PR: 20 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migrations:
 *   client-detail.tsx (portal-account create)
 *   requests-page.tsx (WorkflowsTab — the 3rd form on the page)
 *
 * The portal-account form is small but tightly scoped to its own
 * component (CreatePortalAccountSection). Inline schema + type
 * definition keeps the migration local — no shared module needed.
 *
 * requests-page now has all 3 tabs migrated (request-create from #311,
 * type-create from #311, workflow-create from this PR).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("client-detail — portal-account create on FormShell + zod", () => {
  const SRC = read("client-detail.tsx");

  it("imports the FormShell stack with FormEmailField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormEmailField");
  });

  it("schema validates email format + 6-char min password", () => {
    expect(SRC).toContain("portalSchema = z.object(");
    expect(SRC).toMatch(/email:\s*z\.string\(\)\.email\(/);
    expect(SRC).toMatch(/password:\s*z\.string\(\)\.min\(6/);
  });

  it("removes the manual `if (!form.email || !form.password)` guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.email \|\| !form\.password\)/);
  });

  it("seed clientEmail into defaultValues so the form pre-fills", () => {
    expect(SRC).toMatch(/defaultValues=\{\{\s*email:\s*clientEmail\s*\|\|\s*""/);
  });

  it("removes the manual `disabled={createMut.isPending}` button on submit", () => {
    // The old code had `disabled={createMut.isPending}` on the submit
    // button + a `{isPending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}` label.
    // FormShell handles both natively.
    expect(stripComments(SRC)).not.toMatch(/disabled=\{createMut\.isPending\}/);
  });
});

describe("requests-page — WorkflowsTab on FormShell + zod (3rd form on page)", () => {
  const SRC = read("requests-page.tsx");

  it("defines workflowSchema with required name", () => {
    expect(SRC).toContain("workflowSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
  });

  it("WorkflowsTab createMut generic narrowed Record<string,string> → WorkflowForm", () => {
    expect(SRC).toContain("useApiMutation<unknown, WorkflowForm>");
    expect(stripComments(SRC)).not.toMatch(/useApiMutation<unknown, Record<string, string>>\("\/requests\/workflows"/);
  });

  it("removes the inline onClick handler that did the mutate+reset", () => {
    // Old: `onClick={async () => { await createMut.mutateAsync(form);
    //   setForm({ name: "", description: "" }); setShowForm(false); refetch(); }}`
    // FormShell.onSubmit + ctx.reset cleans this up.
    expect(stripComments(SRC)).not.toMatch(/setForm\(\{\s*name:\s*""\s*,\s*description:\s*""\s*\}\);\s*setShowForm\(false\)/);
  });
});
