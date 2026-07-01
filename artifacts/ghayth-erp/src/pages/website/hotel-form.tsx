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
  FormSelectField,
  FormCheckboxField,
  FormGrid,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  slug: z
    .string()
    .min(1, "المعرّف مطلوب")
    .regex(/^[a-z0-9-]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  city: z.string().optional(),
  distanceLabel: z.string().optional(),
  stars: z.string().optional(),
  badge: z.string().optional(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteHotelForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/hotels/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-hotels"], "/site/hotels");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/hotels/${id}` : "/site/hotels",
    isEdit ? "PUT" : "POST",
    [["site-hotels"]],
    {
      successMessage: isEdit ? "تم تحديث الفندق" : "تم إنشاء الفندق",
      onSuccess: () => navigate("/website/hotels"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("الفندق غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    city: existing?.city ?? "",
    distanceLabel: existing?.distanceLabel ?? "",
    stars: existing?.stars != null ? String(existing.stars) : "",
    badge: existing?.badge ?? "",
    imageUrl: existing?.imageUrl ?? "",
    description: existing?.description ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell
      title={isEdit ? "تعديل فندق" : "فندق جديد"}
      subtitle="فندق يُعرض على الموقع الإلكتروني"
    >
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء الفندق"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/hotels")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            name: v.name,
            slug: v.slug,
            city: v.city || undefined,
            distanceLabel: v.distanceLabel || undefined,
            stars: num(v.stars),
            badge: v.badge || undefined,
            imageUrl: v.imageUrl || undefined,
            description: v.description || undefined,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="name" label="اسم الفندق" required />
          <FormTextField name="slug" label="المعرّف (slug)" required placeholder="makkah-hotel" />
          <FormTextField name="city" label="المدينة" />
          <FormTextField name="distanceLabel" label="المسافة (مثل: ٢٠٠م من الحرم)" />
        </FormGrid>
        <FormGrid>
          <FormSelectField
            name="stars"
            label="التصنيف (نجوم)"
            placeholder="اختر التصنيف"
            options={[
              { value: "1", label: "★" },
              { value: "2", label: "★★" },
              { value: "3", label: "★★★" },
              { value: "4", label: "★★★★" },
              { value: "5", label: "★★★★★" },
            ]}
          />
          <FormTextField name="badge" label="الوسم" />
          <FormImageField name="imageUrl" label="صورة الفندق" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" rows={3} />
        <FormCheckboxField name="isActive" label="مفعّل (يظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
