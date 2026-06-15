/**
 * FIN-P10-DETAIL-WORKSPACE (#2240) — the unified READ-ONLY detail workspace
 * extended to the VOUCHER detail page.
 *
 * Proves the NON-pending voucher-detail view renders the trace
 * (document → journal → operational effect):
 *   • the THREE separated status axes (document / payment / posting)
 *   • the read-only ITEMS table (the voucher's journal `lines`) with NO inputs
 *   • the FinancialAttachmentViewer in read-only mode="detail"
 *   • operational-effect <Link> navigation (journal / vendor / employee)
 *   • NO uncontrolled edit fields for account/party/items
 * and that a PENDING voucher renders the unified FinancialDecisionPanel.
 *
 * Mirrors expense-detail.detail.test.tsx's mocking style.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { rec } = vi.hoisted(() => ({ rec: { current: {} as any } }));

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "8" }],
  useLocation: () => ["/finance/vouchers/8", () => {}],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ data: rec.current, isLoading: false, error: null, refetch: () => {} }),
  apiFetch: vi.fn(() => Promise.resolve({})),
}));

// entity-kit: DetailPageLayout just renders its overview + actions inline so the
// trace blocks are in the tree.
vi.mock("@workspace/entity-kit", () => ({
  DetailPageLayout: ({ overview, actions }: any) => <div>{actions}{overview}</div>,
}));

vi.mock("@workspace/ui-core", () => ({
  FormGrid: ({ children }: any) => <div>{children}</div>,
  FormTextareaField: () => null,
}));

vi.mock("@workspace/workflow-kit", () => ({
  ActionHistory: () => <div data-testid="action-history" />,
}));

// exercised by their own tests; here we only need to prove the page mounts them.
vi.mock("@/components/shared/financial-attachment-viewer", () => ({
  FinancialAttachmentViewer: ({ mode }: any) => <div data-testid="attachment-viewer" data-mode={mode} />,
}));

vi.mock("@/components/shared/financial-decision-panel", () => ({
  FinancialDecisionPanel: () => <div data-testid="decision-panel" />,
}));

vi.mock("@/components/shared/entity-edit-dialog", () => ({ EntityEditDialog: () => null }));
vi.mock("@/components/shared/confirm-delete-dialog", () => ({ ConfirmDeleteDialog: () => null }));
vi.mock("@/components/shared/entity-tags", () => ({ EntityTags: () => null }));
vi.mock("@/components/shared/print-button", () => ({ PrintButton: () => null }));
vi.mock("@/components/shared/permission-gate", () => ({ GuardedButton: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/components/shared/attachment-preview", () => ({ AttachmentPreview: () => null }));
vi.mock("@/hooks/use-registry-tabs", () => ({ useRegistryTabs: () => ({ extraTabs: [], hideTabs: [] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

import VoucherDetail from "./voucher-detail";

function paymentVoucher(overrides: Record<string, unknown> = {}) {
  return {
    id: 8,
    ref: "PV-8",
    status: "posted", // NON-pending → read-only trace workspace
    voucherType: "payment",
    paymentMethod: "cash",
    sourceAccountCode: "1010",
    createdAt: "2026-06-10T00:00:00Z",
    vendorId: 4,
    vendorName: "محطة الدريس",
    employeeId: 9,
    employeeName: "أحمد",
    amount: 300,
    attachmentUrl: "https://example.test/pv-8.pdf",
    attachmentType: "سند صرف",
    lines: [
      { id: 1, accountCode: "2100", accountName: "ذمم دائنة", debit: 300, credit: 0, vendorId: 4 },
      { id: 2, accountCode: "1010", accountName: "الصندوق", debit: 0, credit: 300, costCenter: "HQ" },
    ],
    ...overrides,
  };
}

describe("#2240 voucher-detail read-only detail workspace", () => {
  it("renders the THREE status axes (document / payment / posting)", () => {
    rec.current = paymentVoucher();
    render(<VoucherDetail />);
    const axes = screen.getByTestId("status-axes");
    // posted → document=معتمد, posting=مرحّل; cash money source → payment=مدفوع
    expect(within(axes).getByText("معتمد")).toBeTruthy();
    expect(within(axes).getByText("مرحّل")).toBeTruthy();
    expect(within(axes).getByText("مدفوع")).toBeTruthy();
  });

  it("renders the read-only ITEMS / journal lines table with accounts + debit/credit + dimensions", () => {
    rec.current = paymentVoucher();
    render(<VoucherDetail />);
    const table = screen.getByTestId("lines-table");
    expect(within(table).getByText("ذمم دائنة")).toBeTruthy();
    expect(within(table).getByText("2100")).toBeTruthy();
    expect(within(table).getByText("الصندوق")).toBeTruthy();
    // dimension chip derived from the line (costCenter)
    expect(within(table).getByText(/مركز: HQ/)).toBeTruthy();
  });

  it("mounts the FinancialAttachmentViewer in read-only mode=detail", () => {
    rec.current = paymentVoucher();
    render(<VoucherDetail />);
    const viewer = screen.getByTestId("attachment-viewer");
    expect(viewer.getAttribute("data-mode")).toBe("detail");
  });

  it("renders operational-effect nav links (journal / vendor / employee)", () => {
    rec.current = paymentVoucher();
    render(<VoucherDetail />);
    expect(screen.getByTestId("trace-link-journal").getAttribute("href")).toBe("/finance/journal/8");
    expect(screen.getByTestId("trace-link-vendor").getAttribute("href")).toBe("/finance/vendors/4");
    expect(screen.getByTestId("trace-link-employee").getAttribute("href")).toBe("/hr/employees/9");
  });

  it("is READ-ONLY: the trace exposes no uncontrolled input/select fields", () => {
    rec.current = paymentVoucher();
    const { container } = render(<VoucherDetail />);
    const trace = screen.getByTestId("detail-trace");
    expect(trace.querySelectorAll("input").length).toBe(0);
    expect(trace.querySelectorAll("select").length).toBe(0);
    expect(trace.querySelectorAll("textarea").length).toBe(0);
    // sanity: the whole rendered tree carries no item/account/party editors
    expect(container.querySelector('input[name="accountCode"]')).toBeNull();
    expect(container.querySelector('input[name="vendorId"]')).toBeNull();
  });

  it("uses the pending decision panel while pending (and omits the trace)", () => {
    rec.current = paymentVoucher({ status: "pending_approval" });
    render(<VoucherDetail />);
    expect(screen.queryByTestId("detail-trace")).toBeNull();
    expect(screen.getByTestId("decision-panel")).toBeTruthy();
  });
});
