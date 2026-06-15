import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P10-DETAIL-WORKSPACE (#2240) — static contract over expense-detail.tsx.
 *
 * The owner mandate UNIFIES the financial detail pages into a read-only
 * detail-workspace that TRACES document → journal → operational effect. This
 * test pins the wiring (so a refactor can't silently drop a trace axis):
 *   • the read-only attachment uses FinancialAttachmentViewer mode="detail"
 *   • the THREE separated status labels are rendered from the status-model
 *   • the fetched journal `lines` are rendered as a read-only table
 *   • there are wouter <Link> navigations to journal / supplier / vehicle
 *   • the page stays read-only (no item/account/supplier editors)
 *
 * It mirrors fuelSupplierContract.test.ts (read the source file, assert text).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/details/expense-detail.tsx"),
  "utf8",
);

describe("#2240 expense-detail wires the read-only attachment viewer", () => {
  it("renders FinancialAttachmentViewer in mode=\"detail\" (read-only)", () => {
    expect(PAGE).toContain("<FinancialAttachmentViewer");
    expect(PAGE).toContain('mode="detail"');
  });

  it("only shows the detail viewer when NOT pending (decision panel owns it while pending)", () => {
    expect(PAGE).toMatch(/!isPending && \(\s*<FinancialAttachmentViewer/);
  });
});

describe("#2240 expense-detail shows the THREE separated status axes", () => {
  it("imports the status-model label maps", () => {
    expect(PAGE).toContain("DOCUMENT_STATUS_LABELS");
    expect(PAGE).toContain("PAYMENT_STATUS_LABELS");
    expect(PAGE).toContain("POSTING_STATUS_LABELS");
  });

  it("renders all three labels from the derived axes", () => {
    expect(PAGE).toContain("DOCUMENT_STATUS_LABELS[documentStatus]");
    expect(PAGE).toContain("PAYMENT_STATUS_LABELS[paymentStatus]");
    expect(PAGE).toContain("POSTING_STATUS_LABELS[postingStatus]");
  });

  it("derives the axes via the shared helpers (no bespoke status mixing)", () => {
    expect(PAGE).toContain("mapJournalStatus(expense?.status)");
    expect(PAGE).toContain("derivePaymentStatus({");
  });
});

describe("#2240 expense-detail renders the linked journal lines (read-only)", () => {
  it("maps the fetched `lines` into a table with account + debit/credit", () => {
    expect(PAGE).toContain("lines.map(");
    expect(PAGE).toContain("l?.accountCode");
    expect(PAGE).toContain("l?.accountName");
    expect(PAGE).toContain("l?.debit");
    expect(PAGE).toContain("l?.credit");
  });

  it("surfaces line dimensions (vehicle / cost center / project)", () => {
    expect(PAGE).toContain("l?.vehicleId");
    expect(PAGE).toContain("l?.costCenter");
    expect(PAGE).toContain("l?.projectId");
  });
});

describe("#2240 expense-detail has navigation links (Link) to journal/supplier/vehicle", () => {
  it("imports wouter Link", () => {
    expect(PAGE).toMatch(/import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*"wouter"/);
  });

  it("links to the journal route", () => {
    expect(PAGE).toContain("/finance/journal/${id}");
  });

  it("links to the supplier/vendor route", () => {
    expect(PAGE).toContain("/finance/vendors/${expense.supplierId}");
  });

  it("links to the vehicle route", () => {
    expect(PAGE).toContain("/fleet/${expense.relatedEntityId}");
  });

  it("renders the trace links via <Link> (not bare anchors)", () => {
    expect(PAGE).toMatch(/traceLinks\.map\([\s\S]{0,400}<Link/);
  });
});

describe("#2240 expense-detail stays READ-ONLY (no item/account/supplier editors)", () => {
  it("does not introduce an account/supplier/items input field", () => {
    expect(PAGE).not.toContain('name="accountCode"');
    expect(PAGE).not.toContain('name="supplierId"');
    expect(PAGE).not.toContain('name="amount"');
  });

  it("keeps the only editor as the existing description-only dialog", () => {
    expect(PAGE).toContain("expenseEditSchema");
    expect(PAGE).toContain('FormTextareaField name="description"');
  });
});
