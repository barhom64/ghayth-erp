import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function PropertiesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges(isDirty);
  const addUnit = useApiMutation("/properties/units", "POST", [["property-units"], ["properties-stats"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { data: buildingsResp, isLoading: loadingB, isError: errorB } = useApiQuery<any>(["property-buildings"], "/properties/buildings");
  const buildings = asList(buildingsResp);

  const { data: ownersResp, isLoading: loadingO, isError: errorO } = useApiQuery<any>(["property-owners"], "/properties/owners");
  const owners = asList(ownersResp);

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const [form, setForm] = useState({
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
    amenities: [] as string[],
    notes: "",
    electricityMeter: "",
    waterMeter: "",
    usageType: "residential",
    parkingSpaces: "",
    acType: "",
    hasKitchen: false,
    ownerId: "",
  });

  if (loadingB || loadingO) return <LoadingSpinner />;
  if (errorB || errorO) return <ErrorState onRetry={() => window.location.reload()} />;

  const AMENITIES_LIST = [
    "مصعد", "موقف سيارة", "حراسة أمنية", "مسبح", "صالة رياضية",
    "تكييف مركزي", "نظام إطفاء", "خزان مياه", "مولد كهربائي", "شبكة إنترنت",
  ];

  const toggleAmenity = (amenity: string) => {
    setIsDirty(true);
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const set = (field: string, value: string) => {
    setIsDirty(true);
    setForm(prev => {
      const normalizedValue = (field === "buildingId" || field === "direction" || field === "finishing") && value === "none" ? "" : value;
      const update: any = { [field]: normalizedValue };
      if (field === "buildingId" && normalizedValue) {
        const bld = buildings.find((b: any) => String(b.id) === normalizedValue);
        if (bld) update.buildingName = bld.name;
      }
      return { ...prev, ...update };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const firstError = validate({
      unitNumber: form.unitNumber ? null : "يرجى إدخال رقم الوحدة",
      area: form.area && Number(form.area) <= 0 ? "المساحة يجب أن تكون أكبر من صفر" : null,
      monthlyRent: form.monthlyRent && Number(form.monthlyRent) < 0 ? "الإيجار الشهري يجب أن يكون صفر أو أكثر" : null,
      floor: form.floor && Number(form.floor) < 0 ? "الطابق يجب أن يكون صفر أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    addUnit.mutate({
      unitNumber: form.unitNumber,
      buildingId: form.buildingId ? Number(form.buildingId) : undefined,
      buildingName: form.buildingName || undefined,
      type: form.type,
      status: form.status,
      area: Number(form.area) || undefined,
      floor: Number(form.floor) || undefined,
      bedrooms: Number(form.bedrooms) || undefined,
      bathrooms: Number(form.bathrooms) || undefined,
      monthlyRent: Number(form.monthlyRent) || undefined,
      address: form.address || undefined,
      direction: form.direction || undefined,
      finishing: form.finishing || undefined,
      amenities: form.amenities.length > 0 ? form.amenities : undefined,
      notes: form.notes || undefined,
      electricityMeter: form.electricityMeter || undefined,
      waterMeter: form.waterMeter || undefined,
      usageType: form.usageType,
      parkingSpaces: Number(form.parkingSpaces) || 0,
      acType: form.acType || undefined,
      hasKitchen: form.hasKitchen,
      ownerId: form.ownerId ? Number(form.ownerId) : undefined,
      ...(attachments.length > 0 ? { attachments } : {}),
    }, {
      onSuccess: () => { toast({ title: "تمت إضافة الوحدة بنجاح" }); setIsDirty(false); setLocation("/properties"); },
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الوحدة", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="إضافة وحدة عقارية" backPath="/properties">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="رقم الوحدة" required value={form.unitNumber} onChange={(v) => set("unitNumber", v)} placeholder="مثل: A-101" error={fieldErrors.unitNumber} />
          <FormFieldWrapper label="المبنى / المجمع">
            {buildings.length > 0 ? (
              <Select value={form.buildingId} onValueChange={v => set("buildingId", v)}>
                <SelectTrigger><SelectValue placeholder="اختر مبنى (اختياري)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون مبنى —</SelectItem>
                  {buildings.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.buildingName} onChange={e => set("buildingName", e.target.value)} placeholder="اسم المبنى" />
            )}
          </FormFieldWrapper>
          <FormFieldWrapper label="النوع">
            <Select value={form.type} onValueChange={v => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="apartment">شقة</SelectItem>
                <SelectItem value="villa">فيلا</SelectItem>
                <SelectItem value="office">مكتب</SelectItem>
                <SelectItem value="shop">محل تجاري</SelectItem>
                <SelectItem value="warehouse">مستودع</SelectItem>
                <SelectItem value="land">أرض</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">متاحة</SelectItem>
                <SelectItem value="rented">مؤجرة</SelectItem>
                <SelectItem value="under_maintenance">تحت الصيانة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <NumberField label="المساحة (م²)" value={form.area} onChange={(v) => set("area", v)} placeholder="٠" min={0} error={fieldErrors.area} />
          <NumberField label="الطابق" value={form.floor} onChange={(v) => set("floor", v)} placeholder="٠" min={0} error={fieldErrors.floor} />
          <NumberField label="غرف نوم" value={form.bedrooms} onChange={(v) => set("bedrooms", v)} placeholder="٠" min={0} />
          <NumberField label="حمامات" value={form.bathrooms} onChange={(v) => set("bathrooms", v)} placeholder="٠" min={0} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberField label={`الإيجار الشهري (${getCurrencySymbol()})`} value={form.monthlyRent} onChange={(v) => set("monthlyRent", v)} placeholder="٠" step={0.01} min={0} error={fieldErrors.monthlyRent} />
          <FormFieldWrapper label="الاتجاه">
            <Select value={form.direction || "none"} onValueChange={v => set("direction", v)}>
              <SelectTrigger><SelectValue placeholder="اختر الاتجاه" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محدد —</SelectItem>
                <SelectItem value="north">شمالي</SelectItem>
                <SelectItem value="south">جنوبي</SelectItem>
                <SelectItem value="east">شرقي</SelectItem>
                <SelectItem value="west">غربي</SelectItem>
                <SelectItem value="north_east">شمالي شرقي</SelectItem>
                <SelectItem value="north_west">شمالي غربي</SelectItem>
                <SelectItem value="south_east">جنوبي شرقي</SelectItem>
                <SelectItem value="south_west">جنوبي غربي</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="مستوى التشطيب">
            <Select value={form.finishing || "none"} onValueChange={v => set("finishing", v)}>
              <SelectTrigger><SelectValue placeholder="مستوى التشطيب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محدد —</SelectItem>
                <SelectItem value="shell">هيكل</SelectItem>
                <SelectItem value="semi_finished">نصف تشطيب</SelectItem>
                <SelectItem value="finished">تشطيب كامل</SelectItem>
                <SelectItem value="luxury">تشطيب فاخر</SelectItem>
                <SelectItem value="furnished">مفروشة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormFieldWrapper label="نوع الاستخدام">
            <Select value={form.usageType} onValueChange={v => set("usageType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="residential">سكني</SelectItem>
                <SelectItem value="commercial">تجاري</SelectItem>
                <SelectItem value="industrial">صناعي</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="رقم عداد الكهرباء" dir="ltr" value={form.electricityMeter} onChange={(v) => set("electricityMeter", v)} placeholder="رقم العداد" />
          <TextField label="رقم عداد المياه" dir="ltr" value={form.waterMeter} onChange={(v) => set("waterMeter", v)} placeholder="رقم العداد" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <NumberField label="مواقف سيارات" value={form.parkingSpaces} onChange={(v) => set("parkingSpaces", v)} placeholder="0" min={0} />
          <FormFieldWrapper label="نوع التكييف">
            <Select value={form.acType || "none"} onValueChange={v => set("acType", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محدد —</SelectItem>
                <SelectItem value="central">مركزي</SelectItem>
                <SelectItem value="split">سبليت</SelectItem>
                <SelectItem value="window">شباك</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox id="hasKitchen" checked={form.hasKitchen} onCheckedChange={(v) => { setIsDirty(true); setForm(prev => ({ ...prev, hasKitchen: v === true })); }} />
            <Label htmlFor="hasKitchen">مطبخ مجهز</Label>
          </div>
          <FormFieldWrapper label="المالك">
            <Select value={form.ownerId || "none"} onValueChange={v => set("ownerId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— بدون —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون مالك —</SelectItem>
                {owners.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>

        <TextField label="العنوان" value={form.address} onChange={(v) => set("address", v)} placeholder="المدينة، الحي، الشارع" />

        <div>
          <Label className="block mb-2">المرافق والمميزات</Label>
          <div className="flex flex-wrap gap-2">
            {AMENITIES_LIST.map(amenity => (
              <button
                key={amenity}
                type="button"
                onClick={() => toggleAmenity(amenity)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  form.amenities.includes(amenity)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {amenity}
              </button>
            ))}
          </div>
        </div>

        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => set("notes", v)} placeholder="ملاحظات إضافية عن الوحدة..." />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="صور ومرفقات الوحدة" />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => setLocation("/properties")}>إلغاء</Button>
          <Button type="submit" disabled={addUnit.isPending} rateLimitAware>{addUnit.isPending ? "جاري الإضافة..." : "إضافة الوحدة"}</Button>
        </div>
      </form>
    </CreatePageLayout>
  );
}
