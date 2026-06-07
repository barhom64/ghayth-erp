import { useEffect, useState } from "react";

/**
 * Bridge between DataTable's internal sort/filter state and PrintButton.
 *
 * DataTable owns the sort UI; the page owns the filtered base set; the
 * PrintButton needs the rows in the user's current order, not the pre-sort
 * order. This hook lifts the post-filter+post-sort rows so the payload
 * builder can use them.
 *
 * Usage:
 *   const { sortedRows, setSortedRows } = usePrintRows(filtered);
 *   <DataTable data={filtered} onSortedDataChange={setSortedRows} />
 *   <PrintButton payload={() => ({ entity, items: sortedRows.map(...) })} />
 *
 * Until DataTable fires the callback (e.g. on first render before mount),
 * `sortedRows` falls back to the input `base`, so prints always have data.
 */
export function usePrintRows<T>(base: readonly T[] | undefined | null) {
  const fallback: T[] = (base ?? []) as T[];
  const [sortedRows, setSortedRows] = useState<T[]>(fallback);

  // Re-seed whenever the input set changes (filter / scope change). Without
  // this, a refetch that produces a new `base` would leave `sortedRows`
  // pointing at the previous batch until the user re-sorted.
  //
  // IMPORTANT: many call sites pass an unstable reference — e.g.
  // `usePrintRows(applyFilters(...))`, `usePrintRows(items.filter(...))`, or
  // `usePrintRows(data?.data ?? [])`. Those produce a brand-new array on every
  // render, so a naive `setSortedRows(base)` here re-fires the effect every
  // render → setState → re-render → infinite loop (React error #185). To stay
  // resilient regardless of how callers pass `base`, we bail out of the state
  // update when the incoming rows are shallow-equal to what we already hold:
  // returning the SAME reference from the updater makes React skip the
  // re-render, breaking the loop.
  useEffect(() => {
    const next = (base ?? []) as T[];
    setSortedRows((prev) => {
      if (prev === next) return prev;
      if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
        return prev;
      }
      return next;
    });
  }, [base]);

  return { sortedRows, setSortedRows };
}
