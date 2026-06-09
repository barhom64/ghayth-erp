import { useState } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@workspace/ui-core";
import { ArrowLeft, Repeat, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { DateField } from "@/components/shared/form-field-wrapper";

// #1812 Comment 4663005810 — cargo recurring route pattern create form.
//
// daysOfWeekMask is a 7-bit field where bit 0 = Sunday, bit 6 = Saturday.
// The UI exposes 7 checkboxes that the operator toggles; on submit we
// build the mask from the checked entries.

const DAYS = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الإثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
  { value: 6, label: "السبت" },
] as const;

export default function TransportRoutePatternsCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [patternCode, setPatternCode] = useState("");
  const [name, setName] = useState("");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [departureTime, setDepartureTime] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeUntil, setActiveUntil] = useState("");
  const [fromLocationText, setFromLocationText] = useState("");
  const [toLocationText, setToLocationText] = useState("");
  const [defaultVehicleClass, setDefaultVehicleClass] = useState("");
  const [defaultLicenseClass, setDefaultLicenseClass] = useState("");
  const [defaultCargoWeight, setDefaultCargoWeight] = useState("");
  const [defaultCargoUnit, setDefaultCargoUnit] = useState("kg");
  const [notes, setNotes] = useState("");

  const toggleDay = (day: number) => {
    setSelectedDays((s) => {
      const next = new Set(s);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const buildMask = (): number => {
    let mask = 0;
    for (const d of selectedDays) mask |= (1 << d);
    return mask;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patternCode.trim()) {
      toast({ variant: "destructive", title: "رمز القالب مطلوب" });
      return;
    }
    if (!name.trim()) {
      toast({ variant: "destructive", title: "اسم القالب مطلوب" });
      return;
    }
    if (selectedDays.size === 0) {
      toast({ variant: "destructive", title: "اختر يوماً واحداً على الأقل" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        patternCode: patternCode.trim(),
        name: name.trim(),
        daysOfWeekMask: buildMask(),
        departureTime: departureTime || undefined,
        activeFrom: activeFrom || undefined,
        activeUntil: activeUntil || undefined,
        fromLocationText: fromLocationText.trim() || undefined,
        toLocationText: toLocationText.trim() || undefined,
        defaultVehicleClass: defaultVehicleClass.trim() || undefined,
        defaultLicenseClass: defaultLicenseClass.trim() || undefined,
        defaultCargoWeight: defaultCargoWeight ? Number(defaultCargoWeight) : undefined,
        defaultCargoUnit: defaultCargoUnit.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const res = await apiFetch<{ data: { id: number } }>(
        "/transport/route-patterns",
        { method: "POST", body: JSON.stringify(body) },
      );
      toast({ title: "تم إنشاء القالب" });
      if (res?.data?.id) navigate(`/fleet/transport/route-patterns/${res.data.id}`);
      else navigate("/fleet/transport/route-patterns");
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإنشاء", description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="قالب رحلة متكرّرة جديد"
      subtitle="قالب لرحلة حمولة تتكرّر أسبوعياً (cargo_load فقط)"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/route-patterns", label: "جداول متكرّرة" },
        { label: "إنشاء" },
      ]}
      actions={
        <Link href="/fleet/transport/route-patterns">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 ml-1" />
            عودة للقائمة
          </Button>
        </Link>
      }
    >
      <FleetTabsNav />
      <form onSubmit={submit} className="space-y-4 max-w-4xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              التعريف الأساسي
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="patternCode">الرمز<span className="text-rose-600">*</span></Label>
              <Input
                id="patternCode" value={patternCode}
                onChange={(e) => setPatternCode(e.target.value)}
                placeholder="مثال: RYD-JED-MWF"
                className="font-mono"
                maxLength={32}
              />
              <p className="text-xs text-muted-foreground mt-1">
                رمز قصير مميّز يستخدم لتوليد أرقام الحجوزات تلقائياً
              </p>
            </div>
            <div>
              <Label htmlFor="name">الاسم<span className="text-rose-600">*</span></Label>
              <Input
                id="name" value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: نقل أسبوعي الرياض → جدة"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">جدول التشغيل</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              اختر أيام الأسبوع التي يجب أن يُحوَّل فيها القالب إلى حجز تلقائياً
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((d) => {
                const selected = selectedDays.has(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`p-2 border rounded text-sm text-center transition-colors ${
                      selected
                        ? "border-status-info-foreground bg-status-info-surface font-medium"
                        : "border-border bg-white hover:bg-surface-subtle"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="departureTime">وقت الانطلاق</Label>
                <Input
                  id="departureTime" type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                />
              </div>
              <DateField
                label="ساري من" mode="date"
                value={activeFrom}
                onChange={setActiveFrom}
              />
              <DateField
                label="ساري إلى" mode="date"
                value={activeUntil}
                onChange={setActiveUntil}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المسار</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from">من</Label>
              <Input
                id="from" value={fromLocationText}
                onChange={(e) => setFromLocationText(e.target.value)}
                placeholder="مثال: مستودع الرياض الرئيسي"
              />
            </div>
            <div>
              <Label htmlFor="to">إلى</Label>
              <Input
                id="to" value={toLocationText}
                onChange={(e) => setToLocationText(e.target.value)}
                placeholder="مثال: ميناء جدة الإسلامي"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">القيم الافتراضية للحجز</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              تُنسخ هذه القيم إلى كل حجز يُولَّد من القالب — يمكن تعديلها لكل حجز على حدة
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vehicleClass">فئة المركبة الافتراضية</Label>
              <Input
                id="vehicleClass" value={defaultVehicleClass}
                onChange={(e) => setDefaultVehicleClass(e.target.value)}
                placeholder="مثال: 15-ton-truck"
              />
            </div>
            <div>
              <Label htmlFor="licenseClass">فئة الرخصة المطلوبة</Label>
              <Input
                id="licenseClass" value={defaultLicenseClass}
                onChange={(e) => setDefaultLicenseClass(e.target.value)}
                placeholder="heavy / medium / public_trans"
              />
            </div>
            <div>
              <Label htmlFor="cargoWeight">الوزن الافتراضي</Label>
              <Input
                id="cargoWeight" type="number" min="0" step="0.01"
                value={defaultCargoWeight}
                onChange={(e) => setDefaultCargoWeight(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cargoUnit">وحدة القياس</Label>
              <Input
                id="cargoUnit" value={defaultCargoUnit}
                onChange={(e) => setDefaultCargoUnit(e.target.value)}
                placeholder="kg / ton / pallet"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ملاحظات</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={3} placeholder="أي تعليمات تشغيلية إضافية..."
            />
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-status-info-surface/30 p-3 rounded border border-status-info-foreground/30">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-status-info-foreground" />
          <div>
            بعد الحفظ، يُفعَّل القالب فوراً ضمن جدول الـ cron اليومي.
            ستظهر الحجوزات المُولَّدة في <span className="font-mono">/fleet/transport/bookings</span>
            مع <span className="font-mono">bookingSource = recurring_schedule</span> ورابط
            عودة للقالب الأصلي.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/fleet/transport/route-patterns">
            <Button type="button" variant="outline">إلغاء</Button>
          </Link>
          <Button type="submit" disabled={submitting} rateLimitAware>
            {submitting ? "جارٍ الحفظ..." : "حفظ القالب"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
