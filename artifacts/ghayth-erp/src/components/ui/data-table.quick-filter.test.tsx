/**
 * Batch D — DataTable quick filters («يحتاج إجراء مني»).
 * Pins: (1) a quick-filter toggle narrows rows by the caller's predicate,
 * (2) toggling off / «مسح» restores all rows, (3) when no quickFilters are
 * passed nothing changes (backward compatible). The «next step» column and
 * status-based row actions are intentionally NOT new props — they are already
 * expressible via columns[].render, so no duplicate API is added.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { DataTable, type DataTableColumn, type QuickFilter } from "@workspace/ui-core";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

interface Row { id: number; name: string; assignee: number; status: string }
const columns: DataTableColumn<Row>[] = [{ key: "name", header: "الاسم" }];
const data: Row[] = [
  { id: 1, name: "طلب أحمد", assignee: 7, status: "pending" },
  { id: 2, name: "طلب سارة", assignee: 9, status: "approved" },
  { id: 3, name: "طلب خالد", assignee: 7, status: "pending" },
];
// "needs my action": pending rows assigned to the current user (id 7).
const quickFilters: QuickFilter<Row>[] = [
  { key: "mine", label: "يحتاج إجراء مني", predicate: (r) => r.status === "pending" && r.assignee === 7 },
];

function bodyRowCount() {
  const table = document.querySelector("table")!;
  return within(table).getAllByRole("row").length - 1; // minus header row
}

afterEach(() => cleanup());

describe("Batch D — quick filters", () => {
  it("narrows rows to the predicate when toggled on, restores when off", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} quickFilters={quickFilters} />);
    expect(bodyRowCount()).toBe(3);

    const toggle = screen.getByRole("button", { name: /يحتاج إجراء مني/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("طلب أحمد")).toBeInTheDocument();
    expect(screen.getByText("طلب خالد")).toBeInTheDocument();
    expect(screen.queryByText("طلب سارة")).not.toBeInTheDocument();
    expect(bodyRowCount()).toBe(2);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(bodyRowCount()).toBe(3);
  });

  it("«مسح» clears an active quick filter", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} quickFilters={quickFilters} />);
    await user.click(screen.getByRole("button", { name: /يحتاج إجراء مني/ }));
    expect(bodyRowCount()).toBe(2);
    await user.click(screen.getByRole("button", { name: /^مسح$/ }));
    expect(bodyRowCount()).toBe(3);
  });

  it("renders no quick-filter toggles when none are passed (backward compatible)", () => {
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} />);
    expect(screen.queryByRole("button", { name: /يحتاج إجراء مني/ })).not.toBeInTheDocument();
    expect(bodyRowCount()).toBe(3);
  });
});
