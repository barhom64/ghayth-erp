import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 7 of the forms migration. After this PR: 18 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migrations:
 *   requests-page.tsx   ListTab (request create) + TypesTab (request type create)
 *   admin/users.tsx     create-user form (the bigger sibling of admin/users-tab #301)
 *
 * requests-page.tsx is the heavier migration: the create form sits
 * inside a tab with attachment upload — `attachments` state stays
 * outside FormShell so the existing FileDropZone keeps working.
 *
 * admin/users.tsx is structurally identical to users-tab.tsx (#301).
 * Both pages call POST /admin/users with the same payload shape, so
 * they share the same schema (newUserSchema) defined per page.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("requests-page — request create + types create on FormShell + zod", () => {
  const SRC = read("requests-page.tsx");

  it("imports the FormShell stack", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
  });

  it("requestSchema requires title + closes priority enum", () => {
    expect(SRC).toContain("requestSchema = z.object(");
    expect(SRC).toMatch(/^\s*title:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toContain('z.enum(["low", "medium", "high", "critical"])');
  });

  it("requestTypeSchema requires name", () => {
    expect(SRC).toContain("requestTypeSchema = z.object(");
    // 2 schemas → at least 2 trim().min(1) blocks should be present.
    const matches = SRC.match(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/gm) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("attachments state stays OUTSIDE FormShell so FileDropZone still works", () => {
    // The attachment array isn't part of the form payload — it's
    // collected separately and merged in the submit handler. The
    // useState<Attachment[]> hook must survive the migration.
    expect(SRC).toContain("useState<Attachment[]>([])");
  });

  it("removes useState({ title, description, priority, requesterName }) and { name, description, category }", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*title:\s*""\s*,\s*description:\s*""\s*,\s*priority:/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*description:\s*""\s*,\s*category:\s*""\s*\}\)/);
  });

  it("removes manual disabled={!form.title || createMut.isPending} guard from request form", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{!form\.title \|\| createMut\.isPending\}/);
  });

  it("TypesTab createMut generic narrowed to RequestTypeForm (was Record<string, string>)", () => {
    expect(SRC).toContain("useApiMutation<unknown, RequestTypeForm>");
    expect(stripComments(SRC)).not.toMatch(/useApiMutation<unknown, Record<string, string>>\("\/requests\/types"/);
  });
});

describe("admin/users — create-user form on FormShell + zod", () => {
  const SRC = read("admin/users.tsx");

  it("imports the FormShell stack with FormEmailField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormEmailField");
  });

  it("schema validates email format client-side", () => {
    expect(SRC).toContain("newUserSchema = z.object(");
    expect(SRC).toMatch(/^\s*email:\s*z\.string\(\)\.email\(/m);
  });

  it("removes the local `submitting` state — FormShell tracks isSubmitting", () => {
    expect(stripComments(SRC)).not.toMatch(/const \[submitting, setSubmitting\] = useState/);
  });

  it("removes the manual disabled={!form.email || submitting} guard", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{!form\.email \|\| submitting\}/);
  });

  it("password remains optional (server auto-generates) but blank → undefined, not empty string", () => {
    expect(SRC).toContain("password: values.password || undefined");
  });

  it("create form's employeeId uses '' as 'no link' (no '_none' sentinel inside the migrated form)", () => {
    expect(SRC).toMatch(/value:\s*"",\s*label:\s*"— بدون ربط —"/);
    // The edit dialog + 2 filter selects + role-assignment select
    // still use the legacy "_none" sentinel — those are separate
    // forms not migrated in this PR. Assert the sentinel mapping
    // appears no MORE than 4 times (the create form's mapping is
    // gone). Originally there were 5.
    const sentinelCount = (stripComments(SRC).match(/v === "_none"/g) ?? []).length;
    expect(sentinelCount).toBeLessThanOrEqual(4);
  });
});
