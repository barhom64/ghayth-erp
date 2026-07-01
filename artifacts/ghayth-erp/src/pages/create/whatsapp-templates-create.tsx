import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function WhatsAppTemplateCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/marketing/whatsapp-templates", "POST", [["mkt-wa-templates"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("wa_template_create", {
    name: "", language: "ar", category: "MARKETING", status: "draft",
    headerText: "", bodyText: "", footerText: "",
  });
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name.trim() ? null : "يرجى إدخال اسم القالب",
      bodyText: form.bodyText.trim() ? null : "يرجى إدخال نص القالب",
    });
    if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    try {
      await createMut.mutateAsync({
        name: form.name.trim(),
        language: form.language,
        category: form.category,
        status: form.status,
        headerText: orNull(form.headerText),
        bodyText: form.bodyText.trim(),
        footerText: orNull(form.footerText),
      });
      clearDraft();
      toast({ title: "تم إنشاء القالب بنجاح" });
      setLocation("/marketing/whatsapp-templates");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء القالب", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="قالب واتساب جديد" backPath="/marketing/whatsapp-templates">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="mb-4 rounded-lg border border-status-info-surface bg-status-info-surface/40 px-4 py-3 text-xs text-status-info-foreground leading-relaxed">
        استخدم <code className="font-mono">{"{{1}}"}</code> و <code className="font-mono">{"{{2}}"}</code> … لمواضع المتغيّرات التي تُعبّأ لكل عميل عند الإرسال.
        لا يمكن الإرسال الجماعي إلا بقالب حالته «معتمد» بعد موافقة Meta.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="اسم القالب" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} placeholder="welcome_offer" />
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
        <TextField label="ترويسة (اختياري)" value={form.headerText} onChange={(v) => setForm((f) => ({ ...f, headerText: v }))} placeholder="نص الترويسة" className="md:col-span-2" />
        <TextAreaField label="نص القالب" required value={form.bodyText} onChange={(v) => setForm((f) => ({ ...f, bodyText: v }))} placeholder="مرحباً {{1}}، لدينا عرض خاص لك..." className="md:col-span-2" error={fieldErrors.bodyText} />
        <TextField label="تذييل (اختياري)" value={form.footerText} onChange={(v) => setForm((f) => ({ ...f, footerText: v }))} placeholder="نص التذييل" className="md:col-span-2" />
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/marketing/whatsapp-templates")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || !form.bodyText || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ القالب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
