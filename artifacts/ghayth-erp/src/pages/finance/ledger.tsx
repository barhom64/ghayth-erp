import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ACCOUNT_TYPES } from "@/lib/finance-type-maps";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, BookOpen, Download, Scale, FileCheck2 } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
const typeMap = ACCOUNT_TYPES;

// GAP_MATRIX item #7 — routed through unified export helper so the
// download appears in /reports/print-log with entity=report_ledger.
async function exportCSV(rows: any[], headers: string[], title: string) {
  if (!rows.length) return;
  const HEADER_LABELS: Record<string, string> = {
    date: "التاريخ",
    ref: "المرجع",
    description: "الوصف",
    debit: "مدين",
    credit: "دائن",
    runningBalance: "الرصيد الجاري",
  };
  await exportRowsToCsv({
    entityType: "report_ledger",
    title,
    rows,
    columns: headers.map((h) => ({ key: h, label: HEADER_LABELS[h] ?? h })),
  });
}

export default function LedgerPage() {
  const [, params] = useRoute("/finance/ledger/:code");
  const code = params?.code;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const dateParams = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&");

  const { data, isLoading, isError } = useApiQuery<any>(
    ["ledger", code || "", dateParams],
    `/finance/ledger/${code}${dateParams ? `?${dateParams}` : ""}`,
    !!code
  );

  const account = data?.account;
  const entries = data?.entries || [];
  const summary = data?.summary || {};
  const balance = summary?.balance || 0;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title={`دفتر أستاذ — ${account?.name || code}`}
      subtitle={code}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "دليل الحسابات" },
        { label: `دفتر أستاذ — ${account?.name || code}` },
      ]}
      loading={isLoading}
      actions={
        <>
          <Button asChild variant="ghost" size="icon" title="الانتقال"><Link href="/finance/accounts"><ArrowRight className="h-5 w-5" /></Link></Button>
          {account && <Badge variant="outline">{typeMap[account.type] || account.type}</Badge>}
          <DatePicker value={startDate} onChange={setStartDate} className="w-40" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-40" placeholder="إلى" />
          <Button asChild variant="outline" size="sm"><Link href={`/finance/trial-balance-drilldown?accountCode=${code}`}>
              <Scale className="h-3.5 w-3.5 me-1" />ميزان المراجعة
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/finance/account-recon-workpaper?accountCode=${code}`}>
              <FileCheck2 className="h-3.5 w-3.5 me-1" />ورقة تسوية
            </Link></Button>
          <PrintButton
            entityType="report_general_ledger"
            entityId={`${code}:${startDate ?? ""}..${endDate ?? ""}`}
           
          />
          <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => { void exportCSV(entries, ["date", "ref", "description", "debit", "credit", "runningBalance"], `سجل الحساب — ${code}`); }}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
          </GuardedButton>
        </>
      }
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">عدد القيود</p>
          <p className="text-2xl font-bold">{entries.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي المدين</p>
          <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
          <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</p>
        </CardContent></Card>
        <Card className={Number(balance) >= 0 ? "bg-status-success-surface" : "bg-status-error-surface"}><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
          <p className="text-2xl font-bold" style={{ color: Number(balance) >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(Number(balance))}
          </p>
        </CardContent></Card>
      </div>

      <DataTable
        columns={[
          {
            key: "date",
            header: "التاريخ",
            sortable: true,
            className: "text-muted-foreground text-sm",
            render: (e) => (e.date ? formatDateAr(e.date) : "-"),
          },
          {
            key: "ref",
            header: "المرجع",
            sortable: true,
            searchable: true,
            className: "font-mono text-status-info-foreground text-sm",
            render: (e) => e.ref || "-",
          },
          {
            key: "description",
            header: "الوصف",
            sortable: true,
            searchable: true,
            className: "font-medium",
            render: (e) => e.description || "-",
          },
          {
            key: "debit",
            header: "مدين",
            sortable: true,
            className: "text-status-success-foreground",
            render: (e) => (Number(e.debit || 0) > 0 ? formatCurrency(Number(e.debit)) : "-"),
          },
          {
            key: "credit",
            header: "دائن",
            sortable: true,
            className: "text-status-error-foreground",
            render: (e) => (Number(e.credit || 0) > 0 ? formatCurrency(Number(e.credit)) : "-"),
          },
          {
            key: "runningBalance",
            header: "الرصيد التراكمي",
            sortable: true,
            className: "font-bold",
            render: (e) => (
              <span style={{ color: Number(e.runningBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
                {formatCurrency(Number(e.runningBalance))}
              </span>
            ),
          },
        ] as DataTableColumn<any>[]}
        data={entries}
        rowKey={(e, i) => e.id || i}
        rowClassName={() => "hover:bg-surface-subtle"}
        pageSize={20}
        emptyMessage="لا توجد حركات"
        emptyIcon={<BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />}
        searchPlaceholder="بحث في القيود..."
      />

      {entries.length > 0 && (
        <div className="rounded-lg border bg-surface-subtle font-bold p-3 grid grid-cols-6 gap-2">
          <div className="col-span-3">المجموع</div>
          <div className="text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</div>
          <div className="text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</div>
          <div style={{ color: Number(balance) >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(Number(balance))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
