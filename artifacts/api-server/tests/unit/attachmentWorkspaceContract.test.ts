import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P7-ATTACHMENT-WORKSPACE (#2237) — the reusable financial-attachment
 * viewer is wired into the expense ENTRY page beside the items form (not a
 * bottom upload), supports create/review/detail, and does NO OCR / extraction.
 * The viewer's own behaviour is unit-tested in the frontend suite; this pins
 * the cross-file wiring + the no-OCR / no-journal invariants statically.
 */
const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const VIEWER = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/financial-attachment-viewer.tsx"), "utf8");
const FORM = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx"), "utf8");

describe("#2237 viewer component contract", () => {
  it("exports FinancialAttachmentViewer with the three modes", () => {
    expect(VIEWER).toContain("export function FinancialAttachmentViewer");
    expect(VIEWER).toContain('export type AttachmentViewerMode = "create" | "review" | "detail"');
  });
  it("covers the required display states", () => {
    for (const s of ['data-state="loading"', 'data-state="empty"', 'data-state="image"', 'data-state="pdf"', 'data-state="unsupported"', 'data-state="error"']) {
      expect(VIEWER).toContain(s);
    }
  });
  it("supports zoom + replace/remove/download actions and an internal-serial slot", () => {
    expect(VIEWER).toContain("تكبير");
    expect(VIEWER).toContain("تصغير");
    expect(VIEWER).toContain("استبدال");
    expect(VIEWER).toContain("serialNo");
    expect(VIEWER).toContain("بلا رقم تسلسل");
  });
  it("does NO OCR / extraction (display-only — no OCR lib, states the intent)", () => {
    // no actual OCR/extraction machinery…
    expect(VIEWER.toLowerCase()).not.toContain("tesseract");
    expect(VIEWER.toLowerCase()).not.toContain("recognize(");
    // …and the component documents the no-OCR boundary explicitly.
    expect(VIEWER).toContain("does NOT do OCR");
  });
});

describe("#2237 entry-page wiring", () => {
  it("the expense entry page renders the viewer in create mode beside the form", () => {
    expect(FORM).toContain("FinancialAttachmentViewer");
    expect(FORM).toContain('mode="create"');
    // 2-column layout: the document sits beside (left in RTL) the items form.
    expect(FORM).toContain("lg:grid lg:grid-cols-[1fr_360px]");
  });
  it("reuses the existing attachment state (no break to file upload)", () => {
    expect(FORM).toContain("applyAttachmentFile");
    expect(FORM).toContain("onReplace={applyAttachmentFile}");
    expect(FORM).toContain("clearAttachment");
  });
});
