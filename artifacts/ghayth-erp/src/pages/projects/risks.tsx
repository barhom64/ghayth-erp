import { useState } from "react";
import { z } from "zod";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Plus, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";

// New: probability + impact were strings ("1".."5") and Number()-coerced
// at submit. Now zod coerces and bounds them — invalid combos can't
// even submit. The schema rejects probability=0 or impact=6.
const riskSchema = z.object({
  title: z.string().trim().min(1, "عنوان المخاطرة مطلوب"),
  description: z.string().trim(),
  probability: z.coerce.number().int().min(1, "1 على الأقل").max(5, "5 على الأكثر"),
  impact: z.coerce.number().int().min(1, "1 على الأقل").max(5, "5 على الأكثر"),
  mitigationPlan: z.string().trim(),
});
type RiskForm = z.infer<typeof riskSchema>;
const defaultRiskForm: RiskForm = {
  title: "",
  description: "",
  probability: 3,
  impact: 3,
  mitigationPlan: "",
};
const PROBABILITY_OPTIONS = [
  { value: "1", label: "1 — ضئيلة" },
  { value: "2", label: "2 — منخفضة" },
  { value: "3", label: "3 — متوسطة" },
  { value: "4", label: "4 — عالية" },
  { value: "5", label: "5 — مرتفعة جداً" },
];
const IMPACT_OPTIONS = [
  { value: "1", label: "1 — طفيف" },
  { value: "2", label: "2 — منخفض" },
  { value: "3", label: "3 — متوسط" },
  { value: "4", label: "4 — عالٍ" },
  { value: "5", label: "5 — حرج" },
];

const RISK_LEVEL_COLORS: Record<string, string> = {
  low: "bg-status-success-surface text-status-success-foreground",
  medium: "bg-status-warning-surface text-status-warning-foreground",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-status-error-surface text-status-error-foreground",
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

  const { data: projects } = useApiQuery<any>(["projects-list"], "/projects?limit=100");
  const projectList = asList(projects?.data || projects);

  const { data, refetch } = useApiQuery<any>(
    ["project-risks", projectId],
    `/projects/${projectId}/risks`,
    { enabled: !!projectId }
  );
  const risks = asList(data?.data || data);

  const handleSave = async (values: RiskForm) => {
    if (!projectId) { toast({ title: "اختر المشروع أولاً", variant: "destructive" }); return; }
    try {
      // Schema already coerced probability/impact to numbers — body is
      // typed RiskForm so no extra Number() casts needed.
      await apiFetch(`/projects/${projectId}/risks`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ title: "تم تسجيل المخاطرة" });
      setShowForm(false);
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
          {r.description && <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{r.description}</div>}
        </div>
      ),
    },
    {
      key: "riskLevel",
      header: "مستوى الخطورة",
      sortable: true,
      render: (r) => (
        <Badge className={RISK_LEVEL_COLORS[r.riskLevel] || "bg-surface-subtle text-muted-foreground"}>
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
        <div className="text-xs text-muted-foreground max-w-xs truncate">{r.mitigationPlan}</div>
      ) : <span className="text-muted-foreground">-</span>,
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
          {criticalCount > 0 && <Badge className="bg-status-error-surface text-status-error-foreground">{criticalCount} حرج</Badge>}
          {highCount > 0 && <Badge className="bg-orange-100 text-orange-700">{highCount} عالٍ</Badge>}
          <GuardedButton perm="projects:create" onClick={() => setShowForm(!showForm)} size="sm" disabled={!projectId}>
            <Plus className="w-4 h-4 me-1" /> إضافة مخاطرة
          </GuardedButton>
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
          <CardContent>
            <FormShell
              schema={riskSchema}
              defaultValues={defaultRiskForm}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                await handleSave(values);
                ctx.reset();
              }}
            >
              <FormGrid cols={2}>
                <FormTextField name="title" label="عنوان المخاطرة" required className="col-span-2" placeholder="وصف المخاطرة المحتملة" />
                <FormTextareaField name="description" label="التفاصيل" rows={2} className="col-span-2" />
                <FormSelectField name="probability" label="الاحتمالية (1-5)" options={PROBABILITY_OPTIONS} />
                <FormSelectField name="impact" label="الأثر (1-5)" options={IMPACT_OPTIONS} />
                <FormTextareaField name="mitigationPlan" label="خطة التخفيف" rows={2} className="col-span-2" placeholder="الإجراءات للحد من هذه المخاطرة" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      {!projectId ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">اختر مشروعاً لعرض المخاطر</CardContent></Card>
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
              if (r.riskLevel === "critical") return "bg-status-error-surface";
              if (r.riskLevel === "high") return "bg-orange-50/30";
              return undefined as any;
            }}
          />
        </>
      )}
    </PageShell>
  );
}
