import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import { ArrowLeftRight, Building2, TrendingUp, Layers } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function IntercompanyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showConsolidation, setShowConsolidation] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ toCompanyId: "", amount: "", description: "", transactionDate: new Date().toISOString().split("T")[0] });

  const { data, isLoading } = useApiQuery<any>(
    ["intercompany"],
    `/finance/intercompany${scopeSuffix}`
  );

  const { data: consolidationData, isLoading: loadingConsolidation } = useApiQuery<any>(
    ["intercompany-consolidation"],
    showConsolidation ? `/finance/intercompany/consolidation${scopeSuffix}` : null,
    { enabled: showConsolidation }
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
  const consolidation = consolidationData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">المعاملات البينية</h2>
          <p className="text-sm text-gray-500 mt-1">تسجيل المعاملات المالية بين الشركات مع إنشاء قيود مزدوجة تلقائياً</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowConsolidation(true)}>
            <Layers className="h-4 w-4 ml-2" />
            القوائم الموحدة
          </Button>
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

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد معاملات بينية</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">المرجع</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الشركة المُرسِلة</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الشركة المُستقبِلة</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">المبلغ</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">البيان</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">التاريخ</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الحالة</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">قيد الإرسال</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">قيد الاستلام</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row: any) => (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-3">{row.ref}</td>
                    <td className="px-3 py-3">{row.fromCompanyName}</td>
                    <td className="px-3 py-3">{row.toCompanyName}</td>
                    <td className="px-3 py-3 font-semibold">{formatCurrency(row.amount)}</td>
                    <td className="px-3 py-3">{row.description}</td>
                    <td className="px-3 py-3 text-gray-500">{formatDate(row.transactionDate)}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={row.status === "posted" ? "bg-green-100 text-green-700" : row.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                        {row.status === "posted" ? "مُرحَّل" : row.status === "cancelled" ? "ملغي" : "مسودة"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">{row.fromJournalId ? <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">#{row.fromJournalId}</span> : "—"}</td>
                    <td className="px-3 py-3">{row.toJournalId ? <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">#{row.toJournalId}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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

      {showConsolidation && (
        <Dialog open={showConsolidation} onOpenChange={() => setShowConsolidation(false)}>
          <DialogContent className="max-w-3xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-start">القوائم المالية الموحدة (Consolidation)</DialogTitle>
            </DialogHeader>
          {loadingConsolidation ? (
            <div className="text-center py-8 text-gray-500">جاري تحميل البيانات...</div>
          ) : consolidation ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border bg-blue-50 p-4 text-center">
                  <div className="text-sm text-gray-500">إجمالي الأصول الموحد</div>
                  <div className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalAssets ?? 0)}</div>
                </div>
                <div className="rounded-xl border bg-red-50 p-4 text-center">
                  <div className="text-sm text-gray-500">إجمالي الالتزامات الموحد</div>
                  <div className="text-xl font-bold text-red-700 mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalLiabilities ?? 0)}</div>
                </div>
                <div className="rounded-xl border bg-green-50 p-4 text-center">
                  <div className="text-sm text-gray-500">حقوق الملكية الموحدة</div>
                  <div className="text-xl font-bold text-green-700 mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalEquity ?? 0)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm">
                <span className="font-semibold">مطلوب حذفه (Elimination): </span>
                <span className="font-mono font-bold text-yellow-800">{formatCurrency(consolidation.intercompanyElimination ?? 0)}</span>
                <span className="text-yellow-700 mr-2">— مجموع المعاملات البينية التي تُحذف عند التوحيد</span>
              </div>

              {consolidation.byCompany?.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 text-gray-700">الأداء حسب الشركة</div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-right">الشركة</th>
                          <th className="px-3 py-2 text-right">الإيرادات</th>
                          <th className="px-3 py-2 text-right">المصروفات</th>
                          <th className="px-3 py-2 text-right">صافي الربح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consolidation.byCompany.map((c: any) => (
                          <tr key={c.companyId} className="border-t">
                            <td className="px-3 py-2 font-medium">{c.companyName}</td>
                            <td className="px-3 py-2 text-green-700">{formatCurrency(c.revenue)}</td>
                            <td className="px-3 py-2 text-red-600">{formatCurrency(c.expenses)}</td>
                            <td className={`px-3 py-2 font-semibold ${c.revenue - c.expenses >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(c.revenue - c.expenses)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">جاري تحميل بيانات التوحيد...</div>
          )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
