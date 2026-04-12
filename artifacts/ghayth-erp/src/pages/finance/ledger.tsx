import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, BookOpen, Download, Printer } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useState } from "react";

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
            <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
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

      <DataTable<any>
        columns={[
          {
            key: "date",
            header: "التاريخ",
            sortable: true,
            className: "text-gray-500 text-sm",
            render: (e) => (e.date ? formatDateAr(e.date) : "-"),
          },
          {
            key: "ref",
            header: "المرجع",
            sortable: true,
            searchable: true,
            className: "font-mono text-blue-600 text-sm",
            render: (e) => e.ref || "-",
          },
          {
            key: "description",
            header: "الوصف",
            sortable: true,
            searchable: true,
            className: "font-medium",
            render: (e) => e.description || "-",
          },
          {
            key: "debit",
            header: "مدين",
            sortable: true,
            className: "text-green-600",
            render: (e) => (Number(e.debit || 0) > 0 ? formatCurrency(Number(e.debit)) : "-"),
          },
          {
            key: "credit",
            header: "دائن",
            sortable: true,
            className: "text-red-600",
            render: (e) => (Number(e.credit || 0) > 0 ? formatCurrency(Number(e.credit)) : "-"),
          },
          {
            key: "runningBalance",
            header: "الرصيد التراكمي",
            sortable: true,
            className: "font-bold",
            render: (e) => (
              <span style={{ color: Number(e.runningBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
                {formatCurrency(Number(e.runningBalance))}
              </span>
            ),
          },
        ] as DataTableColumn<any>[]}
        data={entries}
        rowKey={(e, i) => e.id || i}
        rowClassName={() => "hover:bg-gray-50"}
        pageSize={20}
        emptyMessage="لا توجد حركات"
        emptyIcon={<BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />}
        searchPlaceholder="بحث في القيود..."
      />

      {entries.length > 0 && (
        <div className="rounded-lg border bg-gray-100 font-bold p-3 grid grid-cols-6 gap-2">
          <div className="col-span-3">المجموع</div>
          <div className="text-green-700">{formatCurrency(Number(summary.totalDebit || 0))}</div>
          <div className="text-red-700">{formatCurrency(Number(summary.totalCredit || 0))}</div>
          <div style={{ color: Number(balance) >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(Number(balance))}
          </div>
        </div>
      )}
    </div>
  );
}
