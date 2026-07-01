import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreatePageLayout } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

interface WhatsAppTemplate {
  id: number;
  name: string;
  language: string;
  category: string;
  status: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  rejectionReason: string | null;
}

export default function WhatsAppTemplateEdit() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/marketing/whatsapp-templates/:id/edit");
  const id = params?.id;
  const { toast } = useToast();
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { data, isLoading, isError, error, refetch } = useApiQuery<WhatsAppTemplate>(
    ["mkt-wa-template", String(id ?? "")], id ? `/marketing/whatsapp-templates/${id}` : null,
  );
  const updateMut = useApiMutation(`/marketing/whatsapp-templates/${id}`, "PATCH", [["mkt-wa-templates"], ["mkt-wa-template", String(id ?? "")]]);

  const [form, setForm] = useState({
    name: "", language: "ar", category: "MARKETING", status: "draft",
    headerText: "", bodyText: "", footerText: "", rejectionReason: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        language: data.language ?? "ar",
        category: data.category ?? "MARKETING",
        status: data.status ?? "draft",
        headerText: data.headerText ?? "",
        bodyText: data.bodyText ?? "",
        footerText: data.footerText ?? "",
        rejectionReason: data.rejectionReason ?? "",
      });
    }
  }, [data]);

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name.trim() ? null : "يرجى إدخال اسم القالب",
      bodyText: form.bodyText.trim() ? null : "يرجى إدخال نص القالب",
    });
    if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    try {
      await updateMut.mutateAsync({
        name: form.name.trim(),
        language: form.language,
        category: form.category,
        status: form.status,
        headerText: orNull(form.headerText),
        bodyText: form.bodyText.trim(),
        footerText: orNull(form.footerText),
        rejectionReason: orNull(form.rejectionReason),
      });
      toast({ title: "تم تحديث القالب بنجاح" });
      setLocation("/marketing/whatsapp-templates");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء تحديث القالب", description: err?.fix ?? err?.message });
    }
  };

  if (isLoading || isError) {
    return (
      <CreatePageLayout title="تعديل قالب واتساب" backPath="/marketing/whatsapp-templates">
        <PageStateWrapper isLoading={isLoading} error={isError ? error : null} onRetry={refetch}><div /></PageStateWrapper>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout title="تعديل قالب واتساب" backPath="/marketing/whatsapp-templates">
      <div className="mb-4 rounded-lg border border-status-info-surface bg-status-info-surface/40 px-4 py-3 text-xs text-status-info-foreground leading-relaxed">
        استخدم <code className="font-mono">{"{{1}}"}</code> و <code className="font-mono">{"{{2}}"}</code> … لمواضع المتغيّرات. لا يمكن الإرسال الجماعي إلا بقالب حالته «معتمد».
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="اسم القالب" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} />
        <FormFieldWrapper label="اللغة">
          <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">عربي</SelectItem>
              <SelectItem value="en">إنجليزي</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الفئة">
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MARKETING">تسويقي</SelectItem>
              <SelectItem value="UTILITY">خدمي</SelectItem>
              <SelectItem value="AUTHENTICATION">مصادقة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="pending">قيد المراجعة</SelectItem>
              <SelectItem value="approved">معتمد</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextField label="ترويسة (اختياري)" value={form.headerText} onChange={(v) => setForm((f) => ({ ...f, headerText: v }))} className="md:col-span-2" />
        <TextAreaField label="نص القالب" required value={form.bodyText} onChange={(v) => setForm((f) => ({ ...f, bodyText: v }))} className="md:col-span-2" error={fieldErrors.bodyText} />
        <TextField label="تذييل (اختياري)" value={form.footerText} onChange={(v) => setForm((f) => ({ ...f, footerText: v }))} className="md:col-span-2" />
        {form.status === "rejected" && (
          <TextField label="سبب الرفض (اختياري)" value={form.rejectionReason} onChange={(v) => setForm((f) => ({ ...f, rejectionReason: v }))} className="md:col-span-2" />
        )}
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/marketing/whatsapp-templates")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || !form.bodyText || updateMut.isPending} rateLimitAware>
          {updateMut.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
