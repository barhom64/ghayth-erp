import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormCheckboxField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const AMENITIES_LIST = [
  "مصعد", "موقف سيارة", "حراسة أمنية", "مسبح", "صالة رياضية",
  "تكييف مركزي", "نظام إطفاء", "خزان مياه", "مولد كهربائي", "شبكة إنترنت",
];

const schema = z.object({
  unitNumber: z.string().min(1, "يرجى إدخال رقم الوحدة"),
  buildingId: z.string().optional(),
  buildingName: z.string().optional(),
  type: z.enum(["apartment", "villa", "office", "shop", "warehouse", "land"]),
  status: z.enum(["available", "rented", "under_maintenance"]),
  area: z
    .string()
    .optional()
    .refine((v) => !v || Number(v) > 0, "المساحة يجب أن تكون أكبر من صفر"),
  floor: z
    .string()
    .optional()
    .refine((v) => !v || Number(v) >= 0, "الطابق يجب أن يكون صفر أو أكثر"),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  monthlyRent: z
    .string()
    .optional()
    .refine((v) => !v || Number(v) >= 0, "الإيجار الشهري يجب أن يكون صفر أو أكثر"),
  address: z.string().optional(),
  direction: z.string().optional(),
  finishing: z.string().optional(),
  notes: z.string().optional(),
  electricityMeter: z.string().optional(),
  waterMeter: z.string().optional(),
  usageType: z.enum(["residential", "commercial", "industrial"]),
  parkingSpaces: z.string().optional(),
  acType: z.string().optional(),
  hasKitchen: z.boolean(),
  ownerId: z.string().optional(),
});

const TYPE_OPTIONS = [
  { value: "apartment", label: "شقة" },
  { value: "villa", label: "فيلا" },
  { value: "office", label: "مكتب" },
  { value: "shop", label: "محل تجاري" },
  { value: "warehouse", label: "مستودع" },
  { value: "land", label: "أرض" },
];
const STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "rented", label: "مؤجرة" },
  { value: "under_maintenance", label: "تحت الصيانة" },
];
const DIRECTION_OPTIONS = [
  { value: "north", label: "شمالي" },
  { value: "south", label: "جنوبي" },
  { value: "east", label: "شرقي" },
  { value: "west", label: "غربي" },
  { value: "north_east", label: "شمالي شرقي" },
  { value: "north_west", label: "شمالي غربي" },
  { value: "south_east", label: "جنوبي شرقي" },
  { value: "south_west", label: "جنوبي غربي" },
];
const FINISHING_OPTIONS = [
  { value: "shell", label: "هيكل" },
  { value: "semi_finished", label: "نصف تشطيب" },
  { value: "finished", label: "تشطيب كامل" },
  { value: "luxury", label: "تشطيب فاخر" },
  { value: "furnished", label: "مفروشة" },
];
const USAGE_OPTIONS = [
  { value: "residential", label: "سكني" },
  { value: "commercial", label: "تجاري" },
  { value: "industrial", label: "صناعي" },
];
const AC_TYPE_OPTIONS = [
  { value: "central", label: "مركزي" },
  { value: "split", label: "سبليت" },
  { value: "window", label: "شباك" },
];

function BuildingPicker({ buildings }: { buildings: any[] }) {
  const { watch, setValue } = useFormContext();
  const buildingName = watch("buildingName") as string;
  if (buildings.length === 0) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">المبنى / المجمع</label>
        <Input
          value={buildingName}
          onChange={(e) => setValue("buildingName", e.target.value)}
          placeholder="اسم المبنى"
        />
      </div>
    );
  }
  return (
    <FormSelectField
      name="buildingId"
      label="المبنى / المجمع"
      placeholder="— بدون مبنى —"
      options={buildings.map((b: any) => ({ value: String(b.id), label: b.name }))}
    />
  );
}

function SyncBuildingName({ buildings }: { buildings: any[] }) {
  const { watch, setValue } = useFormContext();
  const buildingId = watch("buildingId") as string;
  if (buildingId) {
    const bld = buildings.find((b: any) => String(b.id) === buildingId);
    if (bld) setValue("buildingName", bld.name);
  }
  return null;
}

