import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function BuildingsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ownersResp, isLoading, isError } = useApiQuery<any>(["property-owners"], "/properties/owners");
  const owners = asList(ownersResp);
  const [saving, setSaving] = useState(false);
  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("properties_buildings_create", {
    name: "", address: "", city: "", type: "residential", floors: "", description: "",
    deedNumber: "", deedDate: "", buildingPermitNumber: "",
    district: "", street: "", buildingNumber: "", postalCode: "", additionalNumber: "",
    latitude: "", longitude: "", totalArea: "", yearBuilt: "", ownerId: "",
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const buildPayload = () => ({
    ...form,
    floors: Number(form.floors) || undefined,
    totalArea: form.totalArea ? Number(form.totalArea) : undefined,
    yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
    latitude: form.latitude ? Number(form.latitude) : undefined,
    longitude: form.longitude ? Number(form.longitude) : undefined,
    ownerId: form.ownerId ? Number(form.ownerId) : undefined,
    nationalAddress: (form.district || form.street || form.buildingNumber || form.postalCode) ? {
      district: form.district, street: form.street, buildingNumber: form.buildingNumber,
      postalCode: form.postalCode, additionalNumber: form.additionalNumber,
    } : undefined,
  });

  const handleSave = async () => {
    const firstError = validate({
      name: form.name ? null : "اسم المبنى مطلوب",
      floors: form.floors && Number(form.floors) < 0 ? "عدد الطوابق يجب أن يكون صفر أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/properties/buildings", { method: "POST", body: JSON.stringify(buildPayload()) });
      clearDraft();
      toast({ title: "تمت إضافة المبنى بنجاح" });
      setLocation("/properties/buildings");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المبنى", description: err?.fix ?? err?.message });
    }
    finally { setSaving(false); }
  };

  return (
    <CreatePageLayout
      title="إضافة مبنى جديد"
      subtitle="تسجيل مبنى أو مجمع في النظام"
      backPath="/properties/buildings"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="space-y-6">
        <CreationDateField />
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5 text-status-info" /> بيانات المبنى
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="اسم المبنى" required value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="برج X / مجمع Y" error={fieldErrors.name} />
            <FormFieldWrapper label="نوع المبنى">
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">سكني</SelectItem>
                  <SelectItem value="commercial">تجاري</SelectItem>
                  <SelectItem value="mixed">مختلط</SelectItem>
                  <SelectItem value="industrial">صناعي</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField label="المدينة" value={form.city} onChange={v => setForm({ ...form, city: v })} placeholder="الرياض" />
            <NumberField label="عدد الطوابق" value={form.floors} onChange={v => setForm({ ...form, floors: v })} min={0} error={fieldErrors.floors} />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-muted-foreground mb-3">بيانات الملكية (إيجار)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField label="رقم الصك" dir="ltr" value={form.deedNumber} onChange={v => setForm({ ...form, deedNumber: v })} />
              <FormFieldWrapper label="تاريخ الصك">
                <DatePicker value={form.deedDate} onChange={v => setForm({ ...form, deedDate: v })} />
              </FormFieldWrapper>
              <TextField label="رقم رخصة البناء" dir="ltr" value={form.buildingPermitNumber} onChange={v => setForm({ ...form, buildingPermitNumber: v })} />
              <FormFieldWrapper label="المالك">
                <Select value={form.ownerId || "none"} onValueChange={v => setForm({ ...form, ownerId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— بدون —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون مالك —</SelectItem>
                    {owners.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              <NumberField label="سنة البناء" value={form.yearBuilt} onChange={v => setForm({ ...form, yearBuilt: v })} placeholder="١٤٤٥" min={1800} />
              <NumberField label="المساحة الإجمالية (م²)" value={form.totalArea} onChange={v => setForm({ ...form, totalArea: v })} min={0} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-muted-foreground mb-3">العنوان الوطني</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <TextField label="الحي" value={form.district} onChange={v => setForm({ ...form, district: v })} />
              <TextField label="الشارع" value={form.street} onChange={v => setForm({ ...form, street: v })} />
              <TextField label="رقم المبنى" dir="ltr" value={form.buildingNumber} onChange={v => setForm({ ...form, buildingNumber: v })} />
              <TextField label="الرمز البريدي" dir="ltr" value={form.postalCode} onChange={v => setForm({ ...form, postalCode: v })} />
              <TextField label="الرقم الإضافي" dir="ltr" value={form.additionalNumber} onChange={v => setForm({ ...form, additionalNumber: v })} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-muted-foreground mb-3">الإحداثيات</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="خط العرض" value={form.latitude} onChange={v => setForm({ ...form, latitude: v })} step={0.0000001} placeholder="24.7136" />
              <NumberField label="خط الطول" value={form.longitude} onChange={v => setForm({ ...form, longitude: v })} step={0.0000001} placeholder="46.6753" />
            </div>
          </div>

          <TextField label="العنوان" value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="العنوان الكامل" />
          <TextField label="وصف" value={form.description} onChange={v => setForm({ ...form, description: v })} placeholder="وصف اختياري..." />
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/buildings")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2" rateLimitAware>
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ المبنى"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
