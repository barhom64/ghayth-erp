import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 27 — details/project-detail (phase + task + cost create
 * sub-forms). 43 of ~280 forms now on FormShell + zod (3 in one
 * file).
 *
 * The edit-project form (name / status / budget) is intentionally
 * left on useState — it has its own server-state hydration via
 * startEdit() and is a separate concern (next batch).
 *
 * All three sub-forms are inline cards toggled by showXForm state,
 * §3.4 compliant.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "details/project-detail.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("details/project-detail — phase + task + cost sub-forms on FormShell + zod", () => {
  it("imports the FormShell stack with FormDateField + FormSelectField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormNumberField");
  });

  it("phaseSchema enforces name", () => {
    expect(SRC).toContain("phaseSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
  });

  it("taskSchema uses zod enum for priority", () => {
    expect(SRC).toContain("taskSchema = z.object(");
    expect(SRC).toMatch(/^\s*priority:\s*z\.enum\(\["low",\s*"medium",\s*"high"\]\)/m);
  });

  it("costSchema enforces description + positive amount + closed-set category", () => {
    expect(SRC).toContain("costSchema = z.object(");
    expect(SRC).toMatch(/^\s*description:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*amount:\s*z\.coerce\.number\(\)\.positive/m);
    expect(SRC).toMatch(/category:\s*z\.enum\(\["labor",\s*"materials",\s*"equipment",\s*"subcontractor",\s*"overhead",\s*"other"\]\)/);
  });

  it("removes the three old useState({name|title|description, ...}) shapes", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*startDate:\s*""\s*,\s*endDate/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*title:\s*""\s*,\s*priority:\s*"medium"/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*description:\s*""\s*,\s*amount:\s*""\s*,\s*category/);
  });

  it("typed useApiMutation generics (was useApiMutation<any, any>)", () => {
    expect(SRC).toContain("useApiMutation<any, { name: string; startDate?: string; endDate?: string }>");
    expect(SRC).toContain("useApiMutation<any, { title: string; priority: string; dueDate?: string }>");
  });

  it("addCost handler takes a typed CostForm and no longer reads costForm state", () => {
    expect(SRC).toContain("const addCost = async (values: CostForm)");
    expect(SRC).not.toMatch(/setCostForm\(/);
  });

  it("Select import PRESERVED — used by the in-row task-status dropdown", () => {
    // The Input import was dropped in batch 28 (edit-project form
    // migration); Select stays because the per-row task-status
    // dropdown inside DataTable still uses it.
    expect(SRC).toContain('from "@/components/ui/select"');
  });
});
