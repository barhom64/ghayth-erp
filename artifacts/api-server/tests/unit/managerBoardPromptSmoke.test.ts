import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Closes one of the 13 native-dialog regressions the audit flagged
 * ("window.prompt × 3" — `manager-board.tsx`, `overtime.tsx`,
 * `loans.tsx`). manager-board's rejection flow is the highest-traffic
 * of the three (every pending approval the manager opens runs
 * through it), so it's the natural pilot for the `window.prompt() →
 * PromptDialog` migration.
 *
 * Same shape-locking pattern as the support form migration smoke
 * (#281): read the source, assert the new component is wired and the
 * native API is gone.
 */
const SRC = readFileSync(
  join(
    import.meta.dirname!,
    "../../../../artifacts/ghayth-erp/src/pages/manager-board.tsx",
  ),
  "utf8",
);

describe("manager-board — window.prompt() replaced by PromptDialog", () => {
  it("no longer calls window.prompt() (or bare prompt()) at a statement", () => {
    // Strip line-comments + block-comments before scanning. The
    // page's doc-comment explains what the old prompt() looked like
    // for the next reader; we only want to fail on a real call.
    const stripped = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // `prompt(` at word boundary as an actual call. Won't match
    // `setPrompt(` / `prompt:` / `RoomPrompt(`.
    expect(stripped).not.toMatch(/\bprompt\s*\(/);
    expect(stripped).not.toMatch(/window\.prompt\(/);
  });

  it("imports the shared PromptDialog component", () => {
    expect(SRC).toContain(
      'import { PromptDialog } from "@/components/shared/prompt-dialog"',
    );
  });

  it("tracks the rejection target as typed state, not a free-floating ref", () => {
    // The migration uses `useState<{ _type: string; id: number } | null>`.
    // Asserting the type shape prevents a regression to `useState<any>`
    // that silently allows wrong _type values to flow through.
    expect(SRC).toContain(
      "useState<{ _type: string; id: number } | null>(null)",
    );
  });

  it("submits the reason through PromptDialog.onSubmit, not a synchronous call", () => {
    // doReject now JUST opens the dialog. The actual mutation fires
    // inside handleRejectSubmit, which gets the trimmed reason from
    // PromptDialog. This separation lets the textarea be controlled,
    // trimmed, and validated before the mutation runs.
    expect(SRC).toContain("const handleRejectSubmit = (notes: string) => {");
    expect(SRC).toContain("approvalMut.mutate({ _type, _itemId: id, approved: false, reason: notes, notes })");
  });

  it("mounts the dialog inside PageShell with confirm/close handlers", () => {
    expect(SRC).toContain("<PromptDialog");
    expect(SRC).toContain("onSubmit={handleRejectSubmit}");
    expect(SRC).toContain("onClose={() => setRejectTarget(null)}");
    // Localised confirm label so it doesn't fall back to the generic
    // "تأكيد" — the user is rejecting, not confirming.
    expect(SRC).toContain('confirmLabel="رفض"');
  });
});
