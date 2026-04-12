import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, Users, Target, CheckCircle, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVAL_CRITERIA = [
  { key: "technical_skills", label: "المهارات التقنية والمهنية" },
  { key: "communication", label: "التواصل والتعاون" },
  { key: "initiative", label: "روح المبادرة والإبداع" },
  { key: "punctuality", label: "الالتزام بالمواعيد" },
  { key: "quality", label: "جودة العمل والدقة" },
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
        className="w-full"
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

export default function Evaluation360PeerPage() {
  const [, params] = useRoute("/hr/evaluation-360/:id/peer");
  const [, navigate] = useLocation();
  const cycleId = params?.id;

  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(EVAL_CRITERIA.map((c) => [c.key, 70]))
  );
  const [comments, setComments] = useState("");

  const { data: cycleData } = useApiQuery<any>(
    ["evaluation-cycle-detail", cycleId],
    `/hr/evaluation-cycles/${cycleId}`,
    { enabled: !!cycleId }
  );
  const submitMutation = useApiMutation(`/hr/evaluation-cycles/${cycleId}/peer-evaluation`, "POST");

  const cycle = cycleData?.cycle;
  const systemEval = cycleData?.systemEval;

  const avgScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);

  async function handleSubmit() {
    try {
      await submitMutation.mutateAsync({
        overallScore: avgScore,
        scores,
        comments,
      });
      toast.success("تم إرسال التقييم بنجاح");
      navigate(`/hr/evaluation-360/${cycleId}`);
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء إرسال التقييم");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/hr/evaluation-360/${cycleId}`}>
          <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4 me-1" />عودة</Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">تقييم المدير / الزملاء</h1>
          {cycle && <p className="text-sm text-gray-500">الموظف: {cycle.employeeName} · {cycle.period}</p>}
        </div>
      </div>

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
        <Card className="border-0 shadow-sm bg-blue-50 border border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
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
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={cn("font-bold text-sm", score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600")}>
                    {score}%
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center">
              <span className="text-xs text-blue-600 font-medium">الدرجة الآلية الإجمالية: {systemEval.overallScore}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score sliders */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">تقييم معايير الأداء</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {EVAL_CRITERIA.map((c) => (
            <ScoreSlider
              key={c.key}
              label={c.label}
              value={scores[c.key]!}
              onChange={(v) => setScores({ ...scores, [c.key]: v })}
            />
          ))}
        </CardContent>
      </Card>

      {/* Overall score display */}
      <Card className={cn(
        "border-0 shadow-sm",
        avgScore >= 80 ? "bg-green-50" : avgScore >= 60 ? "bg-yellow-50" : "bg-red-50"
      )}>
        <CardContent className="p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">الدرجة الإجمالية</p>
          <p className={cn("text-5xl font-black", avgScore >= 80 ? "text-green-600" : avgScore >= 60 ? "text-yellow-600" : "text-red-600")}>
            {avgScore}%
          </p>
        </CardContent>
      </Card>

      {/* Comments */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Label>ملاحظات وتعليقات</Label>
          <Textarea
            className="mt-2"
            placeholder="أضف ملاحظاتك حول أداء الموظف، نقاط القوة، مجالات التحسين..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Link href={`/hr/evaluation-360/${cycleId}`}>
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? "جارٍ الإرسال..." : "إرسال التقييم"}
        </Button>
      </div>
    </div>
  );
}
