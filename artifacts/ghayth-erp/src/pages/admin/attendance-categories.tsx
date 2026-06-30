// ════════════════════════════════════════════════════════════════════════════
// HR-015 — Attendance Categories admin (#1799 priority #6 closure)
//
// قبل: الـ 6 system categories من migration 270 موجودة لكن لا UI لإدارتها
// أو إنشاء overrides per company — التعديل كان يحتاج SQL مباشر.
// بعد: شاشة admin تعرض الـ 6 categories + جدول overrides + form لإنشاء/تعديل
// override لأي category. يستهلك /org/employee-categories (read) +
// /org/attendance-policies-per-category (CRUD).
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
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Trash2, Users, Clock, Shield, AlertTriangle } from "lucide-react";

interface EmployeeCategory {
  id: number;
  companyId: number | null;
  categoryKey: string;
  labelAr: string;
  labelEn?: string | null;
  description?: string | null;
  color?: string | null;
  displayOrder: number;
  exemptFromAutoDeduction: boolean;
  trackingFrequencySeconds: number;
  isActive: boolean;
  isSystem: boolean;
}

interface PolicyOverride {
  id: number;
  categoryKey: string;
  categoryLabelAr?: string;
  categoryExempt?: boolean;
  lateThresholdMinutes?: number | null;
  gracePeriodMinutes?: number | null;
  gpsRadiusMeters?: number | null;
  penaltyLevel1?: number | null;
  penaltyLevel2?: number | null;
  penaltyLevel3?: number | null;
  penaltyLevel4?: number | null;
  penaltyLevel5?: number | null;
  autoDeductionEnabled?: boolean | null;
  trackingFrequencySeconds?: number | null;
}

// PR-3 (#2077) — write permission moved from `admin:update` to
// `hr.attendance:update` to match the new backend gate on
// /org/attendance-policies-per-category. The HR Manager surfaces the
// page from /hr/attendance-categories; their role grants hr.attendance
// but not admin:*, so the old key hid the buttons from the new caller.
const PERM_WRITE = "hr.attendance:update";
const EMPTY_FORM = {
  categoryKey: "",
  lateThresholdMinutes: "",
  gracePeriodMinutes: "",
  gpsRadiusMeters: "",
  penaltyLevel1: "",
  penaltyLevel2: "",
  penaltyLevel3: "",
  penaltyLevel4: "",
  penaltyLevel5: "",
  autoDeductionEnabled: "inherit" as "inherit" | "true" | "false",
  trackingFrequencySeconds: "",
};

