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

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  role: z.string().optional(),
  bio: z.string().optional(),
  photoUrl: z.string().optional(),
  sortOrder: z.string().optional(),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function WebsiteTeamForm() {
  const [, navigate] = useLocation();
  const [isEdit, params] = useRoute("/website/team/:id/edit");
  const id = params?.id;

  const listQ = useApiQuery<any>(["site-team"], "/site/team");
  const existing = isEdit ? asList<any>(listQ.data).find((r) => String(r.id) === id) : null;

  const save = useApiMutation<any, any>(
    isEdit ? `/site/team/${id}` : "/site/team",
    isEdit ? "PUT" : "POST",
    [["site-team"]],
    {
      successMessage: isEdit ? "تم تحديث العضو" : "تم إنشاء العضو",
      onSuccess: () => navigate("/website/team"),
    },
  );

  if (isEdit && listQ.isLoading) return <LoadingSpinner />;
  if (isEdit && !existing)
    return <ErrorState error={new Error("العضو غير موجود")} onRetry={() => listQ.refetch()} />;

  const defaults: FormValues = {
    name: existing?.name ?? "",
    role: existing?.role ?? "",
    bio: existing?.bio ?? "",
    photoUrl: existing?.photoUrl ?? "",
    sortOrder: existing?.sortOrder != null ? String(existing.sortOrder) : "",
    isActive: existing?.isActive ?? true,
  };

  return (
    <PageShell title={isEdit ? "تعديل عضو" : "عضو جديد"} subtitle="عضو فريق يُعرض على الموقع الإلكتروني">
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isEdit ? "حفظ التعديلات" : "إنشاء العضو"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/website/team")}>
            إلغاء
          </Button>
        }
        onSubmit={async (v) => {
          await save.mutateAsync({
            name: v.name,
            role: v.role || undefined,
            bio: v.bio || undefined,
            photoUrl: v.photoUrl || undefined,
            sortOrder: num(v.sortOrder),
            isActive: v.isActive ?? true,
          });
        }}
      >
        <FormGrid>
          <FormTextField name="name" label="الاسم" required />
          <FormTextField name="role" label="المنصب" />
          <FormImageField name="photoUrl" label="الصورة الشخصية" />
          <FormNumberField name="sortOrder" label="ترتيب العرض" />
        </FormGrid>
        <FormTextareaField name="bio" label="نبذة" rows={3} />
        <FormCheckboxField name="isActive" label="مفعّل (يظهر على الموقع)" />
      </FormShell>
    </PageShell>
  );
}
