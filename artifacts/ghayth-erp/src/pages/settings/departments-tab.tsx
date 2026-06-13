// N1 — Dedicated Departments tab.
//
// Closes N1 from docs/testing/CRITICAL_DEFECTS_REPORT.md. Replaces the
// generic 3-field CrudSection at settings.tsx:348 with a full tab that
// surfaces the columns that already exist in the departments table but
// the generic component wasn't showing:
//   - parentId (department hierarchy)
//   - branchId (per-branch ownership)
//   - managerId (assignment-based — picks from employees list)
//   - status (active/inactive)
//
// Backend already supports all these via /settings/departments
// (settings.ts:525+ POST/PUT/DELETE). authorizeAny added in batch5
// means HR Director can also use this tab, not just SysAdmin.
import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Edit2, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";

interface Department {
  id: number;
  name: string;
  parentId: number | null;
  branchId: number | null;
  managerId: number | null;
  status: string;
}

const EMPTY_FORM = { name: "", branchId: "", parentId: "", managerId: "", status: "active" };

export function DepartmentsTab() {
  const { toast } = useToast();
  const { data: deptResp, isLoading, isError, refetch } = useApiQuery<any>(
    ["settings-departments"], "/settings/departments"
  );
  const { data: branchesResp } = useApiQuery<any>(
    ["settings-branches"], "/settings/branches"
  );
  const { data: employeesResp } = useApiQuery<any>(
    ["employees-list-deps"], "/employees?limit=500"
  );

  const departments: Department[] = asList(deptResp);
  const branches: any[] = asList(branchesResp);
  const employees: any[] = asList(employeesResp);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const createMut = useApiMutation("/settings/departments", "POST");
  const submitting = createMut.isPending;

  const branchName = (id: number | null) => branches.find((b: any) => b.id === id)?.name ?? "—";
  const parentName = (id: number | null) => departments.find((d) => d.id === id)?.name ?? "—";
  const empName = (id: number | null) => employees.find((e: any) => e.id === id)?.name ?? "—";

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const submit = async () => {
    try {
      const payload = {
        name: form.name,
        branchId: form.branchId ? Number(form.branchId) : null,
        parentId: form.parentId ? Number(form.parentId) : null,
        managerId: form.managerId ? Number(form.managerId) : null,
        status: form.status,
      };
      if (editingId) {
        await createMut.mutateAsync({ ...payload, _method: "PUT", id: editingId });
        toast({ title: "تم تحديث القسم" });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: "تم إنشاء القسم" });
      }
      resetForm();
      await refetch();
    } catch (err: any) {
      toast({ title: "فشل الحفظ", description: err?.message, variant: "destructive" });
    }
  };

  const startEdit = (d: Department) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      branchId: d.branchId ? String(d.branchId) : "",
      parentId: d.parentId ? String(d.parentId) : "",
      managerId: d.managerId ? String(d.managerId) : "",
      status: d.status || "active",
    });
    setShowForm(true);
  };

  const cols: DataTableColumn<Department>[] = [
    { key: "name", header: "اسم القسم", className: "font-semibold", render: (d) => d.name },
    { key: "parent", header: "القسم الأب", render: (d) => d.parentId ? parentName(d.parentId) : <span className="text-muted-foreground">جذر</span> },
    { key: "branch", header: "الفرع", render: (d) => branchName(d.branchId) },
    { key: "manager", header: "مدير القسم", render: (d) => empName(d.managerId) },
    {
      key: "status",
      header: "الحالة",
      render: (d) => (
        <Badge variant={d.status === "active" ? "default" : "secondary"}>
          {d.status === "active" ? "نشط" : "غير نشط"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (d) => (
        <Button variant="ghost" size="sm" data-testid={`button-edit-dept-${d.id}`} onClick={() => startEdit(d)}>
          <Edit2 className="h-3 w-3" />
        </Button>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" /> الأقسام
          </h3>
          <p className="text-sm text-muted-foreground">
            هيكل تنظيمي بدعم الأقسام الأب-الفرع والربط بالفروع ومدير لكل قسم.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_settings_departments"
            entityId="list"
            size="icon"
            label="طباعة الهيكل التنظيمي"
            payload={() => ({
              entity: { title: "الهيكل التنظيمي — الأقسام", total: departments.length },
              items: departments.map((d) => ({
                "اسم القسم": d.name,
                "القسم الأب": d.parentId ? parentName(d.parentId) : "جذر",
                "الفرع": branchName(d.branchId),
                "مدير القسم": empName(d.managerId),
                "الحالة": d.status === "active" ? "نشط" : "غير نشط",
              })),
            })}
          />
          <GuardedButton perm="settings:update" onClick={() => { setShowForm((v) => !v); if (showForm) resetForm(); }} data-testid="button-toggle-dept-form">
            {showForm ? <><X className="h-4 w-4 me-1" /> إلغاء</> : <><Plus className="h-4 w-4 me-1" /> قسم جديد</>}
          </GuardedButton>
        </div>
      </div>

      {showForm && (
        <Card data-testid="form-department">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold">{editingId ? "تعديل قسم" : "إضافة قسم جديد"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">اسم القسم *</Label>
                <Input data-testid="input-dept-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="إدارة الموارد البشرية" />
              </div>
              <div>
                <Label className="text-xs">الفرع</Label>
                <select
                  data-testid="select-dept-branch"
                  className="w-full h-10 border rounded-md px-2 text-sm"
                  value={form.branchId}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                >
                  <option value="">— كل الفروع —</option>
                  {branches.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">القسم الأب (اختياري)</Label>
                <select
                  data-testid="select-dept-parent"
                  className="w-full h-10 border rounded-md px-2 text-sm"
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                >
                  <option value="">— جذر —</option>
                  {departments
                    .filter((d) => d.id !== editingId) /* prevent self-parent */
                    .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">مدير القسم</Label>
                <select
                  data-testid="select-dept-manager"
                  className="w-full h-10 border rounded-md px-2 text-sm"
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                >
                  <option value="">— بدون —</option>
                  {employees.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.name} {e.empNumber ? `(${e.empNumber})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">الحالة</Label>
                <select
                  data-testid="select-dept-status"
                  className="w-full h-10 border rounded-md px-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={!form.name || submitting} onClick={submit} data-testid="button-submit-dept">
                {submitting ? "جاري الحفظ..." : editingId ? "تحديث" : "إنشاء"}
              </Button>
              <Button variant="outline" onClick={resetForm}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={cols}
        data={departments}
        rowKey={(d) => d.id}
        emptyMessage="لا توجد أقسام بعد. ابدأ بإضافة قسم جذر، ثم أنشئ أقسام فرعية تحته."
        emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
      />
    </div>
  );
}
