import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { Download, AlertTriangle, Clock, Building2 } from "lucide-react";
import { formatCurrency, formatDateAr , todayLocal } from "@/lib/formatters";
import { PageShell } from "@workspace/ui-core";

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(data: any[], filename: string) {
  const headers = ["المورد", "حالي", "1-30 يوم", "31-60 يوم", "61-90 يوم", "أكثر من 90", "الإجمالي"];
  const rows = data.map((s: any) => [
    csvEscape(s.supplierName ?? ""), s.current.toFixed(2), s["1_30"].toFixed(2),
    s["31_60"].toFixed(2), s["61_90"].toFixed(2), s.over90.toFixed(2), s.total.toFixed(2),
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

export default function ApAgingPage() {
  const [asOfDate, setAsOfDate] = useState(todayLocal());
  const [expanded, setExpanded] = useState<string | number | null>(null);

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["ap-aging", asOfDate],
    `/finance/ap-aging?asOfDate=${asOfDate}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const suppliers = (data?.suppliers || []) as any[];
  const summary = data?.summary || {};

  const columns: DataTableColumn<any>[] = [
    {
      key: "supplierName",
      header: "المورد",
      sortable: true,
      searchable: true,
      render: (s) => (
        <div>
          <p className="font-semibold text-sm">{s.supplierName}</p>
          <p className="text-xs text-muted-foreground">{s.orders?.length ?? 0} أمر شراء</p>
        </div>
      ),
    },
    { key: "current", header: "حالي", sortable: true, render: (s) => s.current > 0 ? <Badge className="bg-status-success-surface text-status-success-foreground">{formatCurrency(s.current)}</Badge> : "—" },
    { key: "1_30", header: "1-30 يوم", sortable: true, render: (s) => s["1_30"] > 0 ? <Badge className="bg-status-warning-surface text-status-warning-foreground">{formatCurrency(s["1_30"])}</Badge> : "—" },
    { key: "31_60", header: "31-60 يوم", sortable: true, render: (s) => s["31_60"] > 0 ? <Badge className="bg-orange-100 text-orange-700">{formatCurrency(s["31_60"])}</Badge> : "—" },
    { key: "61_90", header: "61-90 يوم", sortable: true, render: (s) => s["61_90"] > 0 ? <Badge className="bg-status-error-surface text-status-error-foreground">{formatCurrency(s["61_90"])}</Badge> : "—" },
    { key: "over90", header: "+90 يوم", sortable: true, render: (s) => s.over90 > 0 ? <Badge className="bg-red-200 text-status-error-foreground">{formatCurrency(s.over90)}</Badge> : "—" },
    { key: "total", header: "الإجمالي", sortable: true, className: "font-bold text-status-info-foreground", render: (s) => formatCurrency(s.total) },
  ];

  return (
    <PageShell
      title="تقرير تقادم الذمم الدائنة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تقرير تقادم الذمم الدائنة" }]}
      loading={isLoading}
      actions={
        <>
          <DatePicker value={asOfDate} onChange={setAsOfDate} className="w-44" placeholder="تاريخ التقرير" />
          <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(suppliers, `ap-aging-${asOfDate}.csv`)}>
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
      <Card className="bg-status-info-surface border-status-info-surface">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-status-info-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">إجمالي الذمم الدائنة المستحقة</p>
            <p className="text-2xl font-bold text-status-info-foreground">{formatCurrency(Number(summary.grandTotal ?? 0))}</p>
          </div>
          <div className="ms-auto text-end">
            <p className="text-xs text-muted-foreground">عدد الموردين</p>
            <p className="text-xl font-bold text-status-neutral-foreground">{suppliers.length}</p>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={suppliers}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث باسم المورد..."
        emptyMessage="لا توجد ذمم دائنة مستحقة"
        emptyIcon={<Building2 className="h-10 w-10 opacity-30" />}
        rowKey={(s) => s.supplierId ?? s.supplierName}
        rowClassName={(s) => (s["31_60"] > 0 || s["61_90"] > 0 || s.over90 > 0) ? "border-r-2 border-red-400" : undefined}
        onRowClick={(s) => {
          const sid = s.supplierId ?? s.supplierName;
          setExpanded(expanded === sid ? null : sid);
        }}
        renderRowExtras={(s) => {
          const sid = s.supplierId ?? s.supplierName;
          if (expanded !== sid || !s.orders?.length) return null;
          return (
            <div className="border-t bg-surface-subtle/30 p-3">
              <DataTable
                noToolbar
                pageSize={0}
                data={s.orders}
                rowKey={(po) => po.id}
                emptyMessage="لا توجد أوامر"
                columns={[
                  { key: "ref", header: "المرجع", className: "font-mono text-status-info-foreground text-xs", render: (po: any) => po.ref },
                  { key: "dueDate", header: "تاريخ الاستحقاق", className: "text-xs text-muted-foreground", render: (po: any) => po.dueDate ? formatDateAr(po.dueDate) : "-" },
                  { key: "outstanding", header: "المستحق", className: "font-semibold", render: (po: any) => formatCurrency(po.outstanding) },
                  {
                    key: "bucket",
                    header: "الفترة",
                    render: (po: any) => {
                      const b = BUCKETS.find(x => x.key === po.bucket);
                      return <Badge className={b?.color ?? ""}>{b?.label ?? po.bucket}</Badge>;
                    },
                  },
                ]}
              />
            </div>
          );
        }}
      />
    </PageShell>
  );
}
