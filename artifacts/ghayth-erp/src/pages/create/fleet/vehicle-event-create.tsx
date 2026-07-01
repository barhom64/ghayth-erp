// البند ٤ — «تسجيل واقعة مركبة» (الكيان يقود التجربة).
// اختر المركبة مرّة واحدة → يفتح عالمها (عداد/تأمين/استمارة/صيانة عبر VehicleContextCard)
// → اختر الواقعة (وقود/صيانة/تأمين) → عبّئ → سجّل. واجهة تشغيلية واحدة تُركّب نقاط
// الخلفية الجاهزة بدل ثلاث صفحات منفصلة (النموذج لا يُلغيها — روحان: واقعة + قوائم
// كلاسيكية). المعالجة (الحساب/القيد/الذمة/الإطفاء) يشتقّها المحرّك خلفيًّا.
import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard, type VehicleContextSection } from "@/components/shared/vehicle-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { VehicleSelect, SupplierSelect, DriverSelect } from "@/components/shared/entity-selects";
import { useVehicleDriverDefault, useVehicleMileageDefault } from "@/hooks/use-vehicle-driver-default";

type EventKind = "fuel" | "maintenance" | "insurance";

const DRAFT_KEY = "fleet_vehicle_event_create";
const INITIAL = {
  vehicleId: "",
  event: "fuel" as EventKind,
  // وقود — يستدعي POST /fleet/vehicles/:id/fuel-event (يرحّل القيد حسب مَن يتحمّل).
  liters: "", costPerLiter: "", mileageAtFuel: "", vatRatePercent: "15",
  stationName: "", fuelDate: todayLocal(), driverId: "", costBearer: "company",
  // صيانة — POST /fleet/maintenance (ترشيح مصروف للمحاسب).
  mType: "", mDescription: "", mCost: "", mMileage: "", mServiceDate: todayLocal(),
  mNextDate: "", mNextKm: "", mSupplierId: "", mStatus: "pending",
  // تأمين — POST /fleet/insurance (قسط مقدّم → إطفاء شهري).
  iType: "comprehensive", iProvider: "", iPolicyNumber: "",
  iStartDate: "", iEndDate: "", iPremium: "", iCoverage: "", iNotes: "",
};

const EVENTS: Array<{ key: EventKind; label: string; hint: string }> = [
  { key: "fuel", label: "وقود", hint: "تزويد وقود — يُرحَّل على حساب المركبة حسب مَن يتحمّل" },
  { key: "maintenance", label: "صيانة", hint: "تذكرة صيانة — ترشيح مصروف للمحاسب + جدولة قادمة" },
  { key: "insurance", label: "تأمين", hint: "قسط تأمين — مدفوع مقدّمًا يُطفأ شهريًّا" },
];

