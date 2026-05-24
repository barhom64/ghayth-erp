import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";

const schema = z.object({
  name: z.string().min(1, "اسم المبنى مطلوب"),
  address: z.string().optional(),
  city: z.string().optional(),
  type: z.enum(["residential", "commercial", "mixed", "industrial"]),
  floors: z
    .string()
    .optional()
    .refine(
      (v) => !v || Number(v) >= 0,
      "عدد الطوابق يجب أن يكون صفر أو أكثر",
    ),
  description: z.string().optional(),
  deedNumber: z.string().optional(),
  deedDate: z.string().optional(),
  buildingPermitNumber: z.string().optional(),
  district: z.string().optional(),
  street: z.string().optional(),
  buildingNumber: z.string().optional(),
  postalCode: z.string().optional(),
  additionalNumber: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  totalArea: z.string().optional(),
  yearBuilt: z.string().optional(),
  ownerId: z.string().optional(),
});

const TYPE_OPTIONS = [
  { value: "residential", label: "سكني" },
  { value: "commercial", label: "تجاري" },
  { value: "mixed", label: "مختلط" },
  { value: "industrial", label: "صناعي" },
];

export default function BuildingsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ownersResp, isLoading, isError } = useApiQuery<any>(
    ["property-owners"],
    "/properties/owners",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const owners = asList(ownersResp);
  const ownerOptions = owners.map((o: any) => ({
    value: String(o.id),
    label: o.name,
  }));

  return (
    <CreatePageLayout
      title="إضافة مبنى جديد"
      subtitle="تسجيل مبنى أو مجمع في النظام"
      backPath="/properties/buildings"
    >
      <CreationDateField />
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Building2 className="h-5 w-5 text-status-info" /> بيانات المبنى
      </h3>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          address: "",
          city: "",
          type: "residential",
          floors: "",
          description: "",
          deedNumber: "",
          deedDate: "",
          buildingPermitNumber: "",
          district: "",
          street: "",
          buildingNumber: "",
          postalCode: "",
          additionalNumber: "",
          latitude: "",
          longitude: "",
          totalArea: "",
          yearBuilt: "",
          ownerId: "",
        }}
        submitLabel="حفظ المبنى"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties/buildings")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const payload = {
            ...values,
            floors: Number(values.floors) || undefined,
            totalArea: values.totalArea ? Number(values.totalArea) : undefined,
            yearBuilt: values.yearBuilt ? Number(values.yearBuilt) : undefined,
            latitude: values.latitude ? Number(values.latitude) : undefined,
            longitude: values.longitude ? Number(values.longitude) : undefined,
            ownerId: values.ownerId ? Number(values.ownerId) : undefined,
            nationalAddress: (values.district || values.street || values.buildingNumber || values.postalCode) ? {
              district: values.district,
              street: values.street,
              buildingNumber: values.buildingNumber,
              postalCode: values.postalCode,
              additionalNumber: values.additionalNumber,
            } : undefined,
          };
          await apiFetch("/properties/buildings", { method: "POST", body: JSON.stringify(payload) });
          toast({ title: "تمت إضافة المبنى بنجاح" });
          setLocation("/properties/buildings");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المبنى" required placeholder="برج X / مجمع Y" />
          <FormSelectField name="type" label="نوع المبنى" options={TYPE_OPTIONS} />
          <FormTextField name="city" label="المدينة" placeholder="الرياض" />
          <FormNumberField name="floors" label="عدد الطوابق" min="0" />
        </FormGrid>

        <div className="border-t pt-4">
          <p className="text-sm font-bold text-muted-foreground mb-3">بيانات الملكية (إيجار)</p>
          <FormGrid cols={2}>
            <FormTextField name="deedNumber" label="رقم الصك" />
            <FormDateField name="deedDate" label="تاريخ الصك" />
            <FormTextField name="buildingPermitNumber" label="رقم رخصة البناء" />
            <FormSelectField name="ownerId" label="المالك" options={ownerOptions} placeholder="— بدون مالك —" />
            <FormNumberField name="yearBuilt" label="سنة البناء" placeholder="١٤٤٥" min="1800" />
            <FormNumberField name="totalArea" label="المساحة الإجمالية (م²)" min="0" />
          </FormGrid>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-bold text-muted-foreground mb-3">العنوان الوطني</p>
          <FormGrid cols={3}>
            <FormTextField name="district" label="الحي" />
            <FormTextField name="street" label="الشارع" />
            <FormTextField name="buildingNumber" label="رقم المبنى" />
            <FormTextField name="postalCode" label="الرمز البريدي" />
            <FormTextField name="additionalNumber" label="الرقم الإضافي" />
          </FormGrid>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-bold text-muted-foreground mb-3">الإحداثيات</p>
          <FormGrid cols={2}>
            <FormNumberField name="latitude" label="خط العرض" step="0.0000001" placeholder="24.7136" />
            <FormNumberField name="longitude" label="خط الطول" step="0.0000001" placeholder="46.6753" />
          </FormGrid>
        </div>

        <FormTextField name="address" label="العنوان" placeholder="العنوان الكامل" />
        <FormTextField name="description" label="وصف" placeholder="وصف اختياري..." />
      </FormShell>
    </CreatePageLayout>
  );
}
