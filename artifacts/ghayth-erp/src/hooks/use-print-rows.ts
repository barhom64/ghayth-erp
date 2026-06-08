import { useCallback, useEffect, useState } from "react";

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

/**
 * Content-equality for two row arrays.
 *
 * Many call sites build a BRAND-NEW array of BRAND-NEW objects on every render
 * — e.g. `opportunities.flatMap(o => o.activities.map(a => ({ ...a, extra })))`
 * or `applyFilters(items.map(...))`. A reference compare (prev[i] === next[i])
 * can never match those, so it would never bail and we'd loop forever
 * (React error #185). We therefore compare by CONTENT: same length, and each
 * row shallow-equal field-by-field. Field values that are themselves objects
 * keep stable references across renders (they come from the query cache), so a
 * shallow per-key compare is sufficient and cheap.
 */
function rowsEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as unknown;
    const y = b[i] as unknown;
    if (x === y) continue;
    if (
      x === null ||
      y === null ||
      typeof x !== "object" ||
      typeof y !== "object"
    ) {
      if (x !== y) return false;
      continue;
    }
    const xo = x as Record<string, unknown>;
    const yo = y as Record<string, unknown>;
    const kx = Object.keys(xo);
    const ky = Object.keys(yo);
    if (kx.length !== ky.length) return false;
    for (const k of kx) {
      if (xo[k] !== yo[k]) return false;
    }
  }
  return true;
}

export function usePrintRows<T>(base: readonly T[] | undefined | null) {
  const fallback: T[] = (base ?? []) as T[];
  const [sortedRows, setSortedRows] = useState<T[]>(fallback);

  // Guarded setter: bail out of the state update when the incoming rows are
  // content-equal to what we already hold. Returning the SAME reference from
  // the updater makes React skip the re-render, breaking the feedback loop.
  //
  // This guard wraps EVERY write path — both the re-seed effect below AND the
  // raw setter handed to `<DataTable onSortedDataChange={setSortedRows} />`,
  // which otherwise calls setState directly with a fresh array on every render.
  const setSortedRowsGuarded = useCallback(
    (next: T[] | ((prev: T[]) => T[])) => {
      setSortedRows((prev) => {
        const incoming =
          typeof next === "function"
            ? (next as (prev: T[]) => T[])(prev)
            : next;
        return rowsEqual(prev, incoming) ? prev : incoming;
      });
    },
    [],
  );

  // Re-seed whenever the input set changes (filter / scope change). Without
  // this, a refetch that produces a new `base` would leave `sortedRows`
  // pointing at the previous batch until the user re-sorted.
  useEffect(() => {
    setSortedRowsGuarded((base ?? []) as T[]);
  }, [base, setSortedRowsGuarded]);

  return { sortedRows, setSortedRows: setSortedRowsGuarded };
}
