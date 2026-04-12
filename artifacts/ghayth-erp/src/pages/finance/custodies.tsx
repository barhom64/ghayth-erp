import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, DollarSign, Plus, X, CheckCircle, AlertCircle, ChevronDown, ChevronUp, AlertTriangle, Eye, BarChart3 } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "نشطة", color: "bg-blue-100 text-blue-700" },
  partial: { label: "مسوّاة جزئياً", color: "bg-yellow-100 text-yellow-700" },
  settled: { label: "مسوّاة", color: "bg-green-100 text-green-700" },
  pending: { label: "بانتظار الموافقة", color: "bg-orange-100 text-orange-700" },
  rejected: { label: "مرفوضة", color: "bg-red-100 text-red-700" },
  returned: { label: "مُرجعة", color: "bg-gray-100 text-gray-700" },
  overdue: { label: "متأخرة", color: "bg-red-100 text-red-700" },
};

export default function CustodiesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["custodies", scopeQueryString], `/finance/custodies${scopeSuffix}`);
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);
  const [settleTarget, setSettleTarget] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref", "employeeName", "purpose"],
    statusField: "",
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (c) => <span className="font-mono text-blue-600 text-sm">{c.ref}</span>,
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (c) => <span className="font-medium">{c.employeeName || "-"}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (c) => (
        <div className="text-gray-600">
          {c.description || "-"}
          {c.purpose && <div className="text-xs text-gray-400 mt-0.5">{c.purpose}</div>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (c) => <span className="font-semibold">{formatCurrency(c.amount)}</span>,
    },
    {
      key: "remainingAmount",
      header: "المتبقي",
      sortable: true,
      render: (c) => <span className="font-semibold text-orange-600">{formatCurrency(c.remainingAmount || 0)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (c) => {
        const st = statusMap[c.status] || statusMap.active!;
        return (
          <>
            <Badge className={st.color}>{st.label}</Badge>
            {c.daysOverdue > 0 && (
              <div className="text-xs text-red-500 mt-0.5">{c.daysOverdue} يوم تأخير</div>
            )}
          </>
        );
      },
    },
    {
      key: "expectedReturnDate",
      header: "تاريخ الإرجاع",
      sortable: true,
      render: (c) => <span className="text-gray-500 text-sm">{c.expectedReturnDate ? formatDateAr(c.expectedReturnDate) : "-"}</span>,
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (c) => <span className="text-gray-500 text-sm">{c.date ? formatDateAr(c.date) : "-"}</span>,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (c) => (
        <div className="flex items-center gap-1">
          <Link href={`/finance/custodies/${c.id}`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {c.status !== "settled" && c.status !== "pending" && c.status !== "rejected" && (
            <Button variant="outline" size="sm" onClick={() => setSettleTarget(c)}>تسوية</Button>
          )}
          <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="text-gray-400 hover:text-gray-600 p-1">
            {expandedId === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">العهد</h1>
        <div className="flex gap-2">
          <Link href="/finance/custodies/report">
            <Button size="sm" variant="outline">
              <BarChart3 className="h-4 w-4 me-1" />تقرير أعمار العهد
            </Button>
          </Link>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />عهدة جديدة</>}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><KeyRound className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">عدد العهد</p><p className="text-xl font-bold">{summary.total || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(Number(summary.totalAmount || 0))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg"><AlertCircle className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-xs text-gray-500">المتبقي</p><p className="text-xl font-bold text-orange-600">{formatCurrency(Number(summary.totalRemaining || 0))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><CheckCircle className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-xs text-gray-500">النشطة</p><p className="text-xl font-bold">{summary.activeCount || 0}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-xs text-gray-500">متأخرة</p><p className="text-xl font-bold text-red-600">{summary.overdueCount || 0}</p></div>
        </CardContent></Card>
      </div>

      {showForm && <CreateCustodyForm onDone={() => setShowForm(false)} />}
      {settleTarget && <SettleCustodyForm custody={settleTarget} onDone={() => setSettleTarget(null)} />}

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو المرجع أو الغرض...",
          statuses: [
            { value: "active", label: "نشطة" },
            { value: "partial", label: "مسوّاة جزئياً" },
            { value: "settled", label: "مسوّاة" },
            { value: "pending", label: "بانتظار الموافقة" },
            { value: "overdue", label: "متأخرة" },
            { value: "rejected", label: "مرفوضة" },
            { value: "returned", label: "مُرجعة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "employeeName", label: "الموظف" },
          { key: "description", label: "الوصف" },
          { key: "purpose", label: "الغرض" },
          { key: "amount", label: "المبلغ" },
          { key: "settledAmount", label: "المسوّى" },
          { key: "remainingAmount", label: "المتبقي" },
          { key: "status", label: "الحالة" },
          { key: "date", label: "التاريخ" },
          { key: "expectedReturnDate", label: "تاريخ الإرجاع المتوقع" },
          { key: "daysOverdue", label: "أيام التأخير" },
        ], "العهد")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد عهد"
        emptyIcon={<KeyRound className="h-6 w-6 text-slate-400" />}
        rowClassName={(c) => c.status === "overdue" ? "bg-red-50/30" : undefined}
        noToolbar
        renderRowExtras={(c) => {
          if (expandedId !== c.id) return null;
          return (
            <div className="p-3 bg-gray-50/50">
              {(c.approvalStatus === "draft" || c.approvalStatus === "returned" || c.approvalStatus === "pending_approval") && (
                <div className="mb-4 bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold mb-3">إجراءات الاعتماد</h4>
                  <ApprovalActions
                    entityType="custody"
                    entityId={c.id}
                    currentStatus={c.approvalStatus}
                    onDone={() => setExpandedId(null)}
                    invalidateKeys={[["custodies"]]}
                  />
                </div>
              )}
              <ActionHistory entityType="custody" entityId={c.id} defaultOpen />
            </div>
          );
        }}
      />
    </div>
  );
}

function CreateCustodyForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createMut = useApiMutation("/finance/custodies", "POST", [["custodies"]]);
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const sourceAccounts = (accountsData?.data || []).filter((a: any) => a.type === "asset" || a.code?.startsWith("1"));
  const employees = employeesData?.data || [];
  const [form, setForm] = useState({
    assignmentId: "", amount: "", description: "", sourceAccountCode: "",
    purpose: "", expectedReturnDate: "",
  });

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync({
        ...form,
        assignmentId: Number(form.assignmentId),
        amount: Number(form.amount),
        expectedReturnDate: form.expectedReturnDate || undefined,
        purpose: form.purpose || undefined,
      });
      toast({ title: "تم إضافة العهدة" });
      qc.invalidateQueries({ queryKey: ["custodies"] });
      onDone();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>عهدة جديدة</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الموظف</Label>
            <select className="w-full border rounded-md p-2 mt-1" value={form.assignmentId} onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}>
              <option value="">اختر الموظف...</option>
              {employees.map((e: any) => (
                <option key={e.assignmentId || e.id} value={e.assignmentId || e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div><Label>المبلغ</Label><Input className="mt-1" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
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
          <div><Label>الغرض</Label><Input className="mt-1" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="غرض العهدة (اختياري)" /></div>
          <div><Label>تاريخ الإرجاع المتوقع</Label><div className="mt-1"><DatePicker value={form.expectedReturnDate} onChange={(v) => setForm({ ...form, expectedReturnDate: v })} /></div></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onDone}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={!form.assignmentId || !form.amount || createMut.isPending}>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettleCustodyForm({ custody, onDone }: { custody: any; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const settleMut = useApiMutation("/finance/custodies/settle", "POST", [["custodies"]]);
  const [amount, setAmount] = useState(String(custody.remainingAmount || 0));
  const [description, setDescription] = useState("");

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      toast({ variant: "destructive", title: "المبلغ مطلوب" });
      return;
    }
    if (Number(amount) > Number(custody.remainingAmount)) {
      toast({ variant: "destructive", title: "مبلغ التسوية يتجاوز المتبقي" });
      return;
    }
    try {
      await settleMut.mutateAsync({ custodyRef: custody.ref, amount: Number(amount), description });
      toast({ title: "تمت التسوية بنجاح" });
      qc.invalidateQueries({ queryKey: ["custodies"] });
      onDone();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء التسوية" });
    }
  };

  return (
    <Card className="border-orange-200">
      <CardHeader><CardTitle className="text-base">تسوية عهدة: {custody.ref}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500">المبلغ الأصلي</p>
            <p className="text-lg font-bold">{formatCurrency(custody.amount)}</p>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500">المتبقي</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(custody.remainingAmount)}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500">المسوّى سابقاً</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(custody.settledAmount || 0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>مبلغ التسوية</Label><Input className="mt-1" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>ملاحظات</Label><Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اختياري" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onDone}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={!amount || settleMut.isPending}>
            {settleMut.isPending ? "جاري التسوية..." : "تسوية"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
