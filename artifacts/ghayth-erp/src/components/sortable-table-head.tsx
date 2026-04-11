import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortState } from "@/hooks/use-sorted-data";

interface SortableTableHeadProps {
  column: string;
  label: string;
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
}

export function SortableTableHead({
  column,
  label,
  sortState,
  onSort,
  className,
}: SortableTableHeadProps) {
  const isActive = sortState.column === column;
  const ariaSortValue = isActive
    ? sortState.direction === "asc"
      ? "ascending" as const
      : "descending" as const
    : "none" as const;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSort(column);
    }
  };

  return (
    <TableHead
      aria-sort={ariaSortValue}
      className={cn("p-0", className)}
    >
      <button
        type="button"
        className="flex items-center justify-between gap-1 w-full h-full px-2 py-2 cursor-pointer select-none hover:bg-muted/50 transition-colors text-start font-medium text-muted-foreground"
        onClick={() => onSort(column)}
        onKeyDown={handleKeyDown}
        aria-label={`ترتيب حسب ${label}`}
      >
        <span>{label}</span>
        <span className="flex-shrink-0">
          {isActive && sortState.direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          ) : isActive && sortState.direction === "desc" ? (
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </span>
      </button>
    </TableHead>
  );
}
