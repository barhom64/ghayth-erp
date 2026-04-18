import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Star, Target, TrendingUp, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";

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
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/hr/performance", "POST", [["performance"]], {
    successMessage: "تم إضافة التقييم بنجاح",
  });
  const { data: empData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = empData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    assignmentId: "",
    period: "",
    overallScore: 0,
    notes: "",
    strengths: "",
    improvements: "",
    goals: "",
  });
  const [competencies, setCompetencies] = useState<Competency[]>(defaultCompetencies.map((c) => ({ ...c })));
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const avgScore = competencies.filter((c) => c.score > 0).length > 0
    ? (competencies.reduce((sum, c) => sum + c.score, 0) / competencies.filter((c) => c.score > 0).length)
    : 0;

  const updateCompetency = (idx: number, score: number) => {
    const updated = [...competencies];
    updated[idx] = { ...updated[idx], score };
    setCompetencies(updated);
  };

  const selectedEmployee = employees.find((e: any) => String(e.assignmentId || e.id) === form.assignmentId);

  const handleSubmit = () => {
    if (!form.assignmentId) {
      toast({ variant: "destructive", title: "يرجى اختيار الموظف" });
      return;
    }
    if (!form.period) {
      toast({ variant: "destructive", title: "الفترة مطلوبة" });
      return;
    }
    const finalScore = form.overallScore || Math.round(avgScore * 10) / 10;
    createMut.mutate(
      {
        assignmentId: Number(form.assignmentId),
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
      },
    );
  };

  return (
    <CreatePageLayout title="تقييم أداء جديد" backPath="/hr/performance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" />
            معلومات التقييم الأساسية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>الموظف <span className="text-red-500">*</span></Label>
              <Select value={form.assignmentId} onValueChange={(v) => setForm((f) => ({ ...f, assignmentId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.assignmentId || emp.id} value={String(emp.assignmentId || emp.id)}>
                      {emp.name} {emp.empNumber ? `(${emp.empNumber})` : ""} {emp.jobTitle ? `— ${emp.jobTitle}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>فترة التقييم <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="الربع الأول ٢٠٢٦" />
            </div>
            <div>
              <Label>التقييم العام</Label>
              <div className="mt-2 flex items-center gap-3">
                <StarRating value={form.overallScore} onChange={(v) => setForm((f) => ({ ...f, overallScore: v }))} />
                {form.overallScore > 0 && (
                  <span className={cn(
                    "text-sm font-medium px-2 py-0.5 rounded",
                    form.overallScore >= 4 ? "bg-green-100 text-green-700" :
                    form.overallScore >= 3 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {scoreLabels[form.overallScore]}
                  </span>
                )}
              </div>
            </div>
          </div>
          {selectedEmployee && (
            <div className="mt-4">
              <EmployeeContextCard employeeId={selectedEmployee.id} section="violations" />
            </div>
          )}
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
                  <span className="text-sm text-gray-700 w-48">{comp.name}</span>
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
                    avgScore >= 4 ? "text-green-600" : avgScore >= 3 ? "text-yellow-600" : "text-red-600"
                  )}>
                    {avgScore.toFixed(1)}/5
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            التفاصيل والملاحظات
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label>نقاط القوة</Label>
              <Textarea className="mt-1" value={form.strengths} onChange={(e) => setForm((f) => ({ ...f, strengths: e.target.value }))} placeholder="ما يتميز به الموظف..." rows={2} />
            </div>
            <div>
              <Label>مجالات التحسين</Label>
              <Textarea className="mt-1" value={form.improvements} onChange={(e) => setForm((f) => ({ ...f, improvements: e.target.value }))} placeholder="المجالات التي تحتاج تطوير..." rows={2} />
            </div>
            <div>
              <Label>الأهداف المستقبلية</Label>
              <Textarea className="mt-1" value={form.goals} onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))} placeholder="الأهداف المتوقعة للفترة القادمة..." rows={2} />
            </div>
            <div>
              <Label>ملاحظات عامة</Label>
              <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="أي ملاحظات إضافية..." rows={2} />
            </div>
          </div>
        </div>
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التقييم" />

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/performance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} size="lg">
          {createMut.isPending ? "جاري الحفظ..." : "حفظ التقييم"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
