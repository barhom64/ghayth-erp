import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Play, ScrollText, Layers } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * إطفاء المصروفات المدفوعة مقدماً (FIN-TIME-SPREADING #2247).
 *
 * Surfaces the prepaid-amortization engine that previously had no UI even
 * though periodCloseCoordinator requires «POST /finance/amortization/run»
 * before a period can close. Lists the schedules and exposes the due-run
 * action (all-due, or one schedule) — the two operations the close needs.
 *
 *   GET  /finance/amortization/schedules  → { data: AmortizationSchedule[] }
 *   POST /finance/amortization/run        → { data: { posted, schedulesProcessed } }
 */

const STATUS_LABEL: Record<string, string> = {
  active:    "نشط",
  completed: "مكتمل",
  cancelled: "ملغى",
};

interface AmortizationSchedule {
  id: number;
  sourceType?: string;
  prepaidAccountCode: string;
  expenseAccountPurpose: string;
  totalAmount: number;
  monthlyAmount: number;
  recognizedAmount: number;
  months: number;
  startDate: string;
  endDate: string;
  status: string;
  currency?: string;
  createdAt: string;
}

export default function AmortizationPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["amortization-schedules", scopeQueryString],
    `/finance/amortization/schedules${scopeSuffix}`,
  );
  const items: AmortizationSchedule[] = (data?.data || []) as AmortizationSchedule[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  // POST /finance/amortization/run — body-driven: an empty body posts every
  // DUE month across all schedules; { scheduleId } limits it to one.
  const runMut = useApiMutation<void, { scheduleId?: number }>(
    () => "/finance/amortization/run",
    "POST",
    [["amortization-schedules"]],
    { successMessage: "تم ترحيل أشهر الإطفاء المستحقة" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const totalRecognized = items.reduce((s, r) => s + Number(r.recognizedAmount ?? 0), 0);
  const totalValue = items.reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);
  const activeCount = items.filter((r) => r.status === "active").length;

  const columns: DataTableColumn<AmortizationSchedule>[] = [
    {
      key: "prepaidAccountCode",
      header: "الحساب المدفوع مقدماً",
      searchable: true,
      sortable: true,
      render: (r) => <span className="font-medium tabular-nums">{r.prepaidAccountCode}</span>,
    },
    {
      key: "expenseAccountPurpose",
      header: "وجهة المصروف",
      searchable: true,
      render: (r) => <span className="text-sm text-muted-foreground">{r.expenseAccountPurpose}</span>,
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
      header: "المُعترف به",
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
            title="ترحيل المستحق لهذا الجدول"
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
      title="إطفاء المصروفات المدفوعة مقدماً"
      subtitle="جداول توزيع الأصول المدفوعة مقدماً (تأمين/إيجار/اشتراك) على مصروف شهري، وترحيل الأشهر المستحقة قبل الإقفال"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الإطفاء" }]}
      loading={isLoading}
      actions={
        <>
          <PrintButton
            entityType="report_finance_amortization"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "إطفاء المصروفات المدفوعة مقدماً", total: printRows.length },
              items: printRows.map((r: any) => ({
                "الحساب المدفوع مقدماً": r.prepaidAccountCode,
                "وجهة المصروف": r.expenseAccountPurpose,
                "الإجمالي": formatCurrency(Number(r.totalAmount ?? 0)),
                "القسط الشهري": formatCurrency(Number(r.monthlyAmount ?? 0)),
                "المُعترف به": formatCurrency(Number(r.recognizedAmount ?? 0)),
                "الحالة": STATUS_LABEL[r.status] || r.status,
              })),
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
            ترحيل الإطفاء المستحق
          </GuardedButton>
        </>
      }
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-100">
              <Layers className="h-5 w-5 text-violet-600" />
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
            <p className="text-xs text-muted-foreground">المُعترف به</p>
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
        emptyMessage="لا توجد جداول إطفاء"
        emptyIcon={<CalendarClock className="h-10 w-10 mx-auto opacity-30" />}
        searchPlaceholder="بحث بالحساب أو وجهة المصروف..."
      />
    </PageShell>
  );
}
