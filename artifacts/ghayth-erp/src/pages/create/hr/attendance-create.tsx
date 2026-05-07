import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { MapPin, Clock, LogIn, LogOut, CheckCircle, Loader2 } from "lucide-react";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

type ActivityType = "check_in" | "check_out";

const activityTypes: { value: ActivityType; label: string; icon: any; color: string }[] = [
  { value: "check_in", label: "تسجيل حضور", icon: LogIn, color: "border-green-200 bg-green-50 text-green-700" },
  { value: "check_out", label: "تسجيل انصراف", icon: LogOut, color: "border-red-200 bg-red-50 text-red-700" },
];

const DRAFT_KEY = "hr_attendance_create";
const INITIAL = {
  activityType: "check_in" as ActivityType,
  lat: "",
  lon: "",
  notes: "",
  time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
};

export default function AttendanceCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "success" | "error">("idle");

  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const checkInMut = useApiMutation("/hr/check-in", "POST", [["attendance"]], {
    successMessage: "تم تسجيل الحضور بنجاح",
  });
  const checkOutMut = useApiMutation("/hr/check-out", "POST", [["attendance"]], {
    successMessage: "تم تسجيل الانصراف بنجاح",
  });
  const submitting = checkInMut.isPending || checkOutMut.isPending;

  const handleSubmit = () => {
    const mut = form.activityType === "check_out" ? checkOutMut : checkInMut;
    mut.mutate(
      {
        lat: form.lat ? Number(form.lat) : undefined,
        lon: form.lon ? Number(form.lon) : undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/attendance");
        },
      },
    );
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      setLocationLoading(true);
      setLocationStatus("idle");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setForm((f) => ({
            ...f,
            lat: String(pos.coords.latitude.toFixed(6)),
            lon: String(pos.coords.longitude.toFixed(6)),
          }));
          setLocationLoading(false);
          setLocationStatus("success");
          toast({ title: "تم تحديد الموقع بنجاح" });
        },
        () => {
          setLocationLoading(false);
          setLocationStatus("error");
          toast({ variant: "destructive", title: "تعذر تحديد الموقع — تأكد من تفعيل خدمة الموقع" });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      toast({ variant: "destructive", title: "المتصفح لا يدعم تحديد الموقع" });
    }
  };

  const currentActivity = activityTypes.find((a) => a.value === form.activityType);

  return (
    <CreatePageLayout title="تسجيل حضور / انصراف" backPath="/hr/attendance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="الموظف" value={user?.name || "-"} />
        <AutoField label="الرقم الوظيفي" value={user?.empNumber || "-"} />
        <CreationDateField />
        <AutoField label="الوقت الحالي" value={new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            نوع النشاط
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {activityTypes.map((at) => (
              <button
                key={at.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, activityType: at.value }))}
                className={`p-4 rounded-xl border-2 text-center transition-all ${form.activityType === at.value ? at.color + " ring-2 ring-offset-1 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
              >
                <at.icon className={`w-6 h-6 mx-auto mb-2 ${form.activityType === at.value ? "" : "text-gray-400"}`} />
                <p className={`text-sm font-medium ${form.activityType === at.value ? "" : "text-gray-600"}`}>{at.label}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            الموقع الجغرافي
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <NumberField label="خط العرض" value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} step={0.000001} placeholder="24.713600" className="[&_input]:font-mono" />
            <NumberField label="خط الطول" value={form.lon} onChange={(v) => setForm((f) => ({ ...f, lon: v }))} step={0.000001} placeholder="46.675300" className="[&_input]:font-mono" />
            <FormFieldWrapper label="&nbsp;">
              <Button type="button" variant="outline" onClick={handleGetLocation} disabled={locationLoading} className="w-full">
                {locationLoading ? (
                  <><Loader2 className="w-4 h-4 me-2 animate-spin" />جاري التحديد...</>
                ) : locationStatus === "success" ? (
                  <><CheckCircle className="w-4 h-4 me-2 text-green-600" />تم التحديد</>
                ) : (
                  <><MapPin className="w-4 h-4 me-2" />تحديد الموقع تلقائياً</>
                )}
              </Button>
            </FormFieldWrapper>
          </div>
          {locationStatus === "success" && form.lat && form.lon && (
            <div className="mt-2 flex items-center gap-2">
              <Badge className="bg-green-50 text-green-700 text-xs">
                <MapPin className="w-3 h-3 me-1" />
                {form.lat}, {form.lon}
              </Badge>
            </div>
          )}
        </div>

        <TextAreaField
          label="ملاحظات"
          value={form.notes}
          onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          placeholder="ملاحظات إضافية (سبب التأخير، مهمة خارجية، إلخ)..."
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/attendance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={submitting} size="lg" rateLimitAware>
          {submitting ? "جاري التسجيل..." : currentActivity?.label || "تسجيل"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
