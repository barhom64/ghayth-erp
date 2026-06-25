/**
 * AdvancedFilters — engine + behavioral (interaction) tests. Batch 2 of the
 * FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * Two surfaces, both behind the filtered lists across the app:
 *   • applyFilters<T>(items, values, fields) — the PURE filter engine: search
 *     (case-insensitive substring over searchFields), status / branch (exact),
 *     date range (dateField string compare), extraFields (exact), all AND-ed.
 *   • <AdvancedFilters config values onChange> — the controlled UI: typing in
 *     the search box emits onChange with the new value; once a filter is active
 *     «مسح الفلاتر» appears and clears every field.
 *
 * The Radix status <Select> (portal + pointer-events) is intentionally not
 * exercised here — the search box and clear button are plain elements and cover
 * the controlled-callback contract without jsdom portal flakiness.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/use-rate-limit-cooldown", () => ({
  useRateLimitCooldown: () => ({ isCoolingDown: false, label: "" }),
}));

import { AdvancedFilters, applyFilters, type FilterValues } from "@workspace/ui-core";

afterEach(() => cleanup());

const EMPTY: FilterValues = { search: "", status: "", branch: "", dateFrom: "", dateTo: "" };
const fv = (p: Partial<FilterValues>): FilterValues => ({ ...EMPTY, ...p });

interface Row {
  id: number;
  name: string;
  status: string;
  branch: string;
  date: string;
  type?: string;
}
const items: Row[] = [
  { id: 1, name: "أحمد علي", status: "active", branch: "1", date: "2026-01-10", type: "vip" },
  { id: 2, name: "سارة محمد", status: "closed", branch: "2", date: "2026-03-15", type: "normal" },
  { id: 3, name: "خالد أحمد", status: "active", branch: "1", date: "2026-06-20", type: "normal" },
];
const fields = {
  searchFields: ["name"],
  statusField: "status",
  branchField: "branch",
  dateField: "date",
  extraFields: { type: "type" },
};
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("applyFilters — the filter engine", () => {
  it("returns everything when no filter is set", () => {
    expect(ids(applyFilters(items, EMPTY, fields))).toEqual([1, 2, 3]);
  });

  it("search matches a searchable field, case/substring-insensitively", () => {
    // «أحمد» appears in row 1 (أحمد علي) and row 3 (خالد أحمد)
    expect(ids(applyFilters(items, fv({ search: "أحمد" }), fields))).toEqual([1, 3]);
  });

  it("status filters by exact value", () => {
    expect(ids(applyFilters(items, fv({ status: "active" }), fields))).toEqual([1, 3]);
    expect(ids(applyFilters(items, fv({ status: "closed" }), fields))).toEqual([2]);
  });

  it("branch filters by exact value", () => {
    expect(ids(applyFilters(items, fv({ branch: "2" }), fields))).toEqual([2]);
  });

  it("date range is inclusive on both ends", () => {
    expect(ids(applyFilters(items, fv({ dateFrom: "2026-03-01" }), fields))).toEqual([2, 3]);
    expect(ids(applyFilters(items, fv({ dateTo: "2026-03-15" }), fields))).toEqual([1, 2]);
    expect(ids(applyFilters(items, fv({ dateFrom: "2026-03-01", dateTo: "2026-03-31" }), fields))).toEqual([2]);
  });

  it("extra fields filter by exact value", () => {
    expect(ids(applyFilters(items, fv({ type: "vip" }), fields))).toEqual([1]);
  });

  it("multiple filters are AND-combined", () => {
    // active AND branch 1 AND name contains «أحمد» → rows 1 and 3
    expect(ids(applyFilters(items, fv({ status: "active", branch: "1", search: "أحمد" }), fields))).toEqual([1, 3]);
    // active AND branch 2 → none (row 2 is closed)
    expect(ids(applyFilters(items, fv({ status: "active", branch: "2" }), fields))).toEqual([]);
  });
});

describe("AdvancedFilters — controlled UI", () => {
  it("typing in the search box emits onChange with the new search value", () => {
    const onChange = vi.fn();
    render(<AdvancedFilters config={{ showDateRange: false }} values={EMPTY} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("بحث..."), { target: { value: "خالد" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: "خالد" }));
  });

  it("«مسح الفلاتر» appears only with an active filter and clears every field", async () => {
    const user = userEvent.setup();

    // no active filter → no clear button
    const { rerender } = render(
      <AdvancedFilters config={{ showDateRange: false }} values={EMPTY} onChange={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /مسح الفلاتر/ })).not.toBeInTheDocument();

    // an active filter → clear button shows; clicking it emits a fully-cleared value
    const onChange = vi.fn();
    rerender(
      <AdvancedFilters config={{ showDateRange: false }} values={fv({ status: "active" })} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /مسح الفلاتر/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: "", status: "", branch: "", dateFrom: "", dateTo: "" }),
    );
  });
});
