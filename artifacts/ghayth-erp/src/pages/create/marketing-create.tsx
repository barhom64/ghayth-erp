import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function MarketingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/marketing/campaigns", "POST", [["mkt-campaigns"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("marketing_create", {
    name: "", description: "", type: "digital", channel: "",
    budget: "", targetAudience: "", startDate: "", endDate: "", status: "draft",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name) localErrors.name = "يرجى إدخال اسم الحملة";
    if (form.budget && Number(form.budget) < 0) localErrors.budget = "الميزانية يجب أن تكون 0 أو أكثر";
    if (form.startDate && form.endDate && form.endDate <= form.startDate) localErrors.endDate = "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        budget: Number(form.budget) || 0,
      });
      clearDraft();
      toast({ title: "تم إنشاء الحملة بنجاح" });
      setLocation("/marketing");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الحملة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="حملة تسويقية جديدة" backPath="/marketing">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="اسم الحملة" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} />
        <FormFieldWrapper label="النوع">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="digital">إعلان رقمي</SelectItem>
              <SelectItem value="email">بريد إلكتروني</SelectItem>
              <SelectItem value="sms">رسائل نصية</SelectItem>
              <SelectItem value="social_media">وسائل تواصل</SelectItem>
              <SelectItem value="print">مطبوعات</SelectItem>
              <SelectItem value="event">فعاليات</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="القناة">
          <Select value={form.channel || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, channel: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر القناة</SelectItem>
              <SelectItem value="google">إعلانات جوجل</SelectItem>
              <SelectItem value="facebook">فيسبوك</SelectItem>
              <SelectItem value="instagram">إنستغرام</SelectItem>
              <SelectItem value="twitter">منصة إكس</SelectItem>
              <SelectItem value="snapchat">سناب شات</SelectItem>
              <SelectItem value="tiktok">تيك توك</SelectItem>
              <SelectItem value="email">بريد إلكتروني</SelectItem>
              <SelectItem value="sms">رسائل نصية</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="active">نشطة</SelectItem>
              <SelectItem value="paused">متوقفة</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <NumberField label={`الميزانية (${getCurrencySymbol()})`} value={form.budget} onChange={(v) => setForm((f) => ({ ...f, budget: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.budget} />
        <TextField label="الجمهور المستهدف" value={form.targetAudience} onChange={(v) => setForm((f) => ({ ...f, targetAudience: v }))} placeholder="مثال: شباب 18-35" />
        <FormFieldWrapper label="تاريخ البدء">
          <DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
        </FormFieldWrapper>
        <FormFieldWrapper label="تاريخ الانتهاء" error={fieldErrors.endDate}>
          <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
        </FormFieldWrapper>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف الحملة التسويقية..." className="md:col-span-2" />
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/marketing")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الحملة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
