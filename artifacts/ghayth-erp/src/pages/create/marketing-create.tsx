import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function MarketingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/marketing/campaigns", "POST", [["mkt-campaigns"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("marketing_create", {
    name: "", description: "", type: "digital", channel: "",
    budget: "", targetAudience: "", startDate: "", endDate: "", status: "draft",
    isPublic: false, slug: "", publicHeadline: "", publicBody: "", publicImageUrl: "", publicCtaLabel: "",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم الحملة",
      budget: form.budget && Number(form.budget) < 0 ? "الميزانية يجب أن تكون 0 أو أكثر" : null,
      endDate: form.startDate && form.endDate && form.endDate <= form.startDate ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" : null,
      slug: form.isPublic && !form.slug.trim() ? "المعرّف العام (slug) مطلوب عند النشر على الموقع" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    // نرسل الحقول الاختيارية الفارغة كـ null (لا ""): معرّف الحملة يرفض النص الفارغ،
    // ورابط الصورة يُتحقَّق منه بـ safeUrl الذي يرفض "" أيضاً.
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    try {
      await createMut.mutateAsync({
        ...form,
        budget: Number(form.budget) || 0,
        // حقول النشر العام: تُرسَل فقط عند تفعيل النشر؛ عدا ذلك null.
        isPublic: form.isPublic,
        slug: form.isPublic ? orNull(form.slug) : null,
        publicHeadline: form.isPublic ? orNull(form.publicHeadline) : null,
        publicBody: form.isPublic ? orNull(form.publicBody) : null,
        publicImageUrl: form.isPublic ? orNull(form.publicImageUrl) : null,
        publicCtaLabel: form.isPublic ? orNull(form.publicCtaLabel) : null,
      });
      clearDraft();
      toast({ title: "تم إنشاء الحملة بنجاح" });
      setLocation("/marketing");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الحملة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="حملة تسويقية جديدة" backPath="/marketing">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
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

      {/* ===== النشر على الموقع الإلكتروني (وفد) ===== */}
      <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm">نشر الحملة على الموقع الإلكتروني</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              عند التفعيل تظهر الحملة كعرض على موقع وفد، والعملاء المهتمون يُعزَون تلقائياً لهذه الحملة.
            </div>
          </div>
          <Switch
            checked={form.isPublic}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
            aria-label="نشر الحملة على الموقع"
          />
        </div>
        {form.isPublic && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <TextField
              label="المعرّف العام (slug)"
              required
              value={form.slug}
              onChange={(v) => setForm((f) => ({ ...f, slug: v }))}
              placeholder="مثال: umrah-ramadan-2026"
              error={fieldErrors.slug}
            />
            <TextField label="نص الزر (CTA)" value={form.publicCtaLabel} onChange={(v) => setForm((f) => ({ ...f, publicCtaLabel: v }))} placeholder="اطلب الآن" />
            <TextField label="عنوان العرض" value={form.publicHeadline} onChange={(v) => setForm((f) => ({ ...f, publicHeadline: v }))} placeholder="عنوان جذّاب يظهر على الموقع" className="md:col-span-2" />
            <TextAreaField label="نص العرض" value={form.publicBody} onChange={(v) => setForm((f) => ({ ...f, publicBody: v }))} placeholder="تفاصيل العرض التي تظهر للزوار..." className="md:col-span-2" />
            <TextField label="رابط صورة العرض" value={form.publicImageUrl} onChange={(v) => setForm((f) => ({ ...f, publicImageUrl: v }))} placeholder="https://..." className="md:col-span-2" />
          </div>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/marketing")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الحملة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
