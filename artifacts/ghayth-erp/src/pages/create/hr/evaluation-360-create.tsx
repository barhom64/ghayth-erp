import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Plus, X, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";

const DRAFT_KEY = "hr_evaluation_360_create";
const DRAFT_STORAGE = `erp_draft_${DRAFT_KEY}`;

const evaluationSchema = z.object({
  employeeId: z.string().min(1, "الموظف مطلوب"),
  period: z.string().trim().min(1, "الفترة مطلوبة"),
  notes: z.string().trim(),
});
type EvaluationForm = z.infer<typeof evaluationSchema>;

// Load draft from localStorage at module level so the first render
// already has the persisted values. Falls back to empty defaults.
function loadDraft(): EvaluationForm {
  try {
    const stored = localStorage.getItem(DRAFT_STORAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        employeeId: String(parsed.employeeId ?? ""),
        period: String(parsed.period ?? ""),
        notes: String(parsed.notes ?? ""),
      };
    }
  } catch {}
  return { employeeId: "", period: "", notes: "" };
}

export default function Evaluation360Create() {
  const [, setLocation] = useLocation();
  const { scopeQueryString } = useAppContext();
  const [initialDraft] = useState(loadDraft);
  const [hasDraft, setHasDraft] = useState(() => {
    try { return Boolean(localStorage.getItem(DRAFT_STORAGE)); } catch { return false; }
  });

  const createMut = useApiMutation<unknown, {
    employeeId: number;
    period: string;
    notes?: string;
    participants: { evaluatorId: number; evaluatorRole: "manager" | "peer" }[];
  }>("/hr/evaluation-cycles", "POST", [["evaluation-cycles"]], {
    successMessage: "تم بدء دورة التقييم بنجاح",
  });

  const { data: empResp, isLoading, isError } = useApiQuery<any>(["employees-list", scopeQueryString], `/employees?${scopeQueryString || ""}&limit=500`);
  const employees = asList(empResp);

  // Participants list lives outside FormShell — it's a dynamic
  // array seeded by an unrelated picker UI, not part of the
  // submitted-form schema. Same pattern as documents-upload's
  // entityLinks (#344).
  const [participants, setParticipants] = useState<{ evaluatorId: string; evaluatorRole: "manager" | "peer"; name: string }[]>([]);
  const [addingParticipant, setAddingParticipant] = useState({ evaluatorId: "", evaluatorRole: "peer" as "manager" | "peer" });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const addParticipant = () => {
    if (!addingParticipant.evaluatorId) return;
    if (participants.some(p => p.evaluatorId === addingParticipant.evaluatorId)) return;
    const emp = employees.find((e: any) => String(e.id) === addingParticipant.evaluatorId);
    setParticipants([...participants, {
      evaluatorId: addingParticipant.evaluatorId,
      evaluatorRole: addingParticipant.evaluatorRole,
      name: emp?.name || "",
    }]);
    setAddingParticipant({ evaluatorId: "", evaluatorRole: "peer" });
  };

  const removeParticipant = (id: string) => setParticipants(participants.filter(p => p.evaluatorId !== id));

  const clearDraftFromStorage = () => {
    try { localStorage.removeItem(DRAFT_STORAGE); } catch {}
    setHasDraft(false);
  };

  const handleSave = async (values: EvaluationForm) => {
    await createMut.mutateAsync({
      employeeId: Number(values.employeeId),
      period: values.period,
      notes: values.notes || undefined,
      participants: participants.map(p => ({
        evaluatorId: Number(p.evaluatorId),
        evaluatorRole: p.evaluatorRole,
      })),
    });
    clearDraftFromStorage();
    setLocation("/hr/evaluation-360");
  };

  return (
    <CreatePageLayout
      title="بدء دورة تقييم جديدة"
      subtitle="تقييم 360° — تقييم شامل متعدد الأطراف"
      backPath="/hr/evaluation-360"
      isDirty={Boolean(initialDraft.employeeId || initialDraft.period)}
    >
      <FormShell
        schema={evaluationSchema}
        defaultValues={initialDraft}
        submitLabel="بدء دورة التقييم"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/evaluation-360")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <DraftPersist
          onSaved={() => setHasDraft(true)}
        />
        <div className="space-y-6">
          <CreationDateField />
          {hasDraft && (
            <div className="flex items-center gap-2 p-3 bg-status-info-surface border border-status-info-surface rounded-lg text-sm text-status-info-foreground">
              <Info className="h-4 w-4 shrink-0" />
              <span>تم استعادة مسودة سابقة — يمكنك متابعة التعبئة أو مسحها</span>
              <ClearDraftButton onClear={clearDraftFromStorage} />
            </div>
          )}
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
              <Star className="h-5 w-5 text-status-warning" /> بيانات التقييم
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormSelectField
                  name="employeeId"
                  label="الموظف"
                  required
                  options={[
                    { value: "", label: "اختر الموظف" },
                    ...employees.map((e: any) => ({ value: String(e.id), label: e.name })),
                  ]}
                />
                <FormTextField
                  name="period"
                  label="الفترة"
                  required
                  placeholder="مثال: الربع الأول ٢٠٢٦"
                />
              </div>
              <EmployeeContextOnSelected />
              <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات اختيارية..." rows={3} />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold">المقيِّمون (مدراء وزملاء)</h3>
            <p className="text-xs text-muted-foreground mb-3">أضف من سيُشاركون في تقييم هذا الموظف — يمكن تخطي هذه الخطوة وإضافتهم لاحقاً</p>
            <div className="space-y-4">
              <div className="flex gap-2">
                <ParticipantPicker
                  employees={employees}
                  value={addingParticipant.evaluatorId}
                  onChange={(v) => setAddingParticipant({ ...addingParticipant, evaluatorId: v })}
                />
                <Select value={addingParticipant.evaluatorRole} onValueChange={v => setAddingParticipant({ ...addingParticipant, evaluatorRole: v as "manager" | "peer" })}>
                  <SelectTrigger className="w-28 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">مدير</SelectItem>
                    <SelectItem value="peer">زميل</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={addParticipant} className="gap-1">
                  <Plus className="w-4 h-4" /> إضافة
                </Button>
              </div>
              {participants.length > 0 && (
                <div className="space-y-1">
                  {participants.map(p => (
                    <div key={p.evaluatorId} className="flex items-center justify-between bg-surface-subtle rounded px-3 py-2 text-sm">
                      <span>{p.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {p.evaluatorRole === "manager" ? "مدير" : "زميل"}
                        </Badge>
                        <button type="button" onClick={() => removeParticipant(p.evaluatorId)} className="text-red-400 hover:text-status-error-foreground">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-status-info-surface rounded-lg p-3 text-sm text-status-info-foreground">
                عند بدء الدورة سيتولد تلقائياً <strong>تقرير أداء آلي</strong> يشمل: الحضور، إنجاز المهام، الالتزام بالمواعيد، رضا العملاء وجودة التوثيق.
              </div>
            </div>
          </div>
        </div>
      </FormShell>
    </CreatePageLayout>
  );
}

// Debounced auto-draft persistence subcomponent. Replaces the
// useAutoDraft hook's localStorage write loop. Subscribes to all
// form values via useWatch and writes a JSON snapshot to
// localStorage after `debounceMs` of quiet — same behaviour as the
// hook, just driven by RHF state instead of useState.
function DraftPersist({ onSaved, debounceMs = 1000 }: { onSaved: () => void; debounceMs?: number }) {
  const values = useWatch<EvaluationForm>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!values || (!values.employeeId && !values.period && !values.notes)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE, JSON.stringify(values));
        onSaved();
      } catch {}
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [values, debounceMs, onSaved]);
  return null;
}

// Standalone "clear draft" button — uses useFormContext to reset
// the form alongside clearing localStorage.
function ClearDraftButton({ onClear }: { onClear: () => void }) {
  const { reset } = useFormContext<EvaluationForm>();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={() => { onClear(); reset({ employeeId: "", period: "", notes: "" }); }}
      className="mr-auto text-xs"
    >
      مسح المسودة
    </Button>
  );
}

// Renders the EmployeeContextCard only when an employee is picked.
// Reads the selected id via useWatch so the card appears/disappears
// without a parent re-render.
function EmployeeContextOnSelected() {
  const employeeId = useWatch<EvaluationForm, "employeeId">({ name: "employeeId" });
  if (!employeeId) return null;
  return (
    <div className="mt-3">
      <EmployeeContextCard employeeId={employeeId} section="violations" />
    </div>
  );
}

// Filters the picker to exclude the currently-selected target
// employee (you don't evaluate yourself).
function ParticipantPicker({
  employees,
  value,
  onChange,
}: {
  employees: any[];
  value: string;
  onChange: (v: string) => void;
}) {
  const targetEmployeeId = useWatch<EvaluationForm, "employeeId">({ name: "employeeId" });
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="flex-1 text-sm"><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
      <SelectContent>
        {employees
          .filter((e: any) => String(e.id) !== targetEmployeeId)
          .map((e: any) => (
            <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
