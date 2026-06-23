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

  it("renders a column-aligned group subtotal row per group when a column declares groupFooter", () => {
    interface GRow { id: number; section: string; name: string; value: number }
    const gdata: GRow[] = [
      { id: 1, section: "rev", name: "a", value: 10 },
      { id: 2, section: "rev", name: "b", value: 20 },
      { id: 3, section: "exp", name: "c", value: 5 },
    ];
    const gcols: DataTableColumn<GRow>[] = [
      { key: "name", header: "الاسم" },
      { key: "value", header: "القيمة", render: (r) => String(r.value), groupFooter: (rows) => `Σ${rows.reduce((s, r) => s + r.value, 0)}` },
    ];
    render(
      <DataTable columns={gcols} data={gdata} pageSize={0} searchPlaceholder={null} groupBy="section" renderGroupHeader={(g) => g} />,
    );
    // Section subtotals: rev = 10+20 = 30, exp = 5.
    const revSub = screen.getByText("Σ30").closest("tr")!;
    expect(screen.getByText("Σ5")).toBeInTheDocument();
    // Column-aligned: the subtotal row has one cell per column (not a colSpan).
    expect(within(revSub).getAllByRole("cell").length).toBe(2);
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
