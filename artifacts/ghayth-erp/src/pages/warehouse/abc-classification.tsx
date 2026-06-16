import { useMemo, useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { BarChart3 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

const VARIANT: Record<string, any> = { A: "default", B: "secondary", C: "outline" };

export default function AbcClassificationPage() {
  const [cat, setCat] = useState("");
  const { data } = useApiQuery<any>(
    ["abc", cat],
    `/warehouse/abc-classification${cat ? `?category=${cat}` : ""}`,
  );
  const rows = asList(data?.data || data);

  const columns = useMemo<any[]>(() => [
    { key: "productName", header: "المنتج", cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "category", header: "التصنيف", cell: (r: any) => <Badge variant={VARIANT[r.category]}>{r.category}</Badge> },
    { key: "paretoValue", header: "القيمة (ر.س)", cell: (r: any) => formatNumber(Number(r.paretoValue ?? 0)) },
    { key: "paretoShare", header: "النسبة", cell: (r: any) => formatNumber(Number(r.paretoShare ?? 0) * 100) + "%" },
    { key: "period", header: "الفترة", cell: (r: any) => r.period },
  ], []);

  return (
    <PageShell title="تصنيف ABC للمنتجات">
      <div className="mb-4 flex gap-2">
        {["", "A", "B", "C"].map((c) => (
          <Button key={c || "all"} size="sm" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>
            {c === "" ? "الكل" : c}
          </Button>
        ))}
      </div>
      <Card><CardContent className="pt-6">
        <DataTable data={rows} columns={columns} emptyMessage="لا يوجد تصنيف ABC بعد — انتظر تشغيل الـ cron الشهري" />
      </CardContent></Card>
    </PageShell>
  );
}
