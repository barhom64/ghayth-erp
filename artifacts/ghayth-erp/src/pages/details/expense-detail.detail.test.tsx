/**
 * FIN-P10-DETAIL-WORKSPACE (#2240) — the unified READ-ONLY detail workspace.
 *
 * Proves the NON-pending expense-detail view renders the trace
 * (document → journal → operational effect):
 *   • the THREE separated status axes (document / payment / posting)
 *   • the read-only ITEMS table (the fetched journal `lines`) with NO inputs
 *   • the FinancialAttachmentViewer in read-only mode="detail"
 *   • the linked journal lines (accounts, debit/credit, dimensions)
 *   • a linked VOUCHER card when the record references a payment voucher
 *   • operational-effect <Link> navigation (journal/supplier/vehicle/fuel log)
 *   • NO uncontrolled edit fields for account/supplier/items
 *
 * It mirrors journal-detail.test.tsx's mocking style (wouter <Link>, the api
 * hooks, and the heavy shared components mocked to thin pass-throughs).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { rec } = vi.hoisted(() => ({ rec: { current: {} as any } }));

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "7" }],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ data: rec.current, isLoading: false, error: null, refetch: () => {} }),
  apiFetch: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null }),
}));

// entity-kit: DetailPageLayout just renders its overview + actions inline so the
// trace blocks are in the tree; EntityComments is a no-op.
vi.mock("@workspace/entity-kit", () => ({
  DetailPageLayout: ({ overview, actions }: any) => <div>{actions}{overview}</div>,
  EntityComments: () => null,
}));

vi.mock("@workspace/ui-core", () => ({
  FormGrid: ({ children }: any) => <div>{children}</div>,
  FormTextareaField: () => null,
}));

vi.mock("@workspace/workflow-kit", () => ({
  ActionHistory: () => <div data-testid="action-history" />,
}));

// the FinancialAttachmentViewer is exercised by its own test; here we only need
// to prove the page mounts it in the read-only "detail" mode.
vi.mock("@/components/shared/financial-attachment-viewer", () => ({
  FinancialAttachmentViewer: ({ mode }: any) => <div data-testid="attachment-viewer" data-mode={mode} />,
}));

vi.mock("@/components/shared/financial-decision-panel", () => ({
  FinancialDecisionPanel: () => <div data-testid="decision-panel" />,
}));

vi.mock("@/components/shared/approval-timeline", () => ({
  ApprovalTimeline: () => <div data-testid="approval-timeline" />,
}));

vi.mock("@/components/shared/entity-edit-dialog", () => ({ EntityEditDialog: () => null }));
vi.mock("@/components/shared/entity-print", () => ({ EntityPrintButton: () => null }));
vi.mock("@/components/shared/entity-tags", () => ({ EntityTags: () => null }));
vi.mock("@/components/shared/permission-gate", () => ({ GuardedButton: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/components/shared/line-allocation-status-banner", () => ({ LineAllocationStatusBanner: () => null }));
vi.mock("@/components/shared/attachment-preview", () => ({ AttachmentPreview: () => null }));
vi.mock("@/components/shared/detail-edit-delete-actions", () => ({
  useDetailEditDelete: () => ({}),
  DetailActionButtons: () => null,
  InlineEditCard: () => null,
}));
vi.mock("@/components/finance/zatca-actions", () => ({ ZatcaActions: () => null }));
vi.mock("@/hooks/use-registry-tabs", () => ({ useRegistryTabs: () => ({ extraTabs: [], hideTabs: [] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

import ExpenseDetail from "./expense-detail";

function vehicleFuelExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    ref: "EXP-7",
    status: "posted", // NON-pending → read-only trace workspace
    operationType: "fuel",
    expenseType: "وقود",
    paymentMethod: "cash",
    sourceAccountCode: "1010",
    sourceAccountName: "الصندوق",
    createdAt: "2026-06-10T00:00:00Z",
    supplierId: 3,
    supplierName: "محطة الدريس",
    relatedEntityType: "vehicle",
    relatedEntityId: 12,
    relatedEntityName: "شاحنة A-1",
    fuelLogId: 99,
    voucherId: 55,
    voucherRef: "PV-55",
    voucherDate: "2026-06-10T00:00:00Z",
    paidAmount: 200,
    amount: 200,
    lines: [
      { id: 1, accountCode: "5300", accountName: "مصروف وقود", debit: 200, credit: 0, vehicleId: 12, costCenter: "FLEET" },
      { id: 2, accountCode: "1010", accountName: "الصندوق", debit: 0, credit: 200 },
    ],
    ...overrides,
  };
}

describe("#2240 expense-detail read-only detail workspace", () => {
  it("renders the THREE status axes (document / payment / posting)", () => {
    rec.current = vehicleFuelExpense();
    render(<ExpenseDetail />);
    const axes = screen.getByTestId("status-axes");
    // posted → document=معتمد, posting=مرحّل; cash + paid amount → payment=مدفوع
    expect(within(axes).getByText("معتمد")).toBeTruthy();
    expect(within(axes).getByText("مرحّل")).toBeTruthy();
    expect(within(axes).getByText("مدفوع")).toBeTruthy();
  });

  it("renders the read-only ITEMS / journal lines table with accounts + debit/credit + dimensions", () => {
    rec.current = vehicleFuelExpense();
    render(<ExpenseDetail />);
    const table = screen.getByTestId("lines-table");
    expect(within(table).getByText("مصروف وقود")).toBeTruthy();
    expect(within(table).getByText("5300")).toBeTruthy();
    expect(within(table).getByText("الصندوق")).toBeTruthy();
    // dimension chip derived from the line (vehicleId + costCenter)
    expect(within(table).getByText(/مركبة #12/)).toBeTruthy();
  });

  it("mounts the FinancialAttachmentViewer in read-only mode=detail", () => {
    rec.current = vehicleFuelExpense();
    render(<ExpenseDetail />);
    const viewer = screen.getByTestId("attachment-viewer");
    expect(viewer.getAttribute("data-mode")).toBe("detail");
  });

  it("renders the linked VOUCHER card when a voucher is referenced", () => {
    rec.current = vehicleFuelExpense();
    render(<ExpenseDetail />);
    const v = screen.getByTestId("linked-voucher");
    expect(within(v).getByText("PV-55")).toBeTruthy();
  });

  it("renders operational-effect nav links for a vehicle-fuel record", () => {
    rec.current = vehicleFuelExpense();
    render(<ExpenseDetail />);
    // journal, supplier (vendor), vehicle (fleet) and fuel log links
    expect(screen.getByTestId("trace-link-journal").getAttribute("href")).toBe("/finance/journal/7");
    expect(screen.getByTestId("trace-link-supplier").getAttribute("href")).toBe("/finance/vendors/3");
    expect(screen.getByTestId("trace-link-vehicle").getAttribute("href")).toBe("/fleet/12");
    expect(screen.getByTestId("trace-link-fuelLog").getAttribute("href")).toBe("/fleet/12/fuel/99");
  });

  it("is READ-ONLY: the trace exposes no uncontrolled input/select fields", () => {
    rec.current = vehicleFuelExpense();
    const { container } = render(<ExpenseDetail />);
    const trace = screen.getByTestId("detail-trace");
    expect(trace.querySelectorAll("input").length).toBe(0);
    expect(trace.querySelectorAll("select").length).toBe(0);
    expect(trace.querySelectorAll("textarea").length).toBe(0);
    // sanity: the whole rendered tree carries no item/account/supplier editors
    expect(container.querySelector('input[name="accountCode"]')).toBeNull();
    expect(container.querySelector('input[name="supplierId"]')).toBeNull();
  });

  it("omits the voucher card and uses the pending decision panel while pending", () => {
    rec.current = vehicleFuelExpense({ status: "pending_approval", voucherId: null, voucherRef: null });
    render(<ExpenseDetail />);
    expect(screen.queryByTestId("detail-trace")).toBeNull();
    expect(screen.getByTestId("decision-panel")).toBeTruthy();
  });
});
