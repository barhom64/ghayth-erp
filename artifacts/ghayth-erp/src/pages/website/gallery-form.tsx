import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormNumberField,
  FormImageField,
  FormCheckboxField,
  FormGrid,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);

const schema = z.object({
  title: z.string().optional(),
  imageUrl: z.string().min(1, "الصورة مطلوبة"),
  category: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteGalleryForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/gallery/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-gallery"], "/site/gallery");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/gallery/${id}` : "/site/gallery",
    isEdit ? "PUT" : "POST",
    [["site-gallery"]],
    {
      successMessage: isEdit ? "تم تحديث الصورة" : "تم إضافة الصورة",
      onSuccess: () => navigate("/website/gallery"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("الصورة غير موجودة")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    title: existing?.title ?? "",
    imageUrl: existing?.imageUrl ?? "",
    category: existing?.category ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell title={isEdit ? "تعديل صورة" : "صورة جديدة"} subtitle="صورة تُعرض في معرض الموقع الإلكتروني">
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إضافة الصورة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/gallery")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            title: v.title || undefined,
            imageUrl: v.imageUrl,
            category: v.category || undefined,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormImageField name="imageUrl" label="الصورة" />
        <FormGrid>
          <FormTextField name="title" label="العنوان" />
          <FormTextField name="category" label="التصنيف" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="isActive" label="مفعّلة (تظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
