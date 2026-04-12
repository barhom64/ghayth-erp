import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";

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

  const handleSubmit = async () => {
    if (!form.plateNumber) {
      toast({ variant: "destructive", title: "يرجى إدخال رقم اللوحة" });
      return;
    }
    try {
      await addVehicle.mutateAsync({
        plateNumber: form.plateNumber,
        make: form.make || undefined,
        model: form.model || undefined,
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
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المركبة", description: err.message });
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
          <div><Label>رقم اللوحة <span className="text-red-500">*</span></Label><Input className="mt-1" dir="ltr" value={form.plateNumber} onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))} placeholder="ABC 1234" /></div>
          <div><Label>الشركة المصنعة</Label><Input className="mt-1" value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} placeholder="تويوتا، هيونداي..." /></div>
          <div><Label>الموديل</Label><Input className="mt-1" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="كامري، النترا..." /></div>
          <div><Label>سنة الصنع</Label><Input className="mt-1" type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="2024" /></div>
          <div><Label>اللون</Label><Input className="mt-1" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="أبيض، أسود..." /></div>
          <div><Label>رقم الهيكل</Label><Input className="mt-1" dir="ltr" value={form.vinNumber} onChange={(e) => setForm((f) => ({ ...f, vinNumber: e.target.value }))} placeholder="رقم الهيكل" /></div>
          <div>
            <Label>نوع الوقود</Label>
            <Select value={form.fuelType} onValueChange={(v) => setForm((f) => ({ ...f, fuelType: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gasoline">بنزين</SelectItem>
                <SelectItem value="diesel">ديزل</SelectItem>
                <SelectItem value="hybrid">هجين</SelectItem>
                <SelectItem value="electric">كهربائي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>عداد الكيلومترات الحالي</Label><Input className="mt-1" type="number" value={form.currentMileage} onChange={(e) => setForm((f) => ({ ...f, currentMileage: e.target.value }))} placeholder="٠" /></div>
          <div><Label>سعة خزان الوقود (لتر)</Label><Input className="mt-1" type="number" value={form.fuelCapacity} onChange={(e) => setForm((f) => ({ ...f, fuelCapacity: e.target.value }))} placeholder="٠" /></div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="maintenance">في الصيانة</SelectItem>
                <SelectItem value="inactive">غير نشطة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>تاريخ انتهاء التأمين</Label><div className="mt-1"><DatePicker value={form.insuranceExpiry} onChange={(v) => setForm((f) => ({ ...f, insuranceExpiry: v }))} /></div></div>
          <div><Label>تاريخ انتهاء الاستمارة</Label><div className="mt-1"><DatePicker value={form.registrationExpiry} onChange={(v) => setForm((f) => ({ ...f, registrationExpiry: v }))} /></div></div>
        </div>
        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            بيانات التسجيل والفحص — الربط الحكومي (تم)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>رقم الاستمارة</Label><Input className="mt-1" value={form.registrationNumber} onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))} placeholder="رقم الاستمارة" dir="ltr" /></div>
            <div>
              <Label>نوع اللوحة</Label>
              <Select value={form.plateType} onValueChange={(v) => setForm((f) => ({ ...f, plateType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="— اختياري —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">خاصة</SelectItem>
                  <SelectItem value="commercial">تجارية</SelectItem>
                  <SelectItem value="government">حكومية</SelectItem>
                  <SelectItem value="diplomatic">دبلوماسية</SelectItem>
                  <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>رقم التسلسل</Label><Input className="mt-1" value={form.sequenceNumber} onChange={(e) => setForm((f) => ({ ...f, sequenceNumber: e.target.value }))} placeholder="الرقم التسلسلي" dir="ltr" /></div>
            <div><Label>تاريخ آخر فحص دوري</Label><div className="mt-1"><DatePicker value={form.inspectionDate} onChange={(v) => setForm((f) => ({ ...f, inspectionDate: v }))} /></div></div>
            <div><Label>تاريخ الفحص الدوري القادم</Label><div className="mt-1"><DatePicker value={form.nextInspectionDate} onChange={(v) => setForm((f) => ({ ...f, nextInspectionDate: v }))} /></div></div>
          </div>
        </div>

        <div><Label>ملاحظات</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات إضافية..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/fleet")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addVehicle.isPending}>{addVehicle.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
