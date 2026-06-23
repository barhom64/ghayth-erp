/**
 * #2303 PAYROLL-LIABILITY — FE test for the gl-posting-queue dashboard tab.
 *
 * Covers the two pieces of custom logic the payroll-liability section adds on
 * top of the shared helper pattern:
 *   1. One settle button per liability with an OUTSTANDING balance — a zero
 *      balance renders no button (so an operator can't "settle" nothing).
 *   2. Clicking a liability prefills the form, and submit posts the right body
 *      (runId + liabilityType + numeric amount) to the mutation.
 *
 * Mocks mirror posting-activity.test.tsx: ui-core's DataTable invokes each
 * column.render(row) directly so the column closures are exercised without the
 * real table internals, and the provider-bound shared components are stubbed.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { plRows, mutateSpy } = vi.hoisted(() => ({
  plRows: { current: [] as any[] },
  mutateSpy: vi.fn(),
}));

// jsdom is missing a few DOM APIs some components poke at — shim defensively.
beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Data layer: payroll-liability query returns our rows; every other helper
// queue returns empty so its column closures (GuardedButton etc.) never render.
vi.mock("@/lib/api", () => ({
  useApiQuery: (_key: unknown, path: string) => ({
    data: {
      data:
        typeof path === "string" && path.includes("payroll-liability")
          ? plRows.current
          : [],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
  useApiMutation: () => ({ mutate: mutateSpy, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: () => {} }));

// ui-core kit: PageShell passthrough; DataTable invokes each column.render(row)
// so the conditional settle buttons are exercised directly.
vi.mock("@workspace/ui-core", () => ({
  PageShell: ({ children, actions }: any) => <div>{actions}{children}</div>,
  PageStatusBadge: ({ status, children }: any) => <span>{children ?? status}</span>,
  DataTable: ({ columns, data }: any) => (
    <table>
      <tbody>
        {(data ?? []).map((row: any, i: number) => (
          <tr key={i}>
            {columns.map((c: any, ci: number) => (
              <td key={ci} data-key={String(c.key)}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  AdvancedFilters: () => null,
  useFilters: () => [{}, () => {}],
  applyFilters: (items: any) => items,
}));

// Render every tab's content (skip Radix tab-switching) so the
// payroll-liability panel is in the tree without a user gesture.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

// Plain buttons — strip variant/rateLimitAware so no provider is needed; keep
// onClick + disabled (the only behaviour the test relies on).
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/shared/permission-gate", () => ({
  GuardedButton: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));
vi.mock("@/components/shared/finance-tabs-nav", () => ({ FinanceTabsNav: () => null }));
vi.mock("@/components/shared/print-button", () => ({ PrintButton: () => null }));
vi.mock("@/components/shared/loading-error-states", () => ({
  LoadingSpinner: () => null,
  ErrorState: () => null,
}));

import GLPostingQueuePage from "./gl-posting-queue";

describe("#2303 — gl-posting-queue payroll-liability tab", () => {
  it("shows a settle button only for liabilities with an outstanding balance", () => {
    plRows.current = [
      { runId: 7, period: "2026-01", gosiOutstanding: "5000.00", whtOutstanding: "1200.50", deductionsOutstanding: "0" },
    ];
    render(<GLPostingQueuePage />);

    // GOSI + WHT outstanding > 0 → buttons; deductions = 0 → no button.
    expect(screen.getByRole("button", { name: "GOSI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ضريبة" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "استقطاعات" })).toBeNull();
  });

  it("prefills from a liability and posts { runId, liabilityType, amount }", async () => {
    plRows.current = [
      { runId: 7, period: "2026-01", gosiOutstanding: "5000.00", whtOutstanding: "1200.50", deductionsOutstanding: "0" },
    ];
    mutateSpy.mockClear();
    const user = userEvent.setup();
    render(<GLPostingQueuePage />);

    await user.click(screen.getByRole("button", { name: "GOSI" }));
    await user.click(screen.getByRole("button", { name: /تسوية ونشر/ }));

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy.mock.calls[0][0]).toMatchObject({
      runId: 7,
      liabilityType: "gosi",
      amount: 5000,
    });
  });
});
