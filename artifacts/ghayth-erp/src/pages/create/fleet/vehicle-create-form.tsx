import { useState } from "react";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const INITIAL = {
  plateNumber: "", make: "", model: "", year: "", color: "", vinNumber: "",
  fuelType: "gasoline", currentMileage: "", fuelCapacity: "", status: "available",
  insuranceExpiry: "", registrationExpiry: "", notes: "",
  registrationNumber: "", plateType: "", sequenceNumber: "", inspectionDate: "", nextInspectionDate: "",
  purchasePrice: "", purchaseDate: "",
  // #1812 Wave 0.3 — Vehicle Master technical profile (migration 262 + 284).
  vehicleType: "", requiredLicenseClass: "",
  validForPassengers: true, validForCargo: false,
  operationalPayloadKg: "", payloadKg: "", seatCount: "",
  boxLengthCm: "", boxWidthCm: "", boxHeightCm: "",
  axleCount: "", tireCount: "", tireSize: "",
  engineDisplacementCc: "", transmissionType: "",
  hasAc: true, screenCount: "", doorCount: "", upholsteryType: "",
  safetyFeatures: "", equipmentAttachments: "",
  operatingHours: "",
};

// Comma-separated free text → trimmed string array (safety features /
// equipment attachments are jsonb arrays in the DB).
function splitChips(s: string): string[] | undefined {
  const arr = s.split(",").map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

export interface VehicleCreateFormProps {
  /** Called with the freshly-created vehicle row after a successful save. */
  onCreated: (created: any) => void;
  /** Called when the operator cancels (back / إلغاء). */
  onCancel: () => void;
  /** Draft-recovery key — distinct per host (page vs inline drawer). */
  draftKey?: string;
  /** Hide the attachments dropzone (e.g. the inline drawer keeps it lean). */
  showAttachments?: boolean;
}

/**
 * The unified vehicle-creation form body — shared by the full page
 * (`fleet/vehicles-create.tsx`) and the inline `AllowCreateDrawer` opened from
 * `VehicleSelect`. Owns its own state / validation / mutation / draft so an
 * inline create is identical to a page create — the full technical profile,
 * no truncated quick-add.
 */
export function VehicleCreateForm({ onCreated, onCancel, draftKey = "fleet_vehicles_create", showAttachments = true }: VehicleCreateFormProps) {
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addVehicle = useApiMutation("/fleet/vehicles", "POST", [["fleet-vehicles"], ["fleet-stats"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(draftKey, INITIAL);
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
      const created = await addVehicle.mutateAsync({
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
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        purchaseDate: form.purchaseDate || undefined,
        notes: form.notes || undefined,
        // #1812 Wave 0.3 — Vehicle Master technical profile + assignment-
        // decision fields. All optional; the assignment engine treats
        // NULL as "unknown — soft warning, no hard block".
        vehicleType: form.vehicleType || undefined,
        requiredLicenseClass: form.requiredLicenseClass || undefined,
        validForPassengers: form.validForPassengers,
        validForCargo: form.validForCargo,
        operationalPayloadKg: form.operationalPayloadKg ? Number(form.operationalPayloadKg) : undefined,
        payloadKg: form.payloadKg ? Number(form.payloadKg) : undefined,
        seatCount: form.seatCount ? Number(form.seatCount) : undefined,
        boxLengthCm: form.boxLengthCm ? Number(form.boxLengthCm) : undefined,
        boxWidthCm:  form.boxWidthCm  ? Number(form.boxWidthCm)  : undefined,
        boxHeightCm: form.boxHeightCm ? Number(form.boxHeightCm) : undefined,
        axleCount: form.axleCount ? Number(form.axleCount) : undefined,
        tireCount: form.tireCount ? Number(form.tireCount) : undefined,
        tireSize: form.tireSize || undefined,
        engineDisplacementCc: form.engineDisplacementCc ? Number(form.engineDisplacementCc) : undefined,
        transmissionType: form.transmissionType || undefined,
        hasAc: form.hasAc,
        screenCount: form.screenCount ? Number(form.screenCount) : undefined,
        doorCount: form.doorCount ? Number(form.doorCount) : undefined,
        upholsteryType: form.upholsteryType || undefined,
        safetyFeatures: splitChips(form.safetyFeatures),
        equipmentAttachments: splitChips(form.equipmentAttachments),
        operatingHours: form.operatingHours ? Number(form.operatingHours) : undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة المركبة بنجاح" });
      onCreated(created);
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المركبة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
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
                <SelectItem value="available">متاحة</SelectItem>
                <SelectItem value="in_use">قيد الاستخدام</SelectItem>
                <SelectItem value="maintenance">في الصيانة</SelectItem>
                <SelectItem value="out_of_service">خارج الخدمة</SelectItem>
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
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block" />
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

        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block" />
            بيانات الشراء — تُستخدم في تقرير التكلفة الإجمالية وقيد رسملة الأصل
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberField label="سعر الشراء" value={form.purchasePrice} onChange={(v) => setForm((f) => ({ ...f, purchasePrice: v }))} placeholder="٠٫٠٠" />
            <FormFieldWrapper label="تاريخ الشراء">
              <DatePicker value={form.purchaseDate} onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))} />
            </FormFieldWrapper>
          </div>
        </div>

        {/* #1812 Wave 0.3 — Vehicle Master: assignment-decision fields. */}
        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block" />
            التخصص التشغيلي والسعة — يستخدمها محرّك الاقتراح لاختيار المركبة المناسبة
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="نوع المركبة">
              <Select value={form.vehicleType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, vehicleType: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— غير محدد —</SelectItem>
                  <SelectItem value="truck">شاحنة</SelectItem>
                  <SelectItem value="bus">حافلة</SelectItem>
                  <SelectItem value="van">فان</SelectItem>
                  <SelectItem value="pickup">بيك‑أب</SelectItem>
                  <SelectItem value="sedan">سيدان</SelectItem>
                  <SelectItem value="trailer">مقطورة</SelectItem>
                  <SelectItem value="equipment">معدّة</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="رخصة القيادة المطلوبة">
              <Select value={form.requiredLicenseClass || "none"} onValueChange={(v) => setForm((f) => ({ ...f, requiredLicenseClass: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— غير محدد —</SelectItem>
                  <SelectItem value="light">خفيفة</SelectItem>
                  <SelectItem value="private">خاصة</SelectItem>
                  <SelectItem value="public">عمومية</SelectItem>
                  <SelectItem value="heavy">نقل ثقيل</SelectItem>
                  <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <NumberField label="عدد المقاعد (إن كانت للركاب)" value={form.seatCount} onChange={(v) => setForm((f) => ({ ...f, seatCount: v }))} placeholder="٠" />
            <FormFieldWrapper label="صالحة لنقل الركاب">
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={form.validForPassengers} onCheckedChange={(v) => setForm((f) => ({ ...f, validForPassengers: v }))} />
                <span className="text-sm">{form.validForPassengers ? "نعم" : "لا"}</span>
              </div>
            </FormFieldWrapper>
            <FormFieldWrapper label="صالحة لنقل الحمولات">
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={form.validForCargo} onCheckedChange={(v) => setForm((f) => ({ ...f, validForCargo: v }))} />
                <span className="text-sm">{form.validForCargo ? "نعم" : "لا"}</span>
              </div>
            </FormFieldWrapper>
            <NumberField label="الحمولة التشغيلية الآمنة (كغ)" value={form.operationalPayloadKg} onChange={(v) => setForm((f) => ({ ...f, operationalPayloadKg: v }))} placeholder="الحمولة الموصى بها في التشغيل" />
            <NumberField label="الحمولة القصوى الفنية (كغ)" value={form.payloadKg} onChange={(v) => setForm((f) => ({ ...f, payloadKg: v }))} placeholder="حسب البطاقة الفنية" />
            <NumberField label="ساعات تشغيل (للمعدّات الثقيلة)" value={form.operatingHours} onChange={(v) => setForm((f) => ({ ...f, operatingHours: v }))} placeholder="٠" />
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block" />
            الأبعاد والميكانيكا — أبعاد الصندوق وخصائص الجر
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NumberField label="طول الصندوق (سم)" value={form.boxLengthCm} onChange={(v) => setForm((f) => ({ ...f, boxLengthCm: v }))} placeholder="٠" />
            <NumberField label="عرض الصندوق (سم)" value={form.boxWidthCm}  onChange={(v) => setForm((f) => ({ ...f, boxWidthCm: v }))}  placeholder="٠" />
            <NumberField label="ارتفاع الصندوق (سم)" value={form.boxHeightCm} onChange={(v) => setForm((f) => ({ ...f, boxHeightCm: v }))} placeholder="٠" />
            <NumberField label="عدد المحاور" value={form.axleCount} onChange={(v) => setForm((f) => ({ ...f, axleCount: v }))} placeholder="٠" />
            <NumberField label="عدد الإطارات" value={form.tireCount} onChange={(v) => setForm((f) => ({ ...f, tireCount: v }))} placeholder="٠" />
            <TextField label="مقاس الإطار" dir="ltr" value={form.tireSize} onChange={(v) => setForm((f) => ({ ...f, tireSize: v }))} placeholder="مثال: 295/80R22.5" />
            <NumberField label="سعة المحرك (سي‑سي)" value={form.engineDisplacementCc} onChange={(v) => setForm((f) => ({ ...f, engineDisplacementCc: v }))} placeholder="٠" />
            <FormFieldWrapper label="نوع ناقل الحركة">
              <Select value={form.transmissionType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, transmissionType: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— غير محدد —</SelectItem>
                  <SelectItem value="manual">يدوي</SelectItem>
                  <SelectItem value="automatic">أوتوماتيك</SelectItem>
                  <SelectItem value="amt">AMT</SelectItem>
                  <SelectItem value="cvt">CVT</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block" />
            الراحة والسلامة — يظهر للعميل في عرض المركبة المقترحة
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="مكيّفة">
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={form.hasAc} onCheckedChange={(v) => setForm((f) => ({ ...f, hasAc: v }))} />
                <span className="text-sm">{form.hasAc ? "نعم" : "لا"}</span>
              </div>
            </FormFieldWrapper>
            <NumberField label="عدد الشاشات الترفيهية" value={form.screenCount} onChange={(v) => setForm((f) => ({ ...f, screenCount: v }))} placeholder="٠" />
            <NumberField label="عدد الأبواب" value={form.doorCount} onChange={(v) => setForm((f) => ({ ...f, doorCount: v }))} placeholder="٠" />
            <FormFieldWrapper label="نوع التنجيد">
              <Select value={form.upholsteryType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, upholsteryType: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— غير محدد —</SelectItem>
                  <SelectItem value="fabric">قماش</SelectItem>
                  <SelectItem value="leather">جلد</SelectItem>
                  <SelectItem value="premium">فاخر</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <div className="md:col-span-3">
              <TextField label="ميزات السلامة (افصلها بفواصل)" value={form.safetyFeatures} onChange={(v) => setForm((f) => ({ ...f, safetyFeatures: v }))} placeholder="ABS, ESP, وسائد هوائية، حساس مسافة" />
            </div>
            <div className="md:col-span-3">
              <TextField label="ملحقات / تجهيزات إضافية (افصلها بفواصل)" value={form.equipmentAttachments} onChange={(v) => setForm((f) => ({ ...f, equipmentAttachments: v }))} placeholder="رافعة خلفية، شاحن سريع، صندوق مبرد" />
            </div>
          </div>
        </div>

        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." />
        {showAttachments && <FileDropZone files={attachments} onFilesChange={setAttachments} />}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addVehicle.isPending} rateLimitAware>{addVehicle.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </>
  );
}
