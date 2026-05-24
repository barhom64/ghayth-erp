import { useLocation } from "wouter";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormEmailField,
  FormPhoneField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";

const schema = z.object({
  ownerType: z.enum(["individual", "company"]),
  name: z.string().min(1, "اسم المالك مطلوب"),
  nationalId: z.string().optional(),
  crNumber: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.replace(/\D/g, "").length >= 9,
      "رقم الهاتف يجب أن يكون 9 أرقام على الأقل",
    ),
  email: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "صيغة البريد الإلكتروني غير صحيحة",
    ),
  iban: z.string().optional(),
  bankName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  authorizationNumber: z.string().optional(),
  authorizationDate: z.string().optional(),
  authorizationExpiry: z.string().optional(),
  notes: z.string().optional(),
});

const OWNER_TYPE_OPTIONS = [
  { value: "individual", label: "فرد" },
  { value: "company", label: "شركة / مؤسسة" },
];

function CrNumberField() {
  const { watch } = useFormContext();
  const ownerType = watch("ownerType") as string;
  if (ownerType !== "company") return null;
  return <FormTextField name="crNumber" label="رقم السجل التجاري" />;
}

function OwnerNameField() {
  const { watch } = useFormContext();
  const ownerType = watch("ownerType") as string;
  return (
    <FormTextField
      name="name"
      label="الاسم"
      required
      placeholder={ownerType === "company" ? "اسم الشركة" : "الاسم الكامل"}
    />
  );
}

export default function OwnersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  return (
    <CreatePageLayout
      title="إضافة مالك جديد"
      subtitle="تسجيل مالك عقار في النظام"
      backPath="/properties/owners"
    >
      <CreationDateField />
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Crown className="h-5 w-5 text-status-warning" /> بيانات المالك
      </h3>
      <FormShell
        schema={schema}
        defaultValues={{
          ownerType: "individual",
          name: "",
          nationalId: "",
          crNumber: "",
          phone: "",
          email: "",
          iban: "",
          bankName: "",
          address: "",
          city: "",
          authorizationNumber: "",
          authorizationDate: "",
          authorizationExpiry: "",
          notes: "",
        }}
        submitLabel="حفظ المالك"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties/owners")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const payload = {
            ...values,
            authorizationDate: values.authorizationDate || undefined,
            authorizationExpiry: values.authorizationExpiry || undefined,
          };
          await apiFetch("/properties/owners", { method: "POST", body: JSON.stringify(payload) });
          toast({ title: "تمت إضافة المالك بنجاح" });
          setLocation("/properties/owners");
        }}
      >
        <FormGrid cols={2}>
          <FormSelectField name="ownerType" label="نوع المالك" options={OWNER_TYPE_OPTIONS} />
          <OwnerNameField />
          <FormTextField name="nationalId" label="رقم الهوية" />
          <CrNumberField />
          <FormPhoneField name="phone" label="الهاتف" />
          <FormEmailField name="email" label="البريد الإلكتروني" />
        </FormGrid>

        <div className="border-t pt-4">
          <p className="text-sm font-bold text-muted-foreground mb-3">البيانات البنكية (لتحويل الإيرادات)</p>
          <FormGrid cols={2}>
            <FormTextField name="iban" label="رقم الآيبان" placeholder="SA0000000000000000000000" />
            <FormTextField name="bankName" label="اسم البنك" />
          </FormGrid>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-bold text-muted-foreground mb-3">الوكالة / التفويض</p>
          <FormGrid cols={3}>
            <FormTextField name="authorizationNumber" label="رقم الوكالة" />
            <FormDateField name="authorizationDate" label="تاريخ الوكالة" />
            <FormDateField name="authorizationExpiry" label="تاريخ انتهاء الوكالة" />
          </FormGrid>
        </div>

        <div className="border-t pt-4">
          <FormGrid cols={2}>
            <FormTextField name="city" label="المدينة" />
            <FormTextField name="address" label="العنوان" />
          </FormGrid>
        </div>

        <FormTextareaField name="notes" label="ملاحظات" rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
