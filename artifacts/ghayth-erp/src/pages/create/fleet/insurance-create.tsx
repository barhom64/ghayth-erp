import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { VehicleSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "fleet_insurance_create";
const INITIAL = {
  vehicleId: "", type: "comprehensive", provider: "", policyNumber: "",
  startDate: "", endDate: "", premium: "", coverageAmount: "", notes: "",
};

export default function InsuranceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/insurance", "POST", [["insurance"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      vehicleId: form.vehicleId ? null : "يرجى اختيار المركبة",
      provider: form.provider.trim() ? null : "شركة التأمين مطلوبة",
      startDate: form.startDate ? null : "تاريخ البدء مطلوب",
      endDate: !form.endDate
        ? "تاريخ الانتهاء مطلوب"
        : form.startDate && form.endDate <= form.startDate
          ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء"
          : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        type: form.type,
        provider: form.provider,
        policyNumber: form.policyNumber || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        premium: form.premium ? Number(form.premium) : 0,
        coverageAmount: form.coverageAmount ? Number(form.coverageAmount) : undefined,
        notes: form.notes || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تم إضافة التأمين بنجاح" });
      setLocation("/fleet/insurance");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة التأمين", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة تأمين مركبة" backPath="/fleet/insurance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <VehicleSelect value={form.vehicleId} onChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))} label="المركبة" required error={fieldErrors.vehicleId} />
          {form.vehicleId && (
            <div className="mt-3">
              <VehicleContextCard vehicleId={form.vehicleId} section="insurance" />
            </div>
          )}
        </div>
        <FormFieldWrapper label="نوع التأمين">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="comprehensive">شامل</SelectItem>
              <SelectItem value="third-party">ضد الغير</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextField label="شركة التأمين" required value={form.provider} onChange={(v) => setForm((f) => ({ ...f, provider: v }))} error={fieldErrors.provider} />
        <TextField label="رقم الوثيقة" value={form.policyNumber} onChange={(v) => setForm((f) => ({ ...f, policyNumber: v }))} />
        <FormFieldWrapper label="تاريخ البدء" required error={fieldErrors.startDate}>
          <DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
        </FormFieldWrapper>
        <FormFieldWrapper label="تاريخ الانتهاء" required error={fieldErrors.endDate}>
          <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
        </FormFieldWrapper>
        <NumberField label="القسط" value={form.premium} onChange={(v) => setForm((f) => ({ ...f, premium: v }))} step={0.01} min={0} />
        <NumberField label="مبلغ التغطية" value={form.coverageAmount} onChange={(v) => setForm((f) => ({ ...f, coverageAmount: v }))} step={0.01} min={0} />
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} className="md:col-span-3" />
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التأمين" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/insurance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
