import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, Shield, Lock, EyeOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";

const UPWARD_CRITERIA = [
  { key: "leadership", label: "القيادة وتوزيع المهام" },
  { key: "communication", label: "التواصل والشفافية" },
  { key: "fairness", label: "العدالة والموضوعية" },
  { key: "support", label: "الدعم والتوجيه المهني" },
  { key: "feedback", label: "جودة التغذية الراجعة" },
];

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const color = value >= 80 ? "text-green-600" : value >= 60 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("text-sm font-bold", color)}>{value}%</span>
      </div>
      <Slider
        min={0} max={100} step={5}
        value={[value]}
        onValueChange={([v]) => onChange(v!)}
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>ضعيف</span>
        <span>مقبول</span>
        <span>جيد</span>
        <span>جيد جداً</span>
        <span>ممتاز</span>
      </div>
    </div>
  );
}

export default function Evaluation360UpwardPage() {
  const [, params] = useRoute("/hr/evaluation-360/:id/upward");
  const [, navigate] = useLocation();
  const cycleId = params?.id ?? "";

  const [managerId, setManagerId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(UPWARD_CRITERIA.map((c) => [c.key, 70]))
  );
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: cycleData } = useApiQuery<any>(
    ["evaluation-cycle-detail", cycleId],
    `/hr/evaluation-cycles/${cycleId}`,
    { enabled: !!cycleId }
  );
  // Use the cycle's participants to build the manager list — they are already company-scoped
  // and visible to the current user. This avoids calling /employees (restricted for employees).
  const submitMutation = useApiMutation(`/hr/evaluation-cycles/${cycleId}/upward-review`, "POST");

  const cycle = cycleData?.cycle;
  // Extract managers from participants list + optionally the initiator
  const participants: any[] = cycleData?.participants ?? [];
  // Offer all participants with role manager/owner/general_manager as manager candidates
  // Also include HR participants since they can be rated
  const managerCandidates = participants.filter((p: any) =>
    ["manager", "owner", "general_manager"].includes(p.evaluatorRole) || p.evaluatorRole === "manager"
  );
  const avgScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);

  async function handleSubmit() {
    if (!managerId) { toast.error("الرجاء اختيار المدير المراد تقييمه"); return; }
    try {
      await submitMutation.mutateAsync({
        managerId: Number(managerId),
        overallScore: avgScore,
        scores,
        comments: comments || null,
      });
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء إرسال التقييم");
    }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Shield className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-green-700">تم الإرسال بنجاح</h2>
        <p className="text-gray-600">تم إرسال تقييمك العكسي بشكل سري تام. لن يعرف أحد هويتك.</p>
        <p className="text-sm text-gray-400">تُعرض النتائج فقط كمتوسط مجمّع عند وجود 3 تقييمات أو أكثر</p>
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

      {/* Manager selection */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Label>اختر المدير المراد تقييمه *</Label>
          <Select value={managerId} onValueChange={setManagerId}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="اختر المدير" />
            </SelectTrigger>
            <SelectContent>
              {managerCandidates.length > 0 ? (
                managerCandidates.map((p: any) => (
                  <SelectItem key={p.evaluatorId} value={String(p.evaluatorId)}>
                    {p.evaluatorName}
                  </SelectItem>
                ))
              ) : null}
            </SelectContent>
          </Select>
          {managerCandidates.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
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
            <ScoreSlider
              key={c.key}
              label={c.label}
              value={scores[c.key]!}
              onChange={(v) => setScores({ ...scores, [c.key]: v })}
            />
          ))}
        </CardContent>
      </Card>

      {/* Overall */}
      <Card className={cn("border-0 shadow-sm", avgScore >= 80 ? "bg-green-50" : avgScore >= 60 ? "bg-yellow-50" : "bg-red-50")}>
        <CardContent className="p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">الدرجة الإجمالية</p>
          <p className={cn("text-5xl font-black", avgScore >= 80 ? "text-green-600" : avgScore >= 60 ? "text-yellow-600" : "text-red-600")}>
            {avgScore}%
          </p>
        </CardContent>
      </Card>

      {/* Comments (optional) */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Label>ملاحظات اختيارية (مجهولة المصدر)</Label>
          <Textarea
            className="mt-2"
            placeholder="يمكنك إضافة ملاحظات بدون ذكر هويتك..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
          />
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <AlertCircle className="w-3 h-3" />
            <span>لا تذكر معلومات تُعرِّف بهويتك</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Link href={`/hr/evaluation-360/${cycleId}`}>
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Shield className="w-4 h-4 me-1" />
          {submitMutation.isPending ? "جارٍ الإرسال..." : "إرسال بشكل سري"}
        </Button>
      </div>
    </PageShell>
  );
}
