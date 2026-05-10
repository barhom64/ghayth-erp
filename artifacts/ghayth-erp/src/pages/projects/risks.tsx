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
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const RISK_LEVEL_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  low: "منخفض", medium: "متوسط", high: "عالٍ", critical: "حرج",
};

// Dropdown label lookup only — not a status chip. The canonical status
// source is `STATUS_MAP` in `@/components/page-status-badge`; this file
// uses PageStatusBadge for rendering where applicable.
const RISK_STATUS_LABELS: Record<string, string> = {
  open: "مفتوح", mitigated: "مُعالَج", closed: "مغلق",
};

const STATUS_OPTIONS = Object.entries(RISK_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const RISK_LEVEL_OPTIONS = Object.entries(RISK_LEVEL_LABELS).map(([value, label]) => ({ value, label }));

export default function RisksPage() {
  const [projectId, setProjectId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useFilters();
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

  const filtered = applyFilters(risks, filters, {
    searchFields: ["title", "description", "mitigationPlan"],
    statusField: "status",
    extraFields: { riskLevel: "riskLevel" },
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "title",
      header: "عنوان المخاطرة",
      sortable: true,
      searchable: true,
      render: (r) => (
        <div>
          <div className="font-medium">{r.title}</div>
          {r.description && <div className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{r.description}</div>}
        </div>
      ),
    },
    {
      key: "riskLevel",
      header: "مستوى الخطورة",
      sortable: true,
      render: (r) => (
        <Badge className={RISK_LEVEL_COLORS[r.riskLevel] || "bg-gray-100 text-gray-600"}>
          {RISK_LEVEL_LABELS[r.riskLevel] || r.riskLevel}
        </Badge>
      ),
    },
    {
      key: "probability",
      header: "الاحتمالية",
      sortable: true,
      align: "center",
      render: (r) => (
        <span className="font-bold text-lg">{r.probability}</span>
      ),
    },
    {
      key: "impact",
      header: "الأثر",
      sortable: true,
      align: "center",
      render: (r) => (
        <span className="font-bold text-lg">{r.impact}</span>
      ),
    },
    {
      key: "riskScore",
      header: "الدرجة",
      sortable: true,
      align: "center",
      render: (r) => (
        <Badge variant="outline" className="font-mono">{r.riskScore ?? "-"}</Badge>
      ),
    },
    {
      key: "mitigationPlan",
      header: "خطة التخفيف",
      render: (r) => r.mitigationPlan ? (
        <div className="text-xs text-gray-600 max-w-xs truncate">{r.mitigationPlan}</div>
      ) : <span className="text-gray-400">-</span>,
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Select value={r.status} onValueChange={(v) => handleStatusUpdate(r.id, v)}>
          <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
  ];

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
              <Button onClick={handleSave} rateLimitAware>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!projectId ? (
        <Card><CardContent className="py-8 text-center text-gray-400">اختر مشروعاً لعرض المخاطر</CardContent></Card>
      ) : (
        <>
          <AdvancedFilters
            config={{
              showSearch: true,
              searchPlaceholder: "بحث بالعنوان، الوصف، خطة التخفيف...",
              statuses: STATUS_OPTIONS,
              showDateRange: false,
              extraFilters: [{
                key: "riskLevel",
                label: "مستوى الخطورة",
                options: RISK_LEVEL_OPTIONS,
              }],
            }}
            values={filters}
            onChange={setFilters}
            resultCount={filtered.length}
          />

          <DataTable
            columns={columns}
            data={filtered}
            noToolbar
            emptyMessage="لا توجد مخاطر مسجلة لهذا المشروع"
            emptyIcon={<ShieldAlert className="w-10 h-10 text-gray-300" />}
            rowClassName={(r) => {
              if (r.riskLevel === "critical") return "bg-red-50/30";
              if (r.riskLevel === "high") return "bg-orange-50/30";
              return undefined as any;
            }}
          />
        </>
      )}
    </PageShell>
  );
}
