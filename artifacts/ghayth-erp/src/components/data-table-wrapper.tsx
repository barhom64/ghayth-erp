import { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
}: DataTableWrapperProps) {
  const qc = useQueryClient();
  const handleRetry = onRetry ?? (() => qc.invalidateQueries());

  if (isLoading) {
    return (
      <TableBody>
        {[...Array(5)].map((_, i) => (
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
              <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
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
}

export function PaginationBar({ page, pageSize, total, onPageChange }: PaginationBarProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <p className="text-sm text-muted-foreground">
        عرض {from} - {to} من {total}
      </p>
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
    </div>
  );
}
