/**
 * HR-REV-2 fix — discipline-memo-detail header action button.
 *
 * The "خطاب تأديبي" button was rendered as bare text `headerActions`
 * instead of `{headerActions}` (JSX expression), causing React to print
 * the literal string and the button to never appear.
 *
 * Source-only; confirms the JSX expression form is present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/hr/discipline-memo-detail.tsx"),
  "utf8",
);

describe("discipline-memo-detail — headerActions JSX expression", () => {
  it("renders headerActions as a JSX expression {headerActions}, not bare text", () => {
    expect(SRC).toContain("{headerActions}");
  });

  it("does NOT contain bare (unbracketed) headerActions inside JSX", () => {
    // Matches a line with only whitespace + `headerActions` (no surrounding braces / assignment)
    expect(SRC).not.toMatch(/^\s+headerActions\s*$/m);
  });
});
