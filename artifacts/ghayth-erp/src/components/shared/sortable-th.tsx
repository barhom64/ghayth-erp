import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SortState } from "@/hooks/use-sorted-data";

interface SortableThProps {
  column: string;
  label: string;
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
}

export function SortableTh({ column, label, sortState, onSort, className = "" }: SortableThProps) {
  const isActive = sortState.column === column;
  return (
    <th className={`p-3 text-start font-medium ${className}`}>
      <button
        type="button"
        className="flex items-center justify-between gap-1 w-full cursor-pointer select-none hover:text-primary transition-colors text-start"
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="flex-shrink-0">
          {isActive && sortState.direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          ) : isActive && sortState.direction === "desc" ? (
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-300" />
          )}
        </span>
      </button>
    </th>
  );
}
