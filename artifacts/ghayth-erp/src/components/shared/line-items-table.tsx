import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LineItemsTable — shared primitive for finance create/edit pages that render
 * a dynamic list of line-item rows with input cells.
 *
 * GAP_MATRIX P1 — `<FormShell>` without `<LineItemsTable>` forces 9 finance
 * create pages to hand-roll identical raw <table> + add/remove logic. This
 * component extracts that pattern into a single reusable primitive.
 *
 * Usage:
 *   type JournalLine = { accountCode: string; debit: number; credit: number };
 *   const [lines, setLines] = useState<JournalLine[]>([emptyLine()]);
 *
 *   <LineItemsTable<JournalLine>
 *     items={lines}
 *     minItems={2}
 *     onAdd={() => setLines([...lines, emptyLine()])}
 *     onRemove={(i) => setLines(lines.filter((_, idx) => idx !== i))}
 *     columns={[
 *       { header: "الحساب", render: (item, i) => <Input ...> },
 *       { header: "مدين",   render: (item, i) => <NumberField ...> },
 *       { header: "دائن",   render: (item, i) => <NumberField ...> },
 *     ]}
 *     renderTotals={() => (
 *       <tr><td>الإجمالي</td><td>{total}</td></tr>
 *     )}
 *     addLabel="إضافة سطر"
 *   />
 */

export interface LineItemsColumn<T> {
  /** Arabic column header label. */
  header: string;
  /** Width hint (CSS, e.g. "120px"). */
  width?: string;
  /** Render the cell for the given item and row index. */
  render: (item: T, index: number) => ReactNode;
  /** Extra className for the <th> / <td>. */
  className?: string;
}

export interface LineItemsTableProps<T> {
  /** The current list of line items. */
  items: T[];
  /** Column definitions. */
  columns: LineItemsColumn<T>[];
  /** Called when the user clicks "add row". */
  onAdd: () => void;
  /**
   * Called when the user removes row at index `i`.
   * Receives the row index. The caller is responsible for updating `items`.
   */
  onRemove: (index: number) => void;
  /**
   * Minimum number of items; remove button is hidden when `items.length <= minItems`.
   * Defaults to 1.
   */
  minItems?: number;
  /** Label for the add-row button. Default: "إضافة سطر". */
  addLabel?: string;
  /**
   * Optional totals row(s) rendered as the last `<tr>` inside `<tbody>`.
   * Return one or more `<tr>` elements.
   */
  renderTotals?: () => ReactNode;
  /** Extra content rendered below the table (e.g. balance indicator). */
  footer?: ReactNode;
  className?: string;
}

export function LineItemsTable<T>({
  items,
  columns,
  onAdd,
  onRemove,
  minItems = 1,
  addLabel = "إضافة سطر",
  renderTotals,
  footer,
  className,
}: LineItemsTableProps<T>) {
  return (
    <div className={cn("space-y-2", className)} dir="rtl">
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={cn("px-3 py-2 text-right font-medium", col.className)}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
              {/* remove-button column */}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIndex) => (
              <tr key={rowIndex} className="border-t">
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className={cn("px-2 py-1", col.className)}>
                    {col.render(item, rowIndex)}
                  </td>
                ))}
                <td className="px-2 py-1 text-center">
                  {items.length > minItems && (
                    <button
                      type="button"
                      onClick={() => onRemove(rowIndex)}
                      className="text-muted-foreground hover:text-status-error-foreground transition-colors"
                      aria-label="حذف السطر"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {renderTotals?.()}
          </tbody>
        </table>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>

      {footer}
    </div>
  );
}
