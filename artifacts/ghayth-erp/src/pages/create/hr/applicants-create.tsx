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
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { User, Briefcase, GraduationCap } from "lucide-react";
import { APPLICANT_SOURCES, EDUCATION_LEVELS } from "@/lib/hr-type-maps";

const schema = z.object({
  postingId: z.string().min(1, "يرجى اختيار الوظيفة"),
  applicantName: z.string().min(1, "اسم المتقدم مطلوب"),
  email: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "صيغة البريد الإلكتروني غير صحيحة",
    ),
  phone: z.string().optional(),
  notes: z.string().optional(),
  resumeUrl: z.string().optional(),
  source: z.string().optional(),
  experience: z.string().optional(),
  education: z.string().optional(),
  expectedSalary: z.string().optional(),
  currentCompany: z.string().optional(),
  rating: z.string().optional(),
});

const SOURCE_OPTIONS = APPLICANT_SOURCES.map((s) => ({ value: s.value, label: s.label }));
const EDU_OPTIONS = EDUCATION_LEVELS.map((l) => ({ value: l.value, label: l.label }));

function JobPreview({ jobs }: { jobs: any[] }) {
  const { watch } = useFormContext();
  const postingId = watch("postingId") as string;
  const selectedJob = jobs.find((j: any) => String(j.id) === postingId);
  if (!selectedJob) return null;
  return (
    <div className="p-3 bg-status-info-surface rounded-lg border border-status-info-surface">
      <p className="text-sm font-medium text-status-info-foreground">{selectedJob.title}</p>
      <p className="text-xs text-status-info">{selectedJob.department} • {selectedJob.location || "—"}</p>
    </div>
  );
}

function ApplicantSummary({ jobs }: { jobs: any[] }) {
  const { watch } = useFormContext();
  const applicantName = watch("applicantName") as string;
  const postingId = watch("postingId") as string;
  const education = watch("education") as string;
  const experience = watch("experience") as string;
  const source = watch("source") as string;
  if (!applicantName) return null;
  const selectedJob = jobs.find((j: any) => String(j.id) === postingId);
  return (
    <div className="p-4 bg-status-success-surface rounded-xl border border-status-success-surface">
      <h4 className="text-sm font-semibold text-status-success-foreground mb-2">ملخص المتقدم</h4>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{applicantName}</Badge>
        {selectedJob && <Badge variant="outline"><Briefcase className="h-3 w-3 me-1" />{selectedJob.title}</Badge>}
        {education && <Badge variant="outline">{EDUCATION_LEVELS.find(l => l.value === education)?.label || education}</Badge>}
        {experience && <Badge variant="outline">{experience} خبرة</Badge>}
        {source && <Badge variant="outline">{APPLICANT_SOURCES.find(s => s.value === source)?.label}</Badge>}
      </div>
    </div>
  );
}

export default function ApplicantsCreate() {
  const [, setLocation] = useLocation();
  const createMut = useApiMutation("/hr/recruitment/applications", "POST", [["applicants"]], {
    successMessage: "تم إضافة المتقدم بنجاح",
  });
  const { data: jobsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["jobs"],
    "/hr/recruitment/postings",
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const jobs = jobsData?.data || [];
  const jobOptions = jobs.map((job: any) => ({
    value: String(job.id),
    label: `${job.title} ${job.department ? `— ${job.department}` : ""}`,
  }));

  return (
    <CreatePageLayout title="إضافة متقدم جديد" backPath="/hr/recruitment">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          postingId: "",
          applicantName: "",
          email: "",
          phone: "",
          notes: "",
          resumeUrl: "",
          source: "",
          experience: "",
          education: "",
          expectedSalary: "",
          currentCompany: "",
          rating: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "إضافة المتقدم"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/recruitment")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                postingId: Number(values.postingId),
                applicantName: values.applicantName,
                email: values.email || undefined,
                phone: values.phone || undefined,
                notes: values.notes || undefined,
                resumeUrl: values.resumeUrl || undefined,
                source: values.source || undefined,
                experience: values.experience || undefined,
                education: values.education || undefined,
                expectedSalary: values.expectedSalary ? Number(values.expectedSalary) : undefined,
                currentCompany: values.currentCompany || undefined,
                rating: values.rating ? Number(values.rating) : undefined,
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
        <FormGrid cols={2}>
          <FormSelectField name="postingId" label="الوظيفة" required options={jobOptions} placeholder="اختر الوظيفة" />
          <JobPreview jobs={jobs} />
        </FormGrid>

        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <User className="h-4 w-4" /> بيانات المتقدم
        </h3>
        <FormGrid cols={3}>
          <FormTextField name="applicantName" label="الاسم الكامل" required placeholder="الاسم الرباعي" />
          <FormEmailField name="email" label="البريد الإلكتروني" placeholder="email@example.com" />
          <FormPhoneField name="phone" label="الهاتف" placeholder="+966 5xx xxx xxx" />
        </FormGrid>

        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <GraduationCap className="h-4 w-4" /> المؤهلات والخبرة
        </h3>
        <FormGrid cols={3}>
          <FormSelectField name="education" label="المؤهل العلمي" options={EDU_OPTIONS} placeholder="اختر المؤهل" />
          <FormTextField name="experience" label="سنوات الخبرة" placeholder="مثال: 5 سنوات" />
          <FormTextField name="currentCompany" label="الشركة الحالية" placeholder="اسم جهة العمل الحالية" />
          <FormNumberField name="expectedSalary" label="الراتب المتوقع" placeholder="٠" min="0" />
          <FormSelectField name="source" label="مصدر التقديم" options={SOURCE_OPTIONS} placeholder="اختر المصدر" />
          <FormNumberField name="rating" label="التقييم المبدئي (1-5)" placeholder="—" min="1" max="5" />
        </FormGrid>

        <FormTextField name="resumeUrl" label="رابط السيرة الذاتية" placeholder="https://..." />
        <FormTextareaField name="notes" label="ملاحظات إضافية" placeholder="الخبرات، المؤهلات الإضافية، نقاط القوة..." rows={3} />

        <ApplicantSummary jobs={jobs} />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="المرفقات (سيرة ذاتية، شهادات)" />
      </FormShell>
    </CreatePageLayout>
  );
}
