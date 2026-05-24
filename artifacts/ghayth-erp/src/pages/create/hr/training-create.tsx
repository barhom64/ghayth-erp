import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
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
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { BookOpen, Clock, Users, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAINING_TYPES, TRAINING_CATEGORIES } from "@/lib/hr-type-maps";

const schema = z
  .object({
    title: z.string().min(1, "عنوان البرنامج مطلوب"),
    description: z.string().optional(),
    category: z.string().optional(),
    trainer: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    capacity: z.string().optional(),
    location: z.string().optional(),
    type: z.string().optional(),
    provider: z.string().optional(),
    duration: z.string().optional(),
    durationUnit: z.enum(["hours", "days", "weeks"]),
    cost: z.string().optional(),
    maxParticipants: z
      .string()
      .optional()
      .refine(
        (v) => !v || Number(v) > 0,
        "السعة القصوى يجب أن تكون أكبر من صفر",
      ),
    objectives: z.string().optional(),
    targetAudience: z.string().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", path: ["endDate"] },
  );

const CATEGORY_OPTIONS = TRAINING_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
const DURATION_UNIT_OPTIONS = [
  { value: "hours", label: "ساعات" },
  { value: "days", label: "أيام" },
  { value: "weeks", label: "أسابيع" },
];

function TypePicker() {
  const { watch, setValue } = useFormContext();
  const type = watch("type") as string;
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4" /> نوع التدريب
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {TRAINING_TYPES.map((tt) => (
          <button
            key={tt.value}
            type="button"
            onClick={() => setValue("type", tt.value)}
            className={cn(
              "p-3 rounded-xl border-2 text-center transition-all",
              type === tt.value ? tt.color + " ring-2 ring-offset-1" : "border-border hover:border-border",
            )}
          >
            <span className="text-xl block mb-1">{tt.icon}</span>
            <span className="text-xs font-medium">{tt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProgramSummary() {
  const { watch } = useFormContext();
  const title = watch("title") as string;
  const type = watch("type") as string;
  const category = watch("category") as string;
  const duration = watch("duration") as string;
  const durationUnit = watch("durationUnit") as string;
  const maxParticipants = watch("maxParticipants") as string;
  const cost = watch("cost") as string;

  if (!title) return null;

  const durationDisplay = duration
    ? `${duration} ${durationUnit === "hours" ? "ساعة" : durationUnit === "days" ? "يوم" : "أسبوع"}`
    : null;

  return (
    <div className="p-4 bg-status-info-surface rounded-xl border border-status-info-surface">
      <h4 className="text-sm font-semibold text-status-info-foreground mb-2">ملخص البرنامج</h4>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{title}</Badge>
        {type && <Badge variant="outline">{TRAINING_TYPES.find(t => t.value === type)?.label}</Badge>}
        {category && <Badge variant="outline">{TRAINING_CATEGORIES.find(c => c.value === category)?.label}</Badge>}
        {durationDisplay && <Badge variant="outline"><Clock className="h-3 w-3 me-1" />{durationDisplay}</Badge>}
        {maxParticipants && <Badge variant="outline"><Users className="h-3 w-3 me-1" />{maxParticipants} مشارك</Badge>}
        {cost && <Badge variant="outline"><DollarSign className="h-3 w-3 me-1" />{formatCurrency(Number(cost))}</Badge>}
      </div>
    </div>
  );
}

export default function TrainingCreate() {
  const [, setLocation] = useLocation();
  const createMut = useApiMutation("/hr/training/programs", "POST", [["training-programs"]], {
    successMessage: "تم إضافة البرنامج التدريبي بنجاح",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="إضافة برنامج تدريبي" backPath="/hr/training">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          description: "",
          category: "",
          trainer: "",
          startDate: "",
          endDate: "",
          capacity: "",
          location: "",
          type: "",
          provider: "",
          duration: "",
          durationUnit: "hours",
          cost: "",
          maxParticipants: "",
          objectives: "",
          targetAudience: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ البرنامج"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/training")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                title: values.title,
                description: values.description || undefined,
                category: values.category || undefined,
                trainer: values.trainer || undefined,
                startDate: values.startDate || undefined,
                endDate: values.endDate || undefined,
                capacity: values.capacity ? Number(values.capacity) : undefined,
                location: values.location || undefined,
                type: values.type || undefined,
                provider: values.provider || undefined,
                duration: values.duration ? Number(values.duration) : undefined,
                durationUnit: values.durationUnit || undefined,
                cost: values.cost ? Number(values.cost) : 0,
                maxParticipants: values.maxParticipants ? Number(values.maxParticipants) : undefined,
                objectives: values.objectives || undefined,
                targetAudience: values.targetAudience || undefined,
                ...(attachments.length > 0 ? { attachments } : {}),
              },
              {
                onSuccess: () => {
                  setLocation("/hr/training");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <TypePicker />
        <FormGrid cols={2}>
          <FormTextField name="title" label="العنوان" required placeholder="اسم البرنامج التدريبي" />
          <FormSelectField name="category" label="التصنيف" options={CATEGORY_OPTIONS} placeholder="اختر التصنيف" />
          <FormTextField name="provider" label="جهة التدريب" placeholder="اسم الجهة المقدمة" />
          <FormTextField name="trainer" label="المدرب" placeholder="اسم المدرب" />
          <FormTextField name="location" label="المكان" placeholder="قاعة التدريب أو الرابط" />
          <FormNumberField name="maxParticipants" label="السعة القصوى" placeholder="عدد المشاركين" min="1" />
        </FormGrid>

        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" /> المدة والتواريخ
        </h3>
        <FormGrid cols={4}>
          <FormNumberField name="duration" label="المدة" placeholder="٠" min="0" />
          <FormSelectField name="durationUnit" label="وحدة المدة" options={DURATION_UNIT_OPTIONS} />
          <FormDateField name="startDate" label="تاريخ البدء" />
          <FormDateField name="endDate" label="تاريخ الانتهاء" />
        </FormGrid>

        <FormGrid cols={2}>
          <FormNumberField name="cost" label={`التكلفة (${getCurrencySymbol()})`} placeholder="٠" step="0.01" min="0" />
          <FormTextField name="targetAudience" label="الفئة المستهدفة" placeholder="المدراء، الموظفون الجدد..." />
        </FormGrid>

        <FormTextareaField name="objectives" label="أهداف البرنامج" placeholder="الأهداف المتوقعة من البرنامج التدريبي..." rows={3} />
        <FormTextareaField name="description" label="الوصف التفصيلي" placeholder="وصف البرنامج التدريبي ومحتوياته..." rows={3} />

        <ProgramSummary />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التدريب (منهج، مواد تدريبية)" />
      </FormShell>
    </CreatePageLayout>
  );
}
