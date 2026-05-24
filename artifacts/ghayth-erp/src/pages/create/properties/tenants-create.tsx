import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { User, Building2, Shield, Phone, Briefcase } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم المستأجر"),
  phone: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.replace(/\D/g, "").length >= 9,
      "رقم الجوال يجب أن يكون 9 أرقام على الأقل",
    ),
  email: z.string().optional(),
  nationalId: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{10}$/.test(v.trim()),
      "رقم الهوية يجب أن يكون 10 أرقام",
    ),
  nationality: z.string().optional(),
  idType: z.enum(["national_id", "iqama", "passport", "cr"]),
  tenantType: z.enum(["individual", "company"]),
  crNumber: z.string().optional(),
  unifiedNumber: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  monthlyIncome: z.string().optional(),
  guarantorName: z.string().optional(),
  guarantorId: z.string().optional(),
  guarantorPhone: z.string().optional(),
  guarantorRelation: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyContact: z.string().optional(),
  previousAddress: z.string().optional(),
  previousLandlord: z.string().optional(),
  previousLandlordPhone: z.string().optional(),
  notes: z.string().optional(),
});

const TENANT_TYPE_OPTIONS = [
  { value: "individual", label: "فرد" },
  { value: "company", label: "شركة / مؤسسة" },
];
const ID_TYPE_OPTIONS = [
  { value: "national_id", label: "هوية وطنية" },
  { value: "iqama", label: "إقامة" },
  { value: "passport", label: "جواز سفر" },
  { value: "cr", label: "سجل تجاري" },
];
const GENDER_OPTIONS = [
  { value: "male", label: "ذكر" },
  { value: "female", label: "أنثى" },
];
const MARITAL_OPTIONS = [
  { value: "single", label: "أعزب" },
  { value: "married", label: "متزوج" },
  { value: "divorced", label: "مطلق" },
  { value: "widowed", label: "أرمل" },
];

function NameField() {
  const { watch } = useFormContext();
  const isCompany = (watch("tenantType") as string) === "company";
  return (
    <FormTextField
      name="name"
      label={isCompany ? "اسم الشركة" : "الاسم الكامل"}
      required
      placeholder={isCompany ? "اسم الشركة أو المؤسسة" : "الاسم الرباعي"}
    />
  );
}

function CompanyDetailsCard() {
  const { watch } = useFormContext();
  const isCompany = (watch("tenantType") as string) === "company";
  if (!isCompany) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-status-info" /> بيانات الشركة
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FormGrid cols={2}>
          <FormTextField name="crNumber" label="رقم السجل التجاري" placeholder="رقم السجل التجاري" />
          <FormTextField name="unifiedNumber" label="الرقم الموحد (700)" placeholder="700XXXXXXX" />
        </FormGrid>
      </CardContent>
    </Card>
  );
}

function PersonalDetailsCard() {
  const { watch } = useFormContext();
  const isCompany = (watch("tenantType") as string) === "company";
  if (isCompany) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-orange-500" /> البيانات الشخصية
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FormGrid cols={3}>
          <FormDateField name="birthDate" label="تاريخ الميلاد" />
          <FormSelectField name="gender" label="الجنس" options={GENDER_OPTIONS} placeholder="— غير محدد —" />
          <FormSelectField name="maritalStatus" label="الحالة الاجتماعية" options={MARITAL_OPTIONS} placeholder="— غير محدد —" />
          <FormTextField name="occupation" label="المهنة" placeholder="المهنة أو الوظيفة" />
          <FormNumberField name="monthlyIncome" label={`الدخل الشهري (${getCurrencySymbol()})`} placeholder="0" min="0" />
        </FormGrid>
      </CardContent>
    </Card>
  );
}

export default function TenantsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/tenants", "POST", [["property-tenants-list"]]);

  return (
    <CreatePageLayout title="إضافة مستأجر جديد" backPath="/properties/tenants">
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
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
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "إضافة المستأجر"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties/tenants")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            ...values,
            monthlyIncome: values.monthlyIncome ? Number(values.monthlyIncome) : undefined,
            birthDate: values.birthDate || undefined,
            crNumber: values.crNumber || undefined,
            unifiedNumber: values.unifiedNumber || undefined,
            gender: values.gender || undefined,
            maritalStatus: values.maritalStatus || undefined,
          });
          toast({ title: "تم إضافة المستأجر بنجاح" });
          setLocation("/properties/tenants");
        }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-violet-500" /> البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={3}>
              <FormSelectField name="tenantType" label="نوع المستأجر" options={TENANT_TYPE_OPTIONS} />
              <NameField />
              <FormPhoneField name="phone" label="رقم الجوال" placeholder="05XXXXXXXX" />
              <FormEmailField name="email" label="البريد الإلكتروني" placeholder="example@email.com" />
              <FormSelectField name="idType" label="نوع الهوية" options={ID_TYPE_OPTIONS} />
              <FormTextField name="nationalId" label="رقم الهوية" placeholder="رقم الهوية أو الإقامة" />
              <FormTextField name="nationality" label="الجنسية" placeholder="الجنسية" />
            </FormGrid>
          </CardContent>
        </Card>

        <CompanyDetailsCard />
        <PersonalDetailsCard />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-status-error" /> الكفيل / الضامن
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormTextField name="guarantorName" label="اسم الكفيل / الضامن" placeholder="اسم الكفيل الكامل" />
              <FormTextField name="guarantorId" label="رقم هوية الكفيل" placeholder="رقم الهوية" />
              <FormPhoneField name="guarantorPhone" label="هاتف الكفيل" placeholder="05XXXXXXXX" />
              <FormTextField name="guarantorRelation" label="صلة القرابة" placeholder="مثل: أخ، زميل عمل" />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-status-success" /> الطوارئ والسكن السابق
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormTextField name="emergencyName" label="اسم شخص الطوارئ" />
              <FormPhoneField name="emergencyContact" label="هاتف الطوارئ" />
              <FormTextField name="previousAddress" label="عنوان السكن السابق" />
              <FormTextField name="previousLandlord" label="اسم المؤجر السابق" />
              <FormPhoneField name="previousLandlordPhone" label="هاتف المؤجر السابق" />
            </FormGrid>
          </CardContent>
        </Card>

        <FormTextareaField name="notes" label="ملاحظات" placeholder="أي ملاحظات إضافية..." rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
