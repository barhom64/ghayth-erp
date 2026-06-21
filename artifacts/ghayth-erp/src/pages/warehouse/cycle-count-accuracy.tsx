import { useMemo } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

export default function CycleCountAccuracyPage() {
  const { data } = useApiQuery<any>(["cc-accuracy"], "/warehouse/reports/cycle-count-accuracy");
  const rows = asList(data?.data || data);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const columns = useMemo<any[]>(() => [
    { key: "warehouseName", header: "المخزن", cell: (r: any) => r.warehouseName ?? `#${r.warehouseId}` },
    { key: "totalCounts", header: "عمليات الجرد", cell: (r: any) => formatNumber(Number(r.totalCounts ?? 0)) },
    { key: "totalLines", header: "إجمالي الأسطر", cell: (r: any) => formatNumber(Number(r.totalLines ?? 0)) },
    { key: "matchedLines", header: "أسطر مطابقة", cell: (r: any) => formatNumber(Number(r.matchedLines ?? 0)) },
    { key: "accuracyPct", header: "نسبة الدقة", cell: (r: any) => {
      const p = r.accuracyPct == null ? null : Number(r.accuracyPct);
      if (p == null) return "—";
      const variant = p >= 95 ? "default" : p >= 85 ? "secondary" : "destructive";
      // as-any-reason: justified-jsx-generic - shadcn Badge variant prop expects a narrowed union literal that TS cannot infer from the ternary at this position; display only, behavior unchanged
      return <Badge variant={variant as any}>{formatNumber(p)}%</Badge>;
    } },
    { key: "totalGain", header: "زيادات (ر.س)", cell: (r: any) => formatNumber(Number(r.totalGain ?? 0)) },
    { key: "totalLoss", header: "نواقص (ر.س)", cell: (r: any) => formatNumber(Number(r.totalLoss ?? 0)) },
  ], []);

  return (
    <PageShell title="دقة الجرد الدوري"
      actions={
        <PrintButton
          entityType="report_warehouse_cc_accuracy"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "دقة الجرد الدوري", total: printRows.length },
            items: printRows.map((r: any) => ({
              "المخزن": r.warehouseName ?? `#${r.warehouseId}`,
              "إجمالي الأسطر": Number(r.totalLines ?? 0),
              "أسطر مطابقة": Number(r.matchedLines ?? 0),
              "نسبة الدقة": r.accuracyPct == null ? "—" : `${formatNumber(Number(r.accuracyPct))}%`,
              "زيادات (ر.س)": Number(r.totalGain ?? 0),
              "نواقص (ر.س)": Number(r.totalLoss ?? 0),
            })),
          })}
        />
      }
    >
      <WarehouseTabsNav />
      <Card><CardContent className="pt-6">
        <DataTable data={rows} columns={columns} onSortedDataChange={setPrintRows} emptyMessage="لا توجد بيانات اعتماد جرد" />
      </CardContent></Card>
    </PageShell>
  );
}
