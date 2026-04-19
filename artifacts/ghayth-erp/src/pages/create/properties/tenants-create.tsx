import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { User, Building2, Shield, Phone, Briefcase } from "lucide-react";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function TenantsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/tenants", "POST", [["property-tenants-list"]]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المستأجر", description: err?.fix ?? err?.message });
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
              <FormFieldWrapper label="نوع المستأجر">
                <Select value={form.tenantType} onValueChange={v => set("tenantType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">فرد</SelectItem>
                    <SelectItem value="company">شركة / مؤسسة</SelectItem>
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              <TextField label={isCompany ? "اسم الشركة" : "الاسم الكامل"} required value={form.name} onChange={v => set("name", v)} placeholder={isCompany ? "اسم الشركة أو المؤسسة" : "الاسم الرباعي"} error={fieldErrors.name} />
              <TextField label="رقم الجوال" dir="ltr" value={form.phone} onChange={v => set("phone", v)} placeholder="05XXXXXXXX" error={fieldErrors.phone} />
              <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={v => set("email", v)} placeholder="example@email.com" />
              <FormFieldWrapper label="نوع الهوية">
                <Select value={form.idType} onValueChange={v => set("idType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national_id">هوية وطنية</SelectItem>
                    <SelectItem value="iqama">إقامة</SelectItem>
                    <SelectItem value="passport">جواز سفر</SelectItem>
                    <SelectItem value="cr">سجل تجاري</SelectItem>
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              <TextField label="رقم الهوية" dir="ltr" value={form.nationalId} onChange={v => set("nationalId", v)} placeholder="رقم الهوية أو الإقامة" error={fieldErrors.nationalId} />
              <TextField label="الجنسية" value={form.nationality} onChange={v => set("nationality", v)} placeholder="الجنسية" />
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
                <TextField label="رقم السجل التجاري" dir="ltr" value={form.crNumber} onChange={v => set("crNumber", v)} placeholder="رقم السجل التجاري" />
                <TextField label="الرقم الموحد (700)" dir="ltr" value={form.unifiedNumber} onChange={v => set("unifiedNumber", v)} placeholder="700XXXXXXX" />
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
                <FormFieldWrapper label="تاريخ الميلاد">
                  <DatePicker value={form.birthDate} onChange={v => set("birthDate", v)} />
                </FormFieldWrapper>
                <FormFieldWrapper label="الجنس">
                  <Select value={form.gender || "none"} onValueChange={v => set("gender", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— غير محدد —</SelectItem>
                      <SelectItem value="male">ذكر</SelectItem>
                      <SelectItem value="female">أنثى</SelectItem>
                    </SelectContent>
                  </Select>
                </FormFieldWrapper>
                <FormFieldWrapper label="الحالة الاجتماعية">
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
                </FormFieldWrapper>
                <TextField label="المهنة" value={form.occupation} onChange={v => set("occupation", v)} placeholder="المهنة أو الوظيفة" />
                <NumberField label={`الدخل الشهري (${getCurrencySymbol()})`} value={form.monthlyIncome} onChange={v => set("monthlyIncome", v)} placeholder="0" min={0} />
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
              <TextField label="اسم الكفيل / الضامن" value={form.guarantorName} onChange={v => set("guarantorName", v)} placeholder="اسم الكفيل الكامل" />
              <TextField label="رقم هوية الكفيل" dir="ltr" value={form.guarantorId} onChange={v => set("guarantorId", v)} placeholder="رقم الهوية" />
              <TextField label="هاتف الكفيل" dir="ltr" value={form.guarantorPhone} onChange={v => set("guarantorPhone", v)} placeholder="05XXXXXXXX" />
              <TextField label="صلة القرابة" value={form.guarantorRelation} onChange={v => set("guarantorRelation", v)} placeholder="مثل: أخ، زميل عمل" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4 text-green-500" /> الطوارئ والسكن السابق</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField label="اسم شخص الطوارئ" value={form.emergencyName} onChange={v => set("emergencyName", v)} />
              <TextField label="هاتف الطوارئ" dir="ltr" value={form.emergencyContact} onChange={v => set("emergencyContact", v)} />
              <TextField label="عنوان السكن السابق" value={form.previousAddress} onChange={v => set("previousAddress", v)} />
              <TextField label="اسم المؤجر السابق" value={form.previousLandlord} onChange={v => set("previousLandlord", v)} />
              <TextField label="هاتف المؤجر السابق" dir="ltr" value={form.previousLandlordPhone} onChange={v => set("previousLandlordPhone", v)} />
            </div>
          </CardContent>
        </Card>

        <TextAreaField label="ملاحظات" value={form.notes} onChange={v => set("notes", v)} placeholder="أي ملاحظات إضافية..." rows={3} />

        <div className="flex justify-end pt-2">
          <Button onClick={handleSubmit} disabled={createMut.isPending} className="min-w-32">
            {createMut.isPending ? "جاري الحفظ..." : "إضافة المستأجر"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
