import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Star, Plus, X, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "hr_evaluation_360_create";

export default function Evaluation360Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { scopeQueryString } = useAppContext();

  const createMut = useApiMutation("/hr/evaluation-cycles", "POST", [["evaluation-360"]], {
    successMessage: "تم بدء دورة التقييم بنجاح",
  });

  const { data: empResp, isLoading, isError } = useApiQuery<any>(["employees-list", scopeQueryString], `/employees?${scopeQueryString || ""}&limit=500`);
  const employees = asList(empResp);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    employeeId: "",
    period: "",
    notes: "",
  });

  const [participants, setParticipants] = useState<{ evaluatorId: string; evaluatorRole: "manager" | "peer"; name: string }[]>([]);
  const [addingParticipant, setAddingParticipant] = useState({ evaluatorId: "", evaluatorRole: "peer" as "manager" | "peer" });
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

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

  const handleSave = () => {
    const firstError = validate({
      employeeId: form.employeeId ? null : "الموظف مطلوب",
      period: form.period ? null : "الفترة مطلوبة",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate(
      {
        employeeId: Number(form.employeeId),
        period: form.period,
        notes: form.notes || undefined,
        participants: participants.map(p => ({
          evaluatorId: Number(p.evaluatorId),
          evaluatorRole: p.evaluatorRole,
        })),
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/evaluation-360");
        },
        onError: (err: any) => {
          setApiError(err);
        },
      },
    );
  };

  return (
    <CreatePageLayout
      title="بدء دورة تقييم جديدة"
      subtitle="تقييم 360° — تقييم شامل متعدد الأطراف"
      backPath="/hr/evaluation-360"
      isDirty={Boolean(form.employeeId || form.period)}
    >
      <div className="space-y-6">
        <CreationDateField />
        {hasDraft && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <Info className="h-4 w-4 shrink-0" />
            <span>تم استعادة مسودة سابقة — يمكنك متابعة التعبئة أو مسحها</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearDraft} className="mr-auto text-xs">
              مسح المسودة
            </Button>
          </div>
        )}
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
            <Star className="h-5 w-5 text-amber-500" /> بيانات التقييم
          </h3>
          <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormFieldWrapper label="الموظف" required error={fieldErrors.employeeId}>
              <Select value={form.employeeId} onValueChange={v => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField
              label="الفترة"
              required
              placeholder="مثال: الربع الأول ٢٠٢٦"
              value={form.period}
              onChange={(v) => setForm({ ...form, period: v })}
              error={fieldErrors.period}
            />
          </div>
          {form.employeeId && (
            <div className="mt-3">
              <EmployeeContextCard employeeId={form.employeeId} section="violations" />
            </div>
          )}
          <TextAreaField label="ملاحظات" placeholder="ملاحظات اختيارية..." value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={3} />
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold">المقيِّمون (مدراء وزملاء)</h3>
          <p className="text-xs text-gray-400 mb-3">أضف من سيُشاركون في تقييم هذا الموظف — يمكن تخطي هذه الخطوة وإضافتهم لاحقاً</p>
          <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={addingParticipant.evaluatorId} onValueChange={v => setAddingParticipant({ ...addingParticipant, evaluatorId: v })}>
              <SelectTrigger className="flex-1 text-sm"><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
              <SelectContent>
                {employees
                  .filter((e: any) => String(e.id) !== form.employeeId)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
                <div key={p.evaluatorId} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                  <span>{p.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {p.evaluatorRole === "manager" ? "مدير" : "زميل"}
                    </Badge>
                    <button type="button" onClick={() => removeParticipant(p.evaluatorId)} className="text-red-400 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            عند بدء الدورة سيتولد تلقائياً <strong>تقرير أداء آلي</strong> يشمل: الحضور، إنجاز المهام، الالتزام بالمواعيد، رضا العملاء وجودة التوثيق.
          </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/evaluation-360")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={createMut.isPending} className="gap-2" rateLimitAware>
          <Save className="h-4 w-4" /> {createMut.isPending ? "جارٍ البدء..." : "بدء دورة التقييم"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
