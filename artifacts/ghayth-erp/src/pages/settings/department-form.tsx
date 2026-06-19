import { useState } from "react";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export interface DepartmentFormValues {
  name: string;
  branchId: string;
  parentId: string;
  managerId: string;
  status: string;
}

const EMPTY: DepartmentFormValues = { name: "", branchId: "", parentId: "", managerId: "", status: "active" };

export interface DepartmentFormProps {
  /** Called with the freshly-created department row after a successful create. */
  onCreated?: (created: any) => void;
  /** Called after any successful save (create OR edit) — host refetch/reset. */
  onSaved?: () => void;
  /** Called when the operator cancels (إلغاء). */
  onCancel: () => void;
  /** Edit mode (the settings tab only); omit/undefined for create (drawer). */
  editingId?: number | null;
  /** Initial values, used when editing an existing department. */
  initialValues?: Partial<DepartmentFormValues>;
}

/**
 * The unified department create/edit form body — shared by the Settings
 * «الأقسام» tab (DepartmentsTab) and the inline `AllowCreateDrawer` opened
 * from `DepartmentSelect`. Owns its own state + mutation so an inline create
 * is identical to the tab create: the FULL form (name + branch + parent
 * hierarchy + manager + status), never a truncated quick-add.
 */
export function DepartmentForm({
  onCreated,
  onSaved,
  onCancel,
  editingId = null,
  initialValues,
}: DepartmentFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<DepartmentFormValues>({ ...EMPTY, ...initialValues });
  const [submitting, setSubmitting] = useState(false);
  const createMut = useApiMutation("/settings/departments", "POST", [["settings-departments"]]);

  // Same query keys as the tab + selector so React Query shares one cache
  // entry (no duplicate network round-trips).
  const { data: branchesResp } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const { data: deptResp } = useApiQuery<any>(["settings-departments"], "/settings/departments");
  const { data: employeesResp } = useApiQuery<any>(["employees-list-deps"], "/employees?limit=500");
  const branches: any[] = asList(branchesResp);
  const departments: any[] = asList(deptResp);
  const employees: any[] = asList(employeesResp);

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "اسم القسم مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        branchId: form.branchId ? Number(form.branchId) : null,
        parentId: form.parentId ? Number(form.parentId) : null,
        managerId: form.managerId ? Number(form.managerId) : null,
        status: form.status,
      };
      if (editingId) {
        await apiFetch(`/settings/departments/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "تم تحديث القسم" });
      } else {
        const res: any = await createMut.mutateAsync(payload);
        const row = res?.data && res.data.id ? res.data : res;
        toast({ title: "تم إنشاء القسم" });
        onCreated?.(row);
      }
      onSaved?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="form-department">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">اسم القسم *</Label>
          <Input
            data-testid="input-dept-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="إدارة الموارد البشرية"
          />
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
              .filter((d: any) => d.id !== editingId) /* prevent self-parent */
              .map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
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
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}
