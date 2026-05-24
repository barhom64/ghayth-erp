import { useState } from "react";
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
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  plateNumber: z.string().min(1, "يرجى إدخال رقم اللوحة"),
  make: z.string().min(1, "الشركة المصنعة مطلوبة"),
  model: z.string().min(1, "الموديل مطلوب"),
  year: z.string().optional(),
  color: z.string().optional(),
  vinNumber: z.string().optional(),
  fuelType: z.enum(["gasoline", "diesel", "hybrid", "electric"]),
  currentMileage: z.string().optional(),
  fuelCapacity: z.string().optional(),
  status: z.enum(["available", "in_use", "maintenance", "out_of_service"]),
  insuranceExpiry: z.string().optional(),
  registrationExpiry: z.string().optional(),
  registrationNumber: z.string().optional(),
  plateType: z.string().optional(),
  sequenceNumber: z.string().optional(),
  inspectionDate: z.string().optional(),
  nextInspectionDate: z.string().optional(),
  purchasePrice: z.string().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
});

const FUEL_OPTIONS = [
  { value: "gasoline", label: "بنزين" },
  { value: "diesel", label: "ديزل" },
  { value: "hybrid", label: "هجين" },
  { value: "electric", label: "كهربائي" },
];

const STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "in_use", label: "قيد الاستخدام" },
  { value: "maintenance", label: "في الصيانة" },
  { value: "out_of_service", label: "خارج الخدمة" },
];

const PLATE_TYPE_OPTIONS = [
  { value: "private", label: "خاصة" },
  { value: "commercial", label: "تجارية" },
  { value: "government", label: "حكومية" },
  { value: "diplomatic", label: "دبلوماسية" },
  { value: "motorcycle", label: "دراجة نارية" },
];

export default function VehiclesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addVehicle = useApiMutation("/fleet/vehicles", "POST", [
    ["fleet-vehicles"],
    ["fleet-stats"],
  ]);

  return (
    <CreatePageLayout title="إضافة مركبة جديدة" backPath="/fleet">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          plateNumber: "",
          make: "",
          model: "",
          year: "",
          color: "",
          vinNumber: "",
          fuelType: "gasoline",
          currentMileage: "",
          fuelCapacity: "",
          status: "available",
          insuranceExpiry: "",
          registrationExpiry: "",
          notes: "",
          registrationNumber: "",
          plateType: "",
          sequenceNumber: "",
          inspectionDate: "",
          nextInspectionDate: "",
          purchasePrice: "",
          purchaseDate: "",
        }}
        submitLabel={addVehicle.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/fleet")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addVehicle.mutateAsync({
            plateNumber: values.plateNumber,
            make: values.make,
            model: values.model,
            year: values.year ? Number(values.year) : undefined,
            color: values.color || undefined,
            vinNumber: values.vinNumber || undefined,
            fuelType: values.fuelType,
            currentMileage: Number(values.currentMileage) || 0,
            fuelCapacity: values.fuelCapacity ? Number(values.fuelCapacity) : undefined,
            status: values.status,
            insuranceExpiry: values.insuranceExpiry || undefined,
            registrationExpiry: values.registrationExpiry || undefined,
            registrationNumber: values.registrationNumber || undefined,
            plateType: values.plateType || undefined,
            sequenceNumber: values.sequenceNumber || undefined,
            inspectionDate: values.inspectionDate || undefined,
            nextInspectionDate: values.nextInspectionDate || undefined,
            purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : undefined,
            purchaseDate: values.purchaseDate || undefined,
            notes: values.notes || undefined,
          });
          toast({ title: "تمت إضافة المركبة بنجاح" });
          setLocation("/fleet");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="plateNumber" label="رقم اللوحة" required placeholder="ABC 1234" />
          <FormTextField name="make" label="الشركة المصنعة" required placeholder="تويوتا، هيونداي..." />
          <FormTextField name="model" label="الموديل" required placeholder="كامري، النترا..." />
          <FormNumberField name="year" label="سنة الصنع" placeholder="2024" />
          <FormTextField name="color" label="اللون" placeholder="أبيض، أسود..." />
          <FormTextField name="vinNumber" label="رقم الهيكل" placeholder="رقم الهيكل" />
          <FormSelectField name="fuelType" label="نوع الوقود" options={FUEL_OPTIONS} />
          <FormNumberField name="currentMileage" label="عداد الكيلومترات الحالي" placeholder="٠" />
          <FormNumberField name="fuelCapacity" label="سعة خزان الوقود (لتر)" placeholder="٠" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormDateField name="insuranceExpiry" label="تاريخ انتهاء التأمين" />
          <FormDateField name="registrationExpiry" label="تاريخ انتهاء الاستمارة" />
        </FormGrid>

        <div className="border-t pt-4 mt-4">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface inline-block" />
            بيانات التسجيل والفحص — الربط الحكومي (تم)
          </h3>
          <FormGrid cols={2}>
            <FormTextField name="registrationNumber" label="رقم الاستمارة" placeholder="رقم الاستمارة" />
            <FormSelectField name="plateType" label="نوع اللوحة" placeholder="— اختياري —" options={PLATE_TYPE_OPTIONS} />
            <FormTextField name="sequenceNumber" label="رقم التسلسل" placeholder="الرقم التسلسلي" />
            <FormDateField name="inspectionDate" label="تاريخ آخر فحص دوري" />
            <FormDateField name="nextInspectionDate" label="تاريخ الفحص الدوري القادم" />
          </FormGrid>
        </div>

        <div className="border-t pt-4 mt-4">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface inline-block" />
            بيانات الشراء — تُستخدم في تقرير التكلفة الإجمالية وقيد رسملة الأصل
          </h3>
          <FormGrid cols={2}>
            <FormNumberField name="purchasePrice" label="سعر الشراء" placeholder="٠٫٠٠" />
            <FormDateField name="purchaseDate" label="تاريخ الشراء" />
          </FormGrid>
        </div>

        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
