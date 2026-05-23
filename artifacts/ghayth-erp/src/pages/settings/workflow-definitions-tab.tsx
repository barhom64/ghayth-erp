import { useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch, useFieldArray } from "react-hook-form";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Workflow, Clock, AlertTriangle, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";

const workflowStepSchema = z.object({
  stepName: z.string().trim().min(1, "اسم الخطوة مطلوب"),
  requiredRole: z.string().min(1),
  slaHours: z.coerce.number().int().nonnegative(),
  autoApproveOnTimeout: z.boolean(),
});

const workflowDefSchema = z.object({
  requestType: z.string().min(1),
  requestTypeLabel: z.string().trim().min(1, "العنوان مطلوب"),
  description: z.string().trim(),
  isReturnable: z.boolean(),
  enableEscalation: z.boolean(),
  defaultSlaHours: z.coerce.number().int().nonnegative(),
  steps: z.array(workflowStepSchema).min(1, "خطوة واحدة على الأقل"),
});
type WorkflowDefForm = z.infer<typeof workflowDefSchema>;

const slaDefSchema = z.object({
  requestType: z.string().min(1),
  warningHours: z.coerce.number().int().nonnegative(),
  deadlineHours: z.coerce.number().int().positive(),
  escalationHours: z.coerce.number().int().nonnegative(),
  autoApproveOnTimeout: z.boolean(),
  escalateTo: z.string().min(1),
});
type SlaDefForm = z.infer<typeof slaDefSchema>;

