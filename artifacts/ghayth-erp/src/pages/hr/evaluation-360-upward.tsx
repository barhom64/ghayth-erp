import { useState } from "react";
import { useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, Shield, Lock, EyeOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageShell,
  FormShell,
  FormSelectField,
  FormTextareaField,
} from "@workspace/ui-core";
import { usePermission } from "@/components/shared/permission-gate";

const UPWARD_CRITERIA = [
  { key: "leadership", label: "القيادة وتوزيع المهام" },
  { key: "communication", label: "التواصل والشفافية" },
  { key: "fairness", label: "العدالة والموضوعية" },
  { key: "support", label: "الدعم والتوجيه المهني" },
  { key: "feedback", label: "جودة التغذية الراجعة" },
] as const;

const upwardEvalSchema = z.object({
  managerId: z.string().min(1, "اختر المدير"),
  leadership: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  fairness: z.number().min(0).max(100),
  support: z.number().min(0).max(100),
  feedback: z.number().min(0).max(100),
  comments: z.string(),
});
type UpwardEvalForm = z.infer<typeof upwardEvalSchema>;

function FormScoreSlider({ name, label }: { name: keyof UpwardEvalForm; label: string }) {
  const { control } = useFormContext<UpwardEvalForm>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const value = (field.value as number) ?? 0;
        const color = value >= 80 ? "text-status-success-foreground" : value >= 60 ? "text-status-warning-foreground" : "text-status-error-foreground";
        return (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">{label}</span>
              <span className={cn("text-sm font-bold", color)}>{value}%</span>
            </div>
            <Slider
              min={0} max={100} step={5}
              value={[value]}
              onValueChange={([v]) => field.onChange(v!)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>ضعيف</span>
              <span>مقبول</span>
              <span>جيد</span>
              <span>جيد جداً</span>
              <span>ممتاز</span>
            </div>
          </div>
        );
      }}
    />
  );
}