function numOrNull(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export default function AttendanceCategoriesPage() {
  const { toast } = useToast();
  // PR-3 (#2077) — the page is mounted at BOTH /admin/attendance-categories
  // (back-compat alias) and /hr/attendance-categories (new canonical HR
  // path). The breadcrumb shape switches accordingly so the parent crumb
  // matches the user's navigation lane and clicking it returns them
  // to the right module home.
  const [location] = useLocation();
  const onHrRoute = location.startsWith("/hr/");
  const { data: catData, isLoading: lCat } = useApiQuery<{ data: EmployeeCategory[] }>(
    ["employee-categories"], "/org/employee-categories",
  );
  const { data: ovrData, isLoading: lOvr, isError, refetch } = useApiQuery<{ data: PolicyOverride[] }>(
    ["attendance-policies-per-category"], "/org/attendance-policies-per-category",
  );
  const categories = asList<EmployeeCategory>(catData?.data || []);
  const overrides = asList<PolicyOverride>(ovrData?.data || []);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const save = async () => {
    if (!form.categoryKey) { toast({ title: "اختر الفئة", variant: "destructive" }); return; }
    try {
      const body: any = {
        categoryKey: form.categoryKey,
        lateThresholdMinutes: numOrNull(form.lateThresholdMinutes),
        gracePeriodMinutes: numOrNull(form.gracePeriodMinutes),
        gpsRadiusMeters: numOrNull(form.gpsRadiusMeters),
        penaltyLevel1: numOrNull(form.penaltyLevel1),
        penaltyLevel2: numOrNull(form.penaltyLevel2),
        penaltyLevel3: numOrNull(form.penaltyLevel3),
        penaltyLevel4: numOrNull(form.penaltyLevel4),
        penaltyLevel5: numOrNull(form.penaltyLevel5),
        trackingFrequencySeconds: numOrNull(form.trackingFrequencySeconds),
      };
      if (form.autoDeductionEnabled === "true") body.autoDeductionEnabled = true;
      else if (form.autoDeductionEnabled === "false") body.autoDeductionEnabled = false;
      await apiFetch("/org/attendance-policies-per-category", {
        method: "POST", body: JSON.stringify(body),
      });
      toast({ title: "تم حفظ الـ override" });
      setShowForm(false);
      setForm(EMPTY_FORM);
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل الحفظ", variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا الـ override؟ (الفئة ستعود لـ system default)")) return;
    try {
      await apiFetch(`/org/attendance-policies-per-category/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const isLoading = lCat || lOvr;
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const catColumns: DataTableColumn<EmployeeCategory>[] = [
    { key: "labelAr", header: "الفئة", render: (c) => (
      <div>
        <div className="font-medium flex items-center gap-2">
          {c.color && <span className="inline-block w-3 h-3 rounded-full" style={{ background: c.color }} />}
          {c.labelAr}
        </div>
        <div className="text-xs text-muted-foreground font-mono">{c.categoryKey}</div>
      </div>
    )},
    { key: "exemptFromAutoDeduction", header: "مُعفى من الخصم؟", render: (c) =>
      c.exemptFromAutoDeduction
        ? <Badge variant="default" className="gap-1"><Shield className="h-3 w-3" /> نعم</Badge>
        : <span className="text-muted-foreground text-xs">لا</span>
    },
    { key: "trackingFrequencySeconds", header: "تردد التتبع GPS", render: (c) => (
      c.trackingFrequencySeconds === 0
        ? <Badge variant="outline" className="text-xs">لا يُتتبع</Badge>
        : <span className="font-mono text-xs">كل {c.trackingFrequencySeconds}s</span>
    )},
    { key: "isSystem", header: "نوع", render: (c) =>
      c.isSystem ? <Badge variant="secondary" className="text-xs">نظام</Badge>
                 : <Badge variant="outline" className="text-xs">شركة</Badge>
    },
  ];

  const ovrColumns: DataTableColumn<PolicyOverride>[] = [
    { key: "categoryLabelAr", header: "الفئة", render: (o) => (
      <div>
        <div className="font-medium">{o.categoryLabelAr || o.categoryKey}</div>
        <div className="text-xs text-muted-foreground font-mono">{o.categoryKey}</div>
      </div>
    )},
    { key: "lateThresholdMinutes", header: "حد التأخر (د)", render: (o) =>
      o.lateThresholdMinutes != null ? <span className="font-mono">{o.lateThresholdMinutes}</span> : <span className="text-muted-foreground text-xs">—</span>
    },
    { key: "gpsRadiusMeters", header: "نطاق GPS (م)", render: (o) =>
      o.gpsRadiusMeters != null ? <span className="font-mono">{o.gpsRadiusMeters}</span> : <span className="text-muted-foreground text-xs">—</span>
    },
    { key: "autoDeductionEnabled", header: "خصم تلقائي", render: (o) => {
      if (o.autoDeductionEnabled === true) return <Badge variant="destructive" className="text-xs">مُفعَّل</Badge>;
      if (o.autoDeductionEnabled === false) return <Badge variant="default" className="text-xs">مُعطَّل</Badge>;
      return <span className="text-muted-foreground text-xs">يرث</span>;
    }},
    { key: "trackingFrequencySeconds", header: "تتبع (s)", render: (o) =>
      o.trackingFrequencySeconds != null ? <span className="font-mono">{o.trackingFrequencySeconds}</span> : <span className="text-muted-foreground text-xs">—</span>
    },
    { key: "actions", header: "", render: (o) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => remove(o.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  // Categories the user can override (non-system AND active).
  const overridable = categories.filter((c) => c.isActive);

  return (
    <PageShell
      title="فئات الموظفين وسياسات الحضور"
      subtitle="إدارة فئات النظام الست + إنشاء تخصيصات لكل شركة"
      breadcrumbs={onHrRoute ? [
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/attendance-policy", label: "سياسة الحضور" },
        { label: "فئات الحضور" },
      ] : [
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/admin", label: "الإدارة" },
        { label: "فئات الحضور" },
      ]}
    >
      {onHrRoute && <HrTabsNav />}
      {/* System categories — read-only summary */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            فئات الموظفين ({categories.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable data={categories} columns={catColumns} pageSize={10} noToolbar emptyMessage="لا توجد فئات" />
          <p className="text-xs text-muted-foreground mt-2">
            الفئات الـ6 الأولى نظام (seeded في migration 270). لا يمكن تعديلها من هنا — استعمل overrides أدناه لتغيير سلوكها لشركتك.
          </p>
        </CardContent>
      </Card>

      {/* Per-company overrides */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Overrides خاصة بالشركة ({overrides.length})
          </CardTitle>
          {!showForm ? (
            <GuardedButton perm={PERM_WRITE} onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 me-1" /> override جديد
            </GuardedButton>
          ) : (
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
              <X className="h-4 w-4 me-1" /> إلغاء
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showForm && (
            <Card className="mb-4 border-status-info-surface">
              <CardContent className="p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>الفئة *</Label>
                    <Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="اختر فئة" /></SelectTrigger>
                      <SelectContent>
                        {overridable.map((c) => (
                          <SelectItem key={c.id} value={c.categoryKey}>
                            {c.labelAr} ({c.categoryKey})
                            {c.exemptFromAutoDeduction && " — system: مُعفى"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>الخصم التلقائي</Label>
                    <Select value={form.autoDeductionEnabled} onValueChange={(v) => setForm({ ...form, autoDeductionEnabled: v as any })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">يرث من system</SelectItem>
                        <SelectItem value="true">فرض تفعيله</SelectItem>
                        <SelectItem value="false">فرض تعطيله</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>حد التأخر (دقائق)</Label>
                    <Input type="number" min={0} placeholder="مثل: 10" value={form.lateThresholdMinutes} onChange={(e) => setForm({ ...form, lateThresholdMinutes: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>فترة سماح (دقائق)</Label>
                    <Input type="number" min={0} value={form.gracePeriodMinutes} onChange={(e) => setForm({ ...form, gracePeriodMinutes: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>نطاق GPS (متر)</Label>
                    <Input type="number" min={0} value={form.gpsRadiusMeters} onChange={(e) => setForm({ ...form, gpsRadiusMeters: e.target.value })} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">سلّم الخصومات (مستويات 1→5، خصم لكل مرة تأخر)</Label>
                  <div className="grid gap-2 grid-cols-2 md:grid-cols-5 mt-1">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <div key={lvl}>
                        <Label className="text-xs text-muted-foreground">مستوى {lvl}</Label>
                        <Input
                          type="number" step="0.5" min={0}
                          value={(form as any)[`penaltyLevel${lvl}`]}
                          onChange={(e) => setForm({ ...form, [`penaltyLevel${lvl}`]: e.target.value } as any)}
                          className="mt-1 font-mono"
                          placeholder="يرث"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>تردد التتبع GPS (ثانية، 0 = لا تتبع)</Label>
                  <Input type="number" min={0} max={3600} value={form.trackingFrequencySeconds} onChange={(e) => setForm({ ...form, trackingFrequencySeconds: e.target.value })} className="mt-1 max-w-xs" />
                  <p className="text-xs text-muted-foreground mt-1">السائقون: 30s، الميدانيون: 300s، المكتبيون والمدراء: 0</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>
                    اترك أي حقل فارغًا ليرث من الـ system default. هذا UPSERT — إذا
                    كان هناك override موجود لنفس الفئة، سيُستبدل.
                  </span>
                </div>
                <div className="flex justify-end">
                  <GuardedButton perm={PERM_WRITE} onClick={save}>حفظ override</GuardedButton>
                </div>
              </CardContent>
            </Card>
          )}
          <DataTable data={overrides} columns={ovrColumns} pageSize={10} noToolbar emptyMessage="لا توجد overrides — الفئات تعمل بـ system defaults." />
        </CardContent>
      </Card>
    </PageShell>
  );
}
