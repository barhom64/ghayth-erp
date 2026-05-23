import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Download, AlertTriangle, Clock, Users } from "lucide-react";
import { formatCurrency, formatDateAr , todayLocal } from "@/lib/formatters";

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(data: any[], filename: string) {
  const headers = ["العميل", "حالي", "1-30 يوم", "31-60 يوم", "61-90 يوم", "أكثر من 90", "الإجمالي"];
  const rows = data.map((c: any) => [
    csvEscape(c.clientName ?? ""), c.current.toFixed(2), c["1_30"].toFixed(2),
    c["31_60"].toFixed(2), c["61_90"].toFixed(2), c.over90.toFixed(2), c.total.toFixed(2),
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

const BUCKETS = [
  { key: "current", label: "حالي", color: "bg-status-success-surface text-status-success-foreground" },
  { key: "1_30", label: "1-30 يوم", color: "bg-status-warning-surface text-status-warning-foreground" },
  { key: "31_60", label: "31-60 يوم", color: "bg-orange-100 text-orange-700" },
  { key: "61_90", label: "61-90 يوم", color: "bg-status-error-surface text-status-error-foreground" },
  { key: "over90", label: "+90 يوم", color: "bg-red-200 text-status-error-foreground" },
];

export default function ArAgingPage() {
  const [asOfDate, setAsOfDate] = useState(todayLocal());
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["ar-aging", asOfDate],
    `/finance/ar-aging?asOfDate=${asOfDate}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clients = (data?.clients || []) as any[];
  const summary = data?.summary || {};

  const columns: DataTableColumn<any>[] = [
    {
      key: "clientName",
      header: "العميل",
      sortable: true,
      searchable: true,
      render: (c) => (
        <div>
          <p className="font-semibold text-sm">{c.clientName}</p>
          <p className="text-xs text-muted-foreground">{c.invoices?.length ?? 0} فاتورة</p>
        </div>
      ),
    },
    { key: "current", header: "حالي", sortable: true, render: (c) => c.current > 0 ? <Badge className="bg-status-success-surface text-status-success-foreground">{formatCurrency(c.current)}</Badge> : "—" },
    { key: "1_30", header: "1-30 يوم", sortable: true, render: (c) => c["1_30"] > 0 ? <Badge className="bg-status-warning-surface text-status-warning-foreground">{formatCurrency(c["1_30"])}</Badge> : "—" },
    { key: "31_60", header: "31-60 يوم", sortable: true, render: (c) => c["31_60"] > 0 ? <Badge className="bg-orange-100 text-orange-700">{formatCurrency(c["31_60"])}</Badge> : "—" },
    { key: "61_90", header: "61-90 يوم", sortable: true, render: (c) => c["61_90"] > 0 ? <Badge className="bg-status-error-surface text-status-error-foreground">{formatCurrency(c["61_90"])}</Badge> : "—" },
    { key: "over90", header: "+90 يوم", sortable: true, render: (c) => c.over90 > 0 ? <Badge className="bg-red-200 text-status-error-foreground">{formatCurrency(c.over90)}</Badge> : "—" },
    { key: "total", header: "الإجمالي", sortable: true, className: "font-bold text-orange-600", render: (c) => formatCurrency(c.total) },
  ];

  return (
    <PageShell
      title="تقرير تقادم الذمم المدينة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تقرير تقادم الذمم المدينة" }]}
      loading={isLoading}
      actions={
        <>
          <DatePicker value={asOfDate} onChange={setAsOfDate} className="w-44" placeholder="تاريخ التقرير" />
          <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(clients, `ar-aging-${asOfDate}.csv`)}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
          </GuardedButton>
        </>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {BUCKETS.map(b => (
          <Card key={b.key}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
              <p className="text-lg font-bold">{formatCurrency(Number(summary[b.key] ?? 0))}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-orange-50 border-orange-200">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <div>
            <p className="text-sm text-muted-foreground">إجمالي الذمم المدينة المستحقة</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(Number(summary.grandTotal ?? 0))}</p>
          </div>
          <div className="ms-auto text-end">
            <p className="text-xs text-muted-foreground">عدد العملاء</p>
            <p className="text-xl font-bold text-status-neutral-foreground">{clients.length}</p>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={clients}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث باسم العميل..."
        emptyMessage="لا توجد ذمم مستحقة"
        emptyIcon={<Users className="h-10 w-10 opacity-30" />}
        rowKey={(c) => c.clientId}
        rowClassName={(c) => (c["31_60"] > 0 || c["61_90"] > 0 || c.over90 > 0) ? "border-r-2 border-red-400" : undefined}
        onRowClick={(c) => setExpanded(expanded === c.clientId ? null : c.clientId)}
        renderRowExtras={(c) => {
          if (expanded !== c.clientId || !c.invoices?.length) return null;
          return (
            <div className="border-t bg-surface-subtle/30 p-3">
              <DataTable
                noToolbar
                pageSize={0}
                data={c.invoices}
                rowKey={(inv) => inv.id}
                emptyMessage="لا توجد فواتير"
                columns={[
                  { key: "ref", header: "المرجع", className: "font-mono text-status-info-foreground text-xs", render: (inv: any) => inv.ref },
                  { key: "dueDate", header: "تاريخ الاستحقاق", className: "text-xs text-muted-foreground", render: (inv: any) => inv.dueDate ? formatDateAr(inv.dueDate) : "-" },
                  { key: "outstanding", header: "المستحق", className: "font-semibold", render: (inv: any) => formatCurrency(inv.outstanding) },
                  {
                    key: "bucket",
                    header: "الفترة",
                    render: (inv: any) => {
                      const b = BUCKETS.find(x => x.key === inv.bucket);
                      return <Badge className={b?.color ?? ""}>{b?.label ?? inv.bucket}</Badge>;
                    },
                  },
                ]}
              />
            </div>
          );
        }}
      />

      {clients.length > 0 && (
        <Card className="bg-surface-subtle">
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-4 text-sm font-bold">
              <div>المجموع</div>
              {BUCKETS.map(b => (
                <div key={b.key}>{formatCurrency(Number(summary[b.key] ?? 0))}</div>
              ))}
              <div className="text-orange-600">{formatCurrency(Number(summary.grandTotal ?? 0))}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
