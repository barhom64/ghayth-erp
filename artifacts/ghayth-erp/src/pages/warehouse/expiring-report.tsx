import { useMemo, useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Calendar } from "lucide-react";
import { formatDateAr, formatNumber } from "@/lib/formatters";

export default function ExpiringReportPage() {
  const [within, setWithin] = useState("90");
  const { data } = useApiQuery<any>(["expiring", within], `/warehouse/reports/expiring?within=${within || 90}`);
  const rows = asList(data?.data || data);

  const columns = useMemo<any[]>(() => [
    { key: "lotNumber", header: "رقم الدفعة", cell: (r: any) => <span className="font-mono">{r.lotNumber}</span> },
    { key: "productName", header: "المنتج", cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "warehouseName", header: "المخزن", cell: (r: any) => r.warehouseName ?? `#${r.warehouseId}` },
    { key: "quantity", header: "الكمية", cell: (r: any) => formatNumber(Number(r.quantity)) },
    { key: "expiryDate", header: "تاريخ الانتهاء", cell: (r: any) => formatDateAr(r.expiryDate) },
    { key: "daysUntilExpiry", header: "أيام متبقية", cell: (r: any) => {
      const d = Number(r.daysUntilExpiry);
      const variant = d <= 30 ? "destructive" : d <= 60 ? "secondary" : "outline";
      // as-any-reason: justified-jsx-generic - shadcn Badge variant prop expects a narrowed union literal that TS cannot infer from the ternary at this position; display only, behavior unchanged
      return <Badge variant={variant as any}>{formatNumber(d)} يوم</Badge>;
    } },
  ], []);

  return (
    <PageShell title="تقرير الصلاحيات القادمة" >
      <Card className="mb-4">
        <CardContent className="pt-6 flex items-end gap-3">
          <div>
            <label className="block text-sm mb-1">عرض ضمن (يوم)</label>
            <Input type="number" min={1} max={365} value={within} onChange={(e) => setWithin(e.target.value)} className="w-32" />
          </div>
        </CardContent>
      </Card>
      <Card><CardContent className="pt-6">
        <DataTable data={rows} columns={columns} emptyMessage="لا توجد دفعات قاربت على الانتهاء" />
      </CardContent></Card>
    </PageShell>
  );
}
