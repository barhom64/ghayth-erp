import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { Plus } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";

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

export default function ProjectCostingPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showAddCost, setShowAddCost] = useState(false);
  const [costForm, setCostForm] = useState({ projectId: "", amount: "", description: "", date: todayLocal(), category: "direct" });

  const addCostMutation = useApiMutation<any, any>(
    (body) => `/finance/projects/${body.projectId}/costs`,
    "POST",
    [["projects-finance"]],
    {
      successMessage: "تم تسجيل التكلفة بنجاح",
      onSuccess: () => {
        setShowAddCost(false);
        setCostForm({ projectId: "", amount: "", description: "", date: todayLocal(), category: "direct" });
      },
    },
  );

  function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    addCostMutation.mutate({ ...costForm, projectId: Number(costForm.projectId), amount: Number(costForm.amount) });
  }

  const { data, isLoading, isError } = useApiQuery<any>(
    ["projects-finance"],
    `/finance/projects${scopeSuffix}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const list: Project[] = data?.data ?? data ?? [];

  const totals = list.reduce((acc, p) => ({
    budget: acc.budget + Number(p.budget ?? 0),
    actualCost: acc.actualCost + Number(p.actualCost ?? 0),
  }), { budget: 0, actualCost: 0 });

  return (
    <PageShell
      title="تكاليف المشاريع"
      subtitle="متابعة الميزانيات والتكاليف الفعلية لكل مشروع"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تكاليف المشاريع" }]}
      loading={isLoading}
      actions={
        <Button onClick={() => setShowAddCost(true)} disabled={list.length === 0}>
          <Plus className="h-4 w-4 ml-2" />
          تسجيل تكلفة
        </Button>
      }
    >
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
                const pct = row.budget > 0 ? Math.min(100, Math.round((row.actualCost / row.budget) * 100)) : 0;
                return (
                  <div
                    key={row.id}
                    className="border-b px-4 py-3 grid grid-cols-7 gap-2 items-center hover:bg-gray-50 text-sm cursor-pointer"
                    onClick={() => navigate(`/finance/project-costing/${row.id}`)}
                  >
                    <div><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{row.ref}</span></div>
                    <div>
                      <span className="text-blue-600 hover:underline font-medium text-right">{row.name}</span>
                    </div>
                    <div><PageStatusBadge status={row.status} domain="project" /></div>
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
                <Select value={costForm.projectId || "_none"} onValueChange={(v) => setCostForm(f => ({ ...f, projectId: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">-- اختر المشروع --</SelectItem>
                    {list.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">المبلغ *</label>
                <Input type="number" min="0.01" step="0.01" value={costForm.amount} onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">التصنيف</label>
                <Select value={costForm.category} onValueChange={(v) => setCostForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">تكلفة مباشرة</SelectItem>
                    <SelectItem value="indirect">تكلفة غير مباشرة</SelectItem>
                    <SelectItem value="overhead">تكاليف عامة</SelectItem>
                    <SelectItem value="labor">تكاليف عمالة</SelectItem>
                    <SelectItem value="materials">مواد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">التاريخ</label>
                <UnifiedDateInput value={costForm.date} onChange={(iso) => setCostForm(f => ({ ...f, date: iso }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">البيان</label>
                <Textarea rows={2} value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف التكلفة" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddCost(false)}>إلغاء</Button>
                <Button type="submit" disabled={addCostMutation.isPending} rateLimitAware>
                  {addCostMutation.isPending ? "جاري التسجيل..." : "تسجيل التكلفة"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
