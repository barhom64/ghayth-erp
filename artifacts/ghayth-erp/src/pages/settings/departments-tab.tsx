// N1 — Dedicated Departments tab.
//
// Closes N1 from docs/testing/CRITICAL_DEFECTS_REPORT.md. Surfaces the columns
// that already exist in the departments table but the old generic CrudSection
// wasn't showing: parentId (hierarchy), branchId, managerId, status.
//
// The create/edit form body lives in the shared `DepartmentForm` component so
// the SAME full form is reused by the inline `AllowCreateDrawer` opened from
// `DepartmentSelect` — one source of truth, no truncated quick-add. Backend
// supports all fields via /settings/departments (settings.ts POST/PUT/DELETE).
import { useState } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { DepartmentForm, type DepartmentFormValues } from "./department-form";

interface Department {
  id: number;
  name: string;
  parentId: number | null;
  branchId: number | null;
  managerId: number | null;
  status: string;
}

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
  const [editingValues, setEditingValues] = useState<DepartmentFormValues | null>(null);
  const [showForm, setShowForm] = useState(false);

  const branchName = (id: number | null) => branches.find((b: any) => b.id === id)?.name ?? "—";
  const parentName = (id: number | null) => departments.find((d) => d.id === id)?.name ?? "—";
  const empName = (id: number | null) => employees.find((e: any) => e.id === id)?.name ?? "—";

  const resetForm = () => {
    setEditingId(null);
    setEditingValues(null);
    setShowForm(false);
  };

  const deleteDept = async (id: number) => {
    if (!confirm("حذف هذا القسم؟")) return;
    try {
      await apiFetch(`/settings/departments/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      await refetch();
    } catch (err: any) {
      toast({ title: "فشل الحذف", description: err?.message, variant: "destructive" });
    }
  };

  const startEdit = (d: Department) => {
    setEditingId(d.id);
    setEditingValues({
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
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" data-testid={`button-edit-dept-${d.id}`} onClick={() => startEdit(d)}>
            <Edit2 className="h-3 w-3" />
          </Button>
          <GuardedButton perm="settings:update" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteDept(d.id)}>
            <Trash2 className="h-3 w-3" />
          </GuardedButton>
        </div>
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
          <GuardedButton perm="settings:update" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} data-testid="button-toggle-dept-form">
            {showForm ? <><X className="h-4 w-4 me-1" /> إلغاء</> : <><Plus className="h-4 w-4 me-1" /> قسم جديد</>}
          </GuardedButton>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold">{editingId ? "تعديل قسم" : "إضافة قسم جديد"}</h4>
            <DepartmentForm
              editingId={editingId}
              initialValues={editingValues ?? undefined}
              onSaved={() => { resetForm(); refetch(); }}
              onCancel={resetForm}
            />
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
