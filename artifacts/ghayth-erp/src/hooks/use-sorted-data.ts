import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

export function useSortedData<T = any>(data: T[] | undefined | null) {
  const [sortState, setSortState] = useState<SortState>({
    column: null,
    direction: null,
  });

  const handleSort = (column: string) => {
    setSortState((prev) => {
      if (prev.column === column) {
        if (prev.direction === "asc") return { column, direction: "desc" };
        if (prev.direction === "desc") return { column: null, direction: null };
      }
      return { column, direction: "asc" };
    });
  };

  const sortedData = useMemo(() => {
    if (!data || !sortState.column || !sortState.direction) return data;

    const col = sortState.column;
    const dir = sortState.direction === "asc" ? 1 : -1;

    return [...data].sort((a: any, b: any) => {
      const aVal = a[col];
      const bVal = b[col];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * dir;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return aStr.localeCompare(bStr, "ar") * dir;
    });
  }, [data, sortState.column, sortState.direction]);

  return { sortedData, sortState, handleSort };
}
