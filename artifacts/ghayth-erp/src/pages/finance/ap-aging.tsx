import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronDown, ChevronRight, AlertTriangle, Clock, Building2 } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

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

export default function ApAgingPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [expanded, setExpanded] = useState<string | number | null>(null);

  const { data, isLoading } = useApiQuery<any>(
    ["ap-aging", asOfDate],
    `/finance/ap-aging?asOfDate=${asOfDate}`
  );

  const suppliers = data?.suppliers || [];
  const summary = data?.summary || {};

  const buckets = [
    { key: "current", label: "حالي", color: "bg-green-100 text-green-700" },
    { key: "1_30", label: "1-30 يوم", color: "bg-yellow-100 text-yellow-700" },
    { key: "31_60", label: "31-60 يوم", color: "bg-orange-100 text-orange-700" },
    { key: "61_90", label: "61-90 يوم", color: "bg-red-100 text-red-700" },
    { key: "over90", label: "+90 يوم", color: "bg-red-200 text-red-800" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6 text-blue-500" />
          تقرير تقادم الذمم الدائنة (AP Aging)
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePicker value={asOfDate} onChange={setAsOfDate} className="w-44" placeholder="تاريخ التقرير" />
          <Button variant="outline" size="sm" onClick={() => exportCSV(suppliers, `ap-aging-${asOfDate}.csv`)}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {buckets.map(b => (
          <Card key={b.key}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{b.label}</p>
              <p className="text-lg font-bold">{formatCurrency(Number(summary[b.key] ?? 0))}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-sm text-gray-500">إجمالي الذمم الدائنة المستحقة</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(Number(summary.grandTotal ?? 0))}</p>
          </div>
          <div className="ms-auto text-end">
            <p className="text-xs text-gray-500">عدد الموردين</p>
            <p className="text-xl font-bold text-gray-700">{suppliers.length}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : suppliers.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد ذمم دائنة مستحقة</p>
            </CardContent>
          </Card>
        ) : suppliers.map((supplier: any) => {
          const sid = supplier.supplierId ?? supplier.supplierName;
          const isOpen = expanded === sid;
          const hasOverdue = supplier["31_60"] > 0 || supplier["61_90"] > 0 || supplier.over90 > 0;
          return (
            <Card key={sid} className={hasOverdue ? "border-red-200" : ""}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-right"
                  onClick={() => setExpanded(isOpen ? null : sid)}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div>
                      <p className="font-semibold">{supplier.supplierName}</p>
                      <p className="text-xs text-gray-500">{supplier.orders?.length ?? 0} أمر شراء</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {buckets.map(b => supplier[b.key] > 0 && (
                      <div key={b.key} className="text-end">
                        <p className="text-xs text-gray-400">{b.label}</p>
                        <Badge className={b.color + " text-xs"}>{formatCurrency(supplier[b.key])}</Badge>
                      </div>
                    ))}
                    <div className="text-end">
                      <p className="text-xs text-gray-500">الإجمالي</p>
                      <p className="font-bold text-blue-600">{formatCurrency(supplier.total)}</p>
                    </div>
                  </div>
                </button>
                {isOpen && supplier.orders?.length > 0 && (
                  <div className="border-t overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المرجع</TableHead>
                          <TableHead>تاريخ الاستحقاق</TableHead>
                          <TableHead>المستحق</TableHead>
                          <TableHead>الفترة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplier.orders.map((po: any) => (
                          <TableRow key={po.id}>
                            <TableCell className="font-mono text-blue-600 text-xs">{po.ref}</TableCell>
                            <TableCell className="text-xs text-gray-500">{po.dueDate ? formatDateAr(po.dueDate) : "-"}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(po.outstanding)}</TableCell>
                            <TableCell>
                              <Badge className={buckets.find(b => b.key === po.bucket)?.color ?? ""}>
                                {buckets.find(b => b.key === po.bucket)?.label ?? po.bucket}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
