/**
 * useSortedData — hook tests. Batch 14 of the FE behavioral-coverage effort
 * (ghayth-review documented gap).
 *
 * The client-side column sorter behind list/table headers across the app. Two
 * pieces, each with an easy-to-break rule:
 *
 *  - handleSort is a TRI-STATE cycle on the active column: asc → desc →
 *    cleared (null/null) → asc … but clicking a DIFFERENT column jumps
 *    straight to asc (not the previous column's direction).
 *  - the sort comparator has three branches that must stay distinct:
 *      · null/undefined values always sort LAST — and crucially the null
 *        checks are NOT multiplied by the direction, so nulls stay last even
 *        in descending order (the bug-prone invariant).
 *      · two numbers compare numerically (so 100 > 9, not "100" < "9").
 *      · everything else compares as a lower-cased Arabic-locale string.
 *    It also sorts a COPY (`[...data]`), never mutating the caller's array,
 *    and returns the original reference untouched while unsorted.
 *
 * All orderings were confirmed against the live comparator before locking
 * them in. Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSortedData } from "./use-sorted-data";

describe("useSortedData — handleSort cycle", () => {
  it("cycles the active column asc → desc → cleared → asc", () => {
    const { result } = renderHook(() => useSortedData([{ v: 1 }]));
    expect(result.current.sortState).toEqual({ column: null, direction: null });

    act(() => result.current.handleSort("v"));
    expect(result.current.sortState).toEqual({ column: "v", direction: "asc" });

    act(() => result.current.handleSort("v"));
    expect(result.current.sortState).toEqual({ column: "v", direction: "desc" });

    act(() => result.current.handleSort("v"));
    expect(result.current.sortState).toEqual({ column: null, direction: null });

    act(() => result.current.handleSort("v"));
    expect(result.current.sortState).toEqual({ column: "v", direction: "asc" });
  });

  it("switching to a different column restarts at asc, not the prior direction", () => {
    const { result } = renderHook(() => useSortedData([{ a: 1, b: 2 }]));
    act(() => result.current.handleSort("a"));
    act(() => result.current.handleSort("a")); // a → desc
    expect(result.current.sortState).toEqual({ column: "a", direction: "desc" });

    act(() => result.current.handleSort("b"));
    expect(result.current.sortState).toEqual({ column: "b", direction: "asc" });
  });
});

describe("useSortedData — sortedData", () => {
  it("returns the data untouched (same reference) while unsorted", () => {
    const data = [{ v: 3 }, { v: 1 }];
    const { result } = renderHook(() => useSortedData(data));
    expect(result.current.sortedData).toBe(data);
  });

  it("passes through null / undefined data", () => {
    expect(renderHook(() => useSortedData(null)).result.current.sortedData).toBeNull();
    expect(renderHook(() => useSortedData(undefined)).result.current.sortedData).toBeUndefined();
  });

  it("sorts a numeric column numerically, not lexically", () => {
    const { result } = renderHook(() => useSortedData([{ v: 10 }, { v: 9 }, { v: 100 }]));
    act(() => result.current.handleSort("v")); // asc
    expect(result.current.sortedData?.map((r) => r.v)).toEqual([9, 10, 100]);
    act(() => result.current.handleSort("v")); // desc
    expect(result.current.sortedData?.map((r) => r.v)).toEqual([100, 10, 9]);
  });

  it("keeps null values LAST regardless of sort direction", () => {
    const { result } = renderHook(() => useSortedData([{ v: 2 }, { v: null }, { v: 1 }]));
    act(() => result.current.handleSort("v")); // asc
    expect(result.current.sortedData?.map((r) => r.v)).toEqual([1, 2, null]);
    act(() => result.current.handleSort("v")); // desc — null STILL last, not first
    expect(result.current.sortedData?.map((r) => r.v)).toEqual([2, 1, null]);
  });

  it("sorts strings case-insensitively", () => {
    const { result } = renderHook(() => useSortedData([{ v: "B" }, { v: "a" }, { v: "C" }]));
    act(() => result.current.handleSort("v"));
    expect(result.current.sortedData?.map((r) => r.v)).toEqual(["a", "B", "C"]);
  });

  it("sorts a COPY without mutating the caller's array", () => {
    const data = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const { result } = renderHook(() => useSortedData(data));
    act(() => result.current.handleSort("v"));
    expect(data.map((r) => r.v)).toEqual([3, 1, 2]); // original order preserved
    expect(result.current.sortedData).not.toBe(data); // a new array
    expect(result.current.sortedData?.map((r) => r.v)).toEqual([1, 2, 3]);
  });
});
