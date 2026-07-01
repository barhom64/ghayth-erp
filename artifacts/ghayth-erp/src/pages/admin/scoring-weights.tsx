// ════════════════════════════════════════════════════════════════════════════
// HR-020 — Scoring Weights admin (#1799 §F.10 closure)
//
// قبل: الأوزان الستة (20/15/35/15/10/5) hardcoded في employeeScoringEngine.ts —
// كل شركة بنفس الأوزان، لا تخصيص.
// بعد: شاشة admin تسمح بإعادة توزيع الأوزان لكل شركة (company default)
// أو لكل category داخل الشركة (سائقون vs مكتبيون). يتم validation للمجموع =1
// قبل الحفظ. صفحة الـ ranking تعرض ترتيب الموظفين حسب composite score.
//
// تستهلك endpoints الـ org.ts:
//   GET    /org/scoring-weights        — قائمة الـ overrides الموجودة
//   POST   /org/scoring-weights        — UPSERT (keyed on companyId + categoryKey)
//   DELETE /org/scoring-weights/:id
//   GET    /org/scoring-ranking        — Top N employees by composite
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Sliders, TrendingUp, AlertTriangle } from "lucide-react";

interface WeightRow {
  id: number;
  categoryKey: string | null;
  disciplineWeight: number;
  activityWeight: number;
  productivityWeight: number;
  qualityWeight: number;
  managerWeight: number;
  developmentWeight: number;
  updatedAt: string;
}

interface RankingRow {
  id: number;
  employeeId: number;
  employeeName: string;
  jobTitle: string;
  rank: number;
  compositeScore: number;
  trend: number;
  disciplineScore: number;
  activityScore: number;
  productivityScore: number;
  qualityScore: number;
  managerScore: number;
  developmentScore: number;
}

interface EmployeeCategory {
  categoryKey: string;
  labelAr: string;
  isSystem: boolean;
}

const DEFAULT_FORM = {
  categoryKey: "__company__" as string,
  discipline: "0.200",
  activity: "0.150",
  productivity: "0.350",
  quality: "0.150",
  manager: "0.100",
  development: "0.050",
};

// PR-4 (#2077) — same shift as PR-3 did for attendance-categories:
// page is HR-domain (drives the institutional scoring engine's per-
// category weights). Moving the GuardedButton key to hr.employees:update
// so the new HR-side mount at /hr/scoring-weights shows the buttons
// for the HR Manager whose role grants `hr.employees:update` but not
// `admin:*`. Backend gates on /org/scoring-weights were flipped to the
// same key in routes/org.ts.
const PERM_WRITE = "hr.employees:update";

