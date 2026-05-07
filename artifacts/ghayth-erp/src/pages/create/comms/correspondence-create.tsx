/**
 * /create/comms/correspondence-create — إنشاء مراسلة جديدة
 *
 * نموذج إنشاء مراسلة صادرة أو واردة مع حفظ تلقائي كمسودة.
 */
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreatePageLayout } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const INITIAL_FORM = {
  direction: "outgoing" as string,
  subject: "",
  content: "",
  senderName: "",
  senderOrg: "",
  recipientName: "",
  recipientOrg: "",
  channel: "",
  notes: "",
};

export default function CorrespondenceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(
    "correspondence_create",
    INITIAL_FORM,
  );
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const createMut = useApiMutation<unknown, typeof INITIAL_FORM>(
    "/correspondence",
    "POST",
    [["correspondence"]],
  );

  const handleSubmit = () => {
    const firstError = validate({
      subject: form.subject ? null : "يرجى إدخال موضوع المراسلة",
      content: form.content ? null : "يرجى إدخال محتوى المراسلة",
      senderName: form.senderName ? null : "يرجى إدخال اسم المرسل",
      recipientName: form.recipientName ? null : "يرجى إدخال اسم المستلم",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate(form as any, {
      onSuccess: () => {
        clearDraft();
        toast({ title: "تم إنشاء المراسلة بنجاح" });
        setLocation("/correspondence");
      },
      onError: (err: any) => {
        setApiError(err);
        toast({
          variant: "destructive",
          title: "حدث خطأ أثناء إنشاء المراسلة",
          description: err?.fix ?? err?.message,
        });
      },
    });
  };

  return (
    <CreatePageLayout title="مراسلة جديدة" backPath="/correspondence">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-600 h-7 px-2"
            onClick={clearDraft}
          >
            مسح المسودة
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {/* Direction & Channel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldWrapper label="الاتجاه" required>
            <Select
              value={form.direction}
              onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الاتجاه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outgoing">صادر</SelectItem>
                <SelectItem value="incoming">وارد</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="قناة الإرسال">
            <Select
              value={form.channel || "_none"}
              onValueChange={(v) => setForm((f) => ({ ...f, channel: v === "_none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر القناة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر القناة</SelectItem>
                <SelectItem value="email">بريد إلكتروني</SelectItem>
                <SelectItem value="fax">فاكس</SelectItem>
                <SelectItem value="postal">بريد عادي</SelectItem>
                <SelectItem value="hand">تسليم يدوي</SelectItem>
                <SelectItem value="electronic">منصة إلكترونية</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>

        {/* Subject */}
        <TextField
          label="الموضوع"
          required
          value={form.subject}
          onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
          placeholder="موضوع المراسلة"
          error={fieldErrors.subject}
        />

        {/* Sender Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="اسم المرسل"
            required
            value={form.senderName}
            onChange={(v) => setForm((f) => ({ ...f, senderName: v }))}
            placeholder="اسم المرسل"
            error={fieldErrors.senderName}
          />
          <TextField
            label="جهة المرسل"
            value={form.senderOrg}
            onChange={(v) => setForm((f) => ({ ...f, senderOrg: v }))}
            placeholder="المنظمة أو الجهة المرسلة"
          />
        </div>

        {/* Recipient Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="اسم المستلم"
            required
            value={form.recipientName}
            onChange={(v) => setForm((f) => ({ ...f, recipientName: v }))}
            placeholder="اسم المستلم"
            error={fieldErrors.recipientName}
          />
          <TextField
            label="جهة المستلم"
            value={form.recipientOrg}
            onChange={(v) => setForm((f) => ({ ...f, recipientOrg: v }))}
            placeholder="المنظمة أو الجهة المستلمة"
          />
        </div>

        {/* Content */}
        <TextAreaField
          label="المحتوى"
          required
          value={form.content}
          onChange={(v) => setForm((f) => ({ ...f, content: v }))}
          placeholder="نص المراسلة..."
          error={fieldErrors.content}
        />

        {/* Notes */}
        <TextAreaField
          label="ملاحظات"
          value={form.notes}
          onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          placeholder="ملاحظات إضافية (اختياري)..."
        />

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/correspondence")}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
