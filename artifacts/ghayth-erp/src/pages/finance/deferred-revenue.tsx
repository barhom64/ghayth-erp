import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Play, ScrollText, TrendingUp } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * الإيراد المؤجل (FIN-TIME-SPREADING #2247).
 *
 * Surfaces the deferred-revenue engine (routes/finance-deferred-revenue.ts +
 * deferredRevenueEngine.ts) that previously had no UI even though
 * periodCloseCoordinator requires «POST /finance/deferred-revenue/run» before a
 * period can close. Mirror of the prepaid-amortization page.
 *
 *   GET  /finance/deferred-revenue/schedules  → { data: DeferredRevenueSchedule[] }
 *   POST /finance/deferred-revenue/run        → { data: { posted, schedulesProcessed } }
 */

const STATUS_LABEL: Record<string, string> = {
  active:    "نشط",
  completed: "مكتمل",
  cancelled: "ملغى",
};

interface DeferredRevenueSchedule {
  id: number;
  sourceType?: string;
  deferredRevenueAccountCode: string;
  revenueAccountPurpose: string;
  totalAmount: number;
  monthlyAmount: number;
  recognizedAmount: number;
  remainingAmount: number;
  months: number;
  startDate: string;
  endDate: string;
  status: string;
  currency?: string;
  createdAt: string;
}

export default function DeferredRevenuePage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["deferred-revenue-schedules", scopeQueryString],
    `/finance/deferred-revenue/schedules${scopeSuffix}`,
  );
  const items: DeferredRevenueSchedule[] = (data?.data || []) as DeferredRevenueSchedule[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  // POST /finance/deferred-revenue/run — empty body recognises every DUE month
  // across all schedules; { scheduleId } limits it to one.
  const runMut = useApiMutation<void, { scheduleId?: number }>(
    () => "/finance/deferred-revenue/run",
    "POST",
    [["deferred-revenue-schedules"]],
    { successMessage: "تم تحقّق أشهر الإيراد المؤجل المستحقة" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const totalRecognized = items.reduce((s, r) => s + Number(r.recognizedAmount ?? 0), 0);
  const totalValue = items.reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);
  const activeCount = items.filter((r) => r.status === "active").length;

  const columns: DataTableColumn<DeferredRevenueSchedule>[] = [
    {
      key: "deferredRevenueAccountCode",
      header: "حساب الإيراد المؤجل",
      searchable: true,
      sortable: true,
      render: (r) => <span className="font-medium tabular-nums">{r.deferredRevenueAccountCode}</span>,
    },
    {
      key: "revenueAccountPurpose",
      header: "وجهة الإيراد",
      searchable: true,
      render: (r) => <span className="text-sm text-muted-foreground">{r.revenueAccountPurpose}</span>,
    },
    {
      key: "totalAmount",
      header: "الإجمالي",
      sortable: true,
      render: (r) => <span className="tabular-nums">{formatCurrency(Number(r.totalAmount ?? 0))}</span>,
    },
    {
      key: "monthlyAmount",
      header: "القسط الشهري",
      render: (r) => <span className="tabular-nums">{formatCurrency(Number(r.monthlyAmount ?? 0))}</span>,
    },
    {
      key: "recognizedAmount",
      header: "المُحقَّق",
      sortable: true,
      render: (r) => {
        const total = Number(r.totalAmount ?? 0);
        const rec = Number(r.recognizedAmount ?? 0);
        const pct = total > 0 ? Math.round((rec / total) * 100) : 0;
        return (
          <span className="text-sm tabular-nums">
            {formatCurrency(rec)} <span className="text-xs text-muted-foreground">({pct}%)</span>
          </span>
        );
      },
    },
    {
      key: "remainingAmount",
      header: "المتبقّي",
      render: (r) => <span className="tabular-nums text-muted-foreground">{formatCurrency(Number(r.remainingAmount ?? 0))}</span>,
    },
    {
      key: "period",
      header: "المدة",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.months} شهر · {r.startDate ? formatDateAr(r.startDate) : "—"} → {r.endDate ? formatDateAr(r.endDate) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={r.status === "active" ? "default" : "outline"}>
          {STATUS_LABEL[r.status] || r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton
            perm="finance:approve"
            variant="ghost"
            size="icon"
            title="تحقّق المستحق لهذا الجدول"
            disabled={runMut.isPending || r.status !== "active"}
            onClick={() => runMut.mutate({ scheduleId: r.id })}
          >
            <Play className="h-4 w-4 text-status-warning-foreground" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الإيراد المؤجل"
      subtitle="جداول تحقّق الإيراد المؤجل (إيجارات/عمرة/خدمات مقدمة) على مدى الاستحقاق، وترحيل الأشهر المستحقة قبل الإقفال"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الإيراد المؤجل" }]}
      loading={isLoading}
      actions={
        <>
          <PrintButton
            entityType="report_finance_deferred_revenue"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "الإيراد المؤجل", total: printRows.length },
              items: printRows.map((r: any) => Object.fromEntries(
                columns.filter((c: any) => c.header && !/_?select|action|إجراء/i.test(String(c.key)))
                  .map((c: any) => [c.header, r[c.key] ?? "—"]),
              )),
            })}
          />
          <Button asChild variant="outline" size="sm"><Link href="/finance/journal">
            <ScrollText className="h-4 w-4 me-2" />القيود اليومية
          </Link></Button>
          <GuardedButton
            perm="finance:approve"
            size="sm"
            disabled={runMut.isPending}
            onClick={() => runMut.mutate({})}
          >
            <Play className="h-4 w-4 me-1" />
            تحقّق الإيراد المستحق
          </GuardedButton>
        </>
      }
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الجداول</p>
              <p className="text-xl font-bold">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">النشطة</p>
            <p className="text-xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي القيمة</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">المُحقَّق</p>
            <p className="text-xl font-bold tabular-nums text-status-info-foreground">{formatCurrency(totalRecognized)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={items}
        onSortedDataChange={setPrintRows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد جداول إيراد مؤجل"
        emptyIcon={<CalendarClock className="h-10 w-10 mx-auto opacity-30" />}
        searchPlaceholder="بحث بالحساب أو وجهة الإيراد..."
      />
    </PageShell>
  );
}
