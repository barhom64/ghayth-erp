import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { BookOpen, Clock, Users, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAINING_TYPES, TRAINING_CATEGORIES } from "@/lib/hr-type-maps";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "hr_training_create";
const INITIAL = {
  title: "", description: "", category: "", trainer: "",
  startDate: "", endDate: "", capacity: "", location: "",
  type: "", provider: "", duration: "", durationUnit: "hours", cost: "",
  maxParticipants: "", objectives: "", targetAudience: "",
};

export default function TrainingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/hr/training/programs", "POST", [["training-programs"]], {
    successMessage: "تم إضافة البرنامج التدريبي بنجاح",
  });

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const durationDisplay = form.duration
    ? `${form.duration} ${form.durationUnit === "hours" ? "ساعة" : form.durationUnit === "days" ? "يوم" : "أسبوع"}`
    : null;

  const handleSubmit = () => {
    const firstError = validate({
      title: form.title ? null : "عنوان البرنامج مطلوب",
      maxParticipants: form.maxParticipants && Number(form.maxParticipants) <= 0
        ? "السعة القصوى يجب أن تكون أكبر من صفر"
        : null,
      endDate: form.startDate && form.endDate && form.endDate < form.startDate
        ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء"
        : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate(
      {
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        trainer: form.trainer || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        location: form.location || undefined,
        type: form.type || undefined,
        provider: form.provider || undefined,
        duration: form.duration ? Number(form.duration) : undefined,
        durationUnit: form.durationUnit || undefined,
        cost: form.cost ? Number(form.cost) : 0,
        maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined,
        objectives: form.objectives || undefined,
        targetAudience: form.targetAudience || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/training");
        },
        onError: (err: any) => {
          setApiError(err);
        },
      },
    );
  };

  return (
    <CreatePageLayout title="إضافة برنامج تدريبي" backPath="/hr/training">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> نوع التدريب
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {TRAINING_TYPES.map((tt) => (
              <button
                key={tt.value}
                type="button"
                onClick={() => set("type", tt.value)}
                className={cn(
                  "p-3 rounded-xl border-2 text-center transition-all",
                  form.type === tt.value ? tt.color + " ring-2 ring-offset-1" : "border-border hover:border-border"
                )}
              >
                <span className="text-xl block mb-1">{tt.icon}</span>
                <span className="text-xs font-medium">{tt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="العنوان" required value={form.title} onChange={(v) => set("title", v)} placeholder="اسم البرنامج التدريبي" error={fieldErrors.title} />
          <FormFieldWrapper label="التصنيف">
            <Select value={form.category || "_none"} onValueChange={(v) => set("category", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر التصنيف</SelectItem>
                {TRAINING_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="جهة التدريب" value={form.provider} onChange={(v) => set("provider", v)} placeholder="اسم الجهة المقدمة" />
          <TextField label="المدرب" value={form.trainer} onChange={(v) => set("trainer", v)} placeholder="اسم المدرب" />
          <TextField label="المكان" value={form.location} onChange={(v) => set("location", v)} placeholder="قاعة التدريب أو الرابط" />
          <NumberField label="السعة القصوى" value={form.maxParticipants} onChange={(v) => set("maxParticipants", v)} placeholder="عدد المشاركين" min={1} error={fieldErrors.maxParticipants} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> المدة والتواريخ
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <NumberField label="المدة" value={form.duration} onChange={(v) => set("duration", v)} placeholder="٠" min={0} />
            <FormFieldWrapper label="وحدة المدة">
              <Select value={form.durationUnit} onValueChange={(v) => set("durationUnit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">ساعات</SelectItem>
                  <SelectItem value="days">أيام</SelectItem>
                  <SelectItem value="weeks">أسابيع</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="تاريخ البدء">
              <DatePicker value={form.startDate} onChange={(v) => set("startDate", v)} />
            </FormFieldWrapper>
            <FormFieldWrapper label="تاريخ الانتهاء" error={fieldErrors.endDate}>
              <DatePicker value={form.endDate} onChange={(v) => set("endDate", v)} />
            </FormFieldWrapper>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField label={`التكلفة (${getCurrencySymbol()})`} value={form.cost} onChange={(v) => set("cost", v)} placeholder="٠" step={0.01} min={0} />
          <TextField label="الفئة المستهدفة" value={form.targetAudience} onChange={(v) => set("targetAudience", v)} placeholder="المدراء، الموظفون الجدد..." />
        </div>

        <TextAreaField label="أهداف البرنامج" value={form.objectives} onChange={(v) => set("objectives", v)} placeholder="الأهداف المتوقعة من البرنامج التدريبي..." rows={3} />

        <TextAreaField label="الوصف التفصيلي" value={form.description} onChange={(v) => set("description", v)} placeholder="وصف البرنامج التدريبي ومحتوياته..." rows={3} />

        {form.title && (
          <div className="p-4 bg-status-info-surface rounded-xl border border-status-info-surface">
            <h4 className="text-sm font-semibold text-status-info-foreground mb-2">ملخص البرنامج</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{form.title}</Badge>
              {form.type && <Badge variant="outline">{TRAINING_TYPES.find(t => t.value === form.type)?.label}</Badge>}
              {form.category && <Badge variant="outline">{TRAINING_CATEGORIES.find(c => c.value === form.category)?.label}</Badge>}
              {durationDisplay && <Badge variant="outline"><Clock className="h-3 w-3 me-1" />{durationDisplay}</Badge>}
              {form.maxParticipants && <Badge variant="outline"><Users className="h-3 w-3 me-1" />{form.maxParticipants} مشارك</Badge>}
              {form.cost && <Badge variant="outline"><DollarSign className="h-3 w-3 me-1" />{formatCurrency(Number(form.cost))}</Badge>}
            </div>
          </div>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التدريب (منهج، مواد تدريبية)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/training")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.title || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ البرنامج"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
