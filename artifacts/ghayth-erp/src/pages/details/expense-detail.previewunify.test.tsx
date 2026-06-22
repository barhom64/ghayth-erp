import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Expense review preview MUST come from the STORED journal, not a re-derived
 * impact-preview. The journal_entries row lacks the expense's routing context
 * (operationType / relatedEntity), so re-deriving falls to a GENERIC fallback
 * that DIVERGES from — and falsely blocks («الحساب غير قابل للترحيل») — the real
 * posted lines (the bug Ibrahim screenshotted: 5000/1100 in review vs 5510/1113
 * stored). Guard: the detail page derives journalPreview from expense.lines.
 */
const PAGE = readFileSync(
  join(import.meta.dirname!, "expense-detail.tsx"),
  "utf8",
);

describe("expense-detail review preview = stored journal (no divergent re-derive)", () => {
  it("journalPreview is built from expense.lines (stored) before falling back to impact-preview", () => {
    const m = PAGE.match(/const journalPreview = useMemo\(\(\) => \{[\s\S]+?\}, \[[^\]]*\]\);/);
    expect(m, "journalPreview useMemo not found").toBeTruthy();
    const body = m![0];
    // stored journal is the primary source
    expect(body).toMatch(/Array\.isArray\(expense\?\.lines\)\s*&&\s*expense\.lines\.length\s*>\s*0/);
    expect(body).toMatch(/lines\.map\(/);
    expect(body).toMatch(/القيد المخزَّن/);
    // re-computed preview only as the fallback for an unsaved expense
    expect(body).toMatch(/return previewData\?\.journalPreview \?\? null;/);
  });
});
