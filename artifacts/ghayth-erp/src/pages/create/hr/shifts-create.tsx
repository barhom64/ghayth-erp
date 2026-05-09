import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Sun, Moon, Coffee, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

// Keys are the numeric Day.getDay() values (0=Sun .. 6=Sat) because
// the backend parses shift.days with `split(",").map(Number)` at
// check-in time — string keys like "sun" become NaN and every day
// is then considered a non-working day.
const daysOfWeek = [
  { key: "0", label: "الأحد" },
  { key: "1", label: "الإثنين" },
  { key: "2", label: "الثلاثاء" },
  { key: "3", label: "الأربعاء" },
  { key: "4", label: "الخميس" },
  { key: "5", label: "الجمعة" },
  { key: "6", label: "السبت" },
];

const DRAFT_KEY = "hr_shifts_create";

export default function ShiftsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/hr/shifts", "POST", [["shifts"]], {
    successMessage: "تم إضافة الوردية بنجاح",
  });
  const { data: branchData, isLoading, isError } = useApiQuery<any>(["branches"], "/settings/branches");
  const branches = branchData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    name: "",
    startTime: "08:00",
    endTime: "16:00",
    breakMinutes: 60,
    gracePeriod: 15,
    isDefault: false,
    branchId: "",
  });
  const [selectedDays, setSelectedDays] = useState<string[]>(["0", "1", "2", "3", "4"]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const isNightShift = form.startTime && parseInt(form.startTime.split(":")[0]) >= 18;

  const workingHours = (() => {
    if (!form.startTime || !form.endTime) return 0;
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    let totalMin = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMin < 0) totalMin += 24 * 60;
    totalMin -= form.breakMinutes || 0;
    return Math.max(0, totalMin / 60);
  })();

  const handleSubmit = () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "اسم الوردية مطلوب" });
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast({ variant: "destructive", title: "وقت البدء والانتهاء مطلوبان" });
      return;
    }
    createMut.mutate(
      {
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: form.breakMinutes,
        gracePeriod: form.gracePeriod,
        days: selectedDays.join(","),
        isDefault: form.isDefault,
        branchId: form.branchId ? Number(form.branchId) : undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/shifts");
        },
      },
    );
  };

  return (
    <CreatePageLayout title="إضافة وردية جديدة" backPath="/hr/shifts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            {isNightShift ? <Moon className="w-4 h-4 text-indigo-500" /> : <Sun className="w-4 h-4 text-yellow-500" />}
            معلومات الوردية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField label="اسم الوردية" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="وردية صباحية" />
            <FormFieldWrapper label="وقت البدء" required>
              <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            </FormFieldWrapper>
            <FormFieldWrapper label="وقت الانتهاء" required>
              <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </FormFieldWrapper>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberField label="مدة الاستراحة (دقيقة)" value={form.breakMinutes} onChange={(v) => setForm((f) => ({ ...f, breakMinutes: Number(v) || 0 }))} min={0} max={120} />
          <NumberField label="فترة السماح (دقيقة)" value={form.gracePeriod} onChange={(v) => setForm((f) => ({ ...f, gracePeriod: Number(v) || 0 }))} min={0} max={60} hint="الوقت المسموح به للتأخر قبل احتساب مخالفة" />
          {branches.length > 0 && (
            <FormFieldWrapper label="الفرع">
              <Select value={form.branchId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="جميع الفروع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">جميع الفروع</SelectItem>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          )}
        </div>

        <div>
          <Label className="mb-2 block">أيام العمل</Label>
          <div className="flex flex-wrap gap-2">
            {daysOfWeek.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => toggleDay(day.key)}
                className={cn(
                  "px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all",
                  selectedDays.includes(day.key)
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">ساعات العمل:</span>
                  <span className="font-bold ms-1">{workingHours.toFixed(1)} ساعة</span>
                </div>
                <div>
                  <span className="text-muted-foreground">أيام العمل:</span>
                  <span className="font-bold ms-1">{selectedDays.length} أيام</span>
                </div>
                <div>
                  <span className="text-muted-foreground">النوع:</span>
                  <span className={cn("font-bold ms-1", isNightShift ? "text-indigo-600" : "text-yellow-600")}>
                    {isNightShift ? "ليلية" : "نهارية"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isDefault" checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v === true }))} />
                <Label htmlFor="isDefault" className="text-sm cursor-pointer">وردية افتراضية</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/shifts")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending} size="lg" rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الوردية"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
