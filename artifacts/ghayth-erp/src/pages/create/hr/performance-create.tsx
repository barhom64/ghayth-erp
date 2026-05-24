import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Label } from "@/components/ui/label";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Star, Target, TrendingUp, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { EmployeeSelect } from "@/components/shared/entity-selects";

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

const schema = z.object({
  assignmentId: z.string().min(1, "يرجى اختيار الموظف"),
  period: z.string().min(1, "الفترة مطلوبة"),
  overallScore: z.number(),
  notes: z.string(),
  strengths: z.string(),
  improvements: z.string(),
  goals: z.string(),
});

function OverallScoreField() {
  const { control } = useFormContext();
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">التقييم العام</Label>
      <Controller
        name="overallScore"
        control={control}
        render={({ field }) => (
          <div className="flex items-center gap-3">
            <StarRating value={Number(field.value) || 0} onChange={field.onChange} />
            {Number(field.value) > 0 && (
              <span className={cn(
                "text-sm font-medium px-2 py-0.5 rounded",
                Number(field.value) >= 4 ? "bg-status-success-surface text-status-success-foreground" :
                Number(field.value) >= 3 ? "bg-status-warning-surface text-status-warning-foreground" :
                "bg-status-error-surface text-status-error-foreground",
              )}>
                {scoreLabels[Number(field.value)]}
              </span>
            )}
          </div>
        )}
      />
    </div>
  );
}

function EmployeeContext({ employees }: { employees: any[] }) {
  const { watch } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const selectedEmployee = employees.find(
    (e: any) => String(e.assignmentId || e.id) === assignmentId,
  );
  if (!selectedEmployee) return null;
  return (
    <div className="mt-4">
      <EmployeeContextCard employeeId={selectedEmployee.id} section="violations" />
    </div>
  );
}

export default function PerformanceCreate() {
  const [, setLocation] = useLocation();
  const createMut = useApiMutation("/hr/performance", "POST", [["performance"]], {
    successMessage: "تم إضافة التقييم بنجاح",
  });
  const { data: empData, isLoading, isError } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const [competencies, setCompetencies] = useState<Competency[]>(defaultCompetencies.map((c) => ({ ...c })));
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const employees = empData?.data || [];

  const avgScore = competencies.filter((c) => c.score > 0).length > 0
    ? (competencies.reduce((sum, c) => sum + c.score, 0) / competencies.filter((c) => c.score > 0).length)
    : 0;

  const updateCompetency = (idx: number, score: number) => {
    const updated = [...competencies];
    updated[idx] = { ...updated[idx], score };
    setCompetencies(updated);
  };

  return (
    <CreatePageLayout title="تقييم أداء جديد" backPath="/hr/performance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <FormShell
        schema={schema}
        defaultValues={{
          assignmentId: "",
          period: "",
          overallScore: 0,
          notes: "",
          strengths: "",
          improvements: "",
          goals: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ التقييم"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/performance")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const finalScore = values.overallScore || Math.round(avgScore * 10) / 10;
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                assignmentId: Number(values.assignmentId),
                period: values.period,
                overallScore: finalScore || undefined,
                notes: [
                  values.notes,
                  values.strengths ? `نقاط القوة: ${values.strengths}` : "",
                  values.improvements ? `مجالات التحسين: ${values.improvements}` : "",
                  values.goals ? `الأهداف المستقبلية: ${values.goals}` : "",
                  competencies.some((c) => c.score > 0)
                    ? `الكفاءات: ${competencies.filter((c) => c.score > 0).map((c) => `${c.name} (${c.score}/5)`).join("، ")}`
                    : "",
                ].filter(Boolean).join("\n") || undefined,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/performance");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <h3 className="text-sm font-semibold text-status-neutral-foreground flex items-center gap-2">
          <Target className="w-4 h-4" /> معلومات التقييم الأساسية
        </h3>
        <FormGrid cols={3}>
          <FormEntitySelect name="assignmentId" select={EmployeeSelect} label="الموظف" required />
          <FormTextField name="period" label="فترة التقييم" required placeholder="الربع الأول ٢٠٢٦" />
          <OverallScoreField />
        </FormGrid>
        <EmployeeContext employees={employees} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> تقييم الكفاءات
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
                <span className={cn(
                  "text-lg font-bold",
                  avgScore >= 4 ? "text-status-success-foreground" : avgScore >= 3 ? "text-status-warning-foreground" : "text-status-error-foreground",
                )}>
                  {avgScore.toFixed(1)}/5
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <h3 className="text-sm font-semibold text-status-neutral-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4" /> التفاصيل والملاحظات
        </h3>
        <FormTextareaField name="strengths" label="نقاط القوة" placeholder="ما يتميز به الموظف..." rows={2} />
        <FormTextareaField name="improvements" label="مجالات التحسين" placeholder="المجالات التي تحتاج تطوير..." rows={2} />
        <FormTextareaField name="goals" label="الأهداف المستقبلية" placeholder="الأهداف المتوقعة للفترة القادمة..." rows={2} />
        <FormTextareaField name="notes" label="ملاحظات عامة" placeholder="أي ملاحظات إضافية..." rows={2} />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التقييم" />
      </FormShell>
    </CreatePageLayout>
  );
}
