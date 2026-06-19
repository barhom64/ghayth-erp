/**
 * DataTable mobile-responsive cards. The shared DataTable (used by ~307
 * pages) renders rows as stacked label:value cards below 768px instead of
 * a horizontally-scrolling table, making the whole system phone-usable.
 * Desktop keeps the table; grouped/loading/error/empty stay on the table
 * path. Verified by toggling the useIsMobile mock.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const mobile = { value: false };
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile.value }));

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

interface Row { id: number; name: string; salary: number }
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "الاسم" },
  { key: "salary", header: "الراتب", render: (r) => `${r.salary} ر.س` },
];
const data: Row[] = [
  { id: 1, name: "أحمد", salary: 5000 },
  { id: 2, name: "سارة", salary: 7000 },
];

afterEach(() => { cleanup(); mobile.value = false; });

describe("DataTable — responsive mobile cards", () => {
  it("desktop (>=768px) renders the table, not cards", () => {
    mobile.value = false;
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} />);
    expect(screen.queryByTestId("data-table-mobile-cards")).toBeNull();
    expect(document.querySelector("table")).not.toBeNull();
  });

  it("mobile (<768px) renders stacked cards with column headers as labels", () => {
    mobile.value = true;
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} />);
    expect(screen.getByTestId("data-table-mobile-cards")).toBeTruthy();
    // each row becomes a card; labels come from the column headers
    expect(screen.getAllByText("الاسم").length).toBe(2);
    expect(screen.getAllByText("الراتب").length).toBe(2);
    // custom render() is honoured in the card value
    expect(screen.getByText("5000 ر.س")).toBeTruthy();
    expect(screen.getByText("أحمد")).toBeTruthy();
  });

  it("mobile empty data falls back to the table path (shows empty state, not cards)", () => {
    mobile.value = true;
    render(<DataTable columns={columns} data={[]} pageSize={0} searchPlaceholder={null} />);
    expect(screen.queryByTestId("data-table-mobile-cards")).toBeNull();
  });

  it("clicking inside row extras does NOT fire onRowClick (extras outside the click area)", async () => {
    mobile.value = true;
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[data[0]]}
        pageSize={0}
        searchPlaceholder={null}
        onRowClick={onRowClick}
        renderRowExtras={() => <button data-testid="extra-btn">تفاصيل</button>}
      />,
    );
    // a field value IS inside the click area → fires onRowClick
    screen.getByText("أحمد").click();
    expect(onRowClick).toHaveBeenCalledTimes(1);
    // the extras button is OUTSIDE → must NOT fire onRowClick again
    screen.getByTestId("extra-btn").click();
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
