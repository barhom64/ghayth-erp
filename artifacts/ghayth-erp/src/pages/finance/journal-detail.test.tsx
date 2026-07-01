/**
 * #2118 FINANCE-CORRECTION — A2 (#2194) follow-up FE test.
 *
 * Proves journal-detail.tsx renders its DISPLAY posting badge from the API
 * `postingStatus` axis, NOT from the raw `balancesApplied` boolean. The
 * strongest proof is the divergence case: balancesApplied=true but
 * postingStatus='unposted' must render «غير مُرحَّل» — if the badge still read
 * balancesApplied it would (wrongly) read «مُرَحَّل».
 *
 * The action gates (approve/post) are intentionally NOT asserted here — A2 left
 * them server-owned (approvalStatus/balancesApplied) and untouched.
 *
 * Badge mapping (PageStatusBadge mock exposes data-status):
 *   posted   → status="active"
 *   unposted → status="pending"
 *   reversed → status="reversed"
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { je } = vi.hoisted(() => ({ je: { current: {} as any } }));

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "1" }],
  useLocation: () => ["", () => {}],
  Link: ({ children }: any) => <a>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ data: je.current, isLoading: false, isError: false, refetch: () => {} }),
  useApiMutation: () => ({ mutate: () => {}, isPending: false }),
}));

vi.mock("@workspace/ui-core", () => ({
  PageShell: ({ children, actions }: any) => <div>{actions}{children}</div>,
  PageStatusBadge: ({ status, children }: any) => <span data-status={status}>{children ?? status}</span>,
  DataTable: ({ columns, data }: any) => (
    <table>
      <tbody>
        {(data ?? []).map((row: any, i: number) => (
          <tr key={i}>{columns.map((c: any, ci: number) => <td key={ci}>{c.render ? c.render(row) : row[c.key]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock("@/components/shared/finance-tabs-nav", () => ({ FinanceTabsNav: () => null }));
vi.mock("@/components/shared/permission-gate", () => ({ GuardedButton: ({ children }: any) => <button>{children}</button> }));
vi.mock("@/components/shared/entity-print", () => ({ PrintButton: () => null }));
vi.mock("@/components/shared/loading-error-states", () => ({ LoadingSpinner: () => null, ErrorState: () => null }));

import JournalDetailPage from "./journal-detail";

function baseEntry(overrides: Record<string, unknown>) {
  return {
    id: 1, ref: "JE-1", description: null, type: "manual",
    status: "draft", balancesApplied: false, postingStatus: "unposted",
    reversalOfId: null, reversedById: null, reversedAt: null,
    approvalStatus: "approved", createdAt: "2026-06-13T00:00:00Z", postedAt: null,
    lines: [
      { accountCode: "1000", accountName: "نقد", debit: 100, credit: 0 },
      { accountCode: "4000", accountName: "إيراد", debit: 0, credit: 100 },
    ],
    ...overrides,
  };
}

function postingBadgeStatus(overrides: Record<string, unknown>): string[] {
  je.current = baseEntry(overrides);
  const { container } = render(<JournalDetailPage />);
  return Array.from(container.querySelectorAll("[data-status]")).map((el) => el.getAttribute("data-status") || "");
}

describe("#2118 A2 — journal-detail posting badge consumes API postingStatus", () => {
  it("directly-posted entry (status='draft', postingStatus='posted') shows the posted badge", () => {
    const statuses = postingBadgeStatus({ balancesApplied: true, postingStatus: "posted" });
    expect(statuses).toContain("active");
    expect(statuses).not.toContain("pending");
  });

  it("DIVERGENCE: balancesApplied=true but postingStatus='unposted' shows «غير مُرحَّل» — proves the badge reads the axis, not the boolean", () => {
    const statuses = postingBadgeStatus({ balancesApplied: true, postingStatus: "unposted" });
    expect(statuses).toContain("pending");
    expect(statuses).not.toContain("active");
  });

  it("reversed entry (postingStatus='reversed') shows the reversed badge", () => {
    const statuses = postingBadgeStatus({ postingStatus: "reversed" });
    expect(statuses).toContain("reversed");
  });
});
