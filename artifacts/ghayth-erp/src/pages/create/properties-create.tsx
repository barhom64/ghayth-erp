import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

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

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

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
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.unitNumber) localErrors.unitNumber = "يرجى إدخال رقم الوحدة";
    if (form.area && Number(form.area) <= 0) localErrors.area = "المساحة يجب أن تكون أكبر من صفر";
    if (form.monthlyRent && Number(form.monthlyRent) < 0) localErrors.monthlyRent = "الإيجار الشهري يجب أن يكون صفر أو أكثر";
    if (form.floor && Number(form.floor) < 0) localErrors.floor = "الطابق يجب أن يكون صفر أو أكثر";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
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
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الوحدة", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="إضافة وحدة عقارية" backPath="/properties">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>رقم الوحدة <span className="text-red-500">*</span></Label>
            <Input
              className={errCls("unitNumber")}
              value={form.unitNumber}
              onChange={e => set("unitNumber", e.target.value)}
              placeholder="مثل: A-101"
              required
            />
            <FieldHint field="unitNumber" />
          </div>
          <div>
            <Label>المبنى / المجمع</Label>
            {buildings.length > 0 ? (
              <Select value={form.buildingId} onValueChange={v => set("buildingId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مبنى (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون مبنى —</SelectItem>
                  {buildings.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={form.buildingName}
                onChange={e => set("buildingName", e.target.value)}
                placeholder="اسم المبنى"
              />
            )}
          </div>
          <div>
            <Label>النوع</Label>
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
          </div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">متاحة</SelectItem>
                <SelectItem value="rented">مؤجرة</SelectItem>
                <SelectItem value="under_maintenance">تحت الصيانة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>المساحة (م²)</Label><Input className={errCls("area")} type="number" value={form.area} onChange={e => set("area", e.target.value)} placeholder="٠" /><FieldHint field="area" /></div>
          <div><Label>الطابق</Label><Input className={errCls("floor")} type="number" value={form.floor} onChange={e => set("floor", e.target.value)} placeholder="٠" /><FieldHint field="floor" /></div>
          <div><Label>غرف نوم</Label><Input type="number" value={form.bedrooms} onChange={e => set("bedrooms", e.target.value)} placeholder="٠" /></div>
          <div><Label>حمامات</Label><Input type="number" value={form.bathrooms} onChange={e => set("bathrooms", e.target.value)} placeholder="٠" /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{`الإيجار الشهري (${getCurrencySymbol()})`}</Label>
            <Input className={errCls("monthlyRent")} type="number" step="0.01" value={form.monthlyRent} onChange={e => set("monthlyRent", e.target.value)} placeholder="٠" />
            <FieldHint field="monthlyRent" />
          </div>
          <div>
            <Label>الاتجاه</Label>
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
          </div>
          <div>
            <Label>مستوى التشطيب</Label>
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>نوع الاستخدام</Label>
            <Select value={form.usageType} onValueChange={v => set("usageType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="residential">سكني</SelectItem>
                <SelectItem value="commercial">تجاري</SelectItem>
                <SelectItem value="industrial">صناعي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>رقم عداد الكهرباء</Label>
            <Input value={form.electricityMeter} onChange={e => set("electricityMeter", e.target.value)} placeholder="رقم العداد" dir="ltr" />
          </div>
          <div>
            <Label>رقم عداد المياه</Label>
            <Input value={form.waterMeter} onChange={e => set("waterMeter", e.target.value)} placeholder="رقم العداد" dir="ltr" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>مواقف سيارات</Label>
            <Input type="number" value={form.parkingSpaces} onChange={e => set("parkingSpaces", e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>نوع التكييف</Label>
            <Select value={form.acType || "none"} onValueChange={v => set("acType", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محدد —</SelectItem>
                <SelectItem value="central">مركزي</SelectItem>
                <SelectItem value="split">سبليت</SelectItem>
                <SelectItem value="window">شباك</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <input type="checkbox" id="hasKitchen" checked={form.hasKitchen} onChange={e => { setIsDirty(true); setForm(prev => ({ ...prev, hasKitchen: e.target.checked })); }} className="h-4 w-4" />
            <Label htmlFor="hasKitchen">مطبخ مجهز</Label>
          </div>
          <div>
            <Label>المالك</Label>
            <Select value={form.ownerId || "none"} onValueChange={v => set("ownerId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="— بدون —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون مالك —</SelectItem>
                {owners.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>العنوان</Label>
          <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="المدينة، الحي، الشارع" />
        </div>

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

        <div>
          <Label>ملاحظات</Label>
          <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="ملاحظات إضافية عن الوحدة..." />
        </div>

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="صور ومرفقات الوحدة" />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => setLocation("/properties")}>إلغاء</Button>
          <Button type="submit" disabled={addUnit.isPending}>{addUnit.isPending ? "جاري الإضافة..." : "إضافة الوحدة"}</Button>
        </div>
      </form>
    </CreatePageLayout>
  );
}
