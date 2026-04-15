import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Plus, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";

const RISK_LEVEL_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  low: "منخفض", medium: "متوسط", high: "عالٍ", critical: "حرج",
};

const STATUS_MAP: Record<string, string> = {
  open: "مفتوح", mitigated: "مُعالَج", closed: "مغلق",
};

export default function RisksPage() {
  const [projectId, setProjectId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", probability: "3", impact: "3", mitigationPlan: "" });

  const { data: projects } = useApiQuery<any>(["projects-list"], "/projects?limit=100");
  const projectList = asList(projects?.data || projects);

  const { data, refetch } = useApiQuery<any>(
    ["project-risks", projectId],
    `/projects/${projectId}/risks`,
    { enabled: !!projectId }
  );
  const risks = asList(data?.data || data);

  const handleSave = async () => {
    if (!projectId || !form.title) { toast({ title: "اختر المشروع وأدخل عنوان المخاطرة", variant: "destructive" }); return; }
    try {
      await apiFetch(`/projects/${projectId}/risks`, { method: "POST", body: JSON.stringify({
        ...form,
        probability: Number(form.probability),
        impact: Number(form.impact),
      }) });
      toast({ title: "تم تسجيل المخاطرة" });
      setShowForm(false);
      setForm({ title: "", description: "", probability: "3", impact: "3", mitigationPlan: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const handleStatusUpdate = async (riskId: number, status: string) => {
    try {
      await apiFetch(`/projects/risks/${riskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      refetch();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const criticalCount = risks.filter((r: any) => r.riskLevel === "critical").length;
  const highCount = risks.filter((r: any) => r.riskLevel === "high").length;

  return (
    <PageShell
      title="مخاطر المشاريع"
      subtitle="تسجيل وإدارة مخاطر المشاريع وخطط التخفيف"
      breadcrumbs={[{ href: "/projects", label: "المشاريع" }, { label: "مخاطر المشاريع" }]}
      actions={
        <>
          {criticalCount > 0 && <Badge className="bg-red-100 text-red-700">{criticalCount} حرج</Badge>}
          {highCount > 0 && <Badge className="bg-orange-100 text-orange-700">{highCount} عالٍ</Badge>}
          <Button onClick={() => setShowForm(!showForm)} size="sm" disabled={!projectId}>
            <Plus className="w-4 h-4 me-1" /> إضافة مخاطرة
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Label>المشروع:</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="اختر مشروعاً" /></SelectTrigger>
          <SelectContent>
            {projectList.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">مخاطرة جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>عنوان المخاطرة *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="وصف المخاطرة المحتملة" />
            </div>
            <div className="col-span-2">
              <Label>التفاصيل</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>الاحتمالية (1-5)</Label>
              <Select value={form.probability} onValueChange={(v) => setForm({ ...form, probability: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n} — {["ضئيلة","منخفضة","متوسطة","عالية","مرتفعة جداً"][n-1]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الأثر (1-5)</Label>
              <Select value={form.impact} onValueChange={(v) => setForm({ ...form, impact: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n} — {["طفيف","منخفض","متوسط","عالٍ","حرج"][n-1]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>خطة التخفيف</Label>
              <Textarea value={form.mitigationPlan} onChange={(e) => setForm({ ...form, mitigationPlan: e.target.value })} rows={2} placeholder="الإجراءات للحد من هذه المخاطرة" />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={handleSave}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!projectId ? (
        <Card><CardContent className="py-8 text-center text-gray-400">اختر مشروعاً لعرض المخاطر</CardContent></Card>
      ) : risks.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-gray-400">لا توجد مخاطر مسجلة لهذا المشروع</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {risks.map((r: any) => (
            <Card key={r.id} className={`hover:shadow-md border-r-4 ${r.riskLevel === "critical" ? "border-r-red-500" : r.riskLevel === "high" ? "border-r-orange-400" : r.riskLevel === "medium" ? "border-r-yellow-400" : "border-r-green-400"}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    {r.description && <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>}
                  </div>
                  <Badge className={RISK_LEVEL_COLORS[r.riskLevel] || "bg-gray-100 text-gray-600"}>{RISK_LEVEL_LABELS[r.riskLevel] || r.riskLevel}</Badge>
                </div>
                <div className="grid grid-cols-3 text-xs gap-2">
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-lg">{r.probability}</div>
                    <div className="text-gray-500">احتمالية</div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-lg">×</div>
                    <div className="text-gray-500"></div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-lg">{r.impact}</div>
                    <div className="text-gray-500">أثر</div>
                  </div>
                </div>
                {r.mitigationPlan && (
                  <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                    <span className="font-medium">خطة التخفيف: </span>{r.mitigationPlan}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">الدرجة: {r.riskScore}</span>
                  <Select value={r.status} onValueChange={(v) => handleStatusUpdate(r.id, v)}>
                    <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
