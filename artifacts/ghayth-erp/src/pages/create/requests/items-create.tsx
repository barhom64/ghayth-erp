import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function RequestsItemCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("requests_item_create", {
    title: "", typeId: "", priority: "medium", requester: "", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>("/requests", "POST", [["requests"]]);
  const { data: typesRes, isLoading, isError } = useApiQuery<{ data: any[] }>(["request-types"], "/requests/types");
  const types = typesRes?.data || [];
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = () => {
    const firstError = validate({
      title: form.title ? null : "يرجى إدخال عنوان الطلب",
      description: form.description ? null : "يرجى إدخال وصف الطلب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({
      title: form.title,
      typeId: form.typeId || undefined,
      priority: form.priority,
      requester: form.requester || undefined,
      description: form.description || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء الطلب بنجاح" }); setLocation("/requests"); },
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الطلب", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="طلب جديد" backPath="/requests">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="عنوان الطلب" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="عنوان الطلب" error={fieldErrors.title} />
          <FormFieldWrapper label="النوع">
            <Select value={form.typeId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, typeId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر النوع</SelectItem>
                {types.map((t: { id: number; name: string }) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الأولوية">
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="urgent">عاجلة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="مقدم الطلب" value={form.requester} onChange={(v) => setForm((f) => ({ ...f, requester: v }))} placeholder="اسم مقدم الطلب" />
        </div>
        <TextAreaField label="التفاصيل" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="تفاصيل الطلب..." />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/requests")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
