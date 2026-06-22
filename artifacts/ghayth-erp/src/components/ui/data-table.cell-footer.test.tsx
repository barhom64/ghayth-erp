/**
 * Foundation — DataTable per-cell styling + column-aligned footer totals.
 * Pins the two additive column fields introduced for the hard-table set
 * (heatmaps / matrices / financial totals):
 *   (1) `cellClassName(row)` applies a value-dependent class to the BODY cell
 *       (a static `className` is per-column and can't express this).
 *   (2) `footer(rows)` renders a column-aligned total row — one cell under each
 *       column — unlike `renderGrandTotal`'s single colSpan cell.
 *   (3) When no column sets `footer`, no total row is rendered (backward compat).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { DataTable, type DataTableColumn } from "@workspace/ui-core";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

interface Row { id: number; name: string; value: number }
const data: Row[] = [
  { id: 1, name: "أ", value: 10 },
  { id: 2, name: "ب", value: -5 },
];
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "الاسم" },
  {
    key: "value",
    header: "القيمة",
    cellClassName: (r) => (r.value < 0 ? "cell-negative" : "cell-positive"),
    render: (r) => String(r.value),
    footer: (rows) => String(rows.reduce((s, r) => s + r.value, 0)),
  },
];

function tableRowCount() {
  const table = document.querySelector("table")!;
  return within(table).getAllByRole("row").length;
}

afterEach(() => cleanup());

describe("Foundation — cellClassName + footer", () => {
  it("applies cellClassName per body cell, computed from the row", () => {
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} />);
    expect(screen.getByText("10").closest("td")!.className).toContain("cell-positive");
    expect(screen.getByText("-5").closest("td")!.className).toContain("cell-negative");
  });

  it("renders a column-aligned footer total row when a column declares footer", () => {
    render(<DataTable columns={columns} data={data} pageSize={0} searchPlaceholder={null} />);
    // 10 + (-5) = 5 appears in the footer.
    const totalCell = screen.getByText("5").closest("td")!;
    const footerRow = totalCell.closest("tr")!;
    // Column-aligned: one cell per column (الاسم empty, القيمة = 5) — not a colSpan.
    expect(within(footerRow).getAllByRole("cell").length).toBe(2);
    // header + 2 body + 1 footer.
    expect(tableRowCount()).toBe(4);
  });

  it("renders no footer total row when no column declares footer (backward compatible)", () => {
    const noFooter: DataTableColumn<Row>[] = [
      { key: "name", header: "الاسم" },
      { key: "value", header: "القيمة", render: (r) => String(r.value) },
    ];
    render(<DataTable columns={noFooter} data={data} pageSize={0} searchPlaceholder={null} />);
    // header + 2 body, no footer.
    expect(tableRowCount()).toBe(3);
  });
});
