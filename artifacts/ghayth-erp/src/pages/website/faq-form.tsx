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

const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);

const schema = z.object({
  question: z.string().min(1, "السؤال مطلوب"),
  answer: z.string().min(1, "الإجابة مطلوبة"),
  category: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteFaqForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/faqs/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-faqs"], "/site/faqs");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/faqs/${id}` : "/site/faqs",
    isEdit ? "PUT" : "POST",
    [["site-faqs"]],
    {
      successMessage: isEdit ? "تم تحديث السؤال" : "تم إنشاء السؤال",
      onSuccess: () => navigate("/website/faqs"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("السؤال غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    question: existing?.question ?? "",
    answer: existing?.answer ?? "",
    category: existing?.category ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell title={isEdit ? "تعديل سؤال" : "سؤال جديد"} subtitle="سؤال يُعرض في الأسئلة الشائعة على الموقع">
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء السؤال"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/faqs")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            question: v.question,
            answer: v.answer,
            category: v.category || undefined,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormTextField name="question" label="السؤال" required />
        <FormTextareaField name="answer" label="الإجابة" rows={4} />
        <FormGrid>
          <FormTextField name="category" label="التصنيف" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="isActive" label="مفعّل (يظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
