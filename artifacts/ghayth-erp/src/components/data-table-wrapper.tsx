import { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, RefreshCw, Inbox } from "lucide-react";

interface DataTableWrapperProps {
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  data: any[] | undefined | null;
  colCount: number;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  emptyAction?: { label: string; onClick: () => void };
  children: ReactNode;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  /**
   * عدد صفوف الهيكل العظمي أثناء التحميل. الافتراض ٥ (السلوك القديم). يمرّر
   * DataTable حجم الصفحة الفعلي هنا فيحجز التحميل ارتفاع صفحة بيانات كاملة،
   * فلا «تطلع وتنزل» الصفحة عند وصول البيانات (شكوى «الجداول طالعة نازلة»).
   */
  skeletonRows?: number;
}

/**
 * Retry button for the error state. `useQueryClient` is reached ONLY here
 * (the error branch), so the loading / empty / data paths render without a
 * QueryClientProvider — letting pages that mount a DataTable bare in unit
 * tests work without wiring a provider, while production (always inside the
 * app-wide provider) is unchanged.
 */
function DefaultRetry({ onRetry }: { onRetry?: () => void }) {
  const qc = useQueryClient();
  const handleRetry = onRetry ?? (() => qc.invalidateQueries());
  return (
    <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
      <RefreshCw className="h-4 w-4" />
      إعادة المحاولة
    </Button>
  );
}

export function DataTableWrapper({
  isLoading,
  isError,
  error,
  onRetry,
  data,
  colCount,
  emptyMessage = "لا توجد بيانات",
  emptyIcon,
  emptyAction,
  children,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  skeletonRows = 5,
}: DataTableWrapperProps) {
  if (isLoading) {
    const rowCount = Math.max(1, Math.floor(skeletonRows) || 5);
    return (
      <TableBody>
        {[...Array(rowCount)].map((_, i) => (
          <TableRow key={i}>
            {[...Array(colCount)].map((_, j) => (
              <TableCell key={j}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    );
  }

  if (isError) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={colCount} className="h-40">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="p-3 rounded-full bg-rose-50">
                <RefreshCw className="h-6 w-6 text-rose-500" />
              </div>
              <div>
                <p className="font-medium text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {error?.message || "يرجى المحاولة مرة أخرى"}
                </p>
              </div>
              <DefaultRetry onRetry={onRetry} />
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  if (!data || data.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={colCount} className="h-40">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="p-3 rounded-full bg-slate-100">
                {emptyIcon || <Inbox className="h-6 w-6 text-slate-400" />}
              </div>
              <p className="text-muted-foreground">{emptyMessage}</p>
              {emptyAction && (
                <Button variant="default" size="sm" onClick={emptyAction.onClick} className="mt-2 gap-2">
                  {emptyAction.label}
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <>
      <TableBody>{children}</TableBody>
    </>
  );
}

interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Row-count options. When provided together with onPageSizeChange, a
   *  "عدد الصفوف" selector is shown. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationBarProps) {
  const totalPages = Math.ceil(total / pageSize);
  const showSizeSelector =
    !!onPageSizeChange &&
    !!pageSizeOptions &&
    pageSizeOptions.length > 0 &&
    total > Math.min(...pageSizeOptions);
  // Hide the bar entirely only when there is neither pagination nor a size
  // selector to show (preserves the prior "single page → no bar" behaviour
  // for every existing caller that passes no size options).
  if (totalPages <= 1 && !showSizeSelector) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-t sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          عرض {from} - {to} من {total}
        </p>
        {showSizeSelector && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">عدد الصفوف</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange!(Number(v))}>
              <SelectTrigger className="h-8 w-[78px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions!.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="gap-1"
          >
            <ChevronRight className="h-4 w-4" />
            السابق
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="gap-1"
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
