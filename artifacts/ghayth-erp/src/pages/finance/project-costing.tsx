import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import { Plus, FolderOpen, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppContext } from "@/contexts/app-context";

type Project = {
  id: number;
  ref: string;
  name: string;
  description?: string;
  status: string;
  budget: number;
  actualCost: number;
  budgetRemaining: number;
  startDate?: string;
  endDate?: string;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "نشط", color: "green" },
  completed: { label: "مكتمل", color: "blue" },
  cancelled: { label: "ملغي", color: "red" },
  on_hold: { label: "موقوف", color: "yellow" },
};

export default function ProjectCostingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAddCost, setShowAddCost] = useState(false);
  const [costForm, setCostForm] = useState({ projectId: "", amount: "", description: "", date: new Date().toISOString().split("T")[0], category: "direct" });

  const addCostMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/finance/projects/${payload.projectId}/costs`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-finance"] });
      if (selectedProject) qc.invalidateQueries({ queryKey: ["project-costs", String(selectedProject.id)] });
      toast({ title: "تم تسجيل التكلفة بنجاح" });
      setShowAddCost(false);
      setCostForm({ projectId: "", amount: "", description: "", date: new Date().toISOString().split("T")[0], category: "direct" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    addCostMutation.mutate({ ...costForm, projectId: Number(costForm.projectId), amount: Number(costForm.amount) });
  }

  const { data, isLoading } = useApiQuery<any>(
    ["projects-finance"],
    `/finance/projects${scopeSuffix}`
  );

  const { data: costsData, isLoading: loadingCosts } = useApiQuery<any>(
    ["project-costs", String(selectedProject?.id)],
    selectedProject ? `/finance/projects/${selectedProject.id}/costs` : null,
    { enabled: !!selectedProject }
  );

  const list: Project[] = data?.data ?? data ?? [];

  const totals = list.reduce((acc, p) => ({
    budget: acc.budget + Number(p.budget ?? 0),
    actualCost: acc.actualCost + Number(p.actualCost ?? 0),
  }), { budget: 0, actualCost: 0 });

  const costDetails = costsData?.costs ?? [];
  const costSummary = costsData?.summary ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">تكاليف المشاريع</h2>
          <p className="text-sm text-gray-500 mt-1">متابعة الميزانيات والتكاليف الفعلية لكل مشروع</p>
        </div>
        <Button onClick={() => setShowAddCost(true)} disabled={list.length === 0}>
          <Plus className="h-4 w-4 ml-2" />
          تسجيل تكلفة
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">عدد المشاريع</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{list.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">إجمالي الميزانيات</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(totals.budget)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">إجمالي التكاليف الفعلية</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(totals.actualCost)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">المتبقي الإجمالي</div>
          <div className={`text-2xl font-bold mt-1 ${totals.budget - totals.actualCost >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(totals.budget - totals.actualCost)}</div>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد مشاريع مسجلة</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="bg-gray-50 border-b px-4 py-3 text-xs font-semibold text-gray-500 grid grid-cols-7 gap-2">
                <div>الرقم</div>
                <div>اسم المشروع</div>
                <div>الحالة</div>
                <div>الميزانية</div>
                <div>التكلفة الفعلية</div>
                <div>المتبقي</div>
                <div>الاستخدام</div>
              </div>
              {list.map((row) => {
                const cfg = STATUS_MAP[row.status] ?? { label: row.status, color: "gray" };
                const pct = row.budget > 0 ? Math.min(100, Math.round((row.actualCost / row.budget) * 100)) : 0;
                return (
                  <div key={row.id} className="border-b px-4 py-3 grid grid-cols-7 gap-2 items-center hover:bg-gray-50 text-sm">
                    <div><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{row.ref}</span></div>
                    <div>
                      <button onClick={() => setSelectedProject(row)} className="text-blue-600 hover:underline font-medium text-right">{row.name}</button>
                    </div>
                    <div><Badge variant="outline" className={`bg-${cfg.color}-100 text-${cfg.color}-700`}>{cfg.label}</Badge></div>
                    <div>{formatCurrency(row.budget)}</div>
                    <div>{formatCurrency(row.actualCost)}</div>
                    <div><span className={row.budgetRemaining < 0 ? "text-red-600 font-semibold" : "text-green-700"}>{formatCurrency(row.budgetRemaining)}</span></div>
                    <div>
                      <div className="w-24">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {showAddCost && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddCost(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">تسجيل تكلفة جديدة</h3>
            </div>
            <form onSubmit={handleAddCost} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">المشروع *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" required value={costForm.projectId} onChange={e => setCostForm(f => ({ ...f, projectId: e.target.value }))}>
                  <option value="">-- اختر المشروع --</option>
                  {list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">المبلغ *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" required type="number" min="0.01" step="0.01" value={costForm.amount} onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">التصنيف</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={costForm.category} onChange={e => setCostForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="direct">تكلفة مباشرة</option>
                  <option value="indirect">تكلفة غير مباشرة</option>
                  <option value="overhead">تكاليف عامة</option>
                  <option value="labor">تكاليف عمالة</option>
                  <option value="materials">مواد</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">التاريخ</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" type="date" value={costForm.date} onChange={e => setCostForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">البيان</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف التكلفة" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddCost(false)}>إلغاء</Button>
                <Button type="submit" disabled={addCostMutation.isPending}>
                  {addCostMutation.isPending ? "جاري التسجيل..." : "تسجيل التكلفة"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedProject && (
        <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
          <DialogContent className="max-w-3xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-start">{`تفاصيل المشروع: ${selectedProject.name}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border p-4 text-center">
                  <div className="text-xs text-gray-500">الميزانية</div>
                  <div className="text-lg font-bold text-blue-700 mt-1">{formatCurrency(costSummary.budget ?? selectedProject.budget ?? 0)}</div>
                </div>
                <div className="rounded-xl border p-4 text-center">
                  <div className="text-xs text-gray-500">التكلفة الفعلية</div>
                  <div className="text-lg font-bold text-gray-800 mt-1">{formatCurrency(costSummary.totalCost ?? selectedProject.actualCost ?? 0)}</div>
                </div>
                <div className="rounded-xl border p-4 text-center">
                  <div className="text-xs text-gray-500">المتبقي</div>
                  <div className={`text-lg font-bold mt-1 ${(costSummary.budgetRemaining ?? selectedProject.budgetRemaining ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(costSummary.budgetRemaining ?? selectedProject.budgetRemaining ?? 0)}</div>
                </div>
                <div className="rounded-xl border p-4 text-center">
                  <div className="text-xs text-gray-500">نسبة الاستخدام</div>
                  <div className="text-lg font-bold mt-1">{costSummary.usagePct ?? 0}%</div>
                </div>
              </div>
              {loadingCosts ? (
                <div className="py-6 text-center text-gray-400">جاري التحميل...</div>
              ) : (
                <div className="rounded-xl border overflow-hidden text-sm">
                  <div className="px-4 py-2 bg-gray-50 font-medium">القيود المحاسبية المرتبطة بالمشروع</div>
                  <table className="w-full">
                    <thead className="bg-gray-50 border-t">
                      <tr>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">المرجع</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">البيان</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">التاريخ</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costDetails.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد تكاليف مسجلة لهذا المشروع بعد</td></tr>
                      ) : costDetails.map((c: any) => (
                        <tr key={c.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{c.ref}</td>
                          <td className="px-3 py-2">{c.description}</td>
                          <td className="px-3 py-2 text-gray-500">{formatDate(c.date)}</td>
                          <td className="px-3 py-2 font-semibold">{formatCurrency(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
