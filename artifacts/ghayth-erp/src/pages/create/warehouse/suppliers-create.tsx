import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم المورد"),
  contactPerson: z.string().optional(),
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
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  paymentTerms: z.string().optional(),
});

const PAYMENT_TERMS = [
  { value: "0", label: "نقدي" },
  { value: "15", label: "صافي 15 يوم" },
  { value: "30", label: "صافي 30 يوم" },
  { value: "60", label: "صافي 60 يوم" },
  { value: "90", label: "صافي 90 يوم" },
];

export default function SuppliersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addSupplier = useApiMutation("/warehouse/suppliers", "POST", [["warehouse-suppliers"]]);

  return (
    <CreatePageLayout title="إضافة مورد جديد" backPath="/warehouse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          contactPerson: "",
          phone: "",
          email: "",
          address: "",
          taxNumber: "",
          paymentTerms: "",
        }}
        submitLabel={addSupplier.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/warehouse")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addSupplier.mutateAsync(values);
          toast({ title: "تمت إضافة المورد بنجاح" });
          setLocation("/warehouse");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المورد" required placeholder="اسم المورد" />
          <FormTextField name="contactPerson" label="جهة الاتصال" placeholder="جهة الاتصال" />
          <FormPhoneField name="phone" label="الهاتف" placeholder="05xxxxxxxx" />
          <FormEmailField name="email" label="البريد الإلكتروني" placeholder="email@example.com" />
          <FormTextField name="address" label="العنوان" placeholder="المدينة، الحي..." />
          <FormTextField name="taxNumber" label="الرقم الضريبي" placeholder="الرقم الضريبي" />
          <FormSelectField
            name="paymentTerms"
            label="شروط الدفع"
            placeholder="اختر الشروط"
            options={PAYMENT_TERMS}
          />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
