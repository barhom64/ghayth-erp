import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch migration of the remaining 3 `prompt()` call sites the audit
 * flagged ("3 × window.prompt — manager-board.tsx, properties/inspections.tsx,
 * properties/deposits.tsx" + the singleton at hr/discipline-memo-detail.tsx).
 * manager-board landed in #283; this batch finishes the set.
 *
 * Each page reads source-only assertions (same pattern as #281 / #283)
 * to lock the migration without spinning up a frontend test rig.
 */

const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// `prompt(` at word boundary as an actual call, AFTER stripping
// comments — the page's doc-comment may legitimately mention the old
// API to help the next reader.
function callsPrompt(src: string): boolean {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  return /\bprompt\s*\(/.test(stripped) || /window\.prompt\(/.test(stripped);
}

describe("hr/discipline-memo-detail — cancel reason via PromptDialog", () => {
  const SRC = read("hr/discipline-memo-detail.tsx");

  it("no longer calls prompt() in code", () => {
    expect(callsPrompt(SRC)).toBe(false);
  });

  it("imports PromptDialog and mounts it for the cancel flow", () => {
    expect(SRC).toContain(
      'import { PromptDialog } from "@/components/shared/prompt-dialog"',
    );
    expect(SRC).toContain("<PromptDialog");
    expect(SRC).toContain('title="سبب إلغاء المحضر"');
    expect(SRC).toContain('confirmLabel="تأكيد الإلغاء"');
  });

  it("dialog onSubmit calls act('/cancel', { reason })", () => {
    // Same backend contract as before; only the input surface changed.
    expect(SRC).toMatch(/act\("\/cancel",\s*\{\s*reason\s*\}/);
  });
});

describe("properties/inspections — completion via CompleteInspectionDialog (FormShell)", () => {
  const SRC = read("properties/inspections.tsx");

  it("no longer calls prompt() in code", () => {
    expect(callsPrompt(SRC)).toBe(false);
  });

  it("imports the FormShell stack + AlertDialog primitives", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain('from "@/components/ui/alert-dialog"');
  });

  it("validates conditionRating as integer 1-5 (was unchecked from native prompt)", () => {
    // The native flow `Number(rating)`-coerced server-side, so "abc" → NaN
    // silently passed through. The schema now blocks it client-side.
    expect(SRC).toContain("z.coerce");
    expect(SRC).toContain(".int(");
    expect(SRC).toContain(".min(1");
    expect(SRC).toContain(".max(5");
  });

  it("tracks the inspection being completed as typed state, not a free-floating arg", () => {
    expect(SRC).toContain("useState<number | null>(null)");
    expect(SRC).toContain("setCompletingId");
  });
});

describe("properties/deposits — refund via RefundDepositDialog (FormShell + zod over-refund guard)", () => {
  const SRC = read("properties/deposits.tsx");

  it("no longer calls prompt() in code", () => {
    expect(callsPrompt(SRC)).toBe(false);
  });

  it("imports the FormShell stack + AlertDialog primitives", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormTextField");
  });

  it("blocks over-refund client-side (refundAmount ≤ originalAmount via zod .max)", () => {
    // The native flow could send any amount — even more than the original
    // deposit — and rely on the server to reject. Now caught client-side.
    expect(SRC).toContain("function refundSchema(originalAmount: number)");
    expect(SRC).toMatch(/\.max\(originalAmount/);
    expect(SRC).toMatch(/\.positive\(/);
  });

  it("tracks (id, originalAmount) as typed state, not a free-floating closure arg", () => {
    expect(SRC).toContain(
      "useState<\n    { id: number; originalAmount: number } | null\n  >(null)",
    );
  });
});
