import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { User, Building2, Shield, Phone, Briefcase } from "lucide-react";

export default function TenantsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/tenants", "POST", [["property-tenants-list"]]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    nationalId: "",
    nationality: "",
    idType: "national_id",
    tenantType: "individual",
    crNumber: "",
    unifiedNumber: "",
    birthDate: "",
    gender: "",
    maritalStatus: "",
    occupation: "",
    monthlyIncome: "",
    guarantorName: "",
    guarantorId: "",
    guarantorPhone: "",
    guarantorRelation: "",
    emergencyName: "",
    emergencyContact: "",
    previousAddress: "",
    previousLandlord: "",
    previousLandlordPhone: "",
    notes: "",
  });

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const isCompany = form.tenantType === "company";

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name.trim()) localErrors.name = "يرجى إدخال اسم المستأجر";
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) localErrors.phone = "رقم الجوال يجب أن يكون 9 أرقام على الأقل";
    if (form.nationalId && !/^\d{10}$/.test(form.nationalId.trim())) localErrors.nationalId = "رقم الهوية يجب أن يكون 10 أرقام";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
        birthDate: form.birthDate || undefined,
        crNumber: form.crNumber || undefined,
        unifiedNumber: form.unifiedNumber || undefined,
        gender: form.gender || undefined,
        maritalStatus: form.maritalStatus || undefined,
      });
      toast({ title: "تم إضافة المستأجر بنجاح" });
      setLocation("/properties/tenants");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المستأجر", description: err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة مستأجر جديد" backPath="/properties/tenants">
      <div className="space-y-6">
        <CreationDateField />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-violet-500" /> البيانات الأساسية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>نوع المستأجر</Label>
                <Select value={form.tenantType} onValueChange={v => set("tenantType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">فرد</SelectItem>
                    <SelectItem value="company">شركة / مؤسسة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isCompany ? "اسم الشركة" : "الاسم الكامل"} <span className="text-red-500">*</span></Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder={isCompany ? "اسم الشركة أو المؤسسة" : "الاسم الرباعي"} />
              </div>
              <div className="space-y-2">
                <Label>رقم الجوال</Label>
                <Input dir="ltr" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="05XXXXXXXX" />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" dir="ltr" value={form.email} onChange={e => set("email", e.target.value)} placeholder="example@email.com" />
              </div>
              <div className="space-y-2">
                <Label>نوع الهوية</Label>
                <Select value={form.idType} onValueChange={v => set("idType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national_id">هوية وطنية</SelectItem>
                    <SelectItem value="iqama">إقامة</SelectItem>
                    <SelectItem value="passport">جواز سفر</SelectItem>
                    <SelectItem value="cr">سجل تجاري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>رقم الهوية</Label>
                <Input dir="ltr" value={form.nationalId} onChange={e => set("nationalId", e.target.value)} placeholder="رقم الهوية أو الإقامة" />
              </div>
              <div className="space-y-2">
                <Label>الجنسية</Label>
                <Input value={form.nationality} onChange={e => set("nationality", e.target.value)} placeholder="الجنسية" />
              </div>
            </div>
          </CardContent>
        </Card>

        {isCompany && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-500" /> بيانات الشركة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>رقم السجل التجاري</Label>
                  <Input dir="ltr" value={form.crNumber} onChange={e => set("crNumber", e.target.value)} placeholder="رقم السجل التجاري" />
                </div>
                <div className="space-y-2">
                  <Label>الرقم الموحد (700)</Label>
                  <Input dir="ltr" value={form.unifiedNumber} onChange={e => set("unifiedNumber", e.target.value)} placeholder="700XXXXXXX" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isCompany && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-orange-500" /> البيانات الشخصية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>تاريخ الميلاد</Label>
                  <DatePicker value={form.birthDate} onChange={v => set("birthDate", v)} />
                </div>
                <div className="space-y-2">
                  <Label>الجنس</Label>
                  <Select value={form.gender || "none"} onValueChange={v => set("gender", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— غير محدد —</SelectItem>
                      <SelectItem value="male">ذكر</SelectItem>
                      <SelectItem value="female">أنثى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الحالة الاجتماعية</Label>
                  <Select value={form.maritalStatus || "none"} onValueChange={v => set("maritalStatus", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— غير محدد —</SelectItem>
                      <SelectItem value="single">أعزب</SelectItem>
                      <SelectItem value="married">متزوج</SelectItem>
                      <SelectItem value="divorced">مطلق</SelectItem>
                      <SelectItem value="widowed">أرمل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>المهنة</Label>
                  <Input value={form.occupation} onChange={e => set("occupation", e.target.value)} placeholder="المهنة أو الوظيفة" />
                </div>
                <div className="space-y-2">
                  <Label>الدخل الشهري ({getCurrencySymbol()})</Label>
                  <Input type="number" value={form.monthlyIncome} onChange={e => set("monthlyIncome", e.target.value)} placeholder="0" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" /> الكفيل / الضامن</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم الكفيل / الضامن</Label>
                <Input value={form.guarantorName} onChange={e => set("guarantorName", e.target.value)} placeholder="اسم الكفيل الكامل" />
              </div>
              <div className="space-y-2">
                <Label>رقم هوية الكفيل</Label>
                <Input dir="ltr" value={form.guarantorId} onChange={e => set("guarantorId", e.target.value)} placeholder="رقم الهوية" />
              </div>
              <div className="space-y-2">
                <Label>هاتف الكفيل</Label>
                <Input dir="ltr" value={form.guarantorPhone} onChange={e => set("guarantorPhone", e.target.value)} placeholder="05XXXXXXXX" />
              </div>
              <div className="space-y-2">
                <Label>صلة القرابة</Label>
                <Input value={form.guarantorRelation} onChange={e => set("guarantorRelation", e.target.value)} placeholder="مثل: أخ، زميل عمل" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4 text-green-500" /> الطوارئ والسكن السابق</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم شخص الطوارئ</Label>
                <Input value={form.emergencyName} onChange={e => set("emergencyName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>هاتف الطوارئ</Label>
                <Input dir="ltr" value={form.emergencyContact} onChange={e => set("emergencyContact", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>عنوان السكن السابق</Label>
                <Input value={form.previousAddress} onChange={e => set("previousAddress", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>اسم المؤجر السابق</Label>
                <Input value={form.previousLandlord} onChange={e => set("previousLandlord", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>هاتف المؤجر السابق</Label>
                <Input dir="ltr" value={form.previousLandlordPhone} onChange={e => set("previousLandlordPhone", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label>ملاحظات</Label>
          <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="أي ملاحظات إضافية..." rows={3} />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSubmit} disabled={createMut.isPending} className="min-w-32">
            {createMut.isPending ? "جاري الحفظ..." : "إضافة المستأجر"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
