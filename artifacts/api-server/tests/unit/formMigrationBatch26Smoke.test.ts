import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 26 — admin/users editUser form (the create form was migrated
 * previously). 40 of ~280 forms now on FormShell + zod.
 *
 * Uses the key={editUser.id} remount trick to re-seed defaults when
 * the operator clicks "edit" on a different row. PATCH semantics
 * are preserved — the saveEdit handler still only sends role when
 * it changed (compare against editUser.role) and treats blank
 * employeeId as "unlink".
 *
 * §3.4 compliant (inline Card, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "admin/users.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("admin/users — editUser form on FormShell + zod", () => {
  it("editUserSchema requires role", () => {
    expect(SRC).toContain("editUserSchema = z.object(");
    expect(SRC).toMatch(/^\s*role:\s*z\.string\(\)\.min\(1,/m);
    expect(SRC).toMatch(/^\s*employeeId:\s*z\.string\(\)/m);
  });

  it("the FormShell uses key={editUser.id} to re-seed on row switch", () => {
    expect(SRC).toContain("key={editUser.id}");
    expect(SRC).toContain("role: editUser.role || \"\"");
    expect(SRC).toContain("employeeId: editUser.employeeId ? String(editUser.employeeId) : \"\"");
  });

  it("removes the editForm useState — defaults come from editUser via the remount", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*email:\s*""\s*,\s*role:\s*""\s*,\s*employeeId/);
  });

  it("PATCH semantics preserved (only-changed-fields sent)", () => {
    // role only sent if changed; employeeId always normalised.
    expect(SRC).toContain("role: values.role !== editUser.role ? values.role : undefined");
    expect(SRC).toContain("employeeId: values.employeeId ? Number(values.employeeId) : undefined");
  });

  it("saveEdit takes a typed EditUserForm", () => {
    expect(SRC).toContain("type EditUserForm = z.infer<typeof editUserSchema>");
    expect(SRC).toContain("const saveEdit = async (values: EditUserForm)");
  });

  it("the create form (migrated earlier in #301) is still on FormShell", () => {
    // Sanity guard against regression — both forms must coexist.
    expect(SRC).toContain("newUserSchema");
    expect(SRC).toMatch(/<FormShell\b[\s\S]*?schema=\{newUserSchema\}/);
    expect(SRC).toMatch(/<FormShell\b[\s\S]*?schema=\{editUserSchema\}/);
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal)", () => {
    // The page never had a Dialog; verify nothing has crept in.
    expect(SRC).not.toMatch(/<Dialog\b/);
  });

  it("Input/Label still imported — used by the reset-password panel (out of scope)", () => {
    // The reset-password input is a separate concern; its <Input>
    // and <Label> imports must survive this migration.
    expect(SRC).toContain('from "@/components/ui/input"');
    expect(SRC).toContain('from "@/components/ui/label"');
  });
});
