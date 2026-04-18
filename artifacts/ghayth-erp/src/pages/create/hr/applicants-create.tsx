import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { User, Mail, Phone, Briefcase, GraduationCap, Link as LinkIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPLICANT_SOURCES, EDUCATION_LEVELS } from "@/lib/hr-type-maps";

const DRAFT_KEY = "hr_applicants_create";
const INITIAL = {
  postingId: "", applicantName: "", email: "", phone: "",
  notes: "", resumeUrl: "", source: "", experience: "",
  education: "", expectedSalary: "", currentCompany: "", rating: "",
};

export default function ApplicantsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/recruitment/applications", "POST", [["applicants"]], {
    successMessage: "تم إضافة المتقدم بنجاح",
  });
  const { data: jobsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["jobs"], "/recruitment/postings");
  const jobs = jobsData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const selectedJob = jobs.find((j: any) => String(j.id) === form.postingId);

  const handleSubmit = () => {
    if (!form.postingId) {
      toast({ variant: "destructive", title: "يرجى اختيار الوظيفة" });
      return;
    }
    if (!form.applicantName) {
      toast({ variant: "destructive", title: "اسم المتقدم مطلوب" });
      return;
    }
    createMut.mutate(
      {
        postingId: Number(form.postingId),
        applicantName: form.applicantName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
        resumeUrl: form.resumeUrl || undefined,
        source: form.source || undefined,
        experience: form.experience || undefined,
        education: form.education || undefined,
        expectedSalary: form.expectedSalary ? Number(form.expectedSalary) : undefined,
        currentCompany: form.currentCompany || undefined,
        rating: form.rating ? Number(form.rating) : undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/recruitment");
        },
      },
    );
  };

  return (
    <CreatePageLayout title="إضافة متقدم جديد" backPath="/hr/recruitment">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> الوظيفة <span className="text-red-500">*</span></Label>
            <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.postingId} onChange={(e) => set("postingId", e.target.value)}>
              <option value="">اختر الوظيفة</option>
              {jobs.map((job: any) => (
                <option key={job.id} value={job.id}>{job.title} {job.department ? `— ${job.department}` : ""}</option>
              ))}
            </select>
          </div>
          {selectedJob && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-700">{selectedJob.title}</p>
              <p className="text-xs text-blue-500">{selectedJob.department} • {selectedJob.location || "—"}</p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <User className="h-4 w-4" /> بيانات المتقدم
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>الاسم الكامل <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.applicantName} onChange={(e) => set("applicantName", e.target.value)} placeholder="الاسم الرباعي" />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> البريد الإلكتروني</Label>
              <Input className="mt-1" type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> الهاتف</Label>
              <Input className="mt-1" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+966 5xx xxx xxx" />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> المؤهلات والخبرة
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>المؤهل العلمي</Label>
              <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.education} onChange={(e) => set("education", e.target.value)}>
                <option value="">اختر المؤهل</option>
                {EDUCATION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <Label>سنوات الخبرة</Label>
              <Input className="mt-1" value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="مثال: 5 سنوات" />
            </div>
            <div>
              <Label>الشركة الحالية</Label>
              <Input className="mt-1" value={form.currentCompany} onChange={(e) => set("currentCompany", e.target.value)} placeholder="اسم جهة العمل الحالية" />
            </div>
            <div>
              <Label>الراتب المتوقع</Label>
              <Input className="mt-1" type="number" value={form.expectedSalary} onChange={(e) => set("expectedSalary", e.target.value)} placeholder="٠" />
            </div>
            <div>
              <Label>مصدر التقديم</Label>
              <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.source} onChange={(e) => set("source", e.target.value)}>
                <option value="">اختر المصدر</option>
                {APPLICANT_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Star className="h-3.5 w-3.5" /> التقييم المبدئي (1-5)</Label>
              <Input className="mt-1" type="number" min="1" max="5" value={form.rating} onChange={(e) => set("rating", e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        <div>
          <Label className="flex items-center gap-1"><LinkIcon className="h-3.5 w-3.5" /> رابط السيرة الذاتية</Label>
          <Input className="mt-1" dir="ltr" value={form.resumeUrl} onChange={(e) => set("resumeUrl", e.target.value)} placeholder="https://..." />
        </div>

        <div>
          <Label>ملاحظات إضافية</Label>
          <Textarea className="mt-1 min-h-[80px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="الخبرات، المؤهلات الإضافية، نقاط القوة..." />
        </div>

        {form.applicantName && (
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <h4 className="text-sm font-semibold text-green-700 mb-2">ملخص المتقدم</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{form.applicantName}</Badge>
              {selectedJob && <Badge variant="outline"><Briefcase className="h-3 w-3 me-1" />{selectedJob.title}</Badge>}
              {form.education && <Badge variant="outline">{EDUCATION_LEVELS.find(l => l.value === form.education)?.label || form.education}</Badge>}
              {form.experience && <Badge variant="outline">{form.experience} خبرة</Badge>}
              {form.source && <Badge variant="outline">{APPLICANT_SOURCES.find(s => s.value === form.source)?.label}</Badge>}
            </div>
          </div>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="المرفقات (سيرة ذاتية، شهادات)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/recruitment")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "إضافة المتقدم"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
