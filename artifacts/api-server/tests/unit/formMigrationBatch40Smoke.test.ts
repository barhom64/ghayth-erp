import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 40 — settings/workflow-definitions-tab workflow form
 * (Create/Edit with nested `steps` array). 56 of ~280 forms now on
 * FormShell + zod.
 *
 * Introduces the useFieldArray pattern: the dynamic `steps[]`
 * editor uses react-hook-form's useFieldArray to append / remove
 * rows, replacing the old imperative addStep/removeStep/updateStep
 * helpers. Each step's per-row fields register directly to
 * `steps.${idx}.fieldName` paths.
 *
 * Schema:
 *   - workflowDefSchema requires steps.min(1) — server crashes if
 *     a definition has zero approval steps.
 *   - workflowStepSchema enforces non-empty stepName, role required,
 *     non-negative slaHours, boolean autoApproveOnTimeout.
 *
 * The page now has BOTH forms (SLA #39 + workflow #40) on
 * FormShell. Mixed-state migrations from previous batches are
 * complete here.
 *
 * §3.4 compliant (inline Cards, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings/workflow-definitions-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/workflow-definitions-tab — workflow form with useFieldArray", () => {
  it("imports useFieldArray from react-hook-form", () => {
    expect(SRC).toContain("useFieldArray");
    expect(SRC).toContain('from "react-hook-form"');
  });

  it("workflowDefSchema enforces steps.min(1) + workflowStepSchema validates each row", () => {
    expect(SRC).toContain("workflowStepSchema = z.object(");
    expect(SRC).toContain("workflowDefSchema = z.object(");
    expect(SRC).toMatch(/steps:\s*z\.array\(workflowStepSchema\)\.min\(1,/);
    expect(SRC).toMatch(/stepName:\s*z\.string\(\)\.trim\(\)\.min\(1,/);
  });

  it("StepsEditor uses useFieldArray for append/remove", () => {
    expect(SRC).toContain("function StepsEditor(");
    expect(SRC).toContain('useFieldArray({ control, name: "steps" })');
    expect(SRC).toMatch(/append\(\{\s*stepName:/);
    expect(SRC).toMatch(/remove\(idx\)/);
  });

  it("dynamic field paths register to steps.${idx}.fieldName", () => {
    expect(SRC).toMatch(/register\(`steps\.\$\{idx\}\.stepName`\)/);
    expect(SRC).toMatch(/register\(`steps\.\$\{idx\}\.requiredRole`\)/);
    expect(SRC).toMatch(/register\(`steps\.\$\{idx\}\.slaHours`,\s*\{ valueAsNumber: true \}/);
  });

  it("removes the imperative addStep/removeStep/updateStep helpers", () => {
    expect(stripComments(SRC)).not.toMatch(/const addStep = \(\)/);
    expect(stripComments(SRC)).not.toMatch(/const removeStep = \(idx/);
    expect(stripComments(SRC)).not.toMatch(/const updateStep = \(idx/);
  });

  it("WorkflowToggles drives isReturnable + enableEscalation via useWatch", () => {
    expect(SRC).toContain("function WorkflowToggles()");
    expect(SRC).toMatch(/useWatch<WorkflowDefForm,\s*"isReturnable">/);
    expect(SRC).toMatch(/useWatch<WorkflowDefForm,\s*"enableEscalation">/);
  });

  it("server-state hydration via key={editingId ?? 'new'}", () => {
    expect(SRC).toContain('key={editingId ?? "new"}');
    expect(SRC).toContain("setFormSeed(");
  });

  it("removes the workflow form useState({...steps[]}) shape and its helpers", () => {
    expect(stripComments(SRC)).not.toMatch(/setForm\(\{\s*\.\.\.form,\s*steps:/);
  });

  it("handleSave takes typed WorkflowDefForm + PUT/POST to /workflows/definitions", () => {
    expect(SRC).toContain("type WorkflowDefForm = z.infer<typeof workflowDefSchema>");
    expect(SRC).toContain("const handleSave = async (values: WorkflowDefForm)");
    expect(SRC).toContain('apiFetch(`/workflows/definitions/${editingId}`');
    expect(SRC).toContain('apiFetch("/workflows/definitions"');
  });

  it("drops the Label import (FormShell renders labels)", () => {
    // Input stays — useFieldArray rows still render raw <Input>.
    expect(SRC).not.toContain('from "@/components/ui/label"');
  });

  it("stays inline Cards — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).toContain("ConfirmDeleteDialog");
  });
});
