/**
 * ListPage — integration (load → render → filter → action) tests. Batch 4 of
 * the FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * ListPage is the composite list primitive (~107 list pages adopt it): it owns
 * the React Query call, the filter state, the PageShell shell, and wires
 * AdvancedFilters → applyFilters → DataTable. This is the closest to an
 * end-to-end page flow we can test without a router: the only thing mocked is
 * the network (useApiQuery) — PageShell, AdvancedFilters and DataTable all
 * render for real, so typing in the filter genuinely narrows the table.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Controlled network state — set per test before render.
const { q } = vi.hoisted(() => ({
  q: { current: { data: undefined as unknown, isLoading: false, isError: false } },
}));

vi.mock("@/lib/api", () => ({
  useApiQuery: () => ({ ...q.current, error: null, refetch: () => {} }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-rate-limit-cooldown", () => ({
  useRateLimitCooldown: () => ({ isCoolingDown: false, label: "" }),
}));

import { ListPage, type DataTableColumn } from "@workspace/ui-core";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

interface Row {
  id: number;
  name: string;
  status: string;
}
const columns: DataTableColumn<Row>[] = [{ key: "name", header: "الاسم" }];
const rows: Row[] = [
  { id: 1, name: "أحمد", status: "active" },
  { id: 2, name: "سارة", status: "closed" },
  { id: 3, name: "خالد", status: "active" },
];

function buildList(primaryAction?: { label: string; onClick: () => void }) {
  return (
    <ListPage
      title="القائمة"
      queryKey={["test-list"]}
      endpoint="/test/list"
      columns={columns}
      rowKey={(r) => r.id}
      filters={{ config: { showDateRange: false }, searchFields: ["name"] }}
      emptyMessage="لا توجد عناصر"
      primaryAction={primaryAction}
    />
  );
}

afterEach(() => {
  cleanup();
  q.current = { data: undefined, isLoading: false, isError: false };
});

describe("ListPage — load → render → filter → action", () => {
  it("renders the rows returned by the query", () => {
    q.current = { data: { data: rows }, isLoading: false, isError: false };
    render(buildList());
    expect(screen.getByText("أحمد")).toBeInTheDocument();
    expect(screen.getByText("سارة")).toBeInTheDocument();
    expect(screen.getByText("خالد")).toBeInTheDocument();
  });

  it("shows the empty message when the query returns no rows", () => {
    q.current = { data: { data: [] }, isLoading: false, isError: false };
    render(buildList());
    expect(screen.getByText("لا توجد عناصر")).toBeInTheDocument();
  });

  it("typing in the filter search narrows the table (AdvancedFilters → applyFilters → DataTable)", async () => {
    const user = userEvent.setup();
    q.current = { data: { data: rows }, isLoading: false, isError: false };
    render(buildList());
    expect(screen.getByText("سارة")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("بحث..."), "خالد");

    expect(screen.getByText("خالد")).toBeInTheDocument();
    expect(screen.queryByText("أحمد")).not.toBeInTheDocument();
    expect(screen.queryByText("سارة")).not.toBeInTheDocument();
  });

  it("fires the primary action's onClick when its button is pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    q.current = { data: { data: rows }, isLoading: false, isError: false };
    render(buildList({ label: "عنصر جديد", onClick }));

    await user.click(screen.getByRole("button", { name: /عنصر جديد/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
