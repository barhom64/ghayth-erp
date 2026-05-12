import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 28 — details/project-detail edit-project form. Picks up
 * where batch 27 left off — the three create sub-forms (phase, task,
 * cost) were migrated there; this is the remaining inline edit form
 * (name + status + budget) with server-state hydration.
 *
 * 44 of ~280 forms now on FormShell + zod.
 *
 * Uses key={project.id} to re-seed defaults if the operator navigates
 * between projects without unmounting. With this final migration the
 * page can drop its <Input> import entirely; <Select> stays because
 * the in-row task-status dropdown still uses it.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "details/project-detail.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("details/project-detail — edit-project form on FormShell + zod", () => {
  it("editProjectSchema requires name + status, coerces budget", () => {
    expect(SRC).toContain("editProjectSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*status:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*budget:\s*z\.coerce\.number\(\)\.nonnegative/m);
  });

  it("FormShell remounts via key={project.id} (server-state hydration)", () => {
    expect(SRC).toMatch(/<FormShell\b[\s\S]{0,200}key=\{project\.id\}/);
  });

  it("removes the editForm useState and the imperative setEditForm in startEdit", () => {
    expect(stripComments(SRC)).not.toMatch(/useState<Record<string,\s*string>>\(\{\}\)/);
    expect(stripComments(SRC)).not.toMatch(/setEditForm\(/);
  });

  it("saveEdit now takes a typed EditProjectForm (was reading from useState)", () => {
    expect(SRC).toContain("type EditProjectForm = z.infer<typeof editProjectSchema>");
    expect(SRC).toContain("const saveEdit = async (values: EditProjectForm)");
    expect(SRC).toContain("body: JSON.stringify({ name: values.name, status: values.status, budget: values.budget })");
  });

  it("startEdit simplifies — was seeding the editForm; now just flips the flag", () => {
    expect(SRC).toContain("const startEdit = () => setEditing(true);");
  });

  it("Input import DROPPED — no <Input> remains in the file", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
  });

  it("Select import PRESERVED — still used by the in-row task-status dropdown", () => {
    expect(SRC).toContain('from "@/components/ui/select"');
  });

  it("Batch-27 sub-forms (phase/task/cost) still present", () => {
    // Regression guard: don't accidentally lose what the previous
    // batch migrated.
    expect(SRC).toContain("phaseSchema");
    expect(SRC).toContain("taskSchema");
    expect(SRC).toContain("costSchema");
  });
});
