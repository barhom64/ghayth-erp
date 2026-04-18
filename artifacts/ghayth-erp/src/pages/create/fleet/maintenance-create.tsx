import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";

const DRAFT_KEY = "fleet_maintenance_create";
const INITIAL = {
  vehicleId: "", type: "", description: "", cost: "",
  mileageAtService: "", serviceDate: new Date().toISOString().split("T")[0],
  nextServiceDate: "", nextServiceKm: "", performedBy: "", status: "pending",
};

export default function MaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/maintenance", "POST", [["fleet-maintenance"]]);
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const vehicles = vehiclesData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = async () => {
    if (!form.vehicleId) {
      toast({ variant: "destructive", title: "يرجى اختيار المركبة" });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        type: form.type || undefined,
        description: form.description || undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        mileageAtService: form.mileageAtService ? Number(form.mileageAtService) : undefined,
        serviceDate: form.serviceDate || undefined,
        nextServiceDate: form.nextServiceDate || undefined,
        nextServiceKm: form.nextServiceKm ? Number(form.nextServiceKm) : undefined,
        performedBy: form.performedBy || undefined,
        status: form.status,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تم إضافة سجل الصيانة بنجاح" });
      setLocation("/fleet/maintenance");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الصيانة" });
    }
  };

  return (
    <CreatePageLayout title="إضافة صيانة مركبة" backPath="/fleet/maintenance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <Label>المركبة <span className="text-red-500">*</span></Label>
          <Select value={form.vehicleId} onValueChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر المركبة" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} - {v.make} {v.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.vehicleId && (
            <div className="mt-3">
              <VehicleContextCard vehicleId={form.vehicleId} section="maintenance" />
            </div>
          )}
        </div>
        <div>
          <Label>نوع الصيانة</Label>
          <Select value={form.type || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, type: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر النوع</SelectItem>
              <SelectItem value="preventive">وقائية</SelectItem>
              <SelectItem value="corrective">إصلاحية</SelectItem>
              <SelectItem value="scheduled">مجدولة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">معلقة</SelectItem>
              <SelectItem value="in_progress">جارية</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>التكلفة</Label><Input className="mt-1" type="number" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} /></div>
        <div><Label>قراءة العداد</Label><Input className="mt-1" type="number" value={form.mileageAtService} onChange={(e) => setForm((f) => ({ ...f, mileageAtService: e.target.value }))} /></div>
        <div><Label>تاريخ الصيانة</Label><div className="mt-1"><DatePicker value={form.serviceDate} onChange={(v) => setForm((f) => ({ ...f, serviceDate: v }))} /></div></div>
        <div><Label>موعد الصيانة القادمة</Label><div className="mt-1"><DatePicker value={form.nextServiceDate} onChange={(v) => setForm((f) => ({ ...f, nextServiceDate: v }))} /></div></div>
        <div><Label>الكيلومترات القادمة</Label><Input className="mt-1" type="number" value={form.nextServiceKm} onChange={(e) => setForm((f) => ({ ...f, nextServiceKm: e.target.value }))} placeholder="مثال: 50000" /></div>
        <div><Label>الورشة / الفني</Label><Input className="mt-1" value={form.performedBy} onChange={(e) => setForm((f) => ({ ...f, performedBy: e.target.value }))} /></div>
        <div className="md:col-span-3">
          <Label>الوصف</Label>
          <Textarea className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات الصيانة" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/maintenance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