function WeightsTab() {
  const { toast } = useToast();
  const { data: weightsData, refetch, isLoading, isError } = useApiQuery<{ data: WeightRow[] }>(
    ["scoring-weights"], "/org/scoring-weights",
  );
  const { data: catData } = useApiQuery<{ data: EmployeeCategory[] }>(
    ["categories-for-weights"], "/org/employee-categories",
  );
  const overrides = asList<WeightRow>(weightsData?.data || []);
  const categories = asList<EmployeeCategory>(catData?.data || []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_FORM });

  const sum =
    Number(form.discipline) + Number(form.activity) + Number(form.productivity)
    + Number(form.quality) + Number(form.manager) + Number(form.development);
  const sumOk = Math.abs(sum - 1) < 0.001;

  const save = async () => {
    if (!sumOk) {
      toast({ title: `مجموع الأوزان يجب = 1.0 (الحالي: ${sum.toFixed(3)})`, variant: "destructive" });
      return;
    }
    try {
      await apiFetch("/org/scoring-weights", {
        method: "POST",
        body: JSON.stringify({
          categoryKey: form.categoryKey === "__company__" ? null : form.categoryKey,
          disciplineWeight: Number(form.discipline),
          activityWeight: Number(form.activity),
          productivityWeight: Number(form.productivity),
          qualityWeight: Number(form.quality),
          managerWeight: Number(form.manager),
          developmentWeight: Number(form.development),
        }),
      });
      toast({ title: "تم حفظ الأوزان" });
      setShowForm(false);
      setForm({ ...DEFAULT_FORM });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا الـ override؟ الفئة ستعود لـ defaults")) return;
    try {
      await apiFetch(`/org/scoring-weights/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<WeightRow>[] = [
    { key: "categoryKey", header: "النطاق", render: (w) =>
      w.categoryKey
        ? <Badge variant="outline">فئة: {w.categoryKey}</Badge>
        : <Badge variant="default">الشركة كاملة</Badge>
    },
    { key: "disciplineWeight", header: "انضباط", render: (w) => <span className="font-mono">{(Number(w.disciplineWeight) * 100).toFixed(1)}%</span> },
    { key: "activityWeight", header: "نشاط", render: (w) => <span className="font-mono">{(Number(w.activityWeight) * 100).toFixed(1)}%</span> },
    { key: "productivityWeight", header: "إنتاجية", render: (w) => <span className="font-mono">{(Number(w.productivityWeight) * 100).toFixed(1)}%</span> },
    { key: "qualityWeight", header: "جودة", render: (w) => <span className="font-mono">{(Number(w.qualityWeight) * 100).toFixed(1)}%</span> },
    { key: "managerWeight", header: "تقييم مدير", render: (w) => <span className="font-mono">{(Number(w.managerWeight) * 100).toFixed(1)}%</span> },
    { key: "developmentWeight", header: "تطوير ذاتي", render: (w) => <span className="font-mono">{(Number(w.developmentWeight) * 100).toFixed(1)}%</span> },
    { key: "actions", header: "", render: (w) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => remove(w.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 text-xs flex items-start gap-2 bg-status-info-surface">
          <Sliders className="h-4 w-4 mt-0.5 text-status-info-foreground" />
          <div>
            الأوزان الافتراضية: <code className="font-mono">انضباط 20% · نشاط 15% · إنتاجية 35% · جودة 15% · تقييم مدير 10% · تطوير 5%</code>.
            إذا لم يوجد override لشركتك، يُستخدم الافتراضي. الـ override بفئة محددة يتغلب على الـ override العام للشركة.
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        {!showForm ? (
          <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 me-1" /> override جديد
          </GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => { setShowForm(false); setForm({ ...DEFAULT_FORM }); }}>إلغاء</Button>
        )}
      </div>

      {showForm && (
        <Card className="border-status-info-surface">
          <CardHeader className="pb-2"><CardTitle className="text-base">override الأوزان</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">النطاق</Label>
              <Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}>
                <SelectTrigger className="mt-1 max-w-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__company__">الشركة كاملة (default لكل الفئات)</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.categoryKey} value={c.categoryKey}>
                      فئة: {c.labelAr} ({c.categoryKey})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { k: "discipline", label: "انضباط" },
                { k: "activity", label: "نشاط" },
                { k: "productivity", label: "إنتاجية" },
                { k: "quality", label: "جودة" },
                { k: "manager", label: "تقييم المدير" },
                { k: "development", label: "تطوير ذاتي" },
              ].map((d) => (
                <div key={d.k}>
                  <Label className="text-xs">{d.label}</Label>
                  <Input
                    type="number" step="0.001" min={0} max={1}
                    value={(form as any)[d.k]}
                    onChange={(e) => setForm({ ...form, [d.k]: e.target.value } as any)}
                    className="mt-1 font-mono"
                  />
                </div>
              ))}
            </div>
            <div className={`text-xs rounded p-2 flex items-center gap-2 ${sumOk ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}`}>
              {sumOk
                ? <>✓ المجموع = <code className="font-mono">{sum.toFixed(3)}</code> (صحيح)</>
                : <><AlertTriangle className="h-4 w-4" /> المجموع = <code className="font-mono">{sum.toFixed(3)}</code> — يجب أن يساوي 1.000 بالضبط</>
              }
            </div>
            <div className="flex justify-end">
              <GuardedButton perm={PERM_WRITE} onClick={save} disabled={!sumOk}>حفظ</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">overrides النشطة ({overrides.length})</CardTitle></CardHeader>
        <CardContent>
          <DataTable data={overrides} columns={columns} pageSize={10} noToolbar emptyMessage="لا توجد overrides — كل الفئات تستعمل الـ defaults." />
        </CardContent>
      </Card>
    </div>
  );
}

function RankingTab() {
  const [scope, setScope] = useState<"weekly" | "monthly" | "quarterly">("monthly");
  const { data, isLoading, isError } = useApiQuery<{ data: RankingRow[]; periodKey: string | null; message?: string }>(
    ["scoring-ranking", scope], `/org/scoring-ranking?scope=${scope}&limit=100`,
  );
  const rows = asList<RankingRow>(data?.data || []);

  const scoreClass = (s: number): string => {
    if (s >= 85) return "text-emerald-700 font-bold";
    if (s >= 70) return "text-status-info-foreground font-semibold";
    if (s >= 50) return "text-amber-700";
    return "text-status-error-foreground font-semibold";
  };

  const columns: DataTableColumn<RankingRow>[] = [
    { key: "rank", header: "#", render: (r) => (
      <span className={r.rank <= 3 ? "font-bold text-amber-600" : "font-mono"}>{r.rank}</span>
    )},
    { key: "employeeName", header: "الموظف", render: (r) => (
      <div>
        <div className="font-medium">{r.employeeName}</div>
        <div className="text-xs text-muted-foreground">{r.jobTitle}</div>
      </div>
    )},
    { key: "compositeScore", header: "النتيجة", render: (r) => (
      <span className={scoreClass(Number(r.compositeScore))}>
        {Math.round(Number(r.compositeScore))}
        {r.trend === 1 ? " ↑" : r.trend === -1 ? " ↓" : ""}
      </span>
    )},
    { key: "disciplineScore", header: "انضباط", render: (r) => <span className="font-mono text-xs">{Math.round(Number(r.disciplineScore))}</span> },
    { key: "activityScore", header: "نشاط", render: (r) => <span className="font-mono text-xs">{Math.round(Number(r.activityScore))}</span> },
    { key: "productivityScore", header: "إنتاجية", render: (r) => <span className="font-mono text-xs">{Math.round(Number(r.productivityScore))}</span> },
    { key: "qualityScore", header: "جودة", render: (r) => <span className="font-mono text-xs">{Math.round(Number(r.qualityScore))}</span> },
    { key: "managerScore", header: "مدير", render: (r) => <span className="font-mono text-xs">{Math.round(Number(r.managerScore))}</span> },
    { key: "developmentScore", header: "تطوير", render: (r) => <span className="font-mono text-xs">{Math.round(Number(r.developmentScore))}</span> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label className="text-xs">النطاق الزمني</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">أسبوعي</SelectItem>
            <SelectItem value="monthly">شهري</SelectItem>
            <SelectItem value="quarterly">ربعي</SelectItem>
          </SelectContent>
        </Select>
        {data?.periodKey && (
          <Badge variant="secondary" className="font-mono">{data.periodKey}</Badge>
        )}
        <span className="text-xs text-muted-foreground">{rows.length} موظف</span>
      </div>

      {data?.message ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{data.message}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-3">
            <DataTable data={rows} columns={columns} pageSize={50} noToolbar emptyMessage="لا توجد بيانات تقييم لهذه الفترة." />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ScoringWeightsPage() {
  // PR-4 (#2077) — the page is mounted at /admin/scoring-weights
  // (back-compat) and /hr/scoring-weights (new canonical HR mount).
  // Same path-aware breadcrumb trick as the attendance-categories page
  // so the parent crumb tracks the user's actual navigation lane.
  const [location] = useLocation();
  const onHrRoute = location.startsWith("/hr/");
  return (
    <PageShell
      title="أوزان التقييم وترتيب الموظفين"
      subtitle="تخصيص أوزان الأبعاد الستة + عرض ترتيب الموظفين حسب الدرجة المركّبة (HR-020)"
      breadcrumbs={onHrRoute ? [
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/hr", label: "الموارد البشرية" },
        { label: "أوزان التقييم" },
      ] : [
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/admin", label: "الإدارة" },
        { label: "أوزان التقييم" },
      ]}
    >
      {onHrRoute && <HrTabsNav />}
      <Tabs defaultValue="weights" className="w-full">
        <TabsList>
          <TabsTrigger value="weights" className="gap-2"><Sliders className="h-4 w-4" /> الأوزان</TabsTrigger>
          <TabsTrigger value="ranking" className="gap-2"><TrendingUp className="h-4 w-4" /> الترتيب</TabsTrigger>
        </TabsList>
        <TabsContent value="weights" className="mt-4"><WeightsTab /></TabsContent>
        <TabsContent value="ranking" className="mt-4"><RankingTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