function OverallScoreCard() {
  const { watch } = useFormContext<UpwardEvalForm>();
  const values = watch();
  const scores = UPWARD_CRITERIA.map((c) => Number(values[c.key as keyof UpwardEvalForm]) || 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return (
    <Card className={cn("border-0 shadow-sm", avg >= 80 ? "bg-status-success-surface" : avg >= 60 ? "bg-status-warning-surface" : "bg-status-error-surface")}>
      <CardContent className="p-4 text-center">
        <p className="text-sm text-muted-foreground mb-1">الدرجة الإجمالية</p>
        <p className={cn("text-5xl font-black", avg >= 80 ? "text-status-success-foreground" : avg >= 60 ? "text-status-warning-foreground" : "text-status-error-foreground")}>
          {avg}%
        </p>
      </CardContent>
    </Card>
  );
}

export default function Evaluation360UpwardPage() {
  const [, params] = useRoute("/hr/evaluation-360/:id/upward");
  const cycleId = params?.id ?? "";
  const canSubmit = usePermission("hr:create");

  const [submitted, setSubmitted] = useState(false);

  const { data: cycleData, isLoading, isError } = useApiQuery<any>(
    ["evaluation-cycle-detail", cycleId],
    `/hr/evaluation-cycles/${cycleId}`,
    { enabled: !!cycleId }
  );
  // HR-U4 — successMessage + onSuccess بدل try/catch العام.
  const submitMutation = useApiMutation(
    `/hr/evaluation-cycles/${cycleId}/upward-review`,
    "POST",
    [["evaluation-cycle-detail", cycleId]],
    { successMessage: "تم إرسال التقييم العكسي" },
  );

  const cycle = cycleData?.cycle;
  // Use the cycle's participants to build the manager list — they are already company-scoped
  // and visible to the current user. This avoids calling /employees (restricted for employees).
  const participants: any[] = cycleData?.participants ?? [];
  const managerCandidates = participants.filter((p: any) =>
    ["manager", "owner", "general_manager"].includes(p.evaluatorRole) || p.evaluatorRole === "manager"
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async (values: UpwardEvalForm) => {
    const scores = Object.fromEntries(UPWARD_CRITERIA.map((c) => [c.key, values[c.key as keyof UpwardEvalForm]]));
    const avg = Math.round(
      UPWARD_CRITERIA.reduce((s, c) => s + Number(values[c.key as keyof UpwardEvalForm] || 0), 0) / UPWARD_CRITERIA.length
    );
    await new Promise<void>((resolve, reject) => {
      submitMutation.mutate(
        {
          managerId: Number(values.managerId),
          overallScore: avg,
          scores,
          comments: values.comments || null,
        },
        {
          onSuccess: () => { setSubmitted(true); resolve(); },
          onError: () => reject(),
        },
      );
    });
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <div className="w-20 h-20 bg-status-success-surface rounded-full flex items-center justify-center mx-auto">
          <Shield className="w-10 h-10 text-status-success-foreground" />
        </div>
        <h2 className="text-2xl font-bold text-status-success-foreground">تم الإرسال بنجاح</h2>
        <p className="text-muted-foreground">تم إرسال تقييمك العكسي بشكل سري تام. لن يعرف أحد هويتك.</p>
        <p className="text-sm text-muted-foreground">تُعرض النتائج فقط كمتوسط مجمّع عند وجود 3 تقييمات أو أكثر</p>
        <Link href={`/hr/evaluation-360/${cycleId}`}>
          <Button>العودة إلى الدورة</Button>
        </Link>
      </div>
    );
  }

  return (
    <PageShell
      title="التقييم العكسي السري"
      subtitle={cycle ? `دورة تقييم: ${cycle.period}` : undefined}
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/evaluation-360", label: "التقييم 360°" }, { label: "التقييم العكسي السري" }]}
      actions={
        <Link href={`/hr/evaluation-360/${cycleId}`}>
          <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4 me-1" />عودة</Button>
        </Link>
      }
    >
      {/* Privacy guarantee */}
      <Card className="border-0 shadow-sm bg-purple-50 border border-purple-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
            <div className="text-sm text-purple-700">
              <p className="font-bold mb-1">ضمانات السرية التامة</p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2"><EyeOff className="w-3 h-3" />لا يُحفظ اسمك في النظام نهائياً</li>
                <li className="flex items-center gap-2"><EyeOff className="w-3 h-3" />المدير لا يستطيع معرفة من قيّمه</li>
                <li className="flex items-center gap-2"><EyeOff className="w-3 h-3" />النتائج تُعرض فقط كمتوسط مجمّع عند 3+ تقييمات</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <FormShell
        schema={upwardEvalSchema}
        defaultValues={{
          managerId: "",
          leadership: 70,
          communication: 70,
          fairness: 70,
          support: 70,
          feedback: 70,
          comments: "",
        }}
        submitLabel="إرسال بشكل سري"
        disabled={!canSubmit}
        secondaryActions={
          <Link href={`/hr/evaluation-360/${cycleId}`}>
            <Button type="button" variant="outline">إلغاء</Button>
          </Link>
        }
        onSubmit={handleSubmit}
      >
        {/* Manager selection */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <FormSelectField
              name="managerId"
              label="اختر المدير المراد تقييمه"
              placeholder="اختر المدير"
              required
              options={managerCandidates.map((p: any) => ({ value: String(p.evaluatorId), label: p.evaluatorName }))}
            />
            {managerCandidates.length === 0 && (
              <p className="text-xs text-status-warning-foreground mt-1">
                يجب أن يُضيف قسم الموارد البشرية مشرفاً بدور "مدير" ضمن المقيِّمين قبل إرسال تقييم عكسي
              </p>
            )}
          </CardContent>
        </Card>

        {/* Score sliders */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تقييم معايير القيادة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {UPWARD_CRITERIA.map((c) => (
              <FormScoreSlider key={c.key} name={c.key} label={c.label} />
            ))}
          </CardContent>
        </Card>

        {/* Overall */}
        <OverallScoreCard />

        {/* Comments (optional) */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <FormTextareaField
              name="comments"
              label="ملاحظات اختيارية (مجهولة المصدر)"
              placeholder="يمكنك إضافة ملاحظات بدون ذكر هويتك..."
              rows={3}
            />
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span>لا تذكر معلومات تُعرِّف بهويتك</span>
            </div>
          </CardContent>
        </Card>
      </FormShell>
    </PageShell>
  );
}
