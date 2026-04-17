import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const DRAFT_KEY = "fleet_insurance_create";
const INITIAL = {
  vehicleId: "", type: "comprehensive", provider: "", policyNumber: "",
  startDate: "", endDate: "", premium: "", coverageAmount: "", notes: "",
};

export default function InsuranceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/insurance", "POST", [["insurance"]]);
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
        type: form.type,
        provider: form.provider || undefined,
        policyNumber: form.policyNumber || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        premium: form.premium ? Number(form.premium) : 0,
        coverageAmount: form.coverageAmount ? Number(form.coverageAmount) : undefined,
        notes: form.notes || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تم إضافة التأمين بنجاح" });
      setLocation("/fleet/insurance");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة التأمين" });
    }
  };

  return (
    <CreatePageLayout title="إضافة تأمين مركبة" backPath="/fleet/insurance">
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
          <Label>نوع التأمين</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="comprehensive">شامل</SelectItem>
              <SelectItem value="third-party">ضد الغير</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>شركة التأمين</Label><Input className="mt-1" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} /></div>
        <div><Label>رقم الوثيقة</Label><Input className="mt-1" value={form.policyNumber} onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))} /></div>
        <div><Label>تاريخ البدء</Label><div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} /></div></div>
        <div><Label>تاريخ الانتهاء</Label><div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} /></div></div>
        <div><Label>القسط</Label><Input className="mt-1" type="number" value={form.premium} onChange={(e) => setForm((f) => ({ ...f, premium: e.target.value }))} /></div>
        <div><Label>مبلغ التغطية</Label><Input className="mt-1" type="number" value={form.coverageAmount} onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))} /></div>
        <div className="md:col-span-3">
          <Label>ملاحظات</Label>
          <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      {Number(form.premium) > 0 && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <p className="font-semibold mb-1">سيتم تلقائياً عند الحفظ:</p>
          <ul className="list-disc list-inside space-y-1 text-green-700">
            <li>إنشاء قيد محاسبي: مدين تأمين مدفوع مقدماً / دائن النقدية بمبلغ {Number(form.premium).toLocaleString("ar-SA")} ريال</li>
            <li>ربط القيد بالمركبة المحددة لتتبع تكاليف التأمين</li>
          </ul>
        </div>
      )}
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التأمين" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/insurance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
