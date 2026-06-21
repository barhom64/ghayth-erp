import { useMemo, useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@workspace/ui-core";
import { formatDateAr, formatNumber } from "@/lib/formatters";

function bucketOf(days: number): { label: string; variant: any } {
  if (days <= 30)  return { label: "0-30 يوم",   variant: "default" };
  if (days <= 60)  return { label: "31-60 يوم",  variant: "secondary" };
  if (days <= 90)  return { label: "61-90 يوم",  variant: "outline" };
  if (days <= 180) return { label: "91-180 يوم", variant: "outline" };
  return { label: "أكثر من 180 يوم", variant: "destructive" };
}

export default function LotAgingPage() {
  const [warehouseId, setWarehouseId] = useState("");

  const qs = warehouseId ? `?warehouseId=${warehouseId}` : "";
  const { data } = useApiQuery<any>(["lot-aging", warehouseId], `/warehouse/reports/lot-aging${qs}`);
  const rows = asList(data?.data || data);

  const columns = useMemo<any[]>(() => [
    { key: "lotNumber",     header: "رقم الدفعة",      cell: (r: any) => r.lotNumber },
    { key: "productName",   header: "المنتج",           cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "warehouseName", header: "المخزن",           cell: (r: any) => r.warehouseName ?? `#${r.warehouseId}` },
    { key: "receivedDate",  header: "تاريخ الاستلام",   cell: (r: any) => formatDateAr(r.receivedDate) },
    { key: "ageDays",       header: "العمر (أيام)",     cell: (r: any) => formatNumber(Number(r.ageDays ?? 0)) },
    { key: "bucket",        header: "الفئة العمرية",
      cell: (r: any) => { const b = bucketOf(Number(r.ageDays ?? 0)); return <Badge variant={b.variant}>{b.label}</Badge>; } },
    { key: "quantity",      header: "الكمية المتبقية",  cell: (r: any) => formatNumber(Number(r.quantity ?? 0)) },
    { key: "value",         header: "القيمة (ر.س)",     cell: (r: any) => formatNumber(Number(r.value ?? (Number(r.quantity ?? 0) * Number(r.unitCost ?? 0)))) },
  ], []);

  return (
    <PageShell title="تقرير عمر الدفعات">
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">المخزن (id)</label>
            <Input className="w-32" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="الكل" />
          </div>
        </CardContent>
      </Card>
      <Card><CardContent className="pt-6">
        <DataTable data={rows} columns={columns} emptyMessage="لا توجد دفعات نشطة" />
      </CardContent></Card>
    </PageShell>
  );
}
