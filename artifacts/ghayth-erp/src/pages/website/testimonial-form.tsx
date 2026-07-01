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
  authorName: z.string().min(1, "اسم العميل مطلوب"),
  authorTitle: z.string().optional(),
  body: z.string().min(1, "نص الرأي مطلوب"),
  rating: z.string().optional(),
  avatarUrl: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteTestimonialForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/testimonials/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-testimonials"], "/site/testimonials");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/testimonials/${id}` : "/site/testimonials",
    isEdit ? "PUT" : "POST",
    [["site-testimonials"]],
    {
      successMessage: isEdit ? "تم تحديث الرأي" : "تم إنشاء الرأي",
      onSuccess: () => navigate("/website/testimonials"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("الرأي غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    authorName: existing?.authorName ?? "",
    authorTitle: existing?.authorTitle ?? "",
    body: existing?.body ?? "",
    rating: existing?.rating != null ? String(existing.rating) : "",
    avatarUrl: existing?.avatarUrl ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell title={isEdit ? "تعديل رأي" : "رأي جديد"} subtitle="رأي عميل يُعرض على الموقع الإلكتروني">
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء الرأي"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/testimonials")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            authorName: v.authorName,
            authorTitle: v.authorTitle || undefined,
            body: v.body,
            rating: num(v.rating) ?? null,
            avatarUrl: v.avatarUrl || undefined,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="authorName" label="اسم العميل" required />
          <FormTextField name="authorTitle" label="الصفة (مثل: معتمر)" />
        </FormGrid>
        <FormTextareaField name="body" label="نص الرأي" rows={4} />
        <FormGrid>
          <FormSelectField
            name="rating"
            label="التقييم"
            placeholder="اختر التقييم"
            options={[
              { value: "1", label: "★" },
              { value: "2", label: "★★" },
              { value: "3", label: "★★★" },
              { value: "4", label: "★★★★" },
              { value: "5", label: "★★★★★" },
            ]}
          />
          <FormImageField name="avatarUrl" label="صورة العميل" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="isActive" label="مفعّل (يظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
