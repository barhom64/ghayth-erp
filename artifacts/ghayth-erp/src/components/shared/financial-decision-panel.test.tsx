import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FinancialAttachment } from "./financial-attachment-viewer";

/**
 * FIN-P9-APPROVAL-WORKSPACE (#2239) — the unified FinancialDecisionPanel.
 *
 * It is a PURE COMPOSITION: a read-only record + items table, the review-mode
 * attachment viewer, the review-mode journal preview, governance notes, and the
 * ApprovalActions row. These tests pin the composition contract:
 *   • the items table renders the supplied lines (read-only, no editors),
 *   • the attachment viewer is in review mode (no remove button),
 *   • the journal preview table renders when a preview is supplied,
 *   • the approve button is DISABLED (with the reason) when there are journal
 *     blockers OR a required attachment is missing,
 *   • there is NO free record editor (no textbox bound to supplier/amount).
 */

// useAppContext gates ApprovalActions' decision buttons via can(); grant it.
vi.mock("@/contexts/app-context", () => ({
  useAppContext: () => ({ can: () => true }),
  useAppContextOptional: () => ({ can: () => true, scopeQueryString: "" }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// apiFetch / useApiQuery are imported by ApprovalActions (ActionHistory etc.).
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  useApiQuery: () => ({ data: { data: [] }, refetch: vi.fn() }),
}));

import { FinancialDecisionPanel } from "./financial-decision-panel";

const LINES = [
  { id: 1, accountCode: "5100", accountName: "مصروف وقود", debit: 300, credit: 0, vehicleId: 12 },
  { id: 2, accountCode: "1010", accountName: "النقدية", debit: 0, credit: 300 },
];

const ATT: FinancialAttachment = {
  url: "data:image/png;base64,AAAA",
  name: "inv.png",
  type: "image/png",
  documentType: "فاتورة",
};

const PREVIEW_OK = {
  ready: true,
  lines: [
    { lineNo: 1, accountCode: "5100", accountName: "مصروف وقود", debit: 300, credit: 0, role: "debit", dimensions: { vehicleId: 12 }, derivationReason: "mapping", accountSource: "mapping", status: "ok" },
    { lineNo: 2, accountCode: "1010", accountName: "النقدية", debit: 0, credit: 300, role: "credit", dimensions: {}, derivationReason: "source", accountSource: "selected", status: "ok" },
  ],
  totals: { debit: 300, credit: 300 },
  balanced: true,
  blockers: [],
  warnings: [],
  sourceContext: { paymentMethod: "cash", sourceAccountCode: "1010", sourceAccountName: "النقدية" },
};

const PREVIEW_BLOCKED = {
  ...PREVIEW_OK,
  balanced: false,
  blockers: [{ code: "ACCOUNT_NOT_FOUND", message: "حساب المصروف غير موجود" }],
};

const RECORD = {
  id: 5,
  status: "pending_approval",
  operationType: "fuel",
  createdByName: "أحمد المُقدِّم",
  supplierName: "محطة الدريس",
  reference: "INV-900",
  createdAt: "2026-06-01",
  attachmentType: "فاتورة",
};

function renderPanel(props: Partial<React.ComponentProps<typeof FinancialDecisionPanel>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FinancialDecisionPanel
        documentType="expense"
        documentId={5}
        record={RECORD}
        lines={LINES}
        attachments={[ATT]}
        journalPreview={PREVIEW_OK}
        approveEndpoint="/finance/expenses/5/approve"
        rejectEndpoint="/finance/expenses/5/approve"
        returnEndpoint="/finance/expenses/5/approve"
        {...props}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("#2239 FinancialDecisionPanel composition", () => {
  it("renders the read-only items table with the supplied lines + totals", () => {
    const { container } = renderPanel();
    const table = container.querySelector("[data-items-table]") as HTMLElement;
    expect(table).toBeTruthy();
    expect(within(table).getByText("5100")).toBeTruthy();
    expect(within(table).getByText("1010")).toBeTruthy();
    // dimension chip surfaced read-only
    expect(within(table).getByText(/مركبة: 12/)).toBeTruthy();
  });

  it("embeds the attachment viewer in review mode (no remove button)", () => {
    const { container } = renderPanel();
    const viewer = container.querySelector('[data-attachment-viewer]') as HTMLElement;
    expect(viewer).toBeTruthy();
    expect(viewer.getAttribute("data-mode")).toBe("review");
    expect(screen.queryByRole("button", { name: /إزالة/ })).toBeNull();
  });

  it("renders the journal preview (review) when a preview is supplied", () => {
    renderPanel();
    expect(screen.getByText(/معاينة القيد المحاسبي/)).toBeTruthy();
  });

  it("has NO free record editor (no textbox bound to supplier/amount)", () => {
    renderPanel();
    // The summary/record view is read-only — no input/textarea until an
    // action dialog is opened. The only textbox would appear after clicking a
    // decision verb, which we do not do here.
    expect(screen.queryByRole("textbox")).toBeNull();
    // supplier is rendered as static text, not an input value.
    expect(screen.getByText("محطة الدريس")).toBeTruthy();
  });
});

describe("#2239 approve gating", () => {
  it("disables approve (with reason) when the journal preview has blockers", () => {
    renderPanel({ journalPreview: PREVIEW_BLOCKED });
    const approve = screen.getByRole("button", { name: /قبول/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    // the reason surfaces both in the summary card and the ApprovalActions row.
    expect(screen.getAllByText(/حساب المصروف غير موجود/).length).toBeGreaterThan(0);
  });

  it("disables approve when a required attachment is missing", () => {
    renderPanel({ attachments: [], attachmentRequired: true });
    const approve = screen.getByRole("button", { name: /قبول/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getAllByText(/مرفق مطلوب مفقود/).length).toBeGreaterThan(0);
  });

  it("enables approve when there are no blockers and no missing attachment", () => {
    renderPanel();
    const approve = screen.getByRole("button", { name: /قبول/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
  });
});