export function WorkflowDefinitionsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["workflow-definitions"], "/workflows/definitions");
  const { data: slaData, refetch: refetchSla } = useApiQuery<any>(["sla-definitions"], "/workflows/sla-definitions");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSlaForm, setShowSlaForm] = useState(false);

  const REQUEST_TYPES = [
    { value: "leave", label: "إجازة" },
    { value: "purchase_request", label: "طلب شراء" },
    { value: "salary_advance", label: "سلفة" },
    { value: "custody", label: "عهدة" },
    { value: "official_letter", label: "خطاب رسمي" },
    { value: "maintenance", label: "صيانة" },
    { value: "financial_claim", label: "مطالبة مالية" },
    { value: "expense", label: "مصروف" },
    { value: "general", label: "طلب عام" },
  ];

  const ROLES = [
    { value: "manager", label: "المدير المباشر" },
    { value: "hr", label: "الموارد البشرية" },
    { value: "finance", label: "المالية" },
    { value: "director", label: "المدير العام" },
    { value: "owner", label: "المالك" },
    { value: "procurement", label: "المشتريات" },
  ];

  const [formSeed, setFormSeed] = useState<WorkflowDefForm>({
    requestType: "leave",
    requestTypeLabel: "إجازة",
    description: "",
    isReturnable: true,
    enableEscalation: true,
    defaultSlaHours: 48,
    steps: [{ stepName: "موافقة المدير", requiredRole: "manager", slaHours: 48, autoApproveOnTimeout: false }],
  });

  const slaDefaults: SlaDefForm = {
    requestType: "leave",
    warningHours: 24,
    deadlineHours: 48,
    escalationHours: 72,
    autoApproveOnTimeout: false,
    escalateTo: "hr",
  };

  const defs = asList(data?.data ?? data);
  const slas = asList(slaData?.data ?? slaData);

  const slaColumns: DataTableColumn<any>[] = [
    { key: "requestType", header: "النوع", render: (r: any) => REQUEST_TYPES.find(t => t.value === r.requestType)?.label || r.requestType },
    { key: "warningHours", header: "تنبيه", render: (r: any) => `${r.warningHours}س` },
    { key: "deadlineHours", header: "مهلة", render: (r: any) => `${r.deadlineHours}س` },
    { key: "escalationHours", header: "تصعيد", render: (r: any) => `${r.escalationHours}س` },
    { key: "escalateTo", header: "تصعيد إلى", render: (r: any) => ROLES.find(role => role.value === r.escalateTo)?.label || r.escalateTo },
    { key: "autoApproveOnTimeout", header: "تلقائي", render: (r: any) => r.autoApproveOnTimeout ? "نعم" : "لا" },
  ];

  if (isLoading) return <DataTable columns={slaColumns} data={[]} isLoading={true} searchPlaceholder={null} noToolbar />;
  if (isError) return <DataTable columns={slaColumns} data={[]} isError={true} searchPlaceholder={null} noToolbar />;

  const resetForm = () => {
    setFormSeed({
      requestType: "leave", requestTypeLabel: "إجازة", description: "",
      isReturnable: true, enableEscalation: true, defaultSlaHours: 48,
      steps: [{ stepName: "موافقة المدير", requiredRole: "manager", slaHours: 48, autoApproveOnTimeout: false }],
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = async (def: any) => {
    try {
      const detail = await apiFetch(`/workflows/definitions/${def.id}`);
      const d = detail as any;
      setFormSeed({
        requestType: d.requestType,
        requestTypeLabel: d.requestTypeLabel,
        description: d.description || "",
        isReturnable: d.isReturnable,
        enableEscalation: d.enableEscalation,
        defaultSlaHours: d.defaultSlaHours,
        steps: (d.steps || []).map((s: any) => ({
          stepName: s.stepName, requiredRole: s.requiredRole,
          slaHours: s.slaHours, autoApproveOnTimeout: s.autoApproveOnTimeout,
        })),
      });
      setEditingId(d.id);
      setShowForm(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleSave = async (values: WorkflowDefForm) => {
    try {
      if (editingId) {
        await apiFetch(`/workflows/definitions/${editingId}`, {
          method: "PUT", body: JSON.stringify(values),
        });
        toast({ title: "تم التحديث" });
      } else {
        await apiFetch("/workflows/definitions", {
          method: "POST", body: JSON.stringify(values),
        });
        toast({ title: "تمت الإضافة" });
      }
      resetForm();
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  // Replaces window.confirm(). The dialog owns the DELETE and
  // surfaces 409 blockers inline (e.g. workflow has active instances).
  const [deletingDef, setDeletingDef] = useState<{ id: number; label: string } | null>(null);

  const handleSaveSla = async (values: SlaDefForm) => {
    try {
      await apiFetch("/workflows/sla-definitions", {
        method: "POST", body: JSON.stringify(values),
      });
      toast({ title: "تم حفظ إعدادات المهلة" });
      setShowSlaForm(false);
      refetchSla();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Workflow className="h-5 w-5" />
          محرك الإجراءات الموحد
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSlaForm(!showSlaForm)}>
            <Clock className="h-4 w-4 me-1" />{showSlaForm ? "إخفاء" : "إعدادات مستوى الخدمة"}
          </Button>
          <GuardedButton perm="settings:create" size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
            {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />تعريف جديد</>}
          </GuardedButton>
        </div>
      </div>

      {showSlaForm && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />إعدادات المهل الزمنية</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              schema={slaDefSchema}
              defaultValues={slaDefaults}
              submitLabel="حفظ إعدادات مستوى الخدمة"
              onSubmit={async (values) => {
                await handleSaveSla(values);
              }}
            >
              <FormGrid cols={3}>
                <FormSelectField
                  name="requestType"
                  label="نوع الطلب"
                  options={REQUEST_TYPES}
                />
                <FormNumberField name="warningHours" label="تنبيه بعد (ساعة)" />
                <FormNumberField name="deadlineHours" label="المهلة القصوى (ساعة)" />
                <FormNumberField name="escalationHours" label="تصعيد بعد (ساعة)" />
                <FormSelectField
                  name="escalateTo"
                  label="تصعيد إلى"
                  options={ROLES}
                />
                <AutoApproveToggle />
              </FormGrid>
            </FormShell>

            {slas.length > 0 && (
              <div className="mt-4">
                <DataTable
                  columns={slaColumns}
                  data={slas}
                  pageSize={0}
                  noToolbar
                  emptyMessage="لا توجد إعدادات مهل"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <FormShell
              key={editingId ?? "new"}
              schema={workflowDefSchema}
              defaultValues={formSeed}
              submitLabel={editingId ? "تحديث" : "حفظ"}
              onSubmit={async (values) => {
                await handleSave(values);
              }}
            >
              <FormGrid cols={2}>
                <FormSelectField
                  name="requestType"
                  label="نوع الطلب"
                  options={REQUEST_TYPES}
                />
                <FormTextField name="requestTypeLabel" label="العنوان" required />
                <FormTextField name="description" label="الوصف" className="md:col-span-2" />
                <FormNumberField name="defaultSlaHours" label="المهلة الافتراضية (ساعة)" />
                <WorkflowToggles />
              </FormGrid>

            </FormShell>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {defs.map((def: any) => (
          <Card key={def.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-status-info" />
                  <span className="font-semibold">{def.requestTypeLabel}</span>
                  <Badge variant="outline" className="text-xs">{def.requestType}</Badge>
                  <Badge variant={def.isActive ? "default" : "secondary"} className="text-xs">
                    {def.isActive ? "مفعّل" : "معطّل"}
                  </Badge>
                  {def.enableEscalation && <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700">تصعيد</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(def)}><Pencil className="h-4 w-4" /></Button>
                  <GuardedButton perm="settings:create" variant="ghost" size="sm" className="text-status-error" onClick={() => setDeletingDef({ id: def.id, label: def.requestTypeLabel || def.requestType || "—" })}><Trash2 className="h-4 w-4" /></GuardedButton>
                </div>
              </div>
              {def.description && <p className="text-sm text-muted-foreground mb-2">{def.description}</p>}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>المهلة: {def.defaultSlaHours} ساعة</span>
                <span className="mx-1">|</span>
                <span>{def.stepCount || 0} خطوة</span>
                {def.isReturnable && <><span className="mx-1">|</span><span>قابل للإرجاع</span></>}
              </div>
            </CardContent>
          </Card>
        ))}
        {defs.length === 0 && !showForm && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            لا توجد تعريفات إجراءات. أضف تعريفاً جديداً لتبدأ.
          </CardContent></Card>
        )}
      </div>

      <ConfirmDeleteDialog
        open={deletingDef !== null}
        onOpenChange={(v) => { if (!v) setDeletingDef(null); }}
        entity={{
          type: "workflow_definition",
          id: deletingDef?.id ?? 0,
          name: deletingDef?.label ?? "",
        }}
        deletePath={`/workflows/definitions/${deletingDef?.id}`}
        invalidateKeys={[["workflow-definitions"]]}
        successMessage="تم الحذف"
        onDeleted={() => { setDeletingDef(null); refetch(); }}
      />
    </div>
  );
}

// "Auto-approve on timeout" checkbox bound to the boolean field. The
// label-wrapped <input type="checkbox"> mirrors the original DOM —
// no Switch component swap, just RHF wiring.
function AutoApproveToggle() {
  const { setValue } = useFormContext<SlaDefForm>();
  const checked = useWatch<SlaDefForm, "autoApproveOnTimeout">({ name: "autoApproveOnTimeout" });
  return (
    <div className="flex items-end gap-2 pb-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => setValue("autoApproveOnTimeout", e.target.checked, { shouldDirty: true })}
          className="rounded"
        />
        <span className="text-sm">موافقة تلقائية عند التجاوز</span>
      </label>
    </div>
  );
}

// Pair of toggles for the workflow-definition form
// (isReturnable + enableEscalation). The original DOM had them
// inline in the grid with native <input type="checkbox">.
function WorkflowToggles() {
  const { setValue } = useFormContext<WorkflowDefForm>();
  const isReturnable = useWatch<WorkflowDefForm, "isReturnable">({ name: "isReturnable" });
  const enableEscalation = useWatch<WorkflowDefForm, "enableEscalation">({ name: "enableEscalation" });
  return (
    <div className="flex items-center gap-6 pt-6">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(isReturnable)}
          onChange={(e) => setValue("isReturnable", e.target.checked, { shouldDirty: true })}
          className="rounded"
        />
        <span className="text-sm">قابل للإرجاع</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(enableEscalation)}
          onChange={(e) => setValue("enableEscalation", e.target.checked, { shouldDirty: true })}
          className="rounded"
        />
        <span className="text-sm">تصعيد تلقائي</span>
      </label>
    </div>
  );
}

// Dynamic-array editor for `steps`. useFieldArray gives us append/
// remove/swap operations against the RHF state, replacing the old
// imperative `setForm({ ...form, steps: [...] })` helpers.
function StepsEditor({ roles }: { roles: { value: string; label: string }[] }) {
  const { control, register, setValue } = useFormContext<WorkflowDefForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "steps" });
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm">خطوات الموافقة</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => append({ stepName: "", requiredRole: "hr", slaHours: 48, autoApproveOnTimeout: false })}
        >
          <Plus className="h-3 w-3 me-1" />خطوة
        </Button>
      </div>
      <div className="space-y-3">
        {fields.map((field, idx) => (
          <div key={field.id} className="flex items-center gap-3 p-3 bg-surface-subtle rounded-lg">
            <div className="w-8 h-8 rounded-full bg-status-info-surface flex items-center justify-center text-status-info-foreground text-sm font-bold shrink-0">
              {idx + 1}
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
              <Input placeholder="اسم الخطوة" {...register(`steps.${idx}.stepName`)} />
              <select className="border rounded-md p-2" {...register(`steps.${idx}.requiredRole`)}>
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <Input
                type="number"
                placeholder="مهلة (ساعة)"
                {...register(`steps.${idx}.slaHours`, { valueAsNumber: true })}
              />
              <StepAutoApproveToggle idx={idx} setValue={setValue} />
            </div>
            {fields.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-status-error shrink-0"
                onClick={() => remove(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// Per-step auto-approve checkbox. Lives outside the FormGrid → uses
// the same useWatch pattern as WorkflowToggles.
function StepAutoApproveToggle({
  idx,
  setValue,
}: {
  idx: number;
  setValue: ReturnType<typeof useFormContext<WorkflowDefForm>>["setValue"];
}) {
  const path = `steps.${idx}.autoApproveOnTimeout` as const;
  const checked = useWatch<WorkflowDefForm>({ name: path }) as unknown as boolean;
  return (
    <label className="flex items-center gap-1 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => setValue(path, e.target.checked, { shouldDirty: true })}
        className="rounded"
      />
      موافقة تلقائية
    </label>
  );
}
