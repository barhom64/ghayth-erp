import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormCheckboxField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const daysOfWeek = [
  { key: "0", label: "الأحد" },
  { key: "1", label: "الإثنين" },
  { key: "2", label: "الثلاثاء" },
  { key: "3", label: "الأربعاء" },
  { key: "4", label: "الخميس" },
  { key: "5", label: "الجمعة" },
  { key: "6", label: "السبت" },
];

const schema = z.object({
  name: z.string().min(1, "اسم الوردية مطلوب"),
  startTime: z.string().min(1, "وقت البدء مطلوب"),
  endTime: z.string().min(1, "وقت الانتهاء مطلوب"),
  breakMinutes: z.string().optional(),
  gracePeriod: z.string().optional(),
  isDefault: z.boolean(),
  branchId: z.string().optional(),
});

function ShiftSummary() {
  const { watch } = useFormContext();
  const startTime = watch("startTime") as string;
  const endTime = watch("endTime") as string;
  const breakMinutes = Number(watch("breakMinutes") || 0);
  const isNightShift = startTime && parseInt(startTime.split(":")[0]) >= 18;
  const workingHours = (() => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let totalMin = eh * 60 + em - (sh * 60 + sm);
    if (totalMin < 0) totalMin += 24 * 60;
    totalMin -= breakMinutes;
    return Math.max(0, totalMin / 60);
  })();
  return (
    <div className="flex items-center gap-6 text-sm">
      <div>
        <span className="text-muted-foreground">ساعات العمل:</span>
        <span className="font-bold ms-1">{workingHours.toFixed(1)} ساعة</span>
      </div>
      <div>
        <span className="text-muted-foreground">النوع:</span>
        <span className={cn("font-bold ms-1", isNightShift ? "text-status-info-foreground" : "text-status-warning-foreground")}>
          {isNightShift ? "ليلية" : "نهارية"}
        </span>
      </div>
    </div>
  );
}

function ShiftHeader() {
  const { watch } = useFormContext();
  const startTime = watch("startTime") as string;
  const isNightShift = startTime && parseInt(startTime.split(":")[0]) >= 18;
  return (
    <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
      {isNightShift ? (
        <Moon className="w-4 h-4 text-status-info-foreground" />
      ) : (
        <Sun className="w-4 h-4 text-status-warning-foreground" />
      )}
      معلومات الوردية
    </h3>
  );
}

export default function ShiftsCreate() {
  const [, setLocation] = useLocation();
  const createMut = useApiMutation("/hr/shifts", "POST", [["shifts"]], {
    successMessage: "تم إضافة الوردية بنجاح",
  });
  const { data: branchData, isLoading, isError } = useApiQuery<any>(
    ["branches"],
    "/settings/branches",
  );
  const branches = branchData?.data || [];
  const [selectedDays, setSelectedDays] = useState<string[]>(["0", "1", "2", "3", "4"]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const branchOptions = branches.map((b: any) => ({ value: String(b.id), label: b.name }));

  return (
    <CreatePageLayout title="إضافة وردية جديدة" backPath="/hr/shifts">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          startTime: "08:00",
          endTime: "16:00",
          breakMinutes: "60",
          gracePeriod: "15",
          isDefault: false,
          branchId: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ الوردية"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/shifts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                name: values.name,
                startTime: values.startTime,
                endTime: values.endTime,
                breakMinutes: Number(values.breakMinutes) || 0,
                gracePeriod: Number(values.gracePeriod) || 0,
                days: selectedDays.join(","),
                isDefault: values.isDefault,
                branchId: values.branchId ? Number(values.branchId) : undefined,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/shifts");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <ShiftHeader />
        <FormGrid cols={3}>
          <FormTextField name="name" label="اسم الوردية" required placeholder="وردية صباحية" />
          <FormTextField name="startTime" label="وقت البدء" required type="time" />
          <FormTextField name="endTime" label="وقت الانتهاء" required type="time" />
          <FormNumberField name="breakMinutes" label="مدة الاستراحة (دقيقة)" min="0" max="120" />
          <FormNumberField name="gracePeriod" label="فترة السماح (دقيقة)" min="0" max="60" description="الوقت المسموح به للتأخر قبل احتساب مخالفة" />
          {branches.length > 0 && (
            <FormSelectField name="branchId" label="الفرع" placeholder="جميع الفروع" options={branchOptions} />
          )}
        </FormGrid>

        <div>
          <Label className="mb-2 block">أيام العمل ({selectedDays.length} أيام)</Label>
          <div className="flex flex-wrap gap-2">
            {daysOfWeek.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => toggleDay(day.key)}
                className={cn(
                  "px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all",
                  selectedDays.includes(day.key)
                    ? "border-status-info-surface bg-status-info-surface text-status-info-foreground"
                    : "border-border bg-white text-muted-foreground hover:border-border",
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <Card className="bg-surface-subtle border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <ShiftSummary />
              <FormCheckboxField name="isDefault" label="وردية افتراضية" />
            </div>
          </CardContent>
        </Card>
      </FormShell>
    </CreatePageLayout>
  );
}
