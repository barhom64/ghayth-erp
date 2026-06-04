import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Plus, Edit2, X, Wallet, Shield } from "lucide-react";

// Companion to migration 248: lets an HR/admin operator configure the
// defaultRoleKey + opensCustody policy per job title so the
// /employees onboarding flow auto-fills role + auto-opens custody.
// Both fields are nullable / boolean — no role/no custody is the safe
// default; admins explicitly opt-in.
interface JobTitle {
  id: number;
  name: string;
  nameEn?: string | null;
  category?: string | null;
  defaultRoleKey?: string | null;
  opensCustody?: boolean | null;
  isActive?: boolean | null;
}

interface JobTitleForm {
  name: string;
  nameEn: string;
  category: string;
  defaultRoleKey: string;
  opensCustody: boolean;
  isActive: boolean;
}

const defaultForm: JobTitleForm = {
  name: "",
  nameEn: "",
  category: "general",
  defaultRoleKey: "",
  opensCustody: false,
  isActive: true,
};

// Closed list mirrors the role keys seeded in migration 249. Free-text
// is allowed for forward-compat (admins may add custom roles later),
// but the dropdown surfaces the canonical set so spelling matches.
const KNOWN_ROLE_KEYS = [
  { value: "", label: "— لا يوجد دور افتراضي —" },
  { value: "driver", label: "سائق (driver)" },
  { value: "accountant", label: "محاسب (accountant)" },
  { value: "hr_manager", label: "مدير الموارد البشرية (hr_manager)" },
  { value: "general_manager", label: "مدير عام (general_manager)" },
  { value: "sales_rep", label: "مندوب مبيعات (sales_rep)" },
  { value: "cashier", label: "أمين صندوق (cashier)" },
  { value: "warehouse_keeper", label: "أمين مستودع (warehouse_keeper)" },
  { value: "supervisor", label: "مشرف (supervisor)" },
  { value: "employee", label: "موظف (employee)" },
];

export default function JobTitlesAdminPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<JobTitleForm>(defaultForm);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: JobTitle[] }>(
    ["job-titles-admin"],
    "/employees/job-titles",
  );
  const titles = asList(data?.data || data);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  const createMut = useApiMutation<any, JobTitleForm>(
    "/employees/job-titles",
    "POST",
    [["job-titles-admin"], ["job-titles"]],
    { successMessage: "تم إضافة المسمى الوظيفي", onSuccess: resetForm },
  );
  const updateMut = useApiMutation<any, JobTitleForm & { id: number }>(
    (b) => `/employees/job-titles/${b.id}`,
    "PATCH",
    [["job-titles-admin"], ["job-titles"]],
    { successMessage: "تم تحديث المسمى الوظيفي", onSuccess: resetForm },
  );

  const handleSave = async () => {
    const payload = {
      ...form,
      defaultRoleKey: form.defaultRoleKey || null,
    } as any;
    if (editingId) await updateMut.mutateAsync({ ...payload, id: editingId });
    else await createMut.mutateAsync(payload);
  };

  const handleEdit = (t: JobTitle) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      nameEn: t.nameEn || "",
      category: t.category || "general",
      defaultRoleKey: t.defaultRoleKey || "",
      opensCustody: !!t.opensCustody,
      isActive: t.isActive !== false,
    });
    setShowForm(true);
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <PageShell
      title="المسميات الوظيفية"
      subtitle="ربط المسميات الوظيفية بأدوار النظام والعهد التلقائية"
      breadcrumbs={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "المسميات الوظيفية" },
      ]}
      actions={
        <GuardedButton perm="hr:create" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          مسمى جديد
        </GuardedButton>
      }
    >
      <HrTabsNav />

      {showForm && (
        <Card className="mb-4">
          <CardHeader className="pb-3 flex flex-row items-start justify-between">
            <CardTitle className="text-sm">{editingId ? "تعديل مسمى وظيفي" : "إضافة مسمى وظيفي"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">الاسم بالعربية *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">الاسم بالإنجليزية</Label>
              <Input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} dir="ltr" />
            </div>
            <div>
              <Label className="text-xs">التصنيف</Label>
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Shield className="h-3 w-3" />
                الدور الافتراضي في النظام
              </Label>
              <Select value={form.defaultRoleKey || ""} onValueChange={(v) => setForm((f) => ({ ...f, defaultRoleKey: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="— لا يوجد —" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_ROLE_KEYS.map((r) => (
                    <SelectItem key={r.value || "none"} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                سيُسند هذا الدور تلقائياً عند تعيين موظف بهذا المسمى.
              </p>
            </div>
            <div className="md:col-span-2 flex items-start gap-2 border rounded p-3 bg-status-info-surface/30">
              <Checkbox
                id="opensCustody"
                checked={form.opensCustody}
                onCheckedChange={(v) => setForm((f) => ({ ...f, opensCustody: !!v }))}
              />
              <Label htmlFor="opensCustody" className="text-xs cursor-pointer flex-1">
                <span className="font-medium flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  فتح عهدة تلقائياً عند إضافة موظف بهذا المسمى
                </span>
                <span className="block text-muted-foreground text-[11px] mt-0.5">
                  ينشئ حساباً فرعياً تحت رمز 1400 في دليل الحسابات بصلاحية الموظف، يتم تتبّع رصيد العهد عليه.
                </span>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: !!v }))}
              />
              <Label htmlFor="isActive" className="text-xs">نشط</Label>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>إلغاء</Button>
              <Button
                onClick={handleSave}
                disabled={!form.name || createMut.isPending || updateMut.isPending}
                rateLimitAware
              >
                {editingId ? "حفظ التغييرات" : "إضافة"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">المسميات الوظيفية ({titles.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="text-right p-2">الاسم</th>
                  <th className="text-right p-2">الاسم بالإنجليزية</th>
                  <th className="text-right p-2">التصنيف</th>
                  <th className="text-right p-2">الدور الافتراضي</th>
                  <th className="text-right p-2">عهدة تلقائية</th>
                  <th className="text-right p-2">الحالة</th>
                  <th className="text-right p-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {titles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground text-xs">
                      لا توجد مسميات وظيفية مسجلة
                    </td>
                  </tr>
                ) : (
                  titles.map((t: JobTitle) => (
                    <tr key={t.id} className="border-t hover:bg-muted/20">
                      <td className="p-2 font-medium">{t.name}</td>
                      <td className="p-2 text-muted-foreground font-mono text-xs" dir="ltr">{t.nameEn || "-"}</td>
                      <td className="p-2 text-muted-foreground text-xs">{t.category || "-"}</td>
                      <td className="p-2">
                        {t.defaultRoleKey ? (
                          <Badge variant="outline" className="font-mono text-[10px]" dir="ltr">{t.defaultRoleKey}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {t.opensCustody ? (
                          <Badge className="bg-status-success-surface text-status-success-foreground text-[10px]">
                            <Wallet className="h-3 w-3 ml-1" />
                            مفعّل
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">لا</span>
                        )}
                      </td>
                      <td className="p-2">
                        <Badge variant={t.isActive !== false ? "outline" : "secondary"} className="text-[10px]">
                          {t.isActive !== false ? "نشط" : "موقوف"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <GuardedButton
                          perm="hr:update"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(t)}
                          className="gap-1"
                        >
                          <Edit2 className="h-3 w-3" />
                          تعديل
                        </GuardedButton>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
