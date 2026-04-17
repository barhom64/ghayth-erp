import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreatePageLayout } from "@/components/create-page-layout";

export default function BuildingsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ownersResp } = useApiQuery<any>(["property-owners"], "/properties/owners");
  const owners = asList(ownersResp);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    name: "", address: "", city: "", type: "residential", floors: "", description: "",
    deedNumber: "", deedDate: "", buildingPermitNumber: "",
    district: "", street: "", buildingNumber: "", postalCode: "", additionalNumber: "",
    latitude: "", longitude: "", totalArea: "", yearBuilt: "", ownerId: "",
    purchasePrice: "", purchaseDate: "", salvageValue: "", usefulLifeYears: "20",
  });

  const buildPayload = () => ({
    ...form,
    floors: Number(form.floors) || undefined,
    totalArea: form.totalArea ? Number(form.totalArea) : undefined,
    yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
    latitude: form.latitude ? Number(form.latitude) : undefined,
    longitude: form.longitude ? Number(form.longitude) : undefined,
    ownerId: form.ownerId ? Number(form.ownerId) : undefined,
    purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
    purchaseDate: form.purchaseDate || undefined,
    salvageValue: form.salvageValue ? Number(form.salvageValue) : undefined,
    usefulLifeYears: form.usefulLifeYears ? Number(form.usefulLifeYears) : undefined,
    nationalAddress: (form.district || form.street || form.buildingNumber || form.postalCode) ? {
      district: form.district, street: form.street, buildingNumber: form.buildingNumber,
      postalCode: form.postalCode, additionalNumber: form.additionalNumber,
    } : undefined,
  });

  const handleSave = async () => {
    if (!form.name) { toast({ variant: "destructive", title: "اسم المبنى مطلوب" }); return; }
    setSaving(true);
    try {
      await apiFetch("/properties/buildings", { method: "POST", body: JSON.stringify(buildPayload()) });
      toast({ title: "تمت إضافة المبنى بنجاح" });
      setLocation("/properties/buildings");
    } catch { toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المبنى" }); }
    finally { setSaving(false); }
  };

  return (
    <CreatePageLayout
      title="إضافة مبنى جديد"
      subtitle="تسجيل مبنى أو مجمع في النظام"
      backPath="/properties/buildings"
    >
      <div className="space-y-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5 text-blue-500" /> بيانات المبنى
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>اسم المبنى <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="برج X / مجمع Y" />
            </div>
            <div>
              <Label>نوع المبنى</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">سكني</SelectItem>
                  <SelectItem value="commercial">تجاري</SelectItem>
                  <SelectItem value="mixed">مختلط</SelectItem>
                  <SelectItem value="industrial">صناعي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المدينة</Label>
              <Input className="mt-1" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="الرياض" />
            </div>
            <div>
              <Label>عدد الطوابق</Label>
              <Input className="mt-1" type="number" value={form.floors} onChange={e => setForm({ ...form, floors: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">بيانات الملكية (إيجار)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>رقم الصك</Label>
                <Input className="mt-1" dir="ltr" value={form.deedNumber} onChange={e => setForm({ ...form, deedNumber: e.target.value })} />
              </div>
              <div>
                <Label>تاريخ الصك</Label>
                <Input className="mt-1" type="date" value={form.deedDate} onChange={e => setForm({ ...form, deedDate: e.target.value })} />
              </div>
              <div>
                <Label>رقم رخصة البناء</Label>
                <Input className="mt-1" dir="ltr" value={form.buildingPermitNumber} onChange={e => setForm({ ...form, buildingPermitNumber: e.target.value })} />
              </div>
              <div>
                <Label>المالك</Label>
                <Select value={form.ownerId || "none"} onValueChange={v => setForm({ ...form, ownerId: v === "none" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— بدون —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون مالك —</SelectItem>
                    {owners.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>سنة البناء</Label>
                <Input className="mt-1" type="number" value={form.yearBuilt} onChange={e => setForm({ ...form, yearBuilt: e.target.value })} placeholder="١٤٤٥" />
              </div>
              <div>
                <Label>المساحة الإجمالية (م²)</Label>
                <Input className="mt-1" type="number" value={form.totalArea} onChange={e => setForm({ ...form, totalArea: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">العنوان الوطني</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>الحي</Label>
                <Input className="mt-1" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} />
              </div>
              <div>
                <Label>الشارع</Label>
                <Input className="mt-1" value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} />
              </div>
              <div>
                <Label>رقم المبنى</Label>
                <Input className="mt-1" dir="ltr" value={form.buildingNumber} onChange={e => setForm({ ...form, buildingNumber: e.target.value })} />
              </div>
              <div>
                <Label>الرمز البريدي</Label>
                <Input className="mt-1" dir="ltr" value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} />
              </div>
              <div>
                <Label>الرقم الإضافي</Label>
                <Input className="mt-1" dir="ltr" value={form.additionalNumber} onChange={e => setForm({ ...form, additionalNumber: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">الإحداثيات</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>خط العرض</Label>
                <Input className="mt-1" type="number" step="0.0000001" dir="ltr" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="24.7136" />
              </div>
              <div>
                <Label>خط الطول</Label>
                <Input className="mt-1" type="number" step="0.0000001" dir="ltr" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="46.6753" />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-green-600 mb-3">البيانات المالية — الربط المحاسبي التلقائي</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>سعر الشراء (ريال)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} placeholder="قيمة شراء العقار" /></div>
              <div><Label>تاريخ الشراء</Label><Input className="mt-1" type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} /></div>
              <div><Label>قيمة الخردة (ريال)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={form.salvageValue} onChange={e => setForm({ ...form, salvageValue: e.target.value })} placeholder="القيمة المتبقية" /></div>
              <div><Label>العمر الإنتاجي (سنوات)</Label><Input className="mt-1" type="number" min="1" max="100" value={form.usefulLifeYears} onChange={e => setForm({ ...form, usefulLifeYears: e.target.value })} placeholder="20" /></div>
            </div>
            {form.purchasePrice && Number(form.purchasePrice) > 0 && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                <p className="font-semibold mb-1">سيتم تلقائياً عند الحفظ:</p>
                <ul className="list-disc list-inside space-y-1 text-green-700">
                  <li>إنشاء قيد محاسبي لإثبات الأصل العقاري (مدين: أصول عقارات / دائن: النقدية)</li>
                  <li>تسجيل المبنى كأصل ثابت في نظام الإهلاك</li>
                  <li>فتح حسابات فرعية مرتبطة بالعقار في شجرة الحسابات</li>
                </ul>
              </div>
            )}
          </div>

          <div>
            <Label>العنوان</Label>
            <Input className="mt-1" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="العنوان الكامل" />
          </div>
          <div>
            <Label>وصف</Label>
            <Input className="mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="وصف اختياري..." />
          </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/buildings")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ المبنى"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
