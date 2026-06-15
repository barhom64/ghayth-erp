import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P9-APPROVAL-WORKSPACE (#2239) — static/contract test for the unified
 * expense decision workspace. Asserts the two new backend side-action routes
 * exist, that they require `notes` and write an audit log + event, and that the
 * expense detail page wires the FinancialDecisionPanel (the unification: the
 * bespoke ApprovalActions card is replaced by the composed panel).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");
const DETAIL = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/details/expense-detail.tsx"), "utf8");
const PANEL = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared/financial-decision-panel.tsx"), "utf8");
const ACTIONS = readFileSync(join(REPO_ROOT, "artifacts/ghayth-erp/src/components/approval-actions.tsx"), "utf8");

describe("#2239 backend — request-attachment route", () => {
  it("registers POST /expenses/:id/request-attachment", () => {
    expect(ROUTE).toContain('journalRouter.post("/expenses/:id/request-attachment"');
  });
  it("requires notes (ValidationError when empty)", () => {
    expect(ROUTE).toContain("expenseNoteActionSchema");
    expect(ROUTE).toMatch(/نص الطلب مطلوب/);
  });
  it("records an approval_actions row with action='request_attachment'", () => {
    expect(ROUTE).toContain("'request_attachment'");
    expect(ROUTE).toContain("INSERT INTO approval_actions");
  });
  it("writes an audit log + emits expense.attachment_requested", () => {
    expect(ROUTE).toContain('action: "request_attachment"');
    expect(ROUTE).toContain('action: "expense.attachment_requested"');
    expect(ROUTE).toContain("createAuditLog");
    expect(ROUTE).toContain("emitEvent");
  });
  it("is company-scoped like the approve handler (ref LIKE 'EXP%' + companyId)", () => {
    expect(ROUTE).toMatch(/request-attachment[\s\S]{0,1200}ref LIKE 'EXP%'/);
  });
});

describe("#2239 backend — comment route", () => {
  it("registers POST /expenses/:id/comment", () => {
    expect(ROUTE).toContain('journalRouter.post("/expenses/:id/comment"');
  });
  it("requires notes (ValidationError when empty)", () => {
    expect(ROUTE).toMatch(/نص الملاحظة مطلوب/);
  });
  it("records action='comment', audit log + emits expense.commented", () => {
    expect(ROUTE).toContain("'comment'");
    expect(ROUTE).toContain('action: "expense.commented"');
  });
});

describe("#2239 frontend — expense detail wires FinancialDecisionPanel", () => {
  it("imports and renders FinancialDecisionPanel", () => {
    expect(DETAIL).toContain("FinancialDecisionPanel");
    expect(DETAIL).toContain('from "@/components/shared/financial-decision-panel"');
    expect(DETAIL).toContain("<FinancialDecisionPanel");
  });
  it("feeds it the fetched record, lines, attachments and journal preview", () => {
    expect(DETAIL).toContain("record={expense}");
    expect(DETAIL).toContain("lines={lines}");
    expect(DETAIL).toContain("attachments={decisionAttachments}");
    expect(DETAIL).toContain("journalPreview={journalPreview}");
  });
  it("fetches the journal preview via impact-preview", () => {
    expect(DETAIL).toContain("/finance/expenses/impact-preview");
  });
  it("wires the request-attachment + comment side-action endpoints", () => {
    expect(DETAIL).toContain("/request-attachment");
    expect(DETAIL).toContain("/comment");
  });
  it("no longer renders the bespoke ApprovalActions card directly", () => {
    expect(DETAIL).not.toContain("<ApprovalActions");
  });
});

describe("#2239 frontend — the panel + ApprovalActions gate", () => {
  it("ApprovalActions accepts approveDisabled + approveDisabledReason (back-compatible)", () => {
    expect(ACTIONS).toContain("approveDisabled?: boolean");
    expect(ACTIONS).toContain("approveDisabledReason?: string");
    expect(ACTIONS).toContain("disabled={approveDisabled}");
  });
  it("the panel computes approveBlocked from blockers OR missing required attachment", () => {
    expect(PANEL).toContain("approveBlocked");
    expect(PANEL).toContain("attachmentRequired");
    expect(PANEL).toContain("approveDisabled={approveBlocked}");
  });
  it("the panel composes the review-mode attachment viewer + journal preview", () => {
    expect(PANEL).toContain('mode="review"');
    expect(PANEL).toContain("FinancialAttachmentViewer");
    expect(PANEL).toContain("FinancialJournalPreviewPanel");
  });
});
