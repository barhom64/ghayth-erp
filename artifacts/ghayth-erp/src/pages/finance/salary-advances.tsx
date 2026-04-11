import { useState } from "react";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, DollarSign, Plus, X } from "lucide-react";
import { getCurrencySymbol, formatCurrency , formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV, useAdvancedFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@/components/approval-actions";

export default function SalaryAdvancesPage() {
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["salary-advances", scopeQueryString], `/finance/salary-advances${scopeSuffix}`);
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);
  const canApprove = roleLevel >= 70;
  const qc = useQueryClient();
  const { toast } = useToast();
  const advFilters = useAdvancedFilters();

  const handleApprove = async (id: number, approved: boolean | null) => {
    let notes: string | undefined;
    if (approved === false) {
      const reason = window.prompt("سبب الرفض:");
      if (!reason) return;
      notes = reason;
    } else if (approved === null) {
      const reason = window.prompt("سبب الإرجاع:");
      if (!reason) return;
      notes = reason;
    }
    try {
      await apiFetch(`/finance/salary-advances/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ approved, notes }),
      });
      const msg = approved === true ? "تمت الموافقة على السلفة" : approved === false ? "تم رفض السلفة" : "تمت إعادة السلفة";
      toast({ title: msg });
      qc.invalidateQueries({ queryKey: ["salary-advances"] });
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  const filtered = applyFilters(items as Record<string, any>[], filters, {
    searchFields: ["description", "ref"],
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "amount", label: "المبلغ" },
          { key: "date", label: "التاريخ" },
        ], "سلف_الرواتب")}
        resultCount={sortedData?.length}
      />

      <AdvancedFilters
        dateFrom={advFilters.dateFrom}
        dateTo={advFilters.dateTo}
        onDateFromChange={advFilters.setDateFrom}
        onDateToChange={advFilters.setDateTo}
        onReset={advFilters.reset}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="ref" label="المرجع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="amount" label="المبلغ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="date" label="التاريخ" sortState={sortState} onSort={handleSort} />
            {canApprove && <th className="p-3 text-start font-medium text-xs">إجراء</th>}
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? [...Array(3)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={canApprove ? 7 : 6} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={canApprove ? 7 : 6} className="p-12 text-center text-gray-400">
                <Banknote className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد سلف</p>
              </td></tr>
            ) : (sortedData || []).map((s: any) => (
              <tr key={s.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-blue-600 text-sm">{s.ref}</td>
                <td className="p-3 font-medium">{s.employeeName || "-"}</td>
                <td className="p-3">{s.description || "-"}</td>
                <td className="p-3 font-semibold">{formatCurrency(Number(s.amount))}</td>
                <td className="p-3"><StatusBadge status={s.status || "pending"} /></td>
                <td className="p-3 text-gray-500 text-sm">{s.date ? formatDateAr(s.date) : "-"}</td>
                {canApprove && (
                  <td className="p-3">
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
                  </td>
                )}
              </tr>
            ))}
          </TableBody>
        </Table>
      </div></div>
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
