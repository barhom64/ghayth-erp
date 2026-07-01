import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormNumberField,
  FormImageField,
  FormTextareaField,
  FormCheckboxField,
  FormGrid,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);
const toDateInput = (v?: string) => (v ? String(v).slice(0, 10) : "");

const schema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  message: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  bgColor: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteBannerForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/banners/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-banners"], "/site/banners");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/banners/${id}` : "/site/banners",
    isEdit ? "PUT" : "POST",
    [["site-banners"]],
    {
      successMessage: isEdit ? "تم تحديث البانر" : "تم إنشاء البانر",
      onSuccess: () => navigate("/website/banners"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("البانر غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    title: existing?.title ?? "",
    message: existing?.message ?? "",
    ctaLabel: existing?.ctaLabel ?? "",
    ctaUrl: existing?.ctaUrl ?? "",
    imageUrl: existing?.imageUrl ?? "",
    bgColor: existing?.bgColor ?? "",
    startsAt: toDateInput(existing?.startsAt),
    endsAt: toDateInput(existing?.endsAt),
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell
      title={isEdit ? "تعديل بانر" : "بانر جديد"}
      subtitle="بانر إعلاني/حملة ترويجية يُعرض على الموقع الإلكتروني"
    >
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء البانر"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/banners")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            title: v.title,
            message: v.message || undefined,
            ctaLabel: v.ctaLabel || undefined,
            ctaUrl: v.ctaUrl || undefined,
            imageUrl: v.imageUrl || undefined,
            bgColor: v.bgColor || undefined,
            startsAt: v.startsAt || null,
            endsAt: v.endsAt || null,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="title" label="العنوان" required />
          <FormTextField name="bgColor" label="لون الخلفية (مثل: #0b7)" />
        </FormGrid>
        <FormTextareaField name="message" label="نص الرسالة" rows={2} />
        <FormGrid>
          <FormTextField name="ctaLabel" label="نص زر الإجراء" />
          <FormTextField name="ctaUrl" label="رابط زر الإجراء" />
        </FormGrid>
        <FormImageField name="imageUrl" label="صورة البانر" />
        <FormGrid>
          <FormTextField name="startsAt" label="تاريخ البدء (YYYY-MM-DD)" placeholder="2026-07-01" />
          <FormTextField name="endsAt" label="تاريخ الانتهاء (YYYY-MM-DD)" placeholder="2026-07-31" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="isActive" label="مفعّل (يظهر على الموقع ضمن نافذته الزمنية)" />
      </FormShell>
    </PageShell>
  );
}
