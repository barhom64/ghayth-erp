import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ScrollText, ArrowLeftRight, Undo2 } from "lucide-react";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function JournalPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["journal", scopeQueryString], `/finance/journal${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reversalTarget, setReversalTarget] = useState<any>(null);
  const [reversalReason, setReversalReason] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const reverseMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch(`/finance/journal/${id}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast({ title: "تم عكس القيد بنجاح" });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setReversalTarget(null);
      setReversalReason("");
    },
    onError: (e: any) => toast({ variant: "destructive", title: e?.message || "فشل عكس القيد" }),
  });

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref"],
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (j) => <span className="font-mono text-blue-600 text-xs">{j.ref || `JE-${j.id}`}</span>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (j) => <span className="text-gray-500 text-xs">{j.createdAt ? formatDateAr(j.createdAt) : "-"}</span>,
    },
    {
      key: "description",
      header: "البيان",
      sortable: true,
      render: (j) => <span className="font-medium">{j.description || "-"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (j) => {
        const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
        const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
        return <span className="text-sm text-gray-700">{formatCurrency(totalD)}</span>;
      },
    },
    {
      key: "balanced",
      header: "التوازن",
      render: (j) => {
        const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
        const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
        const totalC = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
        const isBalanced = Math.abs(totalD - totalC) < 0.01;
        return (
          <div className="flex items-center gap-1">
            <Badge className={isBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
              {isBalanced ? "متوازن" : "غير متوازن"}
            </Badge>
            {j.reversedById && <Badge className="bg-yellow-100 text-yellow-700">مُعكوس</Badge>}
            {j.reversalOfId && <Badge className="bg-blue-100 text-blue-700">قيد عاكس</Badge>}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (j) => (
        <Button
          variant="ghost"
          size="icon"
          title="عكس القيد"
          disabled={!!j.reversedById || !!j.reversalOfId}
          onClick={(e) => {
            e.stopPropagation();
            setReversalTarget(j);
            setReversalReason("");
          }}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

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

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد قيود"
        emptyIcon={<ScrollText className="h-6 w-6 text-slate-400" />}
        onRowClick={(j) => setExpandedId(expandedId === j.id ? null : j.id)}
        noToolbar
        renderRowExtras={(j) => {
          if (expandedId !== j.id) return null;
          const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
          if (lines.length === 0) return null;
          const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
          const totalC = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
          return (
            <div className="bg-gray-50 px-6 py-3">
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
          );
        }}
      />

      <AlertDialog open={!!reversalTarget} onOpenChange={(open) => { if (!open) { setReversalTarget(null); setReversalReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>عكس القيد {reversalTarget?.ref || `JE-${reversalTarget?.id}`}</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء قيد جديد بنفس البنود مع عكس المدين والدائن. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">سبب عكس القيد *</label>
            <Textarea
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="أدخل سبب عكس القيد..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                if (!reversalReason.trim()) {
                  toast({ variant: "destructive", title: "السبب مطلوب" });
                  return;
                }
                reverseMut.mutate({ id: reversalTarget.id, reason: reversalReason });
              }}
              disabled={reverseMut.isPending}
            >
              {reverseMut.isPending ? "جاري العكس..." : "تأكيد العكس"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
