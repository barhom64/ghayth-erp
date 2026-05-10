import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "fleet_vehicles_create";
const INITIAL = {
  plateNumber: "", make: "", model: "", year: "", color: "", vinNumber: "",
  fuelType: "gasoline", currentMileage: "", fuelCapacity: "", status: "active",
  insuranceExpiry: "", registrationExpiry: "", notes: "",
  registrationNumber: "", plateType: "", sequenceNumber: "", inspectionDate: "", nextInspectionDate: "",
};

export default function VehiclesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addVehicle = useApiMutation("/fleet/vehicles", "POST", [["fleet-vehicles"], ["fleet-stats"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      plateNumber: form.plateNumber.trim() ? null : "يرجى إدخال رقم اللوحة",
      make: form.make.trim() ? null : "الشركة المصنعة مطلوبة",
      model: form.model.trim() ? null : "الموديل مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await addVehicle.mutateAsync({
        plateNumber: form.plateNumber,
        make: form.make,
        model: form.model,
        year: form.year ? Number(form.year) : undefined,
        color: form.color || undefined,
        vinNumber: form.vinNumber || undefined,
        fuelType: form.fuelType,
        currentMileage: Number(form.currentMileage) || 0,
        fuelCapacity: form.fuelCapacity ? Number(form.fuelCapacity) : undefined,
        status: form.status,
        insuranceExpiry: form.insuranceExpiry || undefined,
        registrationExpiry: form.registrationExpiry || undefined,
        registrationNumber: form.registrationNumber || undefined,
        plateType: form.plateType || undefined,
        sequenceNumber: form.sequenceNumber || undefined,
        inspectionDate: form.inspectionDate || undefined,
        nextInspectionDate: form.nextInspectionDate || undefined,
        notes: form.notes || undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة المركبة بنجاح" });
      setLocation("/fleet");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المركبة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة مركبة جديدة" backPath="/fleet">
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
          <TextField label="رقم اللوحة" required dir="ltr" value={form.plateNumber} onChange={(v) => setForm((f) => ({ ...f, plateNumber: v }))} placeholder="ABC 1234" error={fieldErrors.plateNumber} />
          <TextField label="الشركة المصنعة" required value={form.make} onChange={(v) => setForm((f) => ({ ...f, make: v }))} placeholder="تويوتا، هيونداي..." error={fieldErrors.make} />
          <TextField label="الموديل" required value={form.model} onChange={(v) => setForm((f) => ({ ...f, model: v }))} placeholder="كامري، النترا..." error={fieldErrors.model} />
          <NumberField label="سنة الصنع" value={form.year} onChange={(v) => setForm((f) => ({ ...f, year: v }))} placeholder="2024" error={fieldErrors.year} />
          <TextField label="اللون" value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} placeholder="أبيض، أسود..." />
          <TextField label="رقم الهيكل" dir="ltr" value={form.vinNumber} onChange={(v) => setForm((f) => ({ ...f, vinNumber: v }))} placeholder="رقم الهيكل" />
          <FormFieldWrapper label="نوع الوقود">
            <Select value={form.fuelType} onValueChange={(v) => setForm((f) => ({ ...f, fuelType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gasoline">بنزين</SelectItem>
                <SelectItem value="diesel">ديزل</SelectItem>
                <SelectItem value="hybrid">هجين</SelectItem>
                <SelectItem value="electric">كهربائي</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <NumberField label="عداد الكيلومترات الحالي" value={form.currentMileage} onChange={(v) => setForm((f) => ({ ...f, currentMileage: v }))} placeholder="٠" />
          <NumberField label="سعة خزان الوقود (لتر)" value={form.fuelCapacity} onChange={(v) => setForm((f) => ({ ...f, fuelCapacity: v }))} placeholder="٠" />
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="maintenance">في الصيانة</SelectItem>
                <SelectItem value="inactive">غير نشطة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ انتهاء التأمين">
            <DatePicker value={form.insuranceExpiry} onChange={(v) => setForm((f) => ({ ...f, insuranceExpiry: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ انتهاء الاستمارة">
            <DatePicker value={form.registrationExpiry} onChange={(v) => setForm((f) => ({ ...f, registrationExpiry: v }))} />
          </FormFieldWrapper>
        </div>
        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            بيانات التسجيل والفحص — الربط الحكومي (تم)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="رقم الاستمارة" dir="ltr" value={form.registrationNumber} onChange={(v) => setForm((f) => ({ ...f, registrationNumber: v }))} placeholder="رقم الاستمارة" />
            <FormFieldWrapper label="نوع اللوحة">
              <Select value={form.plateType} onValueChange={(v) => setForm((f) => ({ ...f, plateType: v }))}>
                <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">خاصة</SelectItem>
                  <SelectItem value="commercial">تجارية</SelectItem>
                  <SelectItem value="government">حكومية</SelectItem>
                  <SelectItem value="diplomatic">دبلوماسية</SelectItem>
                  <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField label="رقم التسلسل" dir="ltr" value={form.sequenceNumber} onChange={(v) => setForm((f) => ({ ...f, sequenceNumber: v }))} placeholder="الرقم التسلسلي" />
            <FormFieldWrapper label="تاريخ آخر فحص دوري">
              <DatePicker value={form.inspectionDate} onChange={(v) => setForm((f) => ({ ...f, inspectionDate: v }))} />
            </FormFieldWrapper>
            <FormFieldWrapper label="تاريخ الفحص الدوري القادم">
              <DatePicker value={form.nextInspectionDate} onChange={(v) => setForm((f) => ({ ...f, nextInspectionDate: v }))} />
            </FormFieldWrapper>
          </div>
        </div>

        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/fleet")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addVehicle.isPending} rateLimitAware>{addVehicle.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
