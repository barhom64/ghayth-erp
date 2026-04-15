import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarClock, Play, Pause, Zap, Trash2 } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

/**
 * Recurring journals list — migrated in R.4 iter 4 to the unified
 * template stack.
 *
 * Before: raw <h1>, three separate `useMutation` calls (patch/run/
 * delete) each with their own manual `useToast` + `useQueryClient`
 * bridging, and a native `confirm()` browser dialog for delete that
 * bypassed Phase C.7b's typed-error blockers entirely.
 *
 * After:
 *   • PageShell with title/subtitle/breadcrumbs/actions
 *   • Three `useApiMutation(pathFn)` hooks covering toggle/run/delete
 *     — typed CONFLICT / FORBIDDEN / VALIDATION errors now surface
 *     automatically through R.1.2's toast pipeline
 *   • ConfirmDeleteDialog replaces the native `confirm()`, with the
 *     /impact-preview call + meta.blockers surface that every other
 *     migrated delete flow uses
 *   • Active/inactive pill sourced from PageStatusBadge (shared.active
 *     / shared.inactive) instead of per-page tailwind constants
 *
 * No endpoint, payload, or frequency-label change.
 */

const FREQUENCY_LABEL: Record<string, string> = {
  daily:     "يومي",
  weekly:    "أسبوعي",
  monthly:   "شهري",
  quarterly: "ربع سنوي",
  yearly:    "سنوي",
};

interface RecurringJournal {
  id: number;
  name: string;
  description?: string;
  frequency: string;
  startDate: string;
  nextRunDate: string;
  lastRunDate?: string;
  active: boolean;
  runsCount: number;
  createdAt: string;
}

export default function RecurringJournalsPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["recurring-journals", scopeQueryString],
    `/finance/recurring-journals${scopeSuffix}`,
  );
  const items: RecurringJournal[] = (data?.data || []) as RecurringJournal[];

  // Toggle active flag — body-driven path so a single mutation hook
  // handles both enable and disable. The `active` flag is carried in
  // the body and read by the hook's pathFn.
  const patchMut = useApiMutation<void, { id: number; active: boolean }>(
    (body) => `/finance/recurring-journals/${body.id}`,
    "PATCH",
    [["recurring-journals"]],
    {
      successMessage: false, // toast is conditional on the new state
      onSuccess: () => {
        // Intentionally silent — the pill updates in place.
      },
    },
  );

  const runMut = useApiMutation<void, { id: number }>(
    (body) => `/finance/recurring-journals/${body.id}/run-now`,
    "POST",
    [["recurring-journals"]],
    { successMessage: "تم تنفيذ القيد الدوري" },
  );

  const columns: DataTableColumn<RecurringJournal>[] = [
    {
      key: "name",
      header: "الاسم",
      searchable: true,
      sortable: true,
      render: (r) => (
        <span className="font-medium text-blue-700 hover:underline">{r.name}</span>
      ),
    },
    {
      key: "frequency",
      header: "التكرار",
      sortable: true,
      render: (r) => <Badge variant="outline">{FREQUENCY_LABEL[r.frequency] || r.frequency}</Badge>,
    },
    {
      key: "nextRunDate",
      header: "التنفيذ القادم",
      sortable: true,
      render: (r) => (
        <span className="text-sm">{r.nextRunDate ? formatDateAr(r.nextRunDate) : "-"}</span>
      ),
    },
    {
      key: "lastRunDate",
      header: "آخر تنفيذ",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.lastRunDate ? formatDateAr(r.lastRunDate) : "—"}
        </span>
      ),
    },
    {
      key: "runsCount",
      header: "عدد التنفيذات",
      render: (r) => <span className="tabular-nums">{r.runsCount ?? 0}</span>,
    },
    {
      key: "active",
      header: "الحالة",
      render: (r) => <PageStatusBadge status={r.active ? "active" : "inactive"} />,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.createdAt ? formatDateAr(r.createdAt) : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            title="تنفيذ الآن"
            disabled={runMut.isPending}
            onClick={() => runMut.mutate({ id: r.id })}
          >
            <Zap className="h-4 w-4 text-amber-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={r.active ? "إيقاف" : "تشغيل"}
            disabled={patchMut.isPending}
            onClick={() => patchMut.mutate({ id: r.id, active: !r.active })}
          >
            {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="حذف"
            className="text-destructive"
            onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageShell
        title="القيود الدورية"
        subtitle="جدولة تنفيذ القيود الشهرية والسنوية وتشغيلها يدوياً عند الحاجة"
        breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "القيود الدورية" }]}
        loading={isLoading}
        actions={
          <Button size="sm" asChild>
            <Link href="/finance/recurring-journals/create">
              <Plus className="h-4 w-4 me-1" />
              قيد دوري جديد
            </Link>
          </Button>
        }
      >
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-100">
                <CalendarClock className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي القيود الدورية</p>
                <p className="text-xl font-bold">{items.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">نشطة</p>
              <p className="text-xl font-bold text-emerald-600">
                {items.filter((i) => i.active).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">متوقفة</p>
              <p className="text-xl font-bold text-muted-foreground">
                {items.filter((i) => !i.active).length}
              </p>
            </CardContent>
          </Card>
        </div>

        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد قيود دورية"
          emptyIcon={<CalendarClock className="h-10 w-10 mx-auto opacity-30" />}
          searchPlaceholder="بحث بالاسم..."
          onRowClick={(r) => setLocation(`/finance/recurring-journals/${r.id}`)}
        />
      </PageShell>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        entity={{
          type: "recurring_journal",
          id: deleteTarget?.id ?? 0,
          name: deleteTarget?.name ?? "",
        }}
        deletePath={
          deleteTarget ? `/finance/recurring-journals/${deleteTarget.id}` : ""
        }
        invalidateKeys={[["recurring-journals"]]}
        successMessage="تم حذف القيد الدوري"
        onDeleted={() => setDeleteTarget(null)}
      />
    </>
  );
}
