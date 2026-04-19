import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Briefcase, MapPin, DollarSign, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { JOB_TYPES, EXPERIENCE_LEVELS, EDUCATION_LEVELS } from "@/lib/hr-type-maps";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

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
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/recruitment/postings", "POST", [["jobs"]], {
    successMessage: "تم إضافة الوظيفة بنجاح",
  });
  const { data: deptData, isLoading, isError } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const departments = deptData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const salaryRange = form.salaryMin && form.salaryMax
    ? `${formatCurrency(Number(form.salaryMin))} - ${formatCurrency(Number(form.salaryMax))}`
    : null;

  const handleSubmit = () => {
    const firstError = validate({
      title: form.title ? null : "المسمى الوظيفي مطلوب",
      salaryMax: form.salaryMin && form.salaryMax && Number(form.salaryMax) < Number(form.salaryMin)
        ? "الحد الأعلى للراتب يجب أن يكون أكبر من الحد الأدنى"
        : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate(
      {
        ...form,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        closingDate: form.closingDate || undefined,
        vacancies: form.vacancies ? Number(form.vacancies) : 1,
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
            {JOB_TYPES.map((jt) => (
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
          <TextField label="المسمى الوظيفي" required value={form.title} onChange={(v) => set("title", v)} placeholder="مثال: مهندس برمجيات" error={fieldErrors.title} />
          <FormFieldWrapper label="القسم">
            <Select value={form.department || "_none"} onValueChange={(v) => set("department", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر القسم</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                {departments.length === 0 && <>
                  <SelectItem value="الإدارة">الإدارة</SelectItem>
                  <SelectItem value="الموارد البشرية">الموارد البشرية</SelectItem>
                  <SelectItem value="المالية">المالية</SelectItem>
                  <SelectItem value="تقنية المعلومات">تقنية المعلومات</SelectItem>
                  <SelectItem value="العمليات">العمليات</SelectItem>
                </>}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="الموقع" value={form.location} onChange={(v) => set("location", v)} placeholder="المدينة أو الفرع" />
          <NumberField label="عدد الشواغر" value={form.vacancies} onChange={(v) => set("vacancies", v)} min={1} />
          <FormFieldWrapper label="مستوى الخبرة">
            <Select value={form.experienceLevel || "_none"} onValueChange={(v) => set("experienceLevel", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر المستوى" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر المستوى</SelectItem>
                {EXPERIENCE_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="المؤهل العلمي">
            <Select value={form.education || "_none"} onValueChange={(v) => set("education", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر المؤهل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر المؤهل</SelectItem>
                {EDUCATION_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> نطاق الراتب
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <NumberField label={`الحد الأدنى (${getCurrencySymbol()})`} value={form.salaryMin} onChange={(v) => set("salaryMin", v)} placeholder="٠" min={0} />
            <NumberField label={`الحد الأعلى (${getCurrencySymbol()})`} value={form.salaryMax} onChange={(v) => set("salaryMax", v)} placeholder="٠" min={0} error={fieldErrors.salaryMax} />
            {salaryRange && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                <p className="text-xs text-green-600">نطاق الراتب</p>
                <p className="text-sm font-bold text-green-700">{salaryRange}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldWrapper label="تاريخ الإغلاق">
            <DatePicker value={form.closingDate} onChange={(v) => set("closingDate", v)} />
          </FormFieldWrapper>
        </div>

        <TextAreaField label="الوصف الوظيفي" value={form.description} onChange={(v) => set("description", v)} placeholder="وصف تفصيلي للمهام والمسؤوليات..." rows={4} />

        <TextAreaField label="المتطلبات والمهارات" value={form.requirements} onChange={(v) => set("requirements", v)} placeholder="المهارات والخبرات المطلوبة..." rows={3} />

        <TextAreaField label="المزايا والحوافز" value={form.benefits} onChange={(v) => set("benefits", v)} placeholder="تأمين طبي، بدل نقل، إجازات..." />

        {(form.title || form.department || form.type) && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-700 mb-2">ملخص الوظيفة</h4>
            <div className="flex flex-wrap gap-2">
              {form.title && <Badge variant="outline">{form.title}</Badge>}
              {form.department && <Badge variant="outline">{form.department}</Badge>}
              {form.type && <Badge variant="outline">{JOB_TYPES.find(t => t.value === form.type)?.label}</Badge>}
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
