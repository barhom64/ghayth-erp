import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P10-DETAIL-WORKSPACE (#2240) — static contract over voucher-detail.tsx.
 *
 * The owner mandate UNIFIES the financial detail pages into a read-only
 * detail-workspace that TRACES document → journal → operational effect. This
 * test pins the voucher page's wiring (so a refactor can't silently drop a
 * trace axis), mirroring detailWorkspaceContract.test.ts for expenses:
 *   • the read-only attachment uses FinancialAttachmentViewer mode="detail"
 *   • the THREE separated status labels are rendered from the status-model
 *   • the pending view delegates to FinancialDecisionPanel (documentType=voucher)
 *   • there is a wouter <Link> navigation to the journal
 *   • the page stays read-only (no item/account/party editors)
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PAGE = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/details/voucher-detail.tsx"),
  "utf8",
);

describe("#2240 voucher-detail wires the read-only attachment viewer", () => {
  it("renders FinancialAttachmentViewer in mode=\"detail\" (read-only)", () => {
    expect(PAGE).toContain("<FinancialAttachmentViewer");
    expect(PAGE).toContain('mode="detail"');
  });

  it("only shows the detail viewer when NOT pending (decision panel owns it while pending)", () => {
    expect(PAGE).toMatch(/!isPending && \(\s*<FinancialAttachmentViewer/);
  });
});

describe("#2240 voucher-detail shows the THREE separated status axes", () => {
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
    expect(PAGE).toContain("mapJournalStatus(voucher?.status)");
    expect(PAGE).toContain("derivePaymentStatus({");
  });
});

describe("#2240 voucher-detail delegates the pending view to FinancialDecisionPanel", () => {
  it("renders the unified decision panel for vouchers", () => {
    expect(PAGE).toContain("<FinancialDecisionPanel");
    expect(PAGE).toContain('documentType="voucher"');
  });

  it("only renders the decision panel while pending", () => {
    expect(PAGE).toMatch(/isPending && \(\s*<FinancialDecisionPanel/);
  });

  it("wires the voucher approve/reject/return endpoints", () => {
    expect(PAGE).toContain("/finance/vouchers/${id}/approve");
  });
});

describe("#2240 voucher-detail renders the linked journal lines (read-only)", () => {
  it("maps the voucher `lines` into a table with account + debit/credit", () => {
    expect(PAGE).toContain("lines.map(");
    expect(PAGE).toContain("l?.accountCode");
    expect(PAGE).toContain("l?.accountName");
    expect(PAGE).toContain("l?.debit");
    expect(PAGE).toContain("l?.credit");
  });
});

describe("#2240 voucher-detail has navigation links (Link) to the journal", () => {
  it("imports wouter Link", () => {
    expect(PAGE).toMatch(/import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*"wouter"/);
  });

  it("links to the journal route", () => {
    expect(PAGE).toContain("/finance/journal/${id}");
  });

  it("renders the trace links via <Link> (not bare anchors)", () => {
    expect(PAGE).toMatch(/traceLinks\.map\([\s\S]{0,400}<Link/);
  });
});

describe("#2240 voucher-detail stays READ-ONLY (no item/account/party editors)", () => {
  it("does not introduce an account/party/items input field", () => {
    expect(PAGE).not.toContain('name="accountCode"');
    expect(PAGE).not.toContain('name="vendorId"');
    expect(PAGE).not.toContain('name="amount"');
  });

  it("keeps the only editor as the existing description-only dialog", () => {
    expect(PAGE).toContain("voucherEditSchema");
    expect(PAGE).toContain('name="description"');
  });
});
