import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z
  .object({
    name: z.string().min(1, "يرجى إدخال اسم الحملة"),
    description: z.string().optional(),
    type: z.enum(["digital", "email", "sms", "social_media", "print", "event"]),
    channel: z.string().optional(),
    budget: z
      .string()
      .optional()
      .refine((v) => !v || Number(v) >= 0, "الميزانية يجب أن تكون 0 أو أكثر"),
    targetAudience: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.enum(["draft", "active", "paused", "completed"]),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate > v.startDate,
    { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", path: ["endDate"] },
  );

const TYPE_OPTIONS = [
  { value: "digital", label: "إعلان رقمي" },
  { value: "email", label: "بريد إلكتروني" },
  { value: "sms", label: "رسائل نصية" },
  { value: "social_media", label: "وسائل تواصل" },
  { value: "print", label: "مطبوعات" },
  { value: "event", label: "فعاليات" },
];

const CHANNEL_OPTIONS = [
  { value: "google", label: "إعلانات جوجل" },
  { value: "facebook", label: "فيسبوك" },
  { value: "instagram", label: "إنستغرام" },
  { value: "twitter", label: "منصة إكس" },
  { value: "snapchat", label: "سناب شات" },
  { value: "tiktok", label: "تيك توك" },
  { value: "email", label: "بريد إلكتروني" },
  { value: "sms", label: "رسائل نصية" },
  { value: "other", label: "أخرى" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "active", label: "نشطة" },
  { value: "paused", label: "متوقفة" },
  { value: "completed", label: "مكتملة" },
];

export default function MarketingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/marketing/campaigns", "POST", [["mkt-campaigns"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="حملة تسويقية جديدة" backPath="/marketing">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          description: "",
          type: "digital",
          channel: "",
          budget: "",
          targetAudience: "",
          startDate: "",
          endDate: "",
          status: "draft",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ الحملة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/marketing")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            ...values,
            budget: Number(values.budget) || 0,
          });
          toast({ title: "تم إنشاء الحملة بنجاح" });
          setLocation("/marketing");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم الحملة" required />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
          <FormSelectField name="channel" label="القناة" placeholder="اختر القناة" options={CHANNEL_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormNumberField name="budget" label={`الميزانية (${getCurrencySymbol()})`} placeholder="٠" step="0.01" min="0" />
          <FormTextField name="targetAudience" label="الجمهور المستهدف" placeholder="مثال: شباب 18-35" />
          <FormDateField name="startDate" label="تاريخ البدء" />
          <FormDateField name="endDate" label="تاريخ الانتهاء" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف الحملة التسويقية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
