import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Textarea } from "@/components/ui/textarea";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const DRAFT_KEY = "fleet_trips_create";
const INITIAL = {
  vehicleId: "", driverId: "", clientId: "",
  fromLocation: "", toLocation: "", distance: "", cost: "",
  startTime: "", endTime: "", status: "scheduled", notes: "",
};

export default function TripsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/trips", "POST", [["trips"]]);
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const { data: driversData } = useApiQuery<{ data: any[] }>(["fleet-drivers"], "/fleet/drivers");
  const { data: clientsData } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const vehicles = vehiclesData?.data || [];
  const drivers = driversData?.data || [];
  const clients = clientsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = async () => {
    if (!form.vehicleId) {
      toast({ variant: "destructive", title: "يرجى اختيار المركبة" });
      return;
    }
    if (!form.driverId) {
      toast({ variant: "destructive", title: "يرجى اختيار السائق" });
      return;
    }
    if (!form.fromLocation || !form.toLocation) {
      toast({ variant: "destructive", title: "نقطة الانطلاق والوصول مطلوبتان" });
      return;
    }
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      toast({ variant: "destructive", title: "وقت الوصول يجب أن يكون بعد وقت الانطلاق" });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        driverId: Number(form.driverId),
        clientId: form.clientId ? Number(form.clientId) : undefined,
        fromLocation: form.fromLocation || undefined,
        toLocation: form.toLocation || undefined,
        distance: form.distance ? Number(form.distance) : undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        status: form.status,
        notes: form.notes || undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء الرحلة بنجاح" });
      setLocation("/fleet/trips");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الرحلة" });
    }
  };

  return (
    <CreatePageLayout title="رحلة جديدة" backPath="/fleet/trips">
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
        <div>
          <Label>المركبة <span className="text-red-500">*</span></Label>
          <Autocomplete
            className="mt-1"
            placeholder="ابحث عن المركبة..."
            value={form.vehicleId}
            onChange={(v) => setForm((f) => ({ ...f, vehicleId: String(v) }))}
            options={vehicles.map((v: any) => ({ value: String(v.id), label: `${v.plateNumber} - ${v.make || ""} ${v.model || ""}` }))}
          />
        </div>
        <div>
          <Label>السائق <span className="text-red-500">*</span></Label>
          <Autocomplete
            className="mt-1"
            placeholder="ابحث عن السائق..."
            value={form.driverId}
            onChange={(v) => setForm((f) => ({ ...f, driverId: String(v) }))}
            options={drivers.map((d: any) => ({ value: String(d.id), label: d.name }))}
          />
        </div>
        <div>
          <Label>العميل</Label>
          <Autocomplete
            className="mt-1"
            placeholder="ابحث عن العميل..."
            value={form.clientId}
            onChange={(v) => setForm((f) => ({ ...f, clientId: String(v) }))}
            options={clients.map((c: any) => ({ value: String(c.id), label: c.name }))}
          />
        </div>
        <div><Label>من</Label><Input className="mt-1" value={form.fromLocation} onChange={(e) => setForm((f) => ({ ...f, fromLocation: e.target.value }))} placeholder="نقطة الانطلاق" /></div>
        <div><Label>إلى</Label><Input className="mt-1" value={form.toLocation} onChange={(e) => setForm((f) => ({ ...f, toLocation: e.target.value }))} placeholder="الوجهة" /></div>
        <div><Label>المسافة (كم)</Label><Input className="mt-1" type="number" value={form.distance} onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))} /></div>
        <div><Label>التكلفة</Label><Input className="mt-1" type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} /></div>
        <div><Label>وقت المغادرة</Label><Input className="mt-1" type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
        <div><Label>وقت الوصول</Label><Input className="mt-1" type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
        <div>
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">مجدولة</SelectItem>
              <SelectItem value="in_progress">جارية</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label>ملاحظات</Label>
          <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-semibold mb-1">العمليات المالية عند إكمال الرحلة:</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>قيد محاسبي تلقائي: مصروف وقود + أجرة سائق + إهلاك مركبة</li>
          <li>ربط القيد بالمركبة لتتبع التكاليف التشغيلية</li>
        </ul>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/trips")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
