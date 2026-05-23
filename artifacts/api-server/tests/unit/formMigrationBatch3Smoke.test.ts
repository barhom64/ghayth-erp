import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 3 of the forms migration. After this PR: 6 of ~280 useState
 * forms are on FormShell + zod (kb #281, salary-components #295,
 * admin-integrations #295, plus the 3 here).
 *
 * Each migration is a real win — not just mechanical:
 *
 *   approval-workflows-tab    refines maxAmount > minAmount client-side
 *   governance/capa-tab       closed status enum + required finding
 *   governance/compliance-actions-tab  same shape as capa
 *   hr/official-letters       removes the disabled={!form.subject} guard
 *
 * Same shape-locking pattern as #281/#287/#290/#291/#295.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Strip line- and block-comments so doc-comments referencing the old
// API for the next reader don't false-positive the "no longer used"
// assertions below. Same helper as the prompt + confirm smokes.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("settings/approval-workflows-tab — FormShell + zod with cross-field refine", () => {
  const SRC = read("settings/approval-workflows-tab.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormNumberField");
  });

  it("schema enforces maxAmount > minAmount as a cross-field refine", () => {
    // The native form had no relationship guard between min and max
    // — operator could submit min=100, max=50 and let the server
    // reject. Now caught client-side via z.refine().
    expect(SRC).toContain("approvalChainSchema = z");
    expect(SRC).toMatch(/\.refine\(\s*\(v\) => v\.maxAmount === 0 \|\| v\.maxAmount > v\.minAmount/);
  });

  it("submit handler maps maxAmount=0 → null (API contract)", () => {
    // Convention: 0 in the form = "no upper bound". The API expects
    // null. Migration must keep the contract.
    expect(SRC).toContain("maxAmount: values.maxAmount === 0 ? null : values.maxAmount");
  });

  it("removes the manual `e.target.value ? Number(...) : null` coercion", () => {
    // Old: setForm({ ..., maxAmount: e.target.value ? Number(e.target.value) : null })
    // Now: zod's coerce.number() does the work.
    expect(SRC).not.toMatch(/maxAmount: e\.target\.value \? Number/);
  });
});

describe("governance/capa-tab — FormShell + zod with closed status enum", () => {
  const SRC = read("governance/capa-tab.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
  });

  it("schema requires `finding` and uses a closed status enum", () => {
    expect(SRC).toContain("capaSchema = z.object(");
    expect(SRC).toMatch(/finding:\s*z\.string\(\)\.trim\(\)\.min\(1/);
    expect(SRC).toContain('z.enum(["open", "in_progress", "closed", "overdue"])');
  });

  it("removes the bare `if (!newForm.finding) return` guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!newForm\.finding\) return/);
  });

  it("removes the inline UnifiedDateInput in favour of FormDateField", () => {
    // The dialog used UnifiedDateInput plumbed via setNewForm — the
    // FormShell migration replaces it with the typed FormDateField.
    expect(SRC).not.toContain("UnifiedDateInput");
    expect(SRC).toContain("<FormDateField");
  });
});

describe("governance/compliance-actions-tab — FormShell + zod with closed status enum", () => {
  const SRC = read("governance/compliance-actions-tab.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
  });

  it("schema requires `title` and uses a closed status enum", () => {
    expect(SRC).toContain("complianceActionSchema = z.object(");
    expect(SRC).toMatch(/title:\s*z\.string\(\)\.trim\(\)\.min\(1/);
    expect(SRC).toContain('z.enum(["open", "in_progress", "done", "overdue"])');
  });

  it("removes the inline editFields-driven generic renderer (was its own bug magnet)", () => {
    // The old code looped over editFields with `(newForm as any)[f.key]`
    // — a string-key escape hatch that lost type safety. Migration
    // names every field explicitly via FormShell components.
    expect(SRC).not.toMatch(/\(newForm as any\)\[f\.key\]/);
    expect(SRC).toContain("<FormTextField name=\"title\"");
  });

  it("removes the dynamic-import workaround on apiFetch (now top-level imported)", () => {
    expect(SRC).not.toMatch(/await import\("@\/lib\/api"\)\.then/);
    expect(SRC).toMatch(/import.*apiFetch.*from "@\/lib\/api"/);
  });
});

describe("hr/official-letters — FormShell + zod (removes disabled={!form.subject} guard)", () => {
  const SRC = read("hr/official-letters.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextareaField");
  });

  it("schema requires `subject` and gives `type` a non-empty default", () => {
    expect(SRC).toContain("letterFormSchema = z.object(");
    expect(SRC).toMatch(/subject:\s*z\.string\(\)\.trim\(\)\.min\(1/);
    expect(SRC).toContain('type: "general"');
  });

  it("transforms blank employeeId to null at submit (was Number(form.employeeId) || null)", () => {
    // Old transformer was lossy — Number("0") || null gave null,
    // hiding that "0" was a real (if invalid) employee id. The
    // migration uses a clearer `values.employeeId ? Number(...) : null`.
    expect(SRC).toContain("values.employeeId ? Number(values.employeeId) : null");
  });

  it("removes the manual disabled={!form.subject || createMut.isPending} guard", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{!form\.subject/);
  });

  it("LETTER_TYPES rendered via FormSelectField options array (no inline Object.entries map)", () => {
    expect(SRC).toContain("LETTER_TYPE_OPTIONS = Object.entries(LETTER_TYPES)");
    expect(SRC).toMatch(/<FormSelectField\s+name="type"[\s\S]+options=\{LETTER_TYPE_OPTIONS\}/);
  });
});
