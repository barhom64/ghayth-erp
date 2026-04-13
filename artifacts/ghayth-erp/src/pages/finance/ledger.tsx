import { useState } from "react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, BookOpen, Download, Printer } from "lucide-react";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { PaginationBar } from "@/components/data-table-wrapper";

const typeMap: Record<string, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };

function exportCSV(rows: any[], headers: string[], filename: string) {
  if (!rows.length) return;
  const csv = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function LedgerPage() {
  const [, params] = useRoute("/finance/ledger/:code");
  const code = params?.code;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const dateParams = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&");

  const { data, isLoading } = useApiQuery<any>(
    ["ledger", code || "", dateParams],
    `/finance/ledger/${code}${dateParams ? `?${dateParams}` : ""}`,
    !!code
  );

  const account = data?.account;
  const entries = data?.entries || [];
  const summary = data?.summary || {};
  const { sortedData, sortState, handleSort } = useSortedData(entries);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);
  const balance = summary?.balance || 0;

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/finance/accounts">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              دفتر أستاذ — {account?.name || code}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-sm text-gray-500">{code}</span>
              {account && <Badge variant="outline">{typeMap[account.type] || account.type}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <DatePicker value={startDate} onChange={setStartDate} className="w-40" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-40" placeholder="إلى" />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 me-1" />طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(entries, ["date", "ref", "description", "debit", "credit", "runningBalance"], `ledger-${code}.csv`)}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">عدد القيود</p>
          <p className="text-2xl font-bold">{entries.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">إجمالي المدين</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(Number(summary.totalDebit || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">إجمالي الدائن</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(Number(summary.totalCredit || 0))}</p>
        </CardContent></Card>
        <Card className={Number(balance) >= 0 ? "bg-green-50" : "bg-red-50"}><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">الرصيد الحالي</p>
          <p className="text-2xl font-bold" style={{ color: Number(balance) >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(Number(balance))}
          </p>
        </CardContent></Card>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="date" label="التاريخ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="ref" label="المرجع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="debit" label="مدين" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="credit" label="دائن" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="runningBalance" label="الرصيد التراكمي" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="p-12 text-center text-gray-400">
                <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد حركات</p>
              </td></tr>
            ) : (paginatedData || []).map((e: any, i: number) => (
              <tr key={e.id || i} className="border-b hover:bg-gray-50">
                <td className="p-3 text-gray-500 text-sm">{e.date ? formatDateAr(e.date) : "-"}</td>
                <td className="p-3 font-mono text-blue-600 text-sm">{e.ref || "-"}</td>
                <td className="p-3 font-medium">{e.description || "-"}</td>
                <td className="p-3 text-green-600">{Number(e.debit || 0) > 0 ? formatCurrency(Number(e.debit)) : "-"}</td>
                <td className="p-3 text-red-600">{Number(e.credit || 0) > 0 ? formatCurrency(Number(e.credit)) : "-"}</td>
                <td className="p-3 font-bold" style={{ color: Number(e.runningBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
                  {formatCurrency(Number(e.runningBalance))}
                </td>
              </tr>
            ))}
            {entries.length > 0 && (
              <tr className="bg-gray-100 font-bold">
                <td colSpan={3} className="p-3">المجموع</td>
                <td className="p-3 text-green-700">{formatCurrency(Number(summary.totalDebit || 0))}</td>
                <td className="p-3 text-red-700">{formatCurrency(Number(summary.totalCredit || 0))}</td>
                <td className="p-3" style={{ color: Number(balance) >= 0 ? "#16a34a" : "#dc2626" }}>
                  {formatCurrency(Number(balance))}
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={entries.length} onPageChange={setPage} />
      </div></div>
    </div>
  );
}
