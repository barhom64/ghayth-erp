import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 4 of the forms migration. After this PR: 9 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migrations:
 *   projects/risks.tsx        risk-create form (probability/impact 1-5)
 *   admin/users-tab.tsx       new-user form with email validation
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("projects/risks — risk-create form on FormShell + zod", () => {
  const SRC = read("projects/risks.tsx");

  it("imports the FormShell stack", () => {
    // Accept either the legacy `@/components/form-shell` path or the
    // canonical `@workspace/ui-core` re-export (UNIFICATION_PLAN §P8).
    const hasFormShellImport =
      SRC.includes('from "@/components/form-shell"') ||
      SRC.includes('from "@workspace/ui-core"');
    expect(hasFormShellImport).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
  });

  it("schema bounds probability and impact to integers 1-5", () => {
    expect(SRC).toContain("riskSchema = z.object(");
    // Both fields share the same per-line pattern: coerce.number().int().min(1).max(5)
    // — restrict to one line to avoid the field's later appearance in
    // defaultRiskForm matching.
    expect(SRC).toMatch(/^\s*probability:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1.+\.max\(5/m);
    expect(SRC).toMatch(/^\s*impact:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1.+\.max\(5/m);
  });

  it("removes the Number(form.probability) + Number(form.impact) coercion at submit", () => {
    expect(stripComments(SRC)).not.toMatch(/probability:\s*Number\(form\.probability\)/);
    expect(stripComments(SRC)).not.toMatch(/impact:\s*Number\(form\.impact\)/);
  });

  it("defines named PROBABILITY_OPTIONS + IMPACT_OPTIONS arrays (no inline 1..5 array map)", () => {
    expect(SRC).toContain("PROBABILITY_OPTIONS = [");
    expect(SRC).toContain("IMPACT_OPTIONS = [");
    // Old code used `[1,2,3,4,5].map(...)` inline — the named const
    // is searchable + reusable.
    expect(stripComments(SRC)).not.toMatch(/\[1,2,3,4,5\]\.map/);
  });

  it("preserves the projectId guard outside the form (form can't fire without one)", () => {
    expect(SRC).toMatch(/if \(!projectId\)/);
  });
});

describe("admin/users-tab — new-user form with email validation in zod", () => {
  const SRC = read("admin/users-tab.tsx");

  it("imports the FormShell stack with FormEmailField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormEmailField");
  });

  it("schema validates email format client-side (was: bare !form.email)", () => {
    expect(SRC).toContain("newUserSchema = z.object(");
    expect(SRC).toMatch(/email:\s*z\.string\(\)\.email\(/);
  });

  it("removes the manual `disabled={!form.email || submitting}` guard", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{!form\.email/);
  });

  it("removes the local submitting state — FormShell tracks isSubmitting", () => {
    expect(stripComments(SRC)).not.toMatch(/const \[submitting, setSubmitting\] = useState/);
  });

  it("password remains optional (server auto-generates) but the form doesn't send empty string", () => {
    // Old: `password: form.password || undefined`.
    // Migration keeps that semantics inside the typed handler.
    expect(SRC).toContain("password: values.password || undefined");
  });

  it("employeeId is selected via FormSelectField with explicit '' = no link option", () => {
    // Old code used "_none" sentinel + `v === \"_none\" ? \"\"` mapping.
    // FormSelectField maps "" to a real option with label "بدون ربط".
    expect(SRC).toMatch(/value:\s*"",\s*label:\s*"— بدون ربط —"/);
    expect(stripComments(SRC)).not.toMatch(/v === "_none"/);
  });
});
