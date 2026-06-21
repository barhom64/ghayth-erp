import { useMemo } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { BarChart3 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

const VARIANT: Record<string, any> = { A: "default", B: "secondary", C: "outline" };

export default function AbcClassificationPage() {
  const [filters, setFilters] = useFilters();
  const { data } = useApiQuery<any>(["abc"], `/warehouse/abc-classification`);
  const rows = asList(data?.data || data);
  const filtered = applyFilters(rows, filters, {
    searchFields: ["productName"],
    extraFields: { category: "category" },
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns = useMemo<any[]>(() => [
    { key: "productName", header: "المنتج", cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "category", header: "التصنيف", cell: (r: any) => <Badge variant={VARIANT[r.category]}>{r.category}</Badge> },
    { key: "paretoValue", header: "القيمة (ر.س)", cell: (r: any) => formatNumber(Number(r.paretoValue ?? 0)) },
    { key: "paretoShare", header: "النسبة", cell: (r: any) => formatNumber(Number(r.paretoShare ?? 0) * 100) + "%" },
    { key: "period", header: "الفترة", cell: (r: any) => r.period },
  ], []);

  return (
    <PageShell title="تصنيف ABC للمنتجات"
      actions={
        <PrintButton
          entityType="report_warehouse_abc"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "تصنيف ABC للمنتجات", total: printRows.length },
            items: printRows.map((r: any) => ({
              "المنتج": r.productName ?? `#${r.productId}`,
              "التصنيف": r.category,
              "القيمة (ر.س)": Number(r.paretoValue ?? 0),
              "النسبة": `${formatNumber(Number(r.paretoShare ?? 0) * 100)}%`,
              "الفترة": r.period,
            })),
          })}
        />
      }
    >
      <WarehouseTabsNav />
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث باسم المنتج...",
          extraFilters: [{ key: "category", label: "التصنيف", options: [
            { value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" },
          ] }],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />
      <Card><CardContent className="pt-6">
        <DataTable data={filtered} columns={columns} onSortedDataChange={setPrintRows} emptyMessage="لا يوجد تصنيف ABC بعد — انتظر تشغيل الـ cron الشهري" noToolbar />
      </CardContent></Card>
    </PageShell>
  );
}
