import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronDown, ChevronRight, AlertTriangle, Clock, Users } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

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

export default function ArAgingPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useApiQuery<any>(
    ["ar-aging", asOfDate],
    `/finance/ar-aging?asOfDate=${asOfDate}`
  );

  const clients = data?.clients || [];
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
          <Clock className="h-6 w-6 text-orange-500" />
          تقرير تقادم الذمم المدينة (AR Aging)
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePicker value={asOfDate} onChange={setAsOfDate} className="w-44" placeholder="تاريخ التقرير" />
          <Button variant="outline" size="sm" onClick={() => exportCSV(clients, `ar-aging-${asOfDate}.csv`)}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
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
      <Card className="bg-orange-50 border-orange-200">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <div>
            <p className="text-sm text-gray-500">إجمالي الذمم المدينة المستحقة</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(Number(summary.grandTotal ?? 0))}</p>
          </div>
          <div className="ms-auto text-end">
            <p className="text-xs text-gray-500">عدد العملاء</p>
            <p className="text-xl font-bold text-gray-700">{clients.length}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد ذمم مستحقة</p>
            </CardContent>
          </Card>
        ) : clients.map((client: any) => {
          const isOpen = expanded === client.clientId;
          const hasOverdue = client["31_60"] > 0 || client["61_90"] > 0 || client.over90 > 0;
          return (
            <Card key={client.clientId} className={hasOverdue ? "border-red-200" : ""}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-right"
                  onClick={() => setExpanded(isOpen ? null : client.clientId)}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div>
                      <p className="font-semibold">{client.clientName}</p>
                      <p className="text-xs text-gray-500">{client.invoices?.length ?? 0} فاتورة</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {buckets.map(b => client[b.key] > 0 && (
                      <div key={b.key} className="text-end">
                        <p className="text-xs text-gray-400">{b.label}</p>
                        <Badge className={b.color + " text-xs"}>{formatCurrency(client[b.key])}</Badge>
                      </div>
                    ))}
                    <div className="text-end">
                      <p className="text-xs text-gray-500">الإجمالي</p>
                      <p className="font-bold text-orange-600">{formatCurrency(client.total)}</p>
                    </div>
                  </div>
                </button>
                {isOpen && client.invoices?.length > 0 && (
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
                        {client.invoices.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono text-blue-600 text-xs">{inv.ref}</TableCell>
                            <TableCell className="text-xs text-gray-500">{inv.dueDate ? formatDateAr(inv.dueDate) : "-"}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(inv.outstanding)}</TableCell>
                            <TableCell>
                              <Badge className={buckets.find(b => b.key === inv.bucket)?.color ?? ""}>
                                {buckets.find(b => b.key === inv.bucket)?.label ?? inv.bucket}
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

      {clients.length > 0 && (
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفترة</TableHead>
                  {buckets.map(b => <TableHead key={b.key}>{b.label}</TableHead>)}
                  <TableHead>الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="font-bold">
                  <TableCell>المجموع</TableCell>
                  {buckets.map(b => (
                    <TableCell key={b.key}>{formatCurrency(Number(summary[b.key] ?? 0))}</TableCell>
                  ))}
                  <TableCell className="text-orange-600">{formatCurrency(Number(summary.grandTotal ?? 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
