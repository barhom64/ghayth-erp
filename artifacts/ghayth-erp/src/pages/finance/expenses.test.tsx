/**
 * #2118 FINANCE-CORRECTION — A3 (#2196) follow-up FE test.
 *
 * Proves expenses.tsx surfaces the truthful posting axis from the API
 * (`postingStatus` from /finance/expenses, migration-311 trigger) in the list
 * status column — NOT derived locally from mapJournalStatus(e.status). So a
 * directly-posted expense (status='draft' + balancesApplied=true +
 * postingStatus='posted') reads «مرحّل» in the list, never «غير مرحّل».
 *
 * Diacritic-safe: posted="مرحّل" (contains «مرح», not «غير») /
 * unposted="غير مرحّل" (contains «غير»).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { rows } = vi.hoisted(() => ({ rows: { current: [] as any[] } }));

vi.mock("wouter", () => ({
  Link: ({ children }: any) => <a>{children}</a>,
  useLocation: () => ["/finance/expenses", () => {}],
}));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({
    data: { data: rows.current },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
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
  AdvancedFilters: () => null,
  useFilters: () => [{ status: "" }, () => {}],
  applyFilters: (items: any[]) => items,
  exportToCSV: () => {},
  useAdvancedFilters: () => ({}),
}));

vi.mock("@/components/shared/kpi-card", () => ({ KpiGrid: () => null }));
vi.mock("@workspace/entity-kit", () => ({ EntityComments: () => null }));
vi.mock("@/components/shared/entity-tags", () => ({
  EntityTags: () => null,
  TagFilterSelect: () => null,
  useTagFilter: () => ({ tagsList: [], selectedTag: null, setSelectedTag: () => {}, filteredIds: null }),
}));
vi.mock("@/components/shared/bulk-actions", () => ({
  BulkActionsBar: () => null,
  BulkCheckbox: () => null,
  useBulkSelection: () => ({ selectedIds: new Set(), toggle: () => {}, toggleAll: () => {}, clear: () => {} }),
}));
vi.mock("@workspace/workflow-kit", () => ({ ApprovalActions: () => null, ActionHistory: () => null }));
vi.mock("@/components/shared/permission-gate", () => ({ GuardedButton: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/contexts/app-context", () => ({ useAppContext: () => ({ scopeQueryString: "", can: () => true }) }));
vi.mock("@/components/shared/finance-tabs-nav", () => ({ FinanceTabsNav: () => null }));
vi.mock("@/components/shared/print-button", () => ({ PrintButton: () => null }));
vi.mock("@/components/shared/loading-error-states", () => ({ LoadingSpinner: () => null, ErrorState: () => null }));

import ExpensesPage from "./expenses";

function statusCellText(rowEntries: any[]): string {
  rows.current = rowEntries;
  const { container } = render(<ExpensesPage />);
  return container.querySelector('[data-key="status"]')?.textContent ?? "";
}

describe("#2118 A3 — expenses list surfaces API postingStatus axis", () => {
  it("directly-posted expense (status='draft', postingStatus='posted') reads «مرحّل», not «غير مرحّل»", () => {
    const txt = statusCellText([
      { id: 1, ref: "EXP-1", status: "draft", isPaid: false, balancesApplied: true, postingStatus: "posted" },
    ]);
    expect(txt).toContain("مرح");
    expect(txt).not.toContain("غير");
  });

  it("unposted expense (postingStatus='unposted') reads «غير مرحّل»", () => {
    const txt = statusCellText([
      { id: 2, ref: "EXP-2", status: "draft", isPaid: false, balancesApplied: false, postingStatus: "unposted" },
    ]);
    expect(txt).toContain("غير");
  });
});
