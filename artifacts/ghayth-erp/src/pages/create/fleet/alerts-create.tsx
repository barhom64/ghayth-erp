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
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";

const DRAFT_KEY = "fleet_alerts_create";
const INITIAL = { vehicleId: "", type: "scheduled", description: "", serviceDate: "", performedBy: "" };

export default function FleetAlertsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/maintenance", "POST", [["fleet-alerts"], ["fleet-maintenance"]]);
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const vehicles = vehiclesData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.vehicleId) {
      toast({ variant: "destructive", title: "يرجى اختيار المركبة" });
      return;
    }
    if (!form.description) {
      toast({ variant: "destructive", title: "وصف التنبيه مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        type: form.type,
        description: form.description,
        serviceDate: form.serviceDate || undefined,
        performedBy: form.performedBy || undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء التنبيه بنجاح" });
      setLocation("/fleet/alerts");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التنبيه" });
    }
  };

  return (
    <CreatePageLayout title="إضافة تنبيه صيانة" backPath="/fleet/alerts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>المركبة</Label>
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
          <Label>نوع التنبيه</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">صيانة مجدولة</SelectItem>
              <SelectItem value="preventive">صيانة وقائية</SelectItem>
              <SelectItem value="corrective">صيانة إصلاحية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>تاريخ الاستحقاق</Label><div className="mt-1"><DatePicker value={form.serviceDate} onChange={(v) => setForm((f) => ({ ...f, serviceDate: v }))} /></div></div>
        <div><Label>الفني المسؤول</Label><Input className="mt-1" value={form.performedBy} onChange={(e) => setForm((f) => ({ ...f, performedBy: e.target.value }))} /></div>
        <div className="md:col-span-2">
          <Label>التفاصيل</Label>
          <Textarea className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="تفاصيل التنبيه..." />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button type="button" variant="outline" onClick={() => setLocation("/fleet/alerts")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
