import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
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
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  name: z.string().min(1, "اسم المورد مطلوب"),
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
  taxNumber: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{15}$/.test(v.replace(/\s/g, "")),
      "الرقم الضريبي يجب أن يكون 15 رقماً",
    ),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  category: z.string().optional(),
  date: z.string().optional(),
});

const PAYMENT_TERM_OPTIONS = [
  { value: "net_30", label: "صافي 30 يوم" },
  { value: "net_60", label: "صافي 60 يوم" },
  { value: "net_90", label: "صافي 90 يوم" },
  { value: "cod", label: "الدفع عند التسليم" },
  { value: "advance", label: "مقدماً" },
];

export default function VendorsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/vendors", "POST", [["vendors"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="إضافة مورد جديد" backPath="/finance/vendors">
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          contactPerson: "",
          phone: "",
          email: "",
          taxNumber: "",
          address: "",
          paymentTerms: "",
          category: "",
          date: todayLocal(),
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/vendors")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({ ...values, date: values.date || undefined });
          toast({ title: "تم إضافة المورد بنجاح" });
          setLocation("/finance/vendors");
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="date" label="التاريخ" />
        </FormGrid>
        <FormGrid cols={3}>
          <FormTextField name="name" label="الاسم" required />
          <FormTextField name="contactPerson" label="جهة الاتصال" />
          <FormPhoneField name="phone" label="الهاتف" />
          <FormEmailField name="email" label="البريد" />
          <FormTextField name="taxNumber" label="الرقم الضريبي" />
          <FormTextField name="address" label="العنوان" />
          <FormSelectField
            name="paymentTerms"
            label="شروط الدفع"
            options={PAYMENT_TERM_OPTIONS}
            placeholder="اختر"
          />
        </FormGrid>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
