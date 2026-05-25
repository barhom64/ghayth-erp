import { useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, Users, Target, CheckCircle, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageShell,
  FormShell,
  FormTextareaField,
} from "@workspace/ui-core";
import { usePermission } from "@/components/shared/permission-gate";

const EVAL_CRITERIA = [
  { key: "technical_skills", label: "المهارات التقنية والمهنية" },
  { key: "communication", label: "التواصل والتعاون" },
  { key: "initiative", label: "روح المبادرة والإبداع" },
  { key: "punctuality", label: "الالتزام بالمواعيد" },
  { key: "quality", label: "جودة العمل والدقة" },
] as const;

const peerEvalSchema = z.object({
  technical_skills: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  initiative: z.number().min(0).max(100),
  punctuality: z.number().min(0).max(100),
  quality: z.number().min(0).max(100),
  comments: z.string(),
});
type PeerEvalForm = z.infer<typeof peerEvalSchema>;

// Slider wrapper for RHF Controller. Stays semantically identical to the
// legacy ScoreSlider — same labels, same color thresholds — but reads /
// writes the form state via field.value/onChange.
function FormScoreSlider({ name, label }: { name: keyof PeerEvalForm; label: string }) {
  const { control } = useFormContext<PeerEvalForm>();
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
              className="w-full"
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

// Live overall-score card. Reads the slider values via watch() and
// renders the same colored summary the legacy page derived from local
// useState.
function OverallScoreCard() {
  const { watch } = useFormContext<PeerEvalForm>();
  const values = watch();
  const scores = EVAL_CRITERIA.map((c) => Number(values[c.key as keyof PeerEvalForm]) || 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return (
    <Card className={cn(
      "border-0 shadow-sm",
      avg >= 80 ? "bg-status-success-surface" : avg >= 60 ? "bg-status-warning-surface" : "bg-status-error-surface"
    )}>
      <CardContent className="p-4 text-center">
        <p className="text-sm text-muted-foreground mb-1">الدرجة الإجمالية</p>
        <p className={cn("text-5xl font-black", avg >= 80 ? "text-status-success-foreground" : avg >= 60 ? "text-status-warning-foreground" : "text-status-error-foreground")}>
          {avg}%
        </p>
      </CardContent>
    </Card>
  );
}

export default function Evaluation360PeerPage() {
  const [, params] = useRoute("/hr/evaluation-360/:id/peer");
  const [, navigate] = useLocation();
  const cycleId = params?.id ?? "";
  const canSubmit = usePermission("hr:create");

  const { data: cycleData, isLoading, isError } = useApiQuery<any>(
    ["evaluation-cycle-detail", cycleId],
    `/hr/evaluation-cycles/${cycleId}`,
    { enabled: !!cycleId }
  );
  // HR-U4 — successMessage + onSuccess بدل try/catch العام.
  const submitMutation = useApiMutation(
    `/hr/evaluation-cycles/${cycleId}/peer-evaluation`,
    "POST",
    [["evaluation-cycle-detail", cycleId]],
    { successMessage: "تم إرسال التقييم بنجاح" },
  );

  const cycle = cycleData?.cycle;
  const systemEval = cycleData?.systemEval;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async (values: PeerEvalForm) => {
    const scores = Object.fromEntries(EVAL_CRITERIA.map((c) => [c.key, values[c.key as keyof PeerEvalForm]]));
    const avg = Math.round(
      EVAL_CRITERIA.reduce((s, c) => s + Number(values[c.key as keyof PeerEvalForm] || 0), 0) / EVAL_CRITERIA.length
    );
    await new Promise<void>((resolve, reject) => {
      submitMutation.mutate(
        { overallScore: avg, scores, comments: values.comments },
        {
          onSuccess: () => {
            navigate(`/hr/evaluation-360/${cycleId}`);
            resolve();
          },
          onError: () => reject(),
        },
      );
    });
  };

  return (
    <PageShell
      title="تقييم المدير / الزملاء"
      subtitle={cycle ? `الموظف: ${cycle.employeeName} · ${cycle.period}` : undefined}
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/evaluation-360", label: "التقييم 360°" }, { label: "تقييم الزملاء" }]}
      actions={
        <Link href={`/hr/evaluation-360/${cycleId}`}>
          <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4 me-1" />عودة</Button>
        </Link>
      }
    >
      {/* Identity note */}
      <Card className="border-0 shadow-sm bg-slate-50 border border-slate-200">
        <CardContent className="p-4 flex items-start gap-3">
          <Users className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-600">
            سيُرسَل هذا التقييم باسمك ودورك المسجَّل في النظام. يتحمل المقيِّم المسؤولية الكاملة عن محتوى التقييم.
          </p>
        </CardContent>
      </Card>

      {/* System report reference */}
      {systemEval && (
        <Card className="border-0 shadow-sm bg-status-info-surface border border-status-info-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-status-info-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              التقرير الآلي كمرجع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "الحضور", score: systemEval.attendanceScore, icon: CheckCircle },
                { label: "المهام", score: systemEval.taskCompletionScore, icon: Target },
                { label: "المواعيد", score: systemEval.onTimeScore, icon: Clock },
                { label: "رضا العملاء", score: systemEval.clientSatScore, icon: Star },
                { label: "التوثيق", score: systemEval.docQualityScore, icon: Users },
              ].map(({ label, score, icon: Icon }) => (
                <div key={label} className="text-center bg-white rounded-lg p-2">
                  <Icon className="w-4 h-4 mx-auto text-blue-400 mb-1" />
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("font-bold text-sm", score >= 80 ? "text-status-success-foreground" : score >= 60 ? "text-status-warning-foreground" : "text-status-error-foreground")}>
                    {score}%
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center">
              <span className="text-xs text-status-info-foreground font-medium">الدرجة الآلية الإجمالية: {systemEval.overallScore}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      <FormShell
        schema={peerEvalSchema}
        defaultValues={{
          technical_skills: 70,
          communication: 70,
          initiative: 70,
          punctuality: 70,
          quality: 70,
          comments: "",
        }}
        submitLabel="إرسال التقييم"
        disabled={!canSubmit}
        secondaryActions={
          <Link href={`/hr/evaluation-360/${cycleId}`}>
            <Button type="button" variant="outline">إلغاء</Button>
          </Link>
        }
        onSubmit={handleSubmit}
      >
        {/* Score sliders */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تقييم معايير الأداء</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {EVAL_CRITERIA.map((c) => (
              <FormScoreSlider key={c.key} name={c.key} label={c.label} />
            ))}
          </CardContent>
        </Card>

        {/* Overall score display — reads sliders via watch() */}
        <OverallScoreCard />

        {/* Comments */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <FormTextareaField
              name="comments"
              label="ملاحظات وتعليقات"
              placeholder="أضف ملاحظاتك حول أداء الموظف، نقاط القوة، مجالات التحسين..."
              rows={4}
            />
          </CardContent>
        </Card>
      </FormShell>
    </PageShell>
  );
}