export default function VehicleEventCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  // مسار وقود ديناميكي لكل مركبة؛ صيانة/تأمين ثابتان.
  const fuelMut = useApiMutation((body: any) => `/fleet/vehicles/${body.vehicleId}/fuel-event`, "POST", [["fleet-fuel"]]);
  const maintMut = useApiMutation("/fleet/maintenance", "POST", [["fleet-maintenance"]]);
  const insMut = useApiMutation("/fleet/insurance", "POST", [["fleet-insurance"]]);

  const ev = form.event;
  const pending = fuelMut.isPending || maintMut.isPending || insMut.isPending;
  const set = (patch: Partial<typeof INITIAL>) => setForm((f) => ({ ...f, ...patch }));
  // الكيان يقود التجربة: اختيار المركبة يُعبّئ سائقها المعيَّن تلقائيًا (قابل للتغيير).
  useVehicleDriverDefault(form.vehicleId, form.driverId, (v) => set({ driverId: v }));
  useVehicleMileageDefault(form.vehicleId, form.mileageAtFuel, (v) => set({ mileageAtFuel: v }));

  const done = (msg: string, to = "/fleet") => {
    clearDraft();
    toast({ title: msg });
    setLocation(to);
  };
  const fail = (err: any, title: string) => {
    setApiError(err);
    toast({ variant: "destructive", title, description: err?.fix ?? err?.message });
  };

  const handleSubmit = async () => {
    if (!form.vehicleId) {
      toast({ variant: "destructive", title: validate({ vehicleId: "يرجى اختيار المركبة" }) || "يرجى اختيار المركبة" });
      return;
    }
    const vehicleId = Number(form.vehicleId);
    try {
      if (ev === "fuel") {
        const firstError = validate({
          liters: Number(form.liters) > 0 ? null : "اللترات مطلوبة وموجبة",
          costPerLiter: Number(form.costPerLiter) > 0 ? null : "سعر اللتر مطلوب وموجب",
        });
        if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
        await fuelMut.mutateAsync({
          vehicleId,
          liters: Number(form.liters),
          costPerLiter: Number(form.costPerLiter),
          mileageAtFuel: form.mileageAtFuel ? Number(form.mileageAtFuel) : undefined,
          vatRatePercent: form.vatRatePercent ? Number(form.vatRatePercent) : 0,
          stationName: form.stationName || undefined,
          fuelDate: form.fuelDate || undefined,
          driverId: form.driverId ? Number(form.driverId) : undefined,
          costBearer: form.costBearer || "company",
        });
        done("تم تسجيل واقعة الوقود وترحيلها");
      } else if (ev === "maintenance") {
        const firstError = validate({
          mType: form.mType ? null : "نوع الصيانة مطلوب",
          mDescription: form.mDescription.trim() ? null : "وصف الصيانة مطلوب",
        });
        if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
        await maintMut.mutateAsync({
          vehicleId,
          type: form.mType,
          description: form.mDescription,
          cost: form.mCost ? Number(form.mCost) : undefined,
          mileageAtService: form.mMileage ? Number(form.mMileage) : undefined,
          serviceDate: form.mServiceDate || undefined,
          nextServiceDate: form.mNextDate || undefined,
          nextServiceKm: form.mNextKm ? Number(form.mNextKm) : undefined,
          supplierId: form.mSupplierId ? Number(form.mSupplierId) : undefined,
          status: form.mStatus,
          ...(attachments.length > 0 ? { attachments } : {}),
        });
        done("تم تسجيل واقعة الصيانة", "/fleet/maintenance");
      } else {
        const firstError = validate({
          iProvider: form.iProvider.trim() ? null : "شركة التأمين مطلوبة",
          iStartDate: form.iStartDate ? null : "تاريخ البدء مطلوب",
          iEndDate: !form.iEndDate
            ? "تاريخ الانتهاء مطلوب"
            : form.iStartDate && form.iEndDate <= form.iStartDate
              ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء"
              : null,
        });
        if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
        await insMut.mutateAsync({
          vehicleId,
          type: form.iType,
          provider: form.iProvider,
          policyNumber: form.iPolicyNumber || undefined,
          startDate: form.iStartDate,
          endDate: form.iEndDate,
          premium: form.iPremium ? Number(form.iPremium) : undefined,
          coverageAmount: form.iCoverage ? Number(form.iCoverage) : undefined,
          notes: form.iNotes || undefined,
        });
        done("تم تسجيل واقعة التأمين", "/fleet/insurance");
      }
    } catch (err: any) {
      fail(err, "تعذّر تسجيل الواقعة");
    }
  };

  return (
    <CreatePageLayout title="تسجيل واقعة مركبة" backPath="/fleet">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      {/* ١) الكيان يقود: اختر المركبة → يفتح عالمها */}
      <VehicleSelect value={form.vehicleId} onChange={(v) => set({ vehicleId: v })} label="المركبة" required error={fieldErrors.vehicleId} />
      {form.vehicleId && (
        <div className="mt-3 mb-2">
          <VehicleContextCard vehicleId={form.vehicleId} section={ev as VehicleContextSection} />
        </div>
      )}

      {/* ٢) اختر الواقعة (تصنيف واختصار، لا سؤال تقني) */}
      <div className="mt-5">
        <p className="text-sm font-medium mb-2">الواقعة</p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="نوع الواقعة">
          {EVENTS.map((e) => (
            <Button
              key={e.key}
              type="button"
              variant={ev === e.key ? "default" : "outline"}
              size="sm"
              role="tab"
              aria-selected={ev === e.key}
              data-testid={`vehicle-event-tab-${e.key}`}
              onClick={() => set({ event: e.key })}
            >
              {e.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{EVENTS.find((e) => e.key === ev)?.hint}</p>
      </div>

      {/* ٣) حقول الواقعة المختارة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {ev === "fuel" && (
          <>
            <NumberField label="اللترات" required value={form.liters} onChange={(v) => set({ liters: v })} step={0.01} min={0} error={fieldErrors.liters} />
            <NumberField label="سعر اللتر" required value={form.costPerLiter} onChange={(v) => set({ costPerLiter: v })} step={0.01} min={0} error={fieldErrors.costPerLiter} />
            <NumberField label="نسبة الضريبة %" value={form.vatRatePercent} onChange={(v) => set({ vatRatePercent: v })} step={0.01} min={0} />
            <NumberField label="قراءة العداد" value={form.mileageAtFuel} onChange={(v) => set({ mileageAtFuel: v })} min={0} />
            <FormFieldWrapper label="تاريخ التزويد">
              <DatePicker value={form.fuelDate} onChange={(v) => set({ fuelDate: v })} />
            </FormFieldWrapper>
            <TextField label="المحطة" value={form.stationName} onChange={(v) => set({ stationName: v })} />
            {/* مبدأ إبراهيم: مَن يتحمّل يقرّر الحساب (شركة → مصروف المركبة · سائق → ذمّته) */}
            <FormFieldWrapper label="مَن يتحمّل التكلفة">
              <Select value={form.costBearer} onValueChange={(v) => set({ costBearer: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">الشركة (مصروف تشغيلي للمركبة)</SelectItem>
                  <SelectItem value="driver">السائق (ذمة عليه تُخصم من حسابه)</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <DriverSelect value={form.driverId} onChange={(v) => set({ driverId: v })} label="السائق (اختياري)" />
          </>
        )}

        {ev === "maintenance" && (
          <>
            <FormFieldWrapper label="نوع الصيانة" required error={fieldErrors.mType}>
              <Select value={form.mType || "_none"} onValueChange={(v) => set({ mType: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">اختر النوع</SelectItem>
                  <SelectItem value="preventive">وقائية</SelectItem>
                  <SelectItem value="corrective">إصلاحية</SelectItem>
                  <SelectItem value="scheduled">مجدولة</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="الحالة">
              <Select value={form.mStatus} onValueChange={(v) => set({ mStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">معلقة</SelectItem>
                  <SelectItem value="in_progress">جارية</SelectItem>
                  <SelectItem value="completed">مكتملة</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <NumberField label="التكلفة" value={form.mCost} onChange={(v) => set({ mCost: v })} step={0.01} min={0} />
            <NumberField label="قراءة العداد" value={form.mMileage} onChange={(v) => set({ mMileage: v })} min={0} />
            <FormFieldWrapper label="تاريخ الصيانة">
              <DatePicker value={form.mServiceDate} onChange={(v) => set({ mServiceDate: v })} />
            </FormFieldWrapper>
            <FormFieldWrapper label="موعد الصيانة القادمة">
              <DatePicker value={form.mNextDate} onChange={(v) => set({ mNextDate: v })} />
            </FormFieldWrapper>
            <NumberField label="الكيلومترات القادمة" value={form.mNextKm} onChange={(v) => set({ mNextKm: v })} placeholder="مثال: 50000" min={0} />
            <SupplierSelect value={form.mSupplierId} onChange={(v) => set({ mSupplierId: v })} label="الورشة / المورد" />
            <TextAreaField label="الوصف" required value={form.mDescription} onChange={(v) => set({ mDescription: v })} error={fieldErrors.mDescription} className="md:col-span-3" />
          </>
        )}

        {ev === "insurance" && (
          <>
            <FormFieldWrapper label="نوع التأمين">
              <Select value={form.iType} onValueChange={(v) => set({ iType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprehensive">شامل</SelectItem>
                  <SelectItem value="third_party">ضد الغير</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField label="شركة التأمين" required value={form.iProvider} onChange={(v) => set({ iProvider: v })} error={fieldErrors.iProvider} />
            <TextField label="رقم الوثيقة" value={form.iPolicyNumber} onChange={(v) => set({ iPolicyNumber: v })} />
            <FormFieldWrapper label="تاريخ البدء" required error={fieldErrors.iStartDate}>
              <DatePicker value={form.iStartDate} onChange={(v) => set({ iStartDate: v })} />
            </FormFieldWrapper>
            <FormFieldWrapper label="تاريخ الانتهاء" required error={fieldErrors.iEndDate}>
              <DatePicker value={form.iEndDate} onChange={(v) => set({ iEndDate: v })} />
            </FormFieldWrapper>
            <NumberField label="قيمة القسط" value={form.iPremium} onChange={(v) => set({ iPremium: v })} step={0.01} min={0} />
            <NumberField label="مبلغ التغطية" value={form.iCoverage} onChange={(v) => set({ iCoverage: v })} step={0.01} min={0} />
            <TextAreaField label="ملاحظات" value={form.iNotes} onChange={(v) => set({ iNotes: v })} className="md:col-span-3" />
          </>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات الواقعة" />

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={pending} rateLimitAware data-testid="vehicle-event-submit">
          {pending ? "جاري الحفظ..." : "تسجيل الواقعة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
