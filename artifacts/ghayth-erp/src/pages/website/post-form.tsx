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
  FormDateField,
  FormGrid,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);

const schema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  slug: z
    .string()
    .min(1, "المعرّف مطلوب")
    .regex(/^[a-z0-9-]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطات فقط"),
  excerpt: z.string().optional(),
  body: z.string().optional(),
  coverImageUrl: z.string().optional(),
  status: z.string().optional(),
  publishedAt: z.string().optional(),
  sortOrder: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsitePostForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/posts/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-posts"], "/site/posts");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/posts/${id}` : "/site/posts",
    isEdit ? "PUT" : "POST",
    [["site-posts"]],
    {
      successMessage: isEdit ? "تم تحديث المقال" : "تم إنشاء المقال",
      onSuccess: () => navigate("/website/posts"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("المقال غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    title: existing?.title ?? "",
    slug: existing?.slug ?? "",
    excerpt: existing?.excerpt ?? "",
    body: existing?.body ?? "",
    coverImageUrl: existing?.coverImageUrl ?? "",
    status: existing?.status ?? "draft",
    publishedAt: existing?.publishedAt ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
  };

  return (
    <PageShell
      title={isEdit ? "تعديل مقال" : "مقال جديد"}
      subtitle="مقال يُعرض في مدونة الموقع الإلكتروني"
    >
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء المقال"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/posts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            title: v.title,
            slug: v.slug,
            excerpt: v.excerpt || undefined,
            body: v.body || undefined,
            coverImageUrl: v.coverImageUrl || undefined,
            status: v.status || "draft",
            publishedAt: v.publishedAt || undefined,
            sortOrder: num(v.sortOrder),
          });
        }}
      >
        <FormGrid>
          <FormTextField name="title" label="عنوان المقال" required />
          <FormTextField name="slug" label="المعرّف (slug)" required placeholder="my-post" />
        </FormGrid>
        <FormTextareaField name="excerpt" label="المقتطف" rows={2} />
        <FormTextareaField name="body" label="نص المقال" rows={8} />
        <FormGrid>
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "draft", label: "مسودة" },
              { value: "published", label: "منشور" },
            ]}
          />
          <FormDateField name="publishedAt" label="تاريخ النشر" />
          <FormImageField name="coverImageUrl" label="صورة الغلاف" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
      </FormShell>
    </PageShell>
  );
}