function AmenitiesPicker({
  amenities, toggleAmenity,
}: { amenities: string[]; toggleAmenity: (a: string) => void }) {
  return (
    <div>
      <Label className="block mb-2">المرافق والمميزات</Label>
      <div className="flex flex-wrap gap-2">
        {AMENITIES_LIST.map(amenity => (
          <button
            key={amenity}
            type="button"
            onClick={() => toggleAmenity(amenity)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              amenities.includes(amenity)
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-muted-foreground border-border hover:border-status-info-surface"
            }`}
          >
            {amenity}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PropertiesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const addUnit = useApiMutation("/properties/units", "POST", [["property-units"], ["properties-stats"]]);
  const { data: buildingsResp, isLoading: loadingB, isError: errorB } = useApiQuery<any>(["property-buildings"], "/properties/buildings");
  const { data: ownersResp, isLoading: loadingO, isError: errorO } = useApiQuery<any>(["property-owners"], "/properties/owners");

  if (loadingB || loadingO) return <LoadingSpinner />;
  if (errorB || errorO) return <ErrorState />;

  const buildings = asList(buildingsResp);
  const owners = asList(ownersResp);
  const ownerOptions = owners.map((o: any) => ({ value: String(o.id), label: o.name }));

  const toggleAmenity = (amenity: string) => {
    setAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity],
    );
  };

  return (
    <CreatePageLayout title="إضافة وحدة عقارية" backPath="/properties">
      <FormShell
        schema={schema}
        defaultValues={{
          unitNumber: "",
          buildingId: "",
          buildingName: "",
          type: "apartment",
          status: "available",
          area: "",
          floor: "",
          bedrooms: "",
          bathrooms: "",
          monthlyRent: "",
          address: "",
          direction: "",
          finishing: "",
          notes: "",
          electricityMeter: "",
          waterMeter: "",
          usageType: "residential",
          parkingSpaces: "",
          acType: "",
          hasKitchen: false,
          ownerId: "",
        }}
        submitLabel={addUnit.isPending ? "جاري الإضافة..." : "إضافة الوحدة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            addUnit.mutate(
              {
                unitNumber: values.unitNumber,
                buildingId: values.buildingId ? Number(values.buildingId) : undefined,
                buildingName: values.buildingName || undefined,
                type: values.type,
                status: values.status,
                area: Number(values.area) || undefined,
                floor: Number(values.floor) || undefined,
                bedrooms: Number(values.bedrooms) || undefined,
                bathrooms: Number(values.bathrooms) || undefined,
                monthlyRent: Number(values.monthlyRent) || undefined,
                address: values.address || undefined,
                direction: values.direction || undefined,
                finishing: values.finishing || undefined,
                amenities: amenities.length > 0 ? amenities : undefined,
                notes: values.notes || undefined,
                electricityMeter: values.electricityMeter || undefined,
                waterMeter: values.waterMeter || undefined,
                usageType: values.usageType,
                parkingSpaces: Number(values.parkingSpaces) || 0,
                acType: values.acType || undefined,
                hasKitchen: values.hasKitchen,
                ownerId: values.ownerId ? Number(values.ownerId) : undefined,
                ...(attachments.length > 0 ? { attachments } : {}),
              },
              {
                onSuccess: () => {
                  toast({ title: "تمت إضافة الوحدة بنجاح" });
                  setLocation("/properties");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <SyncBuildingName buildings={buildings} />

        <FormGrid cols={2}>
          <FormTextField name="unitNumber" label="رقم الوحدة" required placeholder="مثل: A-101" />
          <BuildingPicker buildings={buildings} />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
        </FormGrid>

        <FormGrid cols={4}>
          <FormNumberField name="area" label="المساحة (م²)" placeholder="٠" min="0" />
          <FormNumberField name="floor" label="الطابق" placeholder="٠" min="0" />
          <FormNumberField name="bedrooms" label="غرف نوم" placeholder="٠" min="0" />
          <FormNumberField name="bathrooms" label="حمامات" placeholder="٠" min="0" />
        </FormGrid>

        <FormGrid cols={3}>
          <FormNumberField name="monthlyRent" label={`الإيجار الشهري (${getCurrencySymbol()})`} placeholder="٠" step="0.01" min="0" />
          <FormSelectField name="direction" label="الاتجاه" options={DIRECTION_OPTIONS} placeholder="— غير محدد —" />
          <FormSelectField name="finishing" label="مستوى التشطيب" options={FINISHING_OPTIONS} placeholder="— غير محدد —" />
        </FormGrid>

        <FormGrid cols={3}>
          <FormSelectField name="usageType" label="نوع الاستخدام" options={USAGE_OPTIONS} />
          <FormTextField name="electricityMeter" label="رقم عداد الكهرباء" placeholder="رقم العداد" />
          <FormTextField name="waterMeter" label="رقم عداد المياه" placeholder="رقم العداد" />
        </FormGrid>

        <FormGrid cols={4}>
          <FormNumberField name="parkingSpaces" label="مواقف سيارات" placeholder="0" min="0" />
          <FormSelectField name="acType" label="نوع التكييف" options={AC_TYPE_OPTIONS} placeholder="— غير محدد —" />
          <FormCheckboxField name="hasKitchen" label="مطبخ مجهز" className="pt-6" />
          <FormSelectField name="ownerId" label="المالك" options={ownerOptions} placeholder="— بدون مالك —" />
        </FormGrid>

        <FormTextField name="address" label="العنوان" placeholder="المدينة، الحي، الشارع" />

        <AmenitiesPicker amenities={amenities} toggleAmenity={toggleAmenity} />

        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية عن الوحدة..." />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="صور ومرفقات الوحدة" />
      </FormShell>
    </CreatePageLayout>
  );
}
