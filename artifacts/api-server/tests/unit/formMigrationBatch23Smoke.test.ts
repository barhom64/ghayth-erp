import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 23 — documents/documents-upload form.
 * 36 of ~280 forms now on FormShell + zod.
 *
 * Mixed-state migration: title / description / category are inside
 * FormShell + zod; the file picker and the dynamic entityLinks
 * array stay as parent useState (they don't map cleanly to RHF — file
 * is a `File` instance, entityLinks needs `useFieldArray`). This is
 * intentional and documented in-file. The form is a full page (no
 * modal) — §3.4 compliant.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "documents/documents-upload.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("documents/documents-upload — standard fields on FormShell + zod", () => {
  it("imports the FormShell stack with the basic field components", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormSelectField");
  });

  it("uploadSchema requires title; description and category are free strings", () => {
    expect(SRC).toContain("uploadSchema = z.object(");
    expect(SRC).toMatch(/^\s*title:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*description:\s*z\.string\(\)\.trim\(\)/m);
    expect(SRC).toMatch(/^\s*category:\s*z\.string\(\)/m);
  });

  it("removes the old useState({title, description, category}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*title:\s*""\s*,\s*description:\s*""\s*,\s*category/);
  });

  it("file + entityLinks state intentionally PRESERVED as parent useState", () => {
    // file is a `File` instance (not RHF-friendly); entityLinks
    // is a dynamic array (could be useFieldArray, but out of scope
    // for this batch). Migration is staged.
    expect(SRC).toContain('useState<File | null>');
    expect(SRC).toContain("useState<{ entityType: string; entityId: string }[]>");
  });

  it("submit handler takes the typed UploadForm values + reads file from state", () => {
    expect(SRC).toContain("type UploadForm = z.infer<typeof uploadSchema>");
    expect(SRC).toContain("handleUpload = useCallback(async (values: UploadForm)");
    expect(SRC).toContain("title: values.title");
    expect(SRC).toContain("description: values.description");
    expect(SRC).toContain("category: values.category || null");
  });

  it("the dead `if (!file || !form.title)` guard is replaced by zod + a file-only check", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!file \|\| !form\.title\)/);
    // Replaced by: schema validates title, the file check stays
    // (since `file` is parent state, not part of the schema).
    expect(SRC).toContain('if (!file)');
  });

  it("the submit button is FormShell's (disabled-on-pending lives inside)", () => {
    // Old code had: <Button onClick={handleUpload} disabled={!form.title || !file || uploading}>
    // FormShell renders its own submit; we pass submitLabel that
    // toggles to "جاري الرفع…" while `uploading` is true.
    expect(SRC).toContain('submitLabel={uploading ? "جاري الرفع..." : "رفع المستند"}');
  });

  it("stays a full-page route (CreatePageLayout) — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).toContain("<CreatePageLayout");
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).not.toMatch(/fixed inset-0 bg-black/);
  });
});
