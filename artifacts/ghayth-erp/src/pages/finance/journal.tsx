import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ScrollText, ArrowLeftRight, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";
import { useAppContext } from "@/contexts/app-context";

export default function JournalPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["journal", scopeQueryString], `/finance/journal${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref"],
    dateField: "",
  });

  const totalEntries = items.length;
  const totalDebit = items.reduce((s: number, j: any) => {
    const lines = j.lines || [];
    return s + lines.reduce((ls: number, l: any) => ls + Number(l?.debit || 0), 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">القيود اليومية</h1>
        <Link href="/finance/journal/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />قيد جديد</Button>
        </Link>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><ScrollText className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي القيود</p><p className="text-xl font-bold">{formatNumber(totalEntries)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><ArrowLeftRight className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي الحركات</p><p className="text-xl font-bold">{formatCurrency(totalDebit)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><ScrollText className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-xs text-gray-500">قيد مزدوج</p><p className="text-xl font-bold text-purple-600">نشط</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالوصف أو المرجع...",
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "createdAt", label: "التاريخ" },
        ], "القيود_اليومية")}
        resultCount={filtered?.length}
      />

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>لا توجد قيود</p>
          </div>
        ) : filtered.slice((page - 1) * pageSize, page * pageSize).map((j: any) => {
          const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
          const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
          const totalC = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
          const isExpanded = expandedId === j.id;
          const isBalanced = Math.abs(totalD - totalC) < 0.01;

          return (
            <div key={j.id} className="border-b">
              <div className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : j.id)}>
                <span className="font-mono text-blue-600 text-sm w-32 flex-shrink-0">{j.ref || `JE-${j.id}`}</span>
                <span className="font-medium flex-1">{j.description || "-"}</span>
                <Badge className={isBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {isBalanced ? "متوازن" : "غير متوازن"}
                </Badge>
                <span className="text-sm text-gray-500 w-24 text-start">{formatCurrency(totalD)}</span>
                <span className="text-xs text-gray-400 w-28">{j.createdAt ? formatDateAr(j.createdAt) : "-"}</span>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
              {isExpanded && lines.length > 0 && (
                <div className="bg-gray-50 px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-500"><th className="py-1 text-start">الحساب</th><th className="py-1 text-start">مدين</th><th className="py-1 text-start">دائن</th></tr></thead>
                    <tbody>
                      {lines.map((l: any, i: number) => (
                        <tr key={i} className="border-t border-gray-200">
                          <td className="py-1.5 font-mono text-sm">{l.accountCode}</td>
                          <td className="py-1.5 text-green-600 font-medium">{Number(l.debit || 0) > 0 ? formatCurrency(l.debit) : "-"}</td>
                          <td className="py-1.5 text-red-600 font-medium">{Number(l.credit || 0) > 0 ? formatCurrency(l.credit) : "-"}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-300 font-bold">
                        <td className="py-1.5">المجموع</td>
                        <td className="py-1.5 text-green-700">{formatCurrency(totalD)}</td>
                        <td className="py-1.5 text-red-700">{formatCurrency(totalC)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </CardContent></Card>
    </div>
  );
}
