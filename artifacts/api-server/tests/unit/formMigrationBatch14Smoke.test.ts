import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 14 of the forms migration. CONTRIBUTING.md §3.4 compliant
 * (inline card, no modal, FormShell + zod, RTL preserved).
 *
 * After this PR: 27 of ~280 useState forms now on FormShell + zod.
 *
 * Migration: legal-case-detail.tsx — AddSessionForm sub-component.
 *   - Inline Card (no Dialog) — already compliant with §3.4.
 *   - 6 fields: 2 dates + 4 text. sessionDate required.
 *   - DatePicker → FormDateField (same UnifiedDateInput, dual calendar).
 *   - `if (!form.sessionDate) toast(...)` → schema validation.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("legal-case-detail — AddSessionForm on FormShell + zod", () => {
  const SRC = read("legal-case-detail.tsx");

  it("imports the FormShell stack with FormDateField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
  });

  it("schema requires sessionDate (was bare `if (!form.sessionDate)` toast)", () => {
    expect(SRC).toContain("sessionSchema = z.object(");
    expect(SRC).toMatch(/^\s*sessionDate:\s*z\.string\(\)\.min\(1/m);
  });

  it("removes the bare `if (!form.sessionDate)` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.sessionDate\) \{ toast/);
  });

  it("DatePicker import dropped (FormDateField wraps UnifiedDateInput)", () => {
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
    // Two FormDateFields: sessionDate + nextSessionDate.
    const m = SRC.match(/<FormDateField/g) ?? [];
    expect(m.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves the 'expected impact' info panel inside the form", () => {
    // The blue info panel explaining the side-effect (case status
    // transition + lawyer notification) must survive — operator
    // expects to see it BEFORE confirming the session.
    expect(SRC).toContain("الأثر المتوقع");
    expect(SRC).toContain("ستحدث حالة القضية تلقائياً");
  });

  it("preserves useToast import — used by other handlers in the file", () => {
    // The form itself doesn't need useToast anymore (FormShell handles
    // validation errors via inline field errors + useApiMutation's
    // built-in error toast), but the file has OTHER handlers that
    // still call toast(...). Import must survive.
    expect(SRC).toContain('import { useToast } from "@/hooks/use-toast"');
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal for create/edit)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).toContain('Card className="border-dashed"');
  });

  it("createMut generic narrowed to SessionForm (was `typeof form`)", () => {
    expect(SRC).toContain("useApiMutation<any, SessionForm>");
  });
});
