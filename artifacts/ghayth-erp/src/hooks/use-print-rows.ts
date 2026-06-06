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
  useEffect(() => {
    setSortedRows((base ?? []) as T[]);
  }, [base]);

  return { sortedRows, setSortedRows };
}
