/**
 * #2118 FINANCE-CORRECTION — A6 (opening-balances) follow-up FE test.
 *
 * Proves opening-balances.tsx keeps the INDEPENDENT computed balance badge
 * (DR=CR → «متوازن/غير متوازن») AND additionally surfaces the truthful posting
 * axis from the API (`postingStatus`, migration-311 trigger, slice 7). The
 * strongest proof is the divergence case: a BALANCED entry whose
 * postingStatus='unposted' shows «متوازن» (balance, independent) together with
 * «غير مرحّل» (posting axis) — proving the posting indicator is read from the
 * API axis, not derived from the balance signal.
 *
 * Diacritic-safe: posted="مرحّل" / unposted="غير مرحّل".
 * The real status-model labels are used (module NOT mocked).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { rows } = vi.hoisted(() => ({ rows: { current: [] as any[] } }));

vi.mock("wouter", () => ({ Link: ({ children }: any) => <a>{children}</a> }));

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
}));

vi.mock("@/components/shared/finance-tabs-nav", () => ({ FinanceTabsNav: () => null }));
vi.mock("@/components/shared/loading-error-states", () => ({ LoadingSpinner: () => null, ErrorState: () => null }));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({ Button: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/components/shared/permission-gate", () => ({ GuardedButton: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children, className }: any) => <span className={className}>{children}</span> }));
vi.mock("@/contexts/app-context", () => ({ useAppContext: () => ({ scopeQueryString: "" }) }));
vi.mock("@/components/shared/print-button", () => ({ PrintButton: () => null }));
vi.mock("@/hooks/use-print-rows", () => ({ usePrintRows: (rows: any) => ({ sortedRows: rows, setSortedRows: () => {} }) }));

import OpeningBalancesPage from "./opening-balances";

function statusCellText(rowEntries: any[]): string {
  rows.current = rowEntries;
  const { container } = render(<OpeningBalancesPage />);
  return container.querySelector('[data-key="status"]')?.textContent ?? "";
}

describe("#2118 A6 — opening-balances keeps balance badge + surfaces API postingStatus", () => {
  it("balanced + posted reads «متوازن» + «مرحّل», never «غير»", () => {
    const txt = statusCellText([
      { id: 1, ref: "OB-2026", description: "افتتاحي", totalDebit: 100, totalCredit: 100, postingStatus: "posted" },
    ]);
    expect(txt).toContain("متوازن");
    expect(txt).toContain("مرح");
    expect(txt).not.toContain("غير");
  });

  it("DIVERGENCE: balanced entry with postingStatus='unposted' shows «متوازن» (balance) AND «غير مرحّل» (posting axis) — proves the indicator reads the API axis, not the balance", () => {
    const txt = statusCellText([
      { id: 2, ref: "OB-2027", description: "افتتاحي", totalDebit: 100, totalCredit: 100, postingStatus: "unposted" },
    ]);
    expect(txt).toContain("متوازن");
    expect(txt).toContain("غير مرحّل");
  });

  it("a row missing postingStatus shows the balance badge only (no posting indicator)", () => {
    const txt = statusCellText([
      { id: 3, ref: "OB-2028", description: "افتتاحي", totalDebit: 100, totalCredit: 50 },
    ]);
    expect(txt).toContain("غير متوازن");
    expect(txt).not.toContain("مرحّل");
  });
});
