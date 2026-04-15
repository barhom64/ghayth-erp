import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Target, Plus, BookOpen, TrendingUp, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";

// HR-U3 — حُذفت STATUS_LABELS المحلية. القيم (planned/in_progress/completed/cancelled)
// مُعرَّفة في STATUS_MAP.shared مع صياغة موحّدة (مخطط/قيد التنفيذ/مكتمل/ملغى).
const IDP_STATUS_KEYS = ["planned", "in_progress", "completed", "cancelled"] as const;

export default function IDPPage() {
  const [showForm, setShowForm] = useState(false);
  const [empFilter, setEmpFilter] = useState("");
  const [form, setForm] = useState({ employeeId: "", title: "", goals: "", skills: "", targetDate: "", notes: "" });

  const { data, refetch } = useApiQuery<any>(
    ["idp", empFilter],
    `/hr/idp${empFilter ? `?employeeId=${empFilter}` : ""}`
  );
  const plans = asList(data?.data || data);

  const { data: employees } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const employeeList = asList(employees?.data || employees);

  // HR-U2 — useApiMutation للأخطاء المُكتَبة وتوحيد رسائل النجاح.
  const createIdpMut = useApiMutation("/hr/idp", "POST", [["idp"]], {
    successMessage: "تم إنشاء خطة التطوير",
  });
  const updateIdpStatusMut = useApiMutation<unknown, { id: number; status: string }>(
    (b) => `/hr/idp/${b.id}`,
    "PATCH",
    [["idp"]],
    { successMessage: "تم تحديث الحالة" },
  );

  const handleSave = () => {
    if (!form.employeeId) { toast({ title: "الموظف مطلوب", variant: "destructive" }); return; }
    const payload = {
      ...form,
      goals: form.goals ? form.goals.split("\n").filter(Boolean) : [],
      skills: form.skills ? form.skills.split("\n").filter(Boolean) : [],
    };
    createIdpMut.mutate(payload, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ employeeId: "", title: "", goals: "", skills: "", targetDate: "", notes: "" });
        refetch();
      },
    });
  };

  const handleStatusUpdate = (id: number, status: string) => {
    updateIdpStatusMut.mutate({ id, status }, { onSuccess: () => refetch() });
  };

  const stats = {
    total: plans.length,
    inProgress: plans.filter((p: any) => p.status === "in_progress").length,
    completed: plans.filter((p: any) => p.status === "completed").length,
  };

  return (
    <PageShell
      title="خطط التطوير الفردي"
      subtitle="تخطيط مسارات التطوير والنمو الوظيفي للموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "خطط التطوير الفردي" }]}
      actions={
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> خطة جديدة
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-gray-500">إجمالي الخطط</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div><div className="text-xs text-gray-500">جارية</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold text-green-600">{stats.completed}</div><div className="text-xs text-gray-500">مكتملة</div></CardContent></Card>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">خطة تطوير جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>الموظف *</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
                <SelectContent>
                  {employeeList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>عنوان الخطة</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="خطة التطوير الفردي لـ..." />
            </div>
            <div className="col-span-2">
              <Label>الأهداف (سطر لكل هدف)</Label>
              <Textarea value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} placeholder="هدف 1&#10;هدف 2&#10;هدف 3" rows={4} />
            </div>
            <div className="col-span-2">
              <Label>المهارات المستهدفة (سطر لكل مهارة)</Label>
              <Textarea value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="مهارة 1&#10;مهارة 2" rows={3} />
            </div>
            <div>
              <Label>التاريخ المستهدف</Label>
              <Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={handleSave}>حفظ الخطة</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 items-center">
        <Label className="text-sm">تصفية بالموظف:</Label>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="الكل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">الكل</SelectItem>
            {employeeList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-gray-400">لا توجد خطط تطوير</div>
        ) : plans.map((plan: any) => {
          const goals = Array.isArray(plan.goals) ? plan.goals : (typeof plan.goals === "string" ? JSON.parse(plan.goals || "[]") : []);
          const skills = Array.isArray(plan.skills) ? plan.skills : (typeof plan.skills === "string" ? JSON.parse(plan.skills || "[]") : []);
          return (
            <Card key={plan.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{plan.title || "خطة التطوير الفردي"}</div>
                    <div className="text-sm text-gray-500">{plan.employeeName}</div>
                  </div>
                  <PageStatusBadge status={plan.status} />
                </div>
                {goals.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> الأهداف</div>
                    <ul className="text-xs text-gray-600 space-y-0.5">
                      {goals.slice(0, 3).map((g: string, i: number) => <li key={i} className="flex gap-1"><span className="text-primary">•</span>{g}</li>)}
                      {goals.length > 3 && <li className="text-gray-400">+{goals.length - 3} أهداف أخرى</li>}
                    </ul>
                  </div>
                )}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((s: string, i: number) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>)}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {plan.targetDate && <span className="text-xs text-gray-400">الهدف: {plan.targetDate?.split("T")[0]}</span>}
                  <Select value={plan.status} onValueChange={(v) => handleStatusUpdate(plan.id, v)}>
                    <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IDP_STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{resolveStatus(k)?.label ?? k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
