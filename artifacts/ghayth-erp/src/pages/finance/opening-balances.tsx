import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Plus, FilePlus, BookOpen, Scale } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { POSTING_STATUS_LABELS } from "@/lib/finance/status-model";
import { useAppContext } from "@/contexts/app-context";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface OpeningBalance {
  id: number;
  ref: string;
  description: string;
  createdAt: string;
  status?: string;
  postingStatus?: string;
  totalDebit: number;
  totalCredit: number;
  lines: Array<{ accountCode: string; accountName?: string; debit: number; credit: number }>;
}

export default function OpeningBalancesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["opening-balances", scopeQueryString],
    `/finance/opening-balances${scopeSuffix}`
  );
  const items: OpeningBalance[] = (data?.data || []).map((r: any) => ({
    ...r,
    totalDebit: Number(r.totalDebit || 0),
    totalCredit: Number(r.totalCredit || 0),
  }));
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const totalBalanced = items.filter(
    (i) => Math.abs(Number(i.totalDebit) - Number(i.totalCredit)) < 0.01
  ).length;

  const columns: DataTableColumn<OpeningBalance>[] = [
    {
      key: "ref",
      header: "المرجع",
      searchable: true,
      sortable: true,
      render: (r) => <span className="font-mono text-status-info-foreground text-sm">{r.ref}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      searchable: true,
      render: (r) => <span>{r.description || "-"}</span>,
    },
    {
      key: "totalDebit",
      header: "إجمالي المدين",
      sortable: true,
      render: (r) => <span className="text-status-success-foreground font-medium">{formatCurrency(r.totalDebit)}</span>,
    },
    {
      key: "totalCredit",
      header: "إجمالي الدائن",
      sortable: true,
      render: (r) => <span className="text-status-error-foreground font-medium">{formatCurrency(r.totalCredit)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      // FIN-CORRECTION (A6): the balance badge is an INDEPENDENT computed signal
      // (DR=CR), kept as-is — it is not a posting state. Alongside it, surface
      // the truthful posting axis from the API (postingStatus, migration-311
      // trigger, #2118 slice 7) so a directly-posted opening balance
      // (status='draft' + balancesApplied=true) reads «مرحّل». The payment axis
      // is N/A for opening balances, and documentStatus is not surfaced here
      // (this list is balance + posting focused) — see PR notes.
      render: (r) => {
        const balanced = Math.abs(Number(r.totalDebit) - Number(r.totalCredit)) < 0.01;
        return (
          <span className="inline-flex items-center gap-1">
            <Badge className={balanced ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}>
              {balanced ? "متوازن" : "غير متوازن"}
            </Badge>
            {r.postingStatus && (
              <span className={`text-[10px] ${r.postingStatus === "posted" ? "text-status-success-foreground" : "text-muted-foreground"}`}>
                {POSTING_STATUS_LABELS[r.postingStatus as keyof typeof POSTING_STATUS_LABELS]}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.createdAt ? formatDateAr(r.createdAt) : "-"}</span>
      ),
    },
  ];

  return (
    <PageShell
      title="الأرصدة الافتتاحية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الأرصدة الافتتاحية" }]}
      loading={isLoading}
      actions={
        <>
          <Link href="/finance/trial-balance-drilldown">
            <Button variant="outline" size="sm">
              <Scale className="h-4 w-4 me-2" />ميزان المراجعة
            </Button>
          </Link>
          <Link href="/finance/accounts">
            <Button variant="outline" size="sm">
              <BookOpen className="h-4 w-4 me-2" />دليل الحسابات
            </Button>
          </Link>
          <Link href="/finance/opening-balances/create">
            <GuardedButton perm="finance:create" size="sm">
              <Plus className="h-4 w-4 me-1" />
              قيد أرصدة افتتاحية جديد
            </GuardedButton>
          </Link>
          <PrintButton
            entityType="report_finance_opening_balances"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "الأرصدة الافتتاحية", total: printRows.length },
              items: printRows.map((r) => ({
                "المرجع": r.ref,
                "الوصف": r.description || "—",
                "إجمالي المدين": Number(r.totalDebit || 0),
                "إجمالي الدائن": Number(r.totalCredit || 0),
                "متوازن": Math.abs(Number(r.totalDebit) - Number(r.totalCredit)) < 0.01 ? "نعم" : "لا",
                "التاريخ": r.createdAt || "—",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <FilePlus className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي القيود</p>
              <p className="text-xl font-bold">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">متوازن</p>
            <p className="text-xl font-bold text-status-success-foreground">{totalBalanced}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">غير متوازن</p>
            <p className="text-xl font-bold text-status-error-foreground">{items.length - totalBalanced}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد قيود أرصدة افتتاحية"
        emptyIcon={<FilePlus className="h-10 w-10 mx-auto opacity-30" />}
        searchPlaceholder="بحث بالمرجع أو الوصف..."
      />
    </PageShell>
  );
}
