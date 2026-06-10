import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreatePageLayout } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Star, TrendingUp, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { HrCreateScaffold } from "@/components/shared/hr-create-scaffold";

interface Competency {
  name: string;
  score: number;
}

const defaultCompetencies: Competency[] = [
  { name: "جودة العمل", score: 0 },
  { name: "الإنتاجية والأداء", score: 0 },
  { name: "الالتزام بالمواعيد", score: 0 },
  { name: "العمل الجماعي", score: 0 },
  { name: "المبادرة والابتكار", score: 0 },
  { name: "التواصل والتعاون", score: 0 },
];

function StarRating({ value, onChange, size = "md" }: { value: number; onChange: (v: number) => void; size?: "sm" | "md" }) {
  const iconSize = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1)}
          className="hover:scale-110 transition-transform"
        >
          <Star className={cn(iconSize, i < value ? "text-yellow-400 fill-yellow-400" : "text-gray-300 hover:text-yellow-200")} />
        </button>
      ))}
    </div>
  );
}

const scoreLabels: Record<number, string> = {
  1: "ضعيف",
  2: "دون المتوقع",
  3: "يلبي التوقعات",
  4: "جيد جداً",
  5: "متميز",
};

const DRAFT_KEY = "hr_performance_create";

export default function PerformanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  const createMut = useApiMutation("/hr/performance", "POST", [["performance"]], {
    successMessage: "تم إضافة التقييم بنجاح",
  });
  const { data: empData, isLoading, isError } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = empData?.data || [];

  // Wave-1/B group 2: form.employeeId holds the EMPLOYEE id; the
  // assignmentId derives from activeAssignmentId at submit (the old
  // form matched on `e.assignmentId || e.id` under one variable —
  // same bug class fixed in group 1).
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    employeeId: "",
    period: "",
    overallScore: 0,
    notes: "",
    strengths: "",
    improvements: "",
    goals: "",
  });
  const [competencies, setCompetencies] = useState<Competency[]>(defaultCompetencies.map((c) => ({ ...c })));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => String(e.id) === form.employeeId),
    [employees, form.employeeId]
  );
  const assignmentId = selectedEmployee?.activeAssignmentId
    ?? selectedEmployee?.assignmentId
    ?? null;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const avgScore = competencies.filter((c) => c.score > 0).length > 0
    ? (competencies.reduce((sum, c) => sum + c.score, 0) / competencies.filter((c) => c.score > 0).length)
    : 0;

  const updateCompetency = (idx: number, score: number) => {
    const updated = [...competencies];
    updated[idx] = { ...updated[idx], score };
    setCompetencies(updated);
  };

  const handleSubmit = () => {
    const firstError = validate({
      employeeId: form.employeeId ? null : "يرجى اختيار الموظف",
      period: form.period ? null : "الفترة مطلوبة",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (!assignmentId) {
      toast({ variant: "destructive", title: "لا يوجد تعيين فعّال لهذا الموظف" });
      return;
    }
    const finalScore = form.overallScore || Math.round(avgScore * 10) / 10;
    createMut.mutate(
      {
        assignmentId: Number(assignmentId),
        period: form.period,
        overallScore: finalScore || undefined,
        notes: [
          form.notes,
          form.strengths ? `نقاط القوة: ${form.strengths}` : "",
          form.improvements ? `مجالات التحسين: ${form.improvements}` : "",
          form.goals ? `الأهداف المستقبلية: ${form.goals}` : "",
          competencies.some((c) => c.score > 0)
            ? `الكفاءات: ${competencies.filter((c) => c.score > 0).map((c) => `${c.name} (${c.score}/5)`).join("، ")}`
            : "",
        ].filter(Boolean).join("\n") || undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/performance");
        },
        onError: (err: any) => {
          setApiError(err);
        },
      },
    );
  };

  return (
    <CreatePageLayout title="تقييم أداء جديد" backPath="/hr/performance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}

      <HrCreateScaffold
        follows="assignment"
        employeeId={form.employeeId}
        onEmployeeChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
        assignmentId={assignmentId ? String(assignmentId) : undefined}
        contextSection="violations"
        selectedEmployee={selectedEmployee}
        detailsSlot={
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField
                label="فترة التقييم"
                required
                value={form.period}
                onChange={(v) => setForm((f) => ({ ...f, period: v }))}
                placeholder="الربع الأول ٢٠٢٦"
                error={fieldErrors.period}
              />
              <FormFieldWrapper label="التقييم العام">
                <div className="flex items-center gap-3">
                  <StarRating value={form.overallScore} onChange={(v) => setForm((f) => ({ ...f, overallScore: v }))} />
                  {form.overallScore > 0 && (
                    <span className={cn(
                      "text-sm font-medium px-2 py-0.5 rounded",
                      form.overallScore >= 4 ? "bg-status-success-surface text-status-success-foreground" :
                      form.overallScore >= 3 ? "bg-status-warning-surface text-status-warning-foreground" :
                      "bg-status-error-surface text-status-error-foreground"
                    )}>
                      {scoreLabels[form.overallScore]}
                    </span>
                  )}
                </div>
              </FormFieldWrapper>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  تقييم الكفاءات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {competencies.map((comp, idx) => (
                    <div key={comp.name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-status-neutral-foreground w-48">{comp.name}</span>
                      <div className="flex items-center gap-3">
                        <StarRating value={comp.score} onChange={(v) => updateCompetency(idx, v)} size="sm" />
                        {comp.score > 0 && <span className="text-xs text-muted-foreground w-20">{scoreLabels[comp.score]}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {avgScore > 0 && (
                  <div className="mt-4 pt-3 border-t flex items-center justify-between">
                    <span className="text-sm font-medium">متوسط الكفاءات</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-lg font-bold",
                        avgScore >= 4 ? "text-status-success-foreground" : avgScore >= 3 ? "text-status-warning-foreground" : "text-status-error-foreground"
                      )}>
                        {avgScore.toFixed(1)}/5
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div>
              <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                التفاصيل والملاحظات
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <TextAreaField label="نقاط القوة" value={form.strengths} onChange={(v) => setForm((f) => ({ ...f, strengths: v }))} placeholder="ما يتميز به الموظف..." rows={2} />
                <TextAreaField label="مجالات التحسين" value={form.improvements} onChange={(v) => setForm((f) => ({ ...f, improvements: v }))} placeholder="المجالات التي تحتاج تطوير..." rows={2} />
                <TextAreaField label="الأهداف المستقبلية" value={form.goals} onChange={(v) => setForm((f) => ({ ...f, goals: v }))} placeholder="الأهداف المتوقعة للفترة القادمة..." rows={2} />
                <TextAreaField label="ملاحظات عامة" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="أي ملاحظات إضافية..." rows={2} />
              </div>
            </div>

            <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التقييم" />
          </div>
        }
        onSubmit={handleSubmit}
        saving={createMut.isPending}
        saveLabel="حفظ التقييم"
        isDirty={Boolean(form.employeeId || form.period)}
      />
    </CreatePageLayout>
  );
}
