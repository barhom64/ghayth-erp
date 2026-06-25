import { useState } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn, PageStatusBadge } from "@workspace/ui-core";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Wallet, Trash2 } from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════
// قوالب المسميات الوظيفية — كل مسمّى = قالب دور (#1413 §6، الخطة الجذرية §3 م2)
//
// يربط كل مسمّى وظيفي بدوره الافتراضي (job_titles.defaultRoleKey) وسياسة العهدة
// (opensCustody)، فيُفعَّل الموظف الجديد بدوره الصحيح تلقائيًا عند الإنشاء عبر
// /admin/onboard. يستهلك الموجود فقط:
//   GET/POST  /employees/job-titles      ·  PATCH /employees/job-titles/:id
//   GET       /rbac/v2/roles             (لقائمة الأدوار الافتراضية)
// لا نظام جديد، لا تكرار.
// ════════════════════════════════════════════════════════════════════════════

interface JobTitle {
  id: number;
  name: string;
  category?: string | null;
  defaultRoleKey?: string | null;
  opensCustody?: boolean;
  isActive?: boolean;
  companyId?: number | null;
}
interface RbacRole { id: number; role_key: string; label_ar: string }

const NO_ROLE = "__none__";
const EMPTY = { id: 0, name: "", category: "general", defaultRoleKey: "", opensCustody: false, isActive: true };

export default function JobTitlesPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["admin-job-titles"], "/employees/job-titles");
  const titles = asList(data?.data || data) as JobTitle[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(titles);

  const { data: rolesData } = useApiQuery<{ data: RbacRole[] }>(["rbac-roles"], "/rbac/v2/roles");
  const roles = rolesData?.data ?? [];
  const roleLabel = (key?: string | null) => (key ? roles.find((r) => r.role_key === key)?.label_ar || key : null);

  const open = (jt?: JobTitle) => {
    if (jt) {
      setForm({
        id: jt.id,
        name: jt.name,
        category: jt.category || "general",
        defaultRoleKey: jt.defaultRoleKey || "",
        opensCustody: Boolean(jt.opensCustody),
        isActive: jt.isActive !== false,
      });
      setEditing(true);
    } else {
      setForm(EMPTY);
      setEditing(false);
    }
    setShowForm(true);
  };

  const close = () => { setShowForm(false); setForm(EMPTY); setEditing(false); };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "اسم المسمّى مطلوب", variant: "destructive" }); return; }
    const body = {
      name: form.name.trim(),
      category: form.category || "general",
      defaultRoleKey: form.defaultRoleKey || null,
      opensCustody: form.opensCustody,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await apiFetch(`/employees/job-titles/${form.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "تم تحديث المسمّى" });
      } else {
        await apiFetch("/employees/job-titles", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "تم إنشاء المسمّى" });
      }
      close();
      refetch();
    } catch (err: any) {
      toast({ title: err?.message || "تعذّر الحفظ", variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("هل تريد حذف هذا المسمّى الوظيفي؟ (سيُعطَّل ولن يظهر للموظفين الجدد)")) return;
    try {
      await apiFetch(`/employees/job-titles/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف المسمّى" });
      refetch();
    } catch (err: any) {
      toast({ title: err?.message || "تعذّر الحذف", variant: "destructive" });
    }
  };

  const columns: DataTableColumn<JobTitle>[] = [
    { key: "name", header: "المسمّى الوظيفي", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", header: "الفئة", render: (r) => r.category || "—" },
    {
      key: "defaultRoleKey", header: "الدور الافتراضي",
      render: (r) => r.defaultRoleKey
        ? <Badge variant="secondary">{roleLabel(r.defaultRoleKey)}</Badge>
        : <span className="text-muted-foreground text-xs">— لا يُفعَّل دور تلقائيًا —</span>,
    },
    {
      key: "opensCustody", header: "حساب عهدة",
      render: (r) => r.opensCustody ? <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" /> نعم</Badge> : <span className="text-muted-foreground">—</span>,
    },
    { key: "isActive", header: "الحالة", render: (r) => <PageStatusBadge status={r.isActive !== false ? "active" : "inactive"} /> },
    {
      key: "actions", header: "",
      render: (r) => (
        <div className="flex gap-1">
          <GuardedButton perm="hr.employees:update" variant="ghost" size="sm" className="h-7 px-2" onClick={() => open(r)}>
            <Pencil className="h-3.5 w-3.5 me-1" /> تعديل
          </GuardedButton>
          <GuardedButton perm="hr.employees:delete" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => remove(r.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="قوالب المسميات الوظيفية"
      subtitle="اربط كل مسمّى وظيفي بدوره الافتراضي وسياسة العهدة — ليُفعَّل الموظف الجديد تلقائيًا"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/admin", label: "الإدارة" }, { label: "قوالب المسميات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_admin_job_titles"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "قوالب المسميات الوظيفية", total: printRows.length },
              items: printRows.map((r: any) => ({
                "المسمّى الوظيفي": r.name,
                "الفئة": r.category || "—",
                "الدور الافتراضي": roleLabel(r.defaultRoleKey) || "—",
                "حساب عهدة": r.opensCustody ? "نعم" : "—",
                "الحالة": r.isActive !== false ? "نشط" : "غير نشط",
              })),
            })}
          />
          {!showForm ? (
            <GuardedButton perm="hr.employees:create" onClick={() => open()}>
              <Plus className="h-4 w-4 me-1" /> مسمّى جديد
            </GuardedButton>
          ) : (
            <Button variant="outline" onClick={close}><X className="h-4 w-4 me-1" /> إلغاء</Button>
          )}
        </div>
      }
    >
      {showForm && (
        <Card className="mb-4 border-status-info-surface">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editing ? "تعديل مسمّى وظيفي" : "مسمّى وظيفي جديد"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>اسم المسمّى *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثال: محاسب، سائق، مدير فرع" className="mt-1" />
              </div>
              <div>
                <Label>الفئة</Label>
                <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="general" className="mt-1" />
              </div>
              <div>
                <Label>الدور الافتراضي (يُفعَّل تلقائيًا للموظف الجديد)</Label>
                <Select value={form.defaultRoleKey || NO_ROLE} onValueChange={(v) => setForm((f) => ({ ...f, defaultRoleKey: v === NO_ROLE ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— بدون دور افتراضي —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>— بدون دور افتراضي —</SelectItem>
                    {roles.map((r) => <SelectItem key={r.id} value={r.role_key}>{r.label_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">عند إنشاء موظف بهذا المسمّى يُمنح هذا الدور تلقائيًا (يمكن للمشرف إضافة أدوار أخرى).</p>
              </div>
              <div className="flex flex-col justify-center gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.opensCustody} onChange={(e) => setForm((f) => ({ ...f, opensCustody: e.target.checked }))} className="accent-status-info" />
                  يفتح حساب عهدة للموظف تلقائيًا
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="accent-status-info" />
                  مفعّل
                </label>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <GuardedButton perm={editing ? "hr.employees:update" : "hr.employees:create"} onClick={save}>حفظ</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable columns={columns} data={titles} onSortedDataChange={setPrintRows} emptyMessage="لا توجد مسميات وظيفية بعد — أضف أول مسمّى لربطه بدور افتراضي" />
    </PageShell>
  );
}
