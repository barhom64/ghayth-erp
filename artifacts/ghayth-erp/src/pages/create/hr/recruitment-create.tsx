import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Briefcase, MapPin, DollarSign, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { JOB_TYPES, EXPERIENCE_LEVELS, EDUCATION_LEVELS } from "@/lib/hr-type-maps";

const schema = z
  .object({
    title: z.string().min(1, "المسمى الوظيفي مطلوب"),
    department: z.string().optional(),
    location: z.string().optional(),
    type: z.string(),
    description: z.string().optional(),
    requirements: z.string().optional(),
    salaryMin: z.string().optional(),
    salaryMax: z.string().optional(),
    closingDate: z.string().optional(),
    experienceLevel: z.string().optional(),
    education: z.string().optional(),
    vacancies: z.string(),
    benefits: z.string().optional(),
    skills: z.string().optional(),
  })
  .refine(
    (v) => !v.salaryMin || !v.salaryMax || Number(v.salaryMax) >= Number(v.salaryMin),
    { message: "الحد الأعلى للراتب يجب أن يكون أكبر من الحد الأدنى", path: ["salaryMax"] },
  );

const EXP_OPTIONS = EXPERIENCE_LEVELS.map((l) => ({ value: l.value, label: l.label }));
const EDU_OPTIONS = EDUCATION_LEVELS.map((l) => ({ value: l.value, label: l.label }));

const FALLBACK_DEPT_OPTIONS = [
  { value: "الإدارة", label: "الإدارة" },
  { value: "الموارد البشرية", label: "الموارد البشرية" },
  { value: "المالية", label: "المالية" },
  { value: "تقنية المعلومات", label: "تقنية المعلومات" },
  { value: "العمليات", label: "العمليات" },
];

function JobTypePicker() {
  const { watch, setValue } = useFormContext();
  const type = watch("type") as string;
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <Briefcase className="h-4 w-4" /> نوع التوظيف
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {JOB_TYPES.map((jt) => (
          <button
            key={jt.value}
            type="button"
            onClick={() => setValue("type", jt.value)}
            className={cn(
              "p-3 rounded-xl border-2 text-center text-sm font-medium transition-all",
              type === jt.value ? jt.color + " ring-2 ring-offset-1" : "border-border hover:border-border",
            )}
          >
            {jt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SalaryRangePreview() {
  const { watch } = useFormContext();
  const salaryMin = watch("salaryMin") as string;
  const salaryMax = watch("salaryMax") as string;
  if (!salaryMin || !salaryMax) return null;
  return (
    <div className="p-3 bg-status-success-surface rounded-lg border border-status-success-surface text-center">
      <p className="text-xs text-status-success-foreground">نطاق الراتب</p>
      <p className="text-sm font-bold text-status-success-foreground">
        {formatCurrency(Number(salaryMin))} - {formatCurrency(Number(salaryMax))}
      </p>
    </div>
  );
}

function JobSummary() {
  const { watch } = useFormContext();
  const title = watch("title") as string;
  const department = watch("department") as string;
  const type = watch("type") as string;
  const location = watch("location") as string;
  const vacancies = watch("vacancies") as string;
  const closingDate = watch("closingDate") as string;
  if (!title && !department && !type) return null;
  return (
    <div className="p-4 bg-status-info-surface rounded-xl border border-status-info-surface">
      <h4 className="text-sm font-semibold text-status-info-foreground mb-2">ملخص الوظيفة</h4>
      <div className="flex flex-wrap gap-2">
        {title && <Badge variant="outline">{title}</Badge>}
        {department && <Badge variant="outline">{department}</Badge>}
        {type && <Badge variant="outline">{JOB_TYPES.find(t => t.value === type)?.label}</Badge>}
        {location && <Badge variant="outline"><MapPin className="h-3 w-3 me-1" />{location}</Badge>}
        {vacancies && Number(vacancies) > 1 && <Badge variant="outline"><Users className="h-3 w-3 me-1" />{vacancies} شواغر</Badge>}
        {closingDate && <Badge variant="outline"><Clock className="h-3 w-3 me-1" />يُغلق: {closingDate}</Badge>}
      </div>
    </div>
  );
}

export default function RecruitmentCreate() {
  const [, setLocation] = useLocation();
  const createMut = useApiMutation("/hr/recruitment/postings", "POST", [["jobs"]], {
    successMessage: "تم إضافة الوظيفة بنجاح",
  });
  const { data: deptData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["departments-list"],
    "/settings/departments",
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const departments = deptData?.data || [];
  const deptOptions = departments.length > 0
    ? departments.map((d: any) => ({ value: d.name, label: d.name }))
    : FALLBACK_DEPT_OPTIONS;

  return (
    <CreatePageLayout title="إضافة وظيفة جديدة" backPath="/hr/recruitment">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          department: "",
          location: "",
          type: "full-time",
          description: "",
          requirements: "",
          salaryMin: "",
          salaryMax: "",
          closingDate: "",
          experienceLevel: "",
          education: "",
          vacancies: "1",
          benefits: "",
          skills: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "نشر الوظيفة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/recruitment")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                ...values,
                salaryMin: values.salaryMin ? Number(values.salaryMin) : undefined,
                salaryMax: values.salaryMax ? Number(values.salaryMax) : undefined,
                closingDate: values.closingDate || undefined,
                vacancies: values.vacancies ? Number(values.vacancies) : 1,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/recruitment");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <JobTypePicker />
        <FormGrid cols={3}>
          <FormTextField name="title" label="المسمى الوظيفي" required placeholder="مثال: مهندس برمجيات" />
          <FormSelectField name="department" label="القسم" options={deptOptions} placeholder="اختر القسم" />
          <FormTextField name="location" label="الموقع" placeholder="المدينة أو الفرع" />
          <FormNumberField name="vacancies" label="عدد الشواغر" min="1" />
          <FormSelectField name="experienceLevel" label="مستوى الخبرة" options={EXP_OPTIONS} placeholder="اختر المستوى" />
          <FormSelectField name="education" label="المؤهل العلمي" options={EDU_OPTIONS} placeholder="اختر المؤهل" />
        </FormGrid>

        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> نطاق الراتب
        </h3>
        <FormGrid cols={3}>
          <FormNumberField name="salaryMin" label={`الحد الأدنى (${getCurrencySymbol()})`} placeholder="٠" min="0" />
          <FormNumberField name="salaryMax" label={`الحد الأعلى (${getCurrencySymbol()})`} placeholder="٠" min="0" />
          <SalaryRangePreview />
        </FormGrid>

        <FormGrid cols={2}>
          <FormDateField name="closingDate" label="تاريخ الإغلاق" />
        </FormGrid>

        <FormTextareaField name="description" label="الوصف الوظيفي" placeholder="وصف تفصيلي للمهام والمسؤوليات..." rows={4} />
        <FormTextareaField name="requirements" label="المتطلبات والمهارات" placeholder="المهارات والخبرات المطلوبة..." rows={3} />
        <FormTextareaField name="benefits" label="المزايا والحوافز" placeholder="تأمين طبي، بدل نقل، إجازات..." />

        <JobSummary />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات الوظيفة (وصف وظيفي، نماذج)" />
      </FormShell>
    </CreatePageLayout>
  );
}
