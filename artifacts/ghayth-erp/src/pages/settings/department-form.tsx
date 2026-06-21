import { useState } from "react";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { useToast } from "@/hooks/use-toast";

export interface DepartmentFormValues {
  name: string;
  branchId: string;
  parentId: string;
  managerId: string;
  status: string;
}

/** The department row the create/edit endpoints return. */
export interface DepartmentRow {
  id: number;
  name: string;
}

/** Minimal shapes the form's entity dropdowns consume. */
interface BranchOption {
  id: number;
  name: string;
}
interface DepartmentOption {
  id: number;
  name: string;
}
interface EmployeeOption {
  id: number;
  name: string;
  empNumber?: string;
}

const EMPTY: DepartmentFormValues = { name: "", branchId: "", parentId: "", managerId: "", status: "active" };

export interface DepartmentFormProps {
  /** Called with the freshly-created department row after a successful create. */
  onCreated?: (created: DepartmentRow) => void;
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
  const { data: branchesResp } = useApiQuery<{ data: BranchOption[] }>(["settings-branches"], "/settings/branches");
  const { data: deptResp } = useApiQuery<{ data: DepartmentOption[] }>(["settings-departments"], "/settings/departments");
  const { data: employeesResp } = useApiQuery<{ data: EmployeeOption[] }>(["employees-list-deps"], "/employees?limit=500");
  const branches = asList<BranchOption>(branchesResp);
  const departments = asList<DepartmentOption>(deptResp);
  const employees = asList<EmployeeOption>(employeesResp);

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
        const res = (await createMut.mutateAsync(payload)) as { data?: DepartmentRow } & Partial<DepartmentRow>;
        const row = (res?.data && res.data.id ? res.data : res) as DepartmentRow;
        toast({ title: "تم إنشاء القسم" });
        onCreated?.(row);
      }
      onSaved?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: err instanceof Error ? err.message : undefined,
      });
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
          {/* حقل مرتبط بكيان حي → اختيار ببحث ذكي (الدستور §5/3)، لا قائمة صمّاء. */}
          <SearchableSelect
            testId="select-dept-branch"
            value={form.branchId}
            onValueChange={(v) => setForm({ ...form, branchId: v })}
            options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
            placeholder="— كل الفروع —"
          />
        </div>
        <div>
          <Label className="text-xs">القسم الأب (اختياري)</Label>
          <SearchableSelect
            testId="select-dept-parent"
            value={form.parentId}
            onValueChange={(v) => setForm({ ...form, parentId: v })}
            options={departments
              .filter((d) => d.id !== editingId) /* prevent self-parent */
              .map((d) => ({ value: String(d.id), label: d.name }))}
            placeholder="— جذر —"
          />
        </div>
        <div>
          <Label className="text-xs">مدير القسم</Label>
          <SearchableSelect
            testId="select-dept-manager"
            value={form.managerId}
            onValueChange={(v) => setForm({ ...form, managerId: v })}
            options={employees.map((e) => ({
              value: String(e.id),
              label: e.empNumber ? `${e.name} (${e.empNumber})` : e.name,
            }))}
            placeholder="— بدون —"
          />
        </div>
        <div>
          <Label className="text-xs">الحالة</Label>
          {/* تعداد ثابت (نشط/غير نشط) وليس حقلًا مرتبطًا بكيان → قائمة بسيطة كافية؛ §5/3 لا ينطبق. */}
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
