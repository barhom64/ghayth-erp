/**
 * DataTable — behavioral (interaction) tests.
 *
 * ghayth-review flags "اختبار سلوكي للواجهة غير موجود بعد" as a known gap: most
 * FE tests render-and-assert or scan source, but few drive real user actions.
 * DataTable is the shared list/display component behind hundreds of pages, so a
 * regression in its sort / search / pagination silently breaks the whole app.
 * These tests render the REAL component and drive it with userEvent:
 *
 *   • sort      — clicking a sortable header cycles asc → desc → unsorted
 *                 (numeric column sorts numerically, per useSortedData).
 *   • search    — typing in the global box narrows to rows whose searchable
 *                 column matches; clearing restores every row.
 *   • paginate  — pageSize caps visible rows; «التالي»/«السابق» move pages and
 *                 disable at the bounds.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Force the desktop <table> branch (mobile renders cards, not rows).
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { DataTable, type DataTableColumn } from "@workspace/ui-core";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Body rows in document order (header row dropped), as text.
function rowTexts(): string[] {
  const table = document.querySelector("table")!;
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent ?? "");
}

afterEach(() => cleanup());

interface Row {
  id: number;
  name: string;
  amount: number;
}
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "الاسم", sortable: true, searchable: true },
  { key: "amount", header: "المبلغ", sortable: true },
];

describe("DataTable — sorting", () => {
  // intentionally out of order so the initial render isn't already sorted
  const data: Row[] = [
    { id: 1, name: "منخفض", amount: 10 },
    { id: 2, name: "عالٍ", amount: 30 },
    { id: 3, name: "متوسط", amount: 20 },
  ];

  it("cycles a numeric column asc → desc → unsorted on repeated header clicks", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} />);

    // initial (unsorted) order = data order
    expect(rowTexts().map((t) => t.replace(/\d+/g, ""))).toEqual(["منخفض", "عالٍ", "متوسط"]);

    const amountHeader = screen.getByRole("button", { name: /ترتيب حسب المبلغ/ });

    // 1st click → ascending (10, 20, 30)
    await user.click(amountHeader);
    expect(rowTexts()[0]).toContain("منخفض"); // 10
    expect(rowTexts()[1]).toContain("متوسط"); // 20
    expect(rowTexts()[2]).toContain("عالٍ"); // 30
    expect(amountHeader.closest("th")).toHaveAttribute("aria-sort", "ascending");

    // 2nd click → descending (30, 20, 10)
    await user.click(amountHeader);
    expect(rowTexts()[0]).toContain("عالٍ");
    expect(rowTexts()[1]).toContain("متوسط");
    expect(rowTexts()[2]).toContain("منخفض");
    expect(amountHeader.closest("th")).toHaveAttribute("aria-sort", "descending");

    // 3rd click → back to original order
    await user.click(amountHeader);
    expect(rowTexts().map((t) => t.replace(/\d+/g, ""))).toEqual(["منخفض", "عالٍ", "متوسط"]);
    expect(amountHeader.closest("th")).toHaveAttribute("aria-sort", "none");
  });
});

describe("DataTable — search", () => {
  const data: Row[] = [
    { id: 1, name: "منخفض", amount: 10 },
    { id: 2, name: "عالٍ", amount: 30 },
    { id: 3, name: "متوسط", amount: 20 },
  ];

  it("narrows to rows whose searchable column matches, and restores on clear", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder="بحث..." />);
    expect(rowTexts()).toHaveLength(3);

    const box = screen.getByPlaceholderText("بحث...");
    await user.type(box, "عال");
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("عالٍ");

    await user.clear(box);
    expect(rowTexts()).toHaveLength(3);
  });

  it("does not match against a non-searchable column (amount)", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder="بحث..." />);
    // "30" is the amount of «عالٍ» but amount is not searchable → no data row
    // matches and the table falls back to its empty state.
    await user.type(screen.getByPlaceholderText("بحث..."), "30");
    expect(screen.queryByText("عالٍ")).not.toBeInTheDocument();
    expect(screen.getByText(/لا توجد/)).toBeInTheDocument();
  });
});

describe("DataTable — pagination", () => {
  const many: Row[] = [1, 2, 3, 4, 5].map((n) => ({ id: n, name: `بند-${n}`, amount: n }));

  it("caps rows to pageSize and moves pages with «التالي» / «السابق»", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={many} pageSize={2} searchPlaceholder={null} />);

    // page 1 of 3 → first two rows, «السابق» disabled
    expect(rowTexts()).toHaveLength(2);
    expect(rowTexts()[0]).toContain("بند-1");
    expect(rowTexts()[1]).toContain("بند-2");
    const prev = screen.getByRole("button", { name: /السابق/ });
    const next = screen.getByRole("button", { name: /التالي/ });
    expect(prev).toBeDisabled();

    // → page 2
    await user.click(next);
    expect(rowTexts()[0]).toContain("بند-3");
    expect(rowTexts()[1]).toContain("بند-4");
    expect(prev).not.toBeDisabled();

    // → page 3 (last, single row, «التالي» disabled)
    await user.click(next);
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("بند-5");
    expect(next).toBeDisabled();

    // ← back to page 2
    await user.click(prev);
    expect(rowTexts()[0]).toContain("بند-3");
  });
});
