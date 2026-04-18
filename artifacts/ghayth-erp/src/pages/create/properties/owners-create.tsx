import { useState } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Crown, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreatePageLayout } from "@/components/create-page-layout";

export default function OwnersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    ownerType: "individual", name: "", nationalId: "", crNumber: "", phone: "", email: "",
    iban: "", bankName: "", address: "", city: "",
    authorizationNumber: "", authorizationDate: "", authorizationExpiry: "", notes: "",
  });

  const handleSave = async () => {
    if (!form.name) { toast({ variant: "destructive", title: "اسم المالك مطلوب" }); return; }
    setSaving(true);
    try {
      const payload = { ...form, authorizationDate: form.authorizationDate || undefined, authorizationExpiry: form.authorizationExpiry || undefined };
      await apiFetch("/properties/owners", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "تمت إضافة المالك بنجاح" });
      setLocation("/properties/owners");
    } catch (err: any) { toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.message }); }
    finally { setSaving(false); }
  };

  return (
    <CreatePageLayout
      title="إضافة مالك جديد"
      subtitle="تسجيل مالك عقار في النظام"
      backPath="/properties/owners"
    >
      <div className="space-y-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Crown className="h-5 w-5 text-amber-500" /> بيانات المالك
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>نوع المالك</Label>
              <Select value={form.ownerType} onValueChange={v => setForm({ ...form, ownerType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">فرد</SelectItem>
                  <SelectItem value="company">شركة / مؤسسة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الاسم <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={form.ownerType === "company" ? "اسم الشركة" : "الاسم الكامل"} />
            </div>
            <div>
              <Label>رقم الهوية</Label>
              <Input className="mt-1" dir="ltr" value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} />
            </div>
            {form.ownerType === "company" && (
              <div>
                <Label>رقم السجل التجاري</Label>
                <Input className="mt-1" dir="ltr" value={form.crNumber} onChange={e => setForm({ ...form, crNumber: e.target.value })} />
              </div>
            )}
            <div>
              <Label>الهاتف</Label>
              <Input className="mt-1" dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input className="mt-1" type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">البيانات البنكية (لتحويل الإيرادات)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>رقم الآيبان</Label>
                <Input className="mt-1" dir="ltr" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} placeholder="SA0000000000000000000000" />
              </div>
              <div>
                <Label>اسم البنك</Label>
                <Input className="mt-1" value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">الوكالة / التفويض</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>رقم الوكالة</Label>
                <Input className="mt-1" dir="ltr" value={form.authorizationNumber} onChange={e => setForm({ ...form, authorizationNumber: e.target.value })} />
              </div>
              <div>
                <Label>تاريخ الوكالة</Label>
                <Input className="mt-1" type="date" value={form.authorizationDate} onChange={e => setForm({ ...form, authorizationDate: e.target.value })} />
              </div>
              <div>
                <Label>تاريخ انتهاء الوكالة</Label>
                <Input className="mt-1" type="date" value={form.authorizationExpiry} onChange={e => setForm({ ...form, authorizationExpiry: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>المدينة</Label>
                <Input className="mt-1" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>العنوان</Label>
                <Input className="mt-1" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
          </div>

        <div>
          <Label>ملاحظات</Label>
          <Textarea className="mt-1" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/owners")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ المالك"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
