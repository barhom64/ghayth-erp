/**
 * #2118 FINANCE-CORRECTION — A1 (#2193) follow-up FE test.
 *
 * Proves posting-activity.tsx renders its posting badge from the API
 * `postingStatus` axis (migration-311 trigger, via /finance/journal) and NOT
 * from the raw `balancesApplied` boolean — so a directly-posted entry that
 * still carries status='draft' reads «مرحَّل», never «غير مرحَّل».
 *
 * Diacritic-safe assertions: posted="مرحَّل" / unposted="غير مرحَّل" /
 * reversed="معكوس" — we check the «غير» prefix and «معكوس» rather than the
 * exact shadda/fatha spelling.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { rows } = vi.hoisted(() => ({ rows: { current: [] as any[] } }));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({
    data: { data: rows.current },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

// ui-core kit: PageShell passthrough; DataTable invokes each column.render(row)
// so the column closures (the posting badge) are exercised directly without the
// real table internals.
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
}));

vi.mock("@/components/shared/finance-tabs-nav", () => ({ FinanceTabsNav: () => null }));
vi.mock("@/components/shared/date-range-presets", () => ({ DateRangePresets: () => null }));
vi.mock("@/components/shared/print-button", () => ({ PrintButton: () => null }));
vi.mock("@/components/shared/loading-error-states", () => ({ LoadingSpinner: () => null, ErrorState: () => null }));

import PostingActivity from "./posting-activity";

function statusCellText(rowEntries: any[]): string {
  rows.current = rowEntries;
  const { container } = render(<PostingActivity />);
  return container.querySelector('[data-key="status"]')?.textContent ?? "";
}

describe("#2118 A1 — posting-activity posting badge consumes API postingStatus", () => {
  it("directly-posted entry (status='draft', postingStatus='posted') reads «مرحَّل», not «غير مرحَّل»", () => {
    const txt = statusCellText([
      { id: 1, ref: "JE-1", status: "draft", balancesApplied: true, postingStatus: "posted", reversedById: null },
    ]);
    expect(txt).toContain("مرح");
    expect(txt).not.toContain("غير");
    expect(txt).not.toContain("معكوس");
  });

  it("unposted entry (postingStatus='unposted') reads «غير مرحَّل»", () => {
    const txt = statusCellText([
      { id: 2, ref: "JE-2", status: "posted", balancesApplied: false, postingStatus: "unposted", reversedById: null },
    ]);
    expect(txt).toContain("غير");
  });

  it("reversed entry (postingStatus='reversed') reads «معكوس»", () => {
    const txt = statusCellText([
      { id: 3, ref: "JE-3", status: "reversed", balancesApplied: false, postingStatus: "reversed", reversedById: null },
    ]);
    expect(txt).toContain("معكوس");
  });
});
