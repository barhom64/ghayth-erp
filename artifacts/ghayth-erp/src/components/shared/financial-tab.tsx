import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, TrendingUp, TrendingDown, DollarSign, Download } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface FinancialTabProps {
  entityType: "employee" | "vehicle" | "property" | "supplier" | "client" | "project" | "product";
  entityId: string | number;
  sections?: string[];
}

export function FinancialTab({ entityType, entityId, sections }: FinancialTabProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const dateParams = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&");

  const url = `/finance/subsidiary-ledger/${entityType}/${entityId}${dateParams ? `?${dateParams}` : ""}`;
  const { data, isLoading } = useApiQuery<any>(
    ["subsidiary-ledger", entityType, String(entityId), dateParams],
    url,
    !!entityId
  );

  const movements = data?.movements || [];
  const summary = data?.summary || {};
  const sectionData = data?.sections || {};

  const handleExportCSV = () => {
    if (!movements.length) return;
    const headers = ["التاريخ", "المرجع", "الوصف", "مدين", "دائن", "الرصيد"];
    const rows = movements.map((m: any) => [
      m.date ? formatDateAr(m.date) : "",
      m.ref || "",
      m.description || "",
      m.debit || 0,
      m.credit || 0,
      m.runningBalance || 0,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ledger-${entityType}-${entityId}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-base font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" />
          دفتر الأستاذ المساعد
        </h4>
        <div className="flex gap-2 items-center flex-wrap">
          <DatePicker value={startDate} onChange={setStartDate} className="w-36" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-36" />
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!movements.length}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.totalDebit !== undefined && (
          <Card><CardContent className="p-3 text-center">
            <TrendingUp className="h-4 w-4 text-green-600 mx-auto mb-1" />
            <p className="text-xs text-gray-500">إجمالي المدين</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(Number(summary.totalDebit || 0))}</p>
          </CardContent></Card>
        )}
        {summary.totalCredit !== undefined && (
          <Card><CardContent className="p-3 text-center">
            <TrendingDown className="h-4 w-4 text-red-600 mx-auto mb-1" />
            <p className="text-xs text-gray-500">إجمالي الدائن</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(Number(summary.totalCredit || 0))}</p>
          </CardContent></Card>
        )}
        {summary.netBalance !== undefined && (
          <Card className={Number(summary.netBalance) >= 0 ? "bg-green-50" : "bg-red-50"}>
            <CardContent className="p-3 text-center">
              <DollarSign className="h-4 w-4 mx-auto mb-1" style={{ color: Number(summary.netBalance) >= 0 ? "#16a34a" : "#dc2626" }} />
              <p className="text-xs text-gray-500">صافي الرصيد</p>
              <p className="text-lg font-bold" style={{ color: Number(summary.netBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
                {formatCurrency(Number(summary.netBalance))}
              </p>
            </CardContent>
          </Card>
        )}
        <Card><CardContent className="p-3 text-center">
          <BookOpen className="h-4 w-4 text-blue-600 mx-auto mb-1" />
          <p className="text-xs text-gray-500">عدد الحركات</p>
          <p className="text-lg font-bold">{movements.length}</p>
        </CardContent></Card>
      </div>

      {Object.keys(sectionData).length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(sectionData).map(([key, val]: [string, any]) => (
            <Card key={key}><CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">{val.label}</p>
              <p className="text-base font-bold">{formatCurrency(Number(val.amount || 0))}</p>
              {val.count !== undefined && <p className="text-xs text-gray-400">{val.count} سجل</p>}
            </CardContent></Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">حركات دفتر الأستاذ المساعد</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3 text-start">التاريخ</th>
                  <th className="p-3 text-start">المرجع</th>
                  <th className="p-3 text-start">الوصف</th>
                  <th className="p-3 text-start">النوع</th>
                  <th className="p-3 text-start">مدين</th>
                  <th className="p-3 text-start">دائن</th>
                  <th className="p-3 text-start">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-gray-400">
                      <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>لا توجد حركات مالية مرتبطة بهذا الكيان</p>
                    </td>
                  </tr>
                ) : (
                  movements.map((m: any, i: number) => (
                    <tr key={m.id || i} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-500 text-xs whitespace-nowrap">{m.date ? formatDateAr(m.date) : "-"}</td>
                      <td className="p-3 font-mono text-blue-600 text-xs">{m.ref || "-"}</td>
                      <td className="p-3 text-sm">{m.description || "-"}</td>
                      <td className="p-3">
                        {m.movementType && (
                          <Badge variant="outline" className="text-[10px]">{m.movementType}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-green-600 font-medium">
                        {Number(m.debit || 0) > 0 ? formatCurrency(Number(m.debit)) : "-"}
                      </td>
                      <td className="p-3 text-red-600 font-medium">
                        {Number(m.credit || 0) > 0 ? formatCurrency(Number(m.credit)) : "-"}
                      </td>
                      <td className="p-3 font-bold text-xs" style={{ color: Number(m.runningBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
                        {formatCurrency(Number(m.runningBalance || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
