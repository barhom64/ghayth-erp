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
  name: z.string().min(1, "الاسم مطلوب"),
  slug: z
    .string()
    .min(1, "المعرّف مطلوب")
    .regex(/^[a-z0-9-]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  subtitle: z.string().optional(),
  price: z.string().optional(),
  currency: z.string().optional(),
  durationLabel: z.string().optional(),
  durationDays: z.string().optional(),
  badge: z.string().optional(),
  featuresText: z.string().optional(),
  notIncludedText: z.string().optional(),
  imageUrl: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsitePackageForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/packages/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-packages"], "/site/packages");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/packages/${id}` : "/site/packages",
    isEdit ? "PUT" : "POST",
    [["site-packages"]],
    {
      successMessage: isEdit ? "تم تحديث الباقة" : "تم إنشاء الباقة",
      onSuccess: () => navigate("/website/packages"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("الباقة غير موجودة")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    subtitle: existing?.subtitle ?? "",
    price: existing?.price != null ? String(existing.price) : "",
    currency: existing?.currency ?? "ر.س",
    durationLabel: existing?.durationLabel ?? "",
    durationDays: existing?.durationDays != null ? String(existing.durationDays) : "",
    badge: existing?.badge ?? "",
    featuresText: joinLines(existing?.features),
    notIncludedText: joinLines(existing?.notIncluded),
    imageUrl: existing?.imageUrl ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell
      title={isEdit ? "تعديل باقة" : "باقة جديدة"}
      subtitle="باقة عمرة تُعرض على الموقع الإلكتروني"
    >
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء الباقة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/packages")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            name: v.name,
            slug: v.slug,
            subtitle: v.subtitle || undefined,
            price: num(v.price),
            currency: v.currency || undefined,
            durationLabel: v.durationLabel || undefined,
            durationDays: num(v.durationDays),
            badge: v.badge || undefined,
            features: splitLines(v.featuresText),
            notIncluded: splitLines(v.notIncludedText),
            imageUrl: v.imageUrl || undefined,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="name" label="اسم الباقة" required />
          <FormTextField name="slug" label="المعرّف (slug)" required placeholder="economy" />
          <FormTextField name="subtitle" label="العنوان الفرعي" />
          <FormTextField name="badge" label="الوسم (مثل: الأكثر طلباً)" />
        </FormGrid>
        <FormGrid>
          <FormNumberField name="price" label="السعر" />
          <FormTextField name="currency" label="العملة" />
          <FormTextField name="durationLabel" label="وصف المدة (مثل: ١٠ أيام)" />
          <FormNumberField name="durationDays" label="عدد الأيام" />
        </FormGrid>
        <FormTextareaField
          name="featuresText"
          label="المزايا (سطر لكل ميزة)"
          rows={5}
          placeholder={"إقامة فندقية\nنقل مكيّف\nوجبات"}
        />
        <FormTextareaField
          name="notIncludedText"
          label="غير شامل (سطر لكل بند)"
          rows={3}
        />
        <FormGrid>
          <FormTextField name="imageUrl" label="رابط الصورة" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="isActive" label="مفعّلة (تظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
