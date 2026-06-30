import { useState } from "react";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildingSelect, PropertyOwnerSelect } from "@/components/shared/entity-selects";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export interface UnitFormProps {
  /** Called with the freshly-created unit row after a successful save. */
  onCreated: (unit: any) => void;
  /** Called when the operator cancels (back / إلغاء). */
  onCancel: () => void;
  /** Draft-recovery key — distinct per host so the page and an inline drawer
   *  don't clobber each other's draft. */
  draftKey?: string;
  /** Hide the attachments dropzone (e.g. the inline drawer keeps it lean). */
  showAttachments?: boolean;
}

/**
 * النموذج الكامل الموحّد لإنشاء وحدة عقارية — يُشارَك بين الصفحة الكاملة
 * (`properties-create.tsx`) والإضافة السريعة من `UnitSelect` عبر الدرج الموحّد
 * (`AllowCreateDrawer`، نوع "unit"). يملك حالته/تحقّقه/إرساله، فالإنشاء الداخلي
 * مطابق لإنشاء الصفحة — لا إضافة مبتورة [رقم الوحدة] فقط (توجيه إبراهيم «أ»).
 */
export function UnitForm({ onCreated, onCancel, draftKey = "properties_create", showAttachments = true }: UnitFormProps) {
  const { toast } = useToast();
  const addUnit = useApiMutation("/properties/units", "POST", [["property-units"], ["properties-stats"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Share BuildingSelect's exact query key so that creating a building inline
  // (which invalidates "property-buildings-list") also refetches this list —
  // otherwise buildingName below stays blank for inline-created buildings.
  const { data: buildingsResp, isLoading: loadingB, isError: errorB } = useApiQuery<any>(["property-buildings-list"], "/properties/buildings");
  const buildings = asList(buildingsResp);

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(draftKey, {
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

  if (loadingB) return <LoadingSpinner />;
  if (errorB) return <ErrorState />;

  const AMENITIES_LIST = [
    "مصعد", "موقف سيارة", "حراسة أمنية", "مسبح", "صالة رياضية",
    "تكييف مركزي", "نظام إطفاء", "خزان مياه", "مولد كهربائي", "شبكة إنترنت",
  ];

  const toggleAmenity = (amenity: string) => {
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const set = (field: string, value: string) => {
    setForm(prev => {
      const normalizedValue = (field === "buildingId" || field === "direction" || field === "finishing") && value === "none" ? "" : value;
      const update: any = { [field]: normalizedValue };
      if (field === "buildingId") {
        // اشتق اسم المبنى عند الاختيار، وفرّغه عند إلغاء الاختيار حتى لا تُحفظ
        // الوحدة باسم مبنى قديم بلا buildingId.
        const bld = normalizedValue ? buildings.find((b: any) => String(b.id) === normalizedValue) : null;
        update.buildingName = bld ? bld.name : "";
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
    // Resolve buildingName from the (post-create-refetched) list as a backstop
    // for buildings created inline via BuildingSelect, where the select-time
    // derivation in set() ran before the new building landed in the list.
    const selectedBuilding = form.buildingId
      ? buildings.find((b: any) => String(b.id) === String(form.buildingId))
      : null;
    const resolvedBuildingName = selectedBuilding?.name || form.buildingName || undefined;
    addUnit.mutate({
      unitNumber: form.unitNumber,
      buildingId: form.buildingId ? Number(form.buildingId) : undefined,
      buildingName: resolvedBuildingName,
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
      onSuccess: (created: any) => { toast({ title: "تمت إضافة الوحدة بنجاح" }); clearDraft(); onCreated(created); },
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الوحدة", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button type="button" variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="رقم الوحدة" required value={form.unitNumber} onChange={(v) => set("unitNumber", v)} placeholder="مثل: A-101" error={fieldErrors.unitNumber} />
          <BuildingSelect
            label="المبنى / المجمع"
            placeholder="اختر مبنى (اختياري)"
            value={form.buildingId}
            onChange={(v) => set("buildingId", v)}
          />
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
            <Checkbox id="hasKitchen" checked={form.hasKitchen} onCheckedChange={(v) => { setForm(prev => ({ ...prev, hasKitchen: v === true })); }} />
            <Label htmlFor="hasKitchen">مطبخ مجهز</Label>
          </div>
          <PropertyOwnerSelect
            label="المالك"
            placeholder="— بدون مالك —"
            value={form.ownerId}
            onChange={(v) => set("ownerId", v)}
          />
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
                    : "bg-white text-muted-foreground border-border hover:border-status-info-surface"
                }`}
              >
                {amenity}
              </button>
            ))}
          </div>
        </div>

        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => set("notes", v)} placeholder="ملاحظات إضافية عن الوحدة..." />

        {showAttachments && <FileDropZone files={attachments} onFilesChange={setAttachments} label="صور ومرفقات الوحدة" />}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button type="submit" disabled={addUnit.isPending} rateLimitAware>{addUnit.isPending ? "جاري الإضافة..." : "إضافة الوحدة"}</Button>
        </div>
      </form>
    </>
  );
}
