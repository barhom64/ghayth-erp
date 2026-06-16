/**
 * #2118 FINANCE-CORRECTION — A6 (salary-advances) follow-up FE test.
 *
 * Proves salary-advances.tsx surfaces the truthful posting + payment axes from
 * the API (`postingStatus` / `paymentStatus`, migration-311 trigger, slice 5)
 * in the list status column — NOT inferred from the approval `status` alone. So
 * a directly-posted advance (status='draft' + balancesApplied=true +
 * postingStatus='posted') reads «مرحّل», and a disbursed one reads «مدفوع».
 *
 * Diacritic-safe: posted="مرحّل" (contains «مرح», not «غير»),
 * unposted="غير مرحّل" (contains «غير»), paid="مدفوع", unpaid="غير مدفوع".
 *
 * The real status-model labels are used (module NOT mocked) so the assertions
 * bind to the shipped POSTING_STATUS_LABELS / PAYMENT_STATUS_LABELS.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { rows } = vi.hoisted(() => ({ rows: { current: [] as any[] } }));

vi.mock("wouter", () => ({
  useLocation: () => ["/finance/salary-advances", () => {}],
}));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({
    data: { data: rows.current, summary: {} },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
  useApiMutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock("@workspace/ui-core", () => ({
  PageShell: ({ children, actions }: any) => <div>{actions}{children}</div>,
  PageStatusBadge: ({ status, children }: any) => <span data-status={status}>{children ?? status}</span>,
  DataTable: ({ columns, data }: any) => (
    <table>
      <tbody>
        {(data ?? []).map((row: any, i: number) => (
          <tr key={i} data-testid={`row-${row.id ?? i}`}>
            {columns.map((c: any, ci: number) => (
              <td key={ci} data-key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  FormShell: ({ children }: any) => <form>{children}</form>,
  FormTextField: () => null,
  FormNumberField: () => null,
  FormSelectField: () => null,
  FormGrid: ({ children }: any) => <div>{children}</div>,
  AdvancedFilters: () => null,
  useFilters: () => [{ status: "" }, () => {}],
  applyFilters: (items: any[]) => items,
  exportToCSV: () => {},
}));

vi.mock("@/components/shared/finance-tabs-nav", () => ({ FinanceTabsNav: () => null }));
vi.mock("@/components/shared/kpi-card", () => ({ KpiGrid: () => null }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({ Button: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/components/shared/permission-gate", () => ({ GuardedButton: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/lib/finance-account-usage", () => ({ isMoneyAccount: () => true }));
vi.mock("@/contexts/app-context", () => ({ useAppContext: () => ({ roleLevel: 0, scopeQueryString: "" }) }));
vi.mock("@workspace/workflow-kit", () => ({ ApprovalActions: () => null }));
vi.mock("@/components/shared/loading-error-states", () => ({ LoadingSpinner: () => null, ErrorState: () => null }));
vi.mock("@/components/shared/print-button", () => ({ PrintButton: () => null }));
vi.mock("@/hooks/use-print-rows", () => ({ usePrintRows: (rows: any) => ({ sortedRows: rows, setSortedRows: () => {} }) }));

import SalaryAdvancesPage from "./salary-advances";

function statusCellText(rowEntries: any[]): string {
  rows.current = rowEntries;
  const { container } = render(<SalaryAdvancesPage />);
  return container.querySelector('[data-key="status"]')?.textContent ?? "";
}

describe("#2118 A6 — salary-advances list surfaces API posting + payment axes", () => {
  it("directly-posted, disbursed advance (status='draft', postingStatus='posted', paymentStatus='paid') reads «مرحّل» + «مدفوع»", () => {
    const txt = statusCellText([
      { id: 1, ref: "SALARY-ADV-1", employeeName: "أحمد", amount: 500, status: "draft", postingStatus: "posted", paymentStatus: "paid" },
    ]);
    expect(txt).toContain("مرح");      // posted
    expect(txt).toContain("مدفوع");    // paid
    expect(txt).not.toContain("غير");  // neither «غير مرحّل» nor «غير مدفوع»
  });

  it("unposted, unpaid advance reads «غير مرحّل» + «غير مدفوع» (axes, not the approval status)", () => {
    const txt = statusCellText([
      { id: 2, ref: "SALARY-ADV-2", employeeName: "سارة", amount: 300, status: "approved", postingStatus: "unposted", paymentStatus: "unpaid" },
    ]);
    expect(txt).toContain("غير مرحّل");
    expect(txt).toContain("غير مدفوع");
  });

  it("axis is read independently: a row missing the axes shows only the approval badge (no posting/payment indicator)", () => {
    const txt = statusCellText([
      { id: 3, ref: "SALARY-ADV-3", employeeName: "خالد", amount: 100, status: "pending" },
    ]);
    expect(txt).not.toContain("مرحّل");
    expect(txt).not.toContain("مدفوع");
  });
});
