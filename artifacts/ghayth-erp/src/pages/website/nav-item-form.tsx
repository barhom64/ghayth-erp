import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormNumberField,
  FormCheckboxField,
  FormGrid,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const num = (s?: string) => (s != null && s !== "" ? Number(s) : undefined);

const schema = z.object({
  label: z.string().min(1, "العنوان مطلوب"),
  url: z.string().min(1, "الرابط مطلوب"),
  openInNewTab: z.boolean().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteNavItemForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/nav-items/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-nav"], "/site/nav-items");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/nav-items/${id}` : "/site/nav-items",
    isEdit ? "PUT" : "POST",
    [["site-nav"]],
    {
      successMessage: isEdit ? "تم تحديث العنصر" : "تم إنشاء العنصر",
      onSuccess: () => navigate("/website/nav-items"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("العنصر غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    label: existing?.label ?? "",
    url: existing?.url ?? "",
    openInNewTab: existing?.openInNewTab ?? false,
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell title={isEdit ? "تعديل عنصر" : "عنصر جديد"} subtitle="عنصر في قائمة التنقّل العلوية للموقع">
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء العنصر"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/nav-items")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            label: v.label,
            url: v.url,
            openInNewTab: v.openInNewTab ?? false,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="label" label="العنوان" required />
          <FormTextField name="url" label="الرابط" required placeholder="/packages" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormCheckboxField name="openInNewTab" label="فتح في نافذة جديدة" />
        <FormCheckboxField name="isActive" label="مفعّل (يظهر في القائمة)" />
      </FormShell>
    </PageShell>
  );
}
