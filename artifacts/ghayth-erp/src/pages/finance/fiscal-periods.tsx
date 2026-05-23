import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle, Lock, Unlock } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
  PageStatusBadge,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";

/**
 * Fiscal periods list — migrated in R.2 iter 2 to the unified template
 * stack (PageShell + PageStatusBadge). The underlying data source is
 * unchanged (the v1 `/finance/fiscal-periods` endpoint that returns
 * stats per month), but the visual layer is now consistent with
 * `pages/finance/dashboard.tsx` and every other page that adopts the
 * templates in later iterations.
 *
 * Before: raw <h1>, local STATUS_CONFIG map with three statuses
 * (active/closed/future), inline Card tiles, no breadcrumbs.
 * After: PageShell shell, PageStatusBadge drives the status chip from
 * the canonical shared map (open/closed/future all added to STATUS_MAP
 * in the same R.2 commit as this file), and the KPI tiles use the
 * same Card pattern as the dashboard.
 */

interface FiscalPeriodV1Row {
  period: string;
  name: string;
  entries: number;
  totalAmount: number | string;
  status: "active" | "closed" | "future";
}

interface FiscalPeriodV2Row {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  notes: string | null;
  closedByName: string | null;
}

export default function FiscalPeriodsPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ data: FiscalPeriodV1Row[] }>(
    ["fiscal-periods"],
    "/finance/fiscal-periods",
  );
  // FIN-014 — the v1 endpoint above produces stats (entries, totals,
  // active/closed/future status), but doesn't expose an id usable for
  // close. v2 owns the canonical close/reopen workflow keyed by `id`.
  // We join on YYYY-MM so each v1 row can render close/reopen buttons
  // against the matching v2 record.
  const { data: v2Data, refetch: refetchV2 } = useApiQuery<{ data: FiscalPeriodV2Row[] }>(
    ["fiscal-periods-v2"],
    "/finance/fiscal-periods-v2",
  );
  const v2List = asList<FiscalPeriodV2Row>(v2Data?.data || v2Data);
  const v2ByPeriod = new Map<string, FiscalPeriodV2Row>();
  for (const r of v2List) {
    if (r.startDate) v2ByPeriod.set(r.startDate.slice(0, 7), r);
  }
  const items: FiscalPeriodV1Row[] = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [confirming, setConfirming] = useState<{ id: number; action: "close" | "reopen" } | null>(null);

  const closeMut = useApiMutation<unknown, { id: number; notes?: string }>(
    (body) => `/finance/fiscal-periods-v2/${body.id}/close`,
    "POST",
    [["fiscal-periods"], ["fiscal-periods-v2"]],
    {
      successMessage: "تم إقفال الفترة",
      onSuccess: () => { setConfirming(null); refetch(); refetchV2(); },
    },
  );
  const reopenMut = useApiMutation<unknown, { id: number; reason?: string }>(
    (body) => `/finance/fiscal-periods-v2/${body.id}/reopen`,
    "POST",
    [["fiscal-periods"], ["fiscal-periods-v2"]],
    {
      successMessage: "تم إعادة فتح الفترة",
      onSuccess: () => { setConfirming(null); refetch(); refetchV2(); },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items as unknown as Record<string, unknown>[], filters, {
    searchFields: ["name", "period"],
    statusField: "status",
  }) as unknown as FiscalPeriodV1Row[];

  const activeCount = items.filter((p) => p.status === "active").length;
  const closedCount = items.filter((p) => p.status === "closed").length;

  const columns: DataTableColumn<FiscalPeriodV1Row>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      className: "font-mono text-status-info-foreground",
      render: (p) => p.period,
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      className: "font-medium",
      render: (p) => p.name,
    },
    {
      key: "entries",
      header: "عدد القيود",
      sortable: true,
      render: (p) => p.entries,
    },
    {
      key: "totalAmount",
      header: "إجمالي الحركات",
      sortable: true,
      className: "font-semibold",
      render: (p) => formatCurrency(Number(p.totalAmount || 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status} domain="shared" />,
    },
    {
      key: "actions",
      header: "إجراء",
      render: (p) => {
        const v2 = v2ByPeriod.get(p.period);
        if (!v2) return <span className="text-xs text-muted-foreground">—</span>;
        const isConfirming = confirming?.id === v2.id;
        if (isConfirming) {
          const mut = confirming.action === "close" ? closeMut : reopenMut;
          return (
            <div className="inline-flex items-center gap-1">
              <Button size="sm" variant={confirming.action === "close" ? "destructive" : "default"} className="h-7 px-2 text-[11px]" disabled={mut.isPending} onClick={() => mut.mutate({ id: v2.id })}>
                {mut.isPending ? "..." : "تأكيد"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setConfirming(null)}>إلغاء</Button>
            </div>
          );
        }
        if (v2.status === "open") {
          return (
            <GuardedButton perm="finance.hardening:create" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setConfirming({ id: v2.id, action: "close" })}>
              <Lock className="h-3 w-3 ml-1" /> إقفال
            </GuardedButton>
          );
        }
        return (
          <GuardedButton perm="finance.hardening:create" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setConfirming({ id: v2.id, action: "reopen" })}>
            <Unlock className="h-3 w-3 ml-1" /> إعادة فتح
          </GuardedButton>
        );
      },
    },
  ];

  return (
    <PageShell
      title="الفترات المالية"
      subtitle="الفترات الشهرية وعدد القيود وإجمالي الحركات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الفترات المالية" }]}
      loading={isLoading}
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-status-info-surface rounded-lg">
              <Calendar className="h-5 w-5 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الفترات</p>
              <p className="text-xl font-bold">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">نشطة</p>
              <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Lock className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مُغلقة</p>
              <p className="text-xl font-bold text-slate-600">{closedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الفترة...",
          statuses: [
            { value: "active", label: "نشطة" },
            { value: "closed", label: "مُغلقة" },
            { value: "future", label: "مستقبلية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={refetch}
        noToolbar
        rowKey={(p) => p.period}
        rowClassName={(p) => (p.status === "active" ? "bg-emerald-50/40" : undefined)}
        emptyMessage="لا توجد فترات"
        emptyIcon={<Calendar className="h-10 w-10 opacity-30" />}
        pageSize={20}
      />
    </PageShell>
  );
}
