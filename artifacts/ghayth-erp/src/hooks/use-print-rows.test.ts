/**
 * usePrintRows — hook tests. Batch 10 of the FE behavioral-coverage effort
 * (ghayth-review documented gap).
 *
 * Bridges DataTable's sorted/filtered rows to PrintButton. The subtle, bug-prone
 * part is the GUARDED setter: call sites hand it a brand-new array of brand-new
 * objects on every render, so a reference compare would never bail and React
 * would loop forever (error #185). The setter therefore bails by CONTENT — and
 * the hook re-seeds from `base` whenever the input set changes (refetch/filter).
 *
 * `base` is passed via initialProps so it keeps a STABLE reference across
 * re-renders, exactly like the memoized/query-cached arrays real call sites
 * pass (a fresh literal each render would re-fire the re-seed effect — which is
 * itself the hook contract, but not what we're exercising here).
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePrintRows } from "./use-print-rows";

function setup<T>(b: readonly T[] | null | undefined) {
  return renderHook(({ base }) => usePrintRows(base), { initialProps: { base: b } });
}

describe("usePrintRows", () => {
  it("seeds sortedRows from the base set", () => {
    expect(setup([1, 2, 3]).result.current.sortedRows).toEqual([1, 2, 3]);
  });

  it("falls back to [] for null/undefined base", () => {
    expect(setup(null).result.current.sortedRows).toEqual([]);
    expect(setup(undefined).result.current.sortedRows).toEqual([]);
  });

  it("setSortedRows applies a genuinely different ordering", () => {
    const { result } = setup([{ id: 1 }, { id: 2 }]);
    act(() => result.current.setSortedRows([{ id: 2 }, { id: 1 }]));
    expect(result.current.sortedRows).toEqual([{ id: 2 }, { id: 1 }]);
  });

  it("BAILS when handed a content-equal new array (keeps the same reference — guards React #185)", () => {
    const { result } = setup([{ id: 1, name: "x" }]);
    const ref1 = result.current.sortedRows;
    // brand-new array of brand-new, content-equal objects (what call sites pass every render)
    act(() => result.current.setSortedRows([{ id: 1, name: "x" }]));
    expect(result.current.sortedRows).toBe(ref1); // same reference → no re-render loop
  });

  it("does NOT bail when the row count differs", () => {
    const { result } = setup([1, 2, 3]);
    act(() => result.current.setSortedRows([1, 2]));
    expect(result.current.sortedRows).toEqual([1, 2]);
  });

  it("re-seeds sortedRows when the base set changes (refetch / filter)", () => {
    const { result, rerender } = renderHook(({ base }) => usePrintRows(base), {
      initialProps: { base: [1, 2] as number[] },
    });
    act(() => result.current.setSortedRows([9]));
    expect(result.current.sortedRows).toEqual([9]);

    rerender({ base: [3, 4] });
    expect(result.current.sortedRows).toEqual([3, 4]);
  });
});
