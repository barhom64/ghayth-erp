import { useState } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CreatePageLayout } from "@/components/create-page-layout";
import {
  FormShell,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormSelectField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@/components/form-shell";

// Phone is normalised to digits + leading + only — schema rejects
// anything under 9 digits. Email uses zod's built-in `.email()`.
// The conditional `crNumber` field (only when ownerType === "company")
// is still required by the schema, BUT only when the type switches —
// see the OwnerFormBody subcomponent below.
const ownerSchema = z.object({
  ownerType: z.enum(["individual", "company"]),
  name: z.string().trim().min(1, "اسم المالك مطلوب"),
  nationalId: z.string().trim(),
  crNumber: z.string().trim(),
  phone: z.string().trim().refine(
    (v) => !v || v.replace(/\D/g, "").length >= 9,
    "رقم الهاتف يجب أن يكون 9 أرقام على الأقل",
  ),
  email: z.string().trim().refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "صيغة البريد الإلكتروني غير صحيحة",
  ),
  iban: z.string().trim(),
  bankName: z.string().trim(),
  address: z.string().trim(),
  city: z.string().trim(),
  authorizationNumber: z.string().trim(),
  authorizationDate: z.string(),
  authorizationExpiry: z.string(),
  notes: z.string().trim(),
});
type OwnerForm = z.infer<typeof ownerSchema>;

export default function OwnersEdit() {
  const [, params] = useRoute("/properties/owners/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: owner, isLoading, isError, refetch } = useApiQuery<any>(
    ["property-owner", String(params?.id ?? "")],
    `/properties/owners/${params?.id}`,
    { enabled: !!params?.id }
  );

  const handleSave = async (values: OwnerForm) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        authorizationDate: values.authorizationDate || undefined,
        authorizationExpiry: values.authorizationExpiry || undefined,
      };
      await apiPatch(`/properties/owners/${params?.id}`, payload);
      toast({ title: "تم تحديث بيانات المالك" });
      qc.invalidateQueries({ queryKey: ["property-owners"] });
      qc.invalidateQueries({ queryKey: ["property-owner", params?.id] });
      setLocation("/properties/owners");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!owner || !owner.id) return <div className="text-center py-16 text-gray-500">المالك غير موجود</div>;

  return (
    <CreatePageLayout
      title={`تعديل المالك — ${owner.name}`}
      subtitle="تعديل بيانات مالك العقار"
      backPath="/properties/owners"
    >
      <FormShell
        key={owner.id}
        schema={ownerSchema}
        defaultValues={{
          ownerType: (owner.ownerType as "individual" | "company") || "individual",
          name: owner.name || "",
          nationalId: owner.nationalId || "",
          crNumber: owner.crNumber || "",
          phone: owner.phone || "",
          email: owner.email || "",
          iban: owner.iban || "",
          bankName: owner.bankName || "",
          address: owner.address || "",
          city: owner.city || "",
          authorizationNumber: owner.authorizationNumber || "",
          authorizationDate: owner.authorizationDate ? String(owner.authorizationDate).slice(0, 10) : "",
          authorizationExpiry: owner.authorizationExpiry ? String(owner.authorizationExpiry).slice(0, 10) : "",
          notes: owner.notes || "",
        }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties/owners")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <h3 className="flex items-center gap-2 text-lg font-semibold mb-4">
          <Crown className="h-5 w-5 text-amber-500" /> بيانات المالك
        </h3>
        <OwnerFormBody />
      </FormShell>
    </CreatePageLayout>
  );
}

// The conditional crNumber field watches ownerType — react-hook-form's
// FormShell provider exposes `useFormContext` for that. Keeps the
// "show CR number only for companies" UX behaviour from the old
// imperative `{form.ownerType === "company" && ...}` block.
function OwnerFormBody() {
  const { watch } = useFormContext<OwnerForm>();
  const ownerType = watch("ownerType");
  return (
    <>
      <FormGrid cols={2}>
        <FormSelectField
          name="ownerType"
          label="نوع المالك"
          options={[
            { value: "individual", label: "فرد" },
            { value: "company", label: "شركة / مؤسسة" },
          ]}
        />
        <FormTextField
          name="name"
          label="الاسم"
          required
          placeholder={ownerType === "company" ? "اسم الشركة" : "الاسم الكامل"}
        />
        <FormTextField name="nationalId" label="رقم الهوية" />
        {ownerType === "company" && (
          <FormTextField name="crNumber" label="رقم السجل التجاري" />
        )}
        <FormPhoneField name="phone" label="الهاتف" />
        <FormEmailField name="email" label="البريد الإلكتروني" />
      </FormGrid>

      <div className="border-t pt-4 mt-4">
        <p className="text-sm font-bold text-gray-600 mb-3">البيانات البنكية (لتحويل الإيرادات)</p>
        <FormGrid cols={2}>
          <FormTextField name="iban" label="رقم الآيبان" placeholder="SA0000000000000000000000" />
          <FormTextField name="bankName" label="اسم البنك" />
        </FormGrid>
      </div>

      <div className="border-t pt-4 mt-4">
        <p className="text-sm font-bold text-gray-600 mb-3">الوكالة / التفويض</p>
        <FormGrid cols={3}>
          <FormTextField name="authorizationNumber" label="رقم الوكالة" />
          <FormDateField name="authorizationDate" label="تاريخ الوكالة" />
          <FormDateField name="authorizationExpiry" label="تاريخ انتهاء الوكالة" />
        </FormGrid>
      </div>

      <div className="border-t pt-4 mt-4">
        <FormGrid cols={2}>
          <FormTextField name="city" label="المدينة" />
          <FormTextField name="address" label="العنوان" />
        </FormGrid>
      </div>

      <FormTextareaField name="notes" label="ملاحظات" rows={3} className="mt-4" />
    </>
  );
}
