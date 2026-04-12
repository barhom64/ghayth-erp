import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, DollarSign, Plus, X } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV, useAdvancedFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@/components/approval-actions";

export default function SalaryAdvancesPage() {
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["salary-advances", scopeQueryString], `/finance/salary-advances${scopeSuffix}`);
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);
  const canApprove = roleLevel >= 70;
  const advFilters = useAdvancedFilters();

  const filtered = applyFilters(items as Record<string, any>[], filters, {
    searchFields: ["description", "ref"],
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (s) => <span className="font-mono text-blue-600 text-sm">{s.ref}</span>,
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (s) => <span className="font-medium">{s.employeeName || "-"}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (s) => s.description || "-",
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (s) => <span className="font-semibold">{formatCurrency(Number(s.amount))}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (s) => <StatusBadge status={s.status || "pending"} />,
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (s) => <span className="text-gray-500 text-sm">{s.date ? formatDateAr(s.date) : "-"}</span>,
    },
    {
      key: "actions",
      header: "إجراء",
      hidden: !canApprove,
      render: (s) => (
        <ApprovalActions
          entityType="salary_advance"
          entityId={s.id}
          currentStatus={s.status || "pending"}
          approveEndpoint={`/finance/salary-advances/${s.id}/approve`}
          rejectEndpoint={`/finance/salary-advances/${s.id}/approve`}
          returnEndpoint={`/finance/salary-advances/${s.id}/approve`}
          approveMethod="PATCH"
          rejectMethod="PATCH"
          returnMethod="PATCH"
          approveBody={() => ({ approved: true })}
          rejectBody={(notes) => ({ approved: false, notes })}
          returnBody={(notes) => ({ approved: null, notes })}
          pendingStatuses={["pending"]}
          invalidateKeys={[["salary-advances"]]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">سلف الرواتب</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />سلفة جديدة</>}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Banknote className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">عدد السلف</p><p className="text-xl font-bold">{summary.total || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg"><DollarSign className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(Number(summary.totalAmount || 0))}</p></div>
        </CardContent></Card>
      </div>

      {showForm && <CreateAdvanceForm onDone={() => setShowForm(false)} />}

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
          { key: "amount", label: "المبلغ" },
          { key: "date", label: "التاريخ" },
        ], "سلف_الرواتب")}
        resultCount={filtered?.length}
      />

      <AdvancedFilters
        dateFrom={advFilters.dateFrom}
        dateTo={advFilters.dateTo}
        onDateFromChange={advFilters.setDateFrom}
        onDateToChange={advFilters.setDateTo}
        onReset={advFilters.reset}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد سلف"
        emptyIcon={<Banknote className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </div>
  );
}

function CreateAdvanceForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMut = useApiMutation("/finance/salary-advances", "POST", [["salary-advances"]]);
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const sourceAccounts = (accountsData?.data || []).filter((a: any) => a.type === "asset" || a.code?.startsWith("1"));
  const [form, setForm] = useState({ employeeName: "", amount: "", deductMonths: "1", description: "", sourceAccountCode: "" });

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync({ ...form, amount: Number(form.amount), deductMonths: Number(form.deductMonths) });
      toast({ title: "تم إضافة السلفة" });
      qc.invalidateQueries({ queryKey: ["salary-advances"] });
      onDone();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>سلفة جديدة</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><Label>اسم الموظف</Label><Input className="mt-1" value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} /></div>
          <div><Label>المبلغ</Label><Input className="mt-1" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>أشهر الخصم</Label><Input className="mt-1" type="number" value={form.deductMonths} onChange={(e) => setForm({ ...form, deductMonths: e.target.value })} /></div>
          <div>
            <Label>مصدر الصرف</Label>
            <select className="w-full border rounded-md p-2 mt-1" value={form.sourceAccountCode} onChange={(e) => setForm({ ...form, sourceAccountCode: e.target.value })}>
              <option value="">الخزنة النقدية (1100)</option>
              {sourceAccounts.map((a: any) => (
                <option key={a.code || a.id} value={a.code}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>
          <div><Label>الوصف</Label><Input className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onDone}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={!form.employeeName || !form.amount || createMut.isPending}>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
