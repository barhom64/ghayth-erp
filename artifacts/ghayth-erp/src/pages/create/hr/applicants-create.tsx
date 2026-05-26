import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { User, Briefcase, GraduationCap } from "lucide-react";
import { APPLICANT_SOURCES, EDUCATION_LEVELS } from "@/lib/hr-type-maps";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

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
  const createMut = useApiMutation("/hr/recruitment/applications", "POST", [["applicants"]], {
    successMessage: "تم إضافة المتقدم بنجاح",
  });
  const { data: jobsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["jobs"], "/hr/recruitment/postings");
  const jobs = jobsData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const selectedJob = jobs.find((j: any) => String(j.id) === form.postingId);

  const handleSubmit = () => {
    const firstError = validate({
      postingId: form.postingId ? null : "يرجى اختيار الوظيفة",
      applicantName: form.applicantName ? null : "اسم المتقدم مطلوب",
      email: form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        ? "صيغة البريد الإلكتروني غير صحيحة"
        : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
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
        onError: (err: any) => {
          setApiError(err);
        },
      },
    );
  };

  return (
    <CreatePageLayout title="إضافة متقدم جديد" backPath="/hr/recruitment">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldWrapper label="الوظيفة" required error={fieldErrors.postingId}>
            <Select value={form.postingId || "_none"} onValueChange={(v) => set("postingId", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر الوظيفة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الوظيفة</SelectItem>
                {jobs.map((job: any) => (
                  <SelectItem key={job.id} value={String(job.id)}>{job.title} {job.department ? `— ${job.department}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          {selectedJob && (
            <div className="p-3 bg-status-info-surface rounded-lg border border-status-info-surface">
              <p className="text-sm font-medium text-status-info-foreground">{selectedJob.title}</p>
              <p className="text-xs text-status-info">{selectedJob.department} • {selectedJob.location || "—"}</p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <User className="h-4 w-4" /> بيانات المتقدم
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField label="الاسم الكامل" required value={form.applicantName} onChange={(v) => set("applicantName", v)} placeholder="الاسم الرباعي" error={fieldErrors.applicantName} />
            <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={(v) => set("email", v)} placeholder="email@example.com" error={fieldErrors.email} />
            <TextField label="الهاتف" type="tel" inputMode="tel" dir="ltr" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+966 5xx xxx xxx" />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> المؤهلات والخبرة
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="المؤهل العلمي">
              <Select value={form.education || "_none"} onValueChange={(v) => set("education", v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="اختر المؤهل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">اختر المؤهل</SelectItem>
                  {EDUCATION_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField label="سنوات الخبرة" value={form.experience} onChange={(v) => set("experience", v)} placeholder="مثال: 5 سنوات" />
            <TextField label="الشركة الحالية" value={form.currentCompany} onChange={(v) => set("currentCompany", v)} placeholder="اسم جهة العمل الحالية" />
            <NumberField label="الراتب المتوقع" value={form.expectedSalary} onChange={(v) => set("expectedSalary", v)} placeholder="٠" min={0} />
            <FormFieldWrapper label="مصدر التقديم">
              <Select value={form.source || "_none"} onValueChange={(v) => set("source", v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">اختر المصدر</SelectItem>
                  {APPLICANT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <NumberField label="التقييم المبدئي (1-5)" value={form.rating} onChange={(v) => set("rating", v)} placeholder="—" min={1} max={5} />
          </div>
        </div>

        <TextField label="رابط السيرة الذاتية" dir="ltr" value={form.resumeUrl} onChange={(v) => set("resumeUrl", v)} placeholder="https://..." />

        <TextAreaField label="ملاحظات إضافية" value={form.notes} onChange={(v) => set("notes", v)} placeholder="الخبرات، المؤهلات الإضافية، نقاط القوة..." rows={3} />

        {form.applicantName && (
          <div className="p-4 bg-status-success-surface rounded-xl border border-status-success-surface">
            <h4 className="text-sm font-semibold text-status-success-foreground mb-2">ملخص المتقدم</h4>
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
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "إضافة المتقدم"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
