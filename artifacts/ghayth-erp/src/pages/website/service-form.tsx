import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormNumberField,
  FormTextareaField,
  FormCheckboxField,
  FormGrid,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const splitLines = (s?: string) =>
  (s ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const joinLines = (a?: string[]) => (a ?? []).join("\n");
const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);

const schema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  slug: z
    .string()
    .min(1, "المعرّف مطلوب")
    .regex(/^[a-z0-9-]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  link: z.string().optional(),
  featuresText: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteServiceForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/services/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-services"], "/site/services");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/services/${id}` : "/site/services",
    isEdit ? "PUT" : "POST",
    [["site-services"]],
    {
      successMessage: isEdit ? "تم تحديث الخدمة" : "تم إنشاء الخدمة",
      onSuccess: () => navigate("/website/services"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("الخدمة غير موجودة")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    title: existing?.title ?? "",
    slug: existing?.slug ?? "",
    subtitle: existing?.subtitle ?? "",
    description: existing?.description ?? "",
    icon: existing?.icon ?? "",
    link: existing?.link ?? "",
    featuresText: joinLines(existing?.features),
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell
      title={isEdit ? "تعديل خدمة" : "خدمة جديدة"}
      subtitle="خدمة تُعرض على الموقع الإلكتروني"
    >
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء الخدمة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/services")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            title: v.title,
            slug: v.slug,
            subtitle: v.subtitle || undefined,
            description: v.description || undefined,
            icon: v.icon || undefined,
            link: v.link || undefined,
            features: splitLines(v.featuresText),
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="title" label="عنوان الخدمة" required />
          <FormTextField name="slug" label="المعرّف (slug)" required placeholder="visa" />
          <FormTextField name="subtitle" label="العنوان الفرعي" />
          <FormTextField name="icon" label="الأيقونة (اسم/رمز)" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" rows={3} />
        <FormTextareaField
          name="featuresText"
          label="النقاط (سطر لكل نقطة)"
          rows={4}
        />
        <FormGrid>
          <FormTextField name="link" label="الرابط" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="isActive" label="مفعّلة (تظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
