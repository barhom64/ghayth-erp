import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pilot of the forms migration the audit flagged ("280+ pages
 * useState forms, 6 react-hook-form"). This smoke locks in the
 * support knowledge-base create form as the FIRST page migrated
 * end-to-end to FormShell + zod, and asserts the shape of the
 * migration so a future refactor that accidentally re-introduces
 * useState in this exact spot is caught in CI.
 *
 * Reads the SOURCE file (not the bundle) so the test is independent
 * of the frontend build; same pattern as the other route smokes.
 */
const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages/support.tsx"),
  "utf8",
);

describe("support/kb — migrated to FormShell + zod", () => {
  it("imports the FormShell stack", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormGrid");
  });

  it("defines a zod schema for the kb create form", () => {
    expect(SRC).toContain("const kbSchema = z.object(");
    // Title is the required field per the existing manual `!newForm.title`
    // guard — the zod migration must keep it required.
    expect(SRC).toMatch(/title:\s*z\.string\(\)\.trim\(\)\.min\(1/);
    // Status is a closed enum (published | draft | archived) — guard
    // against accidentally widening it to `z.string()`.
    expect(SRC).toContain('z.enum(["published", "draft", "archived"])');
  });

  it("no longer holds the kb form as ad-hoc useState", () => {
    // The migration deletes the `useState({ title, content, category,
    // status })` row. A regression would re-introduce it; assert the
    // exact shape that lived there before is gone.
    expect(SRC).not.toMatch(/useState\(\{\s*title:\s*""\s*,\s*content:\s*""/);
    expect(SRC).not.toContain('setNewForm(p => ({ ...p,');
  });

  it("uses mutateAsync + ctx.reset inside FormShell onSubmit", () => {
    // The migration is "useState → react-hook-form", which means
    // submit goes through `form.handleSubmit` (via FormShell). The
    // success path must reset the form so the operator can re-open
    // the dialog on a clean slate.
    expect(SRC).toContain("await createMut.mutateAsync(values)");
    expect(SRC).toContain("ctx.reset()");
  });

  it("preserves the cancel/secondary action via FormShell.secondaryActions", () => {
    // Keep the existing "Cancel" UX path so the migration is invisible
    // to the user — same buttons, same flow.
    expect(SRC).toContain("secondaryActions=");
    expect(SRC).toMatch(/إلغاء/);
  });
});
