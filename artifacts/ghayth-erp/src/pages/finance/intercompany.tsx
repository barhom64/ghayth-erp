import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import { ArrowLeftRight, Layers } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Link } from "wouter";

export default function IntercompanyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ toCompanyId: "", amount: "", description: "", transactionDate: new Date().toISOString().split("T")[0] });

  const { data, isLoading } = useApiQuery<any>(
    ["intercompany"],
    `/finance/intercompany${scopeSuffix}`
  );

  const { data: companiesData } = useApiQuery<any>(
    ["companies-list"],
    `/settings/companies${scopeSuffix}`
  );

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/finance/intercompany", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intercompany"] });
      toast({ title: "تم تسجيل المعاملة البينية وإنشاء القيدين المحاسبيين" });
      setShowCreate(false);
      setForm({ toCompanyId: "", amount: "", description: "", transactionDate: new Date().toISOString().split("T")[0] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const companies = companiesData?.data ?? companiesData ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({ ...form, toCompanyId: Number(form.toCompanyId), amount: Number(form.amount) });
  }

  const list = data?.data ?? data ?? [];

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (row) => <span className="font-mono text-blue-600 text-xs">{row.ref}</span>,
    },
    {
      key: "transactionDate",
      header: "التاريخ",
      sortable: true,
      render: (row) => <span className="text-gray-500 text-xs">{row.transactionDate ? formatDate(row.transactionDate) : "-"}</span>,
    },
    { key: "fromCompanyName", header: "الشركة المُرسِلة", sortable: true },
    { key: "toCompanyName", header: "الشركة المُستقبِلة", sortable: true },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (row) => <span className="font-semibold">{formatCurrency(row.amount)}</span>,
    },
    { key: "description", header: "البيان" },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (row) => (
        <Badge variant="outline" className={row.status === "posted" ? "bg-green-100 text-green-700" : row.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
          {row.status === "posted" ? "مُرحَّل" : row.status === "cancelled" ? "ملغي" : "مسودة"}
        </Badge>
      ),
    },
    {
      key: "fromJournalId",
      header: "قيد الإرسال",
      render: (row) => row.fromJournalId ? <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">#{row.fromJournalId}</span> : "—",
    },
    {
      key: "toJournalId",
      header: "قيد الاستلام",
      render: (row) => row.toJournalId ? <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">#{row.toJournalId}</span> : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">المعاملات البينية</h2>
          <p className="text-sm text-gray-500 mt-1">تسجيل المعاملات المالية بين الشركات مع إنشاء قيود مزدوجة تلقائياً</p>
        </div>
        <div className="flex gap-3">
          <Link href="/finance/intercompany/consolidation/create">
            <Button variant="outline">
              <Layers className="h-4 w-4 ml-2" />
              القوائم الموحدة
            </Button>
          </Link>
          <Button onClick={() => setShowCreate(true)}>
            <ArrowLeftRight className="h-4 w-4 ml-2" />
            معاملة جديدة
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <div className="font-semibold mb-1">آلية العمل التلقائية</div>
        عند تسجيل معاملة بينية، يُنشئ النظام تلقائياً:
        <ul className="mt-1 list-disc list-inside space-y-0.5 text-blue-700">
          <li>قيد في الشركة المُرسِلة: <strong>ذمم مدينة شركة شقيقة (مدين) / إيراد شركة شقيقة (دائن)</strong></li>
          <li>قيد في الشركة المُستقبِلة: <strong>مصروف شركة شقيقة (مدين) / ذمم دائنة شركة شقيقة (دائن)</strong></li>
        </ul>
      </div>

      <DataTable
        columns={columns}
        data={list}
        isLoading={isLoading}
        emptyMessage="لا توجد معاملات بينية"
        emptyIcon={<ArrowLeftRight className="h-6 w-6 text-slate-400" />}
        noToolbar
      />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">تسجيل معاملة بينية جديدة</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">الشركة المُستقبِلة *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.toCompanyId} onChange={e => setForm(f => ({ ...f, toCompanyId: e.target.value }))}>
                  <option value="">-- اختر الشركة --</option>
                  {(Array.isArray(companies) ? companies : []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">المبلغ *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" required type="number" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تاريخ المعاملة</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">البيان</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف المعاملة البينية" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "جاري التسجيل..." : "تسجيل المعاملة"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
