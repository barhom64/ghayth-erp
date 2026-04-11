import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Briefcase, MapPin, Calendar, DollarSign, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/formatters";

const jobTypes = [
  { value: "full-time", label: "دوام كامل", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "part-time", label: "دوام جزئي", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "contract", label: "عقد مؤقت", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "internship", label: "تدريب تعاوني", color: "bg-purple-50 text-purple-700 border-purple-200" },
];

const experienceLevels = [
  { value: "entry", label: "مبتدئ (0-2 سنوات)" },
  { value: "mid", label: "متوسط (3-5 سنوات)" },
  { value: "senior", label: "خبير (6-10 سنوات)" },
  { value: "lead", label: "قيادي (+10 سنوات)" },
];

const DRAFT_KEY = "hr_recruitment_create";
const INITIAL = {
  title: "", department: "", location: "", type: "full-time",
  description: "", requirements: "", salaryMin: "", salaryMax: "",
  closingDate: "", experienceLevel: "", education: "", vacancies: "1",
  benefits: "", skills: "",
};

export default function RecruitmentCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/recruitment/postings", "POST", [["jobs"]]);
  const { data: deptData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const departments = deptData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const salaryRange = form.salaryMin && form.salaryMax
    ? `${Number(form.salaryMin).toLocaleString()} - ${Number(form.salaryMax).toLocaleString()} ${getCurrencySymbol()}`
    : null;

  const handleSubmit = async () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "المسمى الوظيفي مطلوب" });
      return;
    }
    if (form.salaryMin && form.salaryMax && Number(form.salaryMax) < Number(form.salaryMin)) {
      toast({ variant: "destructive", title: "الحد الأعلى للراتب يجب أن يكون أكبر من الحد الأدنى" });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        closingDate: form.closingDate || undefined,
        vacancies: form.vacancies ? Number(form.vacancies) : 1,
      });
      clearDraft();
      toast({ title: "تم إضافة الوظيفة بنجاح" });
      setLocation("/hr/recruitment");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الوظيفة" });
    }
  };

  return (
    <CreatePageLayout title="إضافة وظيفة جديدة" backPath="/hr/recruitment">
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
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> نوع التوظيف
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {jobTypes.map((jt) => (
              <button
                key={jt.value}
                type="button"
                onClick={() => set("type", jt.value)}
                className={cn(
                  "p-3 rounded-xl border-2 text-center text-sm font-medium transition-all",
                  form.type === jt.value ? jt.color + " ring-2 ring-offset-1" : "border-gray-200 hover:border-gray-300"
                )}
              >
                {jt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>المسمى الوظيفي <span className="text-red-500">*</span></Label>
            <Input className="mt-1" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="مثال: مهندس برمجيات" />
          </div>
          <div>
            <Label>القسم</Label>
            <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.department} onChange={(e) => set("department", e.target.value)}>
              <option value="">اختر القسم</option>
              {departments.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
              {departments.length === 0 && <>
                <option value="الإدارة">الإدارة</option>
                <option value="الموارد البشرية">الموارد البشرية</option>
                <option value="المالية">المالية</option>
                <option value="تقنية المعلومات">تقنية المعلومات</option>
                <option value="العمليات">العمليات</option>
              </>}
            </select>
          </div>
          <div>
            <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> الموقع</Label>
            <Input className="mt-1" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="المدينة أو الفرع" />
          </div>
          <div>
            <Label>عدد الشواغر</Label>
            <Input className="mt-1" type="number" min="1" value={form.vacancies} onChange={(e) => set("vacancies", e.target.value)} />
          </div>
          <div>
            <Label>مستوى الخبرة</Label>
            <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.experienceLevel} onChange={(e) => set("experienceLevel", e.target.value)}>
              <option value="">اختر المستوى</option>
              {experienceLevels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <Label>المؤهل العلمي</Label>
            <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.education} onChange={(e) => set("education", e.target.value)}>
              <option value="">اختر المؤهل</option>
              <option value="high_school">ثانوية</option>
              <option value="diploma">دبلوم</option>
              <option value="bachelor">بكالوريوس</option>
              <option value="master">ماجستير</option>
              <option value="phd">دكتوراه</option>
            </select>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> نطاق الراتب
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label>الحد الأدنى ({getCurrencySymbol()})</Label>
              <Input className="mt-1" type="number" value={form.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} placeholder="٠" />
            </div>
            <div>
              <Label>الحد الأعلى ({getCurrencySymbol()})</Label>
              <Input className="mt-1" type="number" value={form.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} placeholder="٠" />
            </div>
            {salaryRange && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                <p className="text-xs text-green-600">نطاق الراتب</p>
                <p className="text-sm font-bold text-green-700">{salaryRange}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> تاريخ الإغلاق</Label>
            <div className="mt-1"><DatePicker value={form.closingDate} onChange={(v) => set("closingDate", v)} /></div>
          </div>
        </div>

        <div>
          <Label>الوصف الوظيفي</Label>
          <Textarea className="mt-1 min-h-[100px]" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="وصف تفصيلي للمهام والمسؤوليات..." />
        </div>

        <div>
          <Label>المتطلبات والمهارات</Label>
          <Textarea className="mt-1 min-h-[80px]" value={form.requirements} onChange={(e) => set("requirements", e.target.value)} placeholder="المهارات والخبرات المطلوبة..." />
        </div>

        <div>
          <Label>المزايا والحوافز</Label>
          <Textarea className="mt-1" value={form.benefits} onChange={(e) => set("benefits", e.target.value)} placeholder="تأمين طبي، بدل نقل، إجازات..." />
        </div>

        {(form.title || form.department || form.type) && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-700 mb-2">ملخص الوظيفة</h4>
            <div className="flex flex-wrap gap-2">
              {form.title && <Badge variant="outline">{form.title}</Badge>}
              {form.department && <Badge variant="outline">{form.department}</Badge>}
              {form.type && <Badge variant="outline">{jobTypes.find(t => t.value === form.type)?.label}</Badge>}
              {form.location && <Badge variant="outline"><MapPin className="h-3 w-3 me-1" />{form.location}</Badge>}
              {form.vacancies && Number(form.vacancies) > 1 && <Badge variant="outline"><Users className="h-3 w-3 me-1" />{form.vacancies} شواغر</Badge>}
              {form.closingDate && <Badge variant="outline"><Clock className="h-3 w-3 me-1" />يُغلق: {form.closingDate}</Badge>}
            </div>
          </div>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات الوظيفة (وصف وظيفي، نماذج)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/recruitment")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.title || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "نشر الوظيفة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
