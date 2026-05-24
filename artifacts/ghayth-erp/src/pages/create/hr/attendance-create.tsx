import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextareaField,
  FormNumberField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { MapPin, Clock, LogIn, LogOut, CheckCircle, Loader2 } from "lucide-react";

type ActivityType = "check_in" | "check_out";

const activityTypes: { value: ActivityType; label: string; icon: any; color: string }[] = [
  { value: "check_in", label: "تسجيل حضور", icon: LogIn, color: "border-status-success-surface bg-status-success-surface text-status-success-foreground" },
  { value: "check_out", label: "تسجيل انصراف", icon: LogOut, color: "border-status-error-surface bg-status-error-surface text-status-error-foreground" },
];

const schema = z.object({
  activityType: z.enum(["check_in", "check_out"]),
  lat: z.string().optional(),
  lon: z.string().optional(),
  notes: z.string().optional(),
});

function ActivityTypePicker() {
  const { watch, setValue } = useFormContext();
  const activityType = watch("activityType") as ActivityType;
  return (
    <div>
      <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4" /> نوع النشاط
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {activityTypes.map((at) => (
          <button
            key={at.value}
            type="button"
            onClick={() => setValue("activityType", at.value)}
            className={`p-4 rounded-xl border-2 text-center transition-all ${activityType === at.value ? at.color + " ring-2 ring-offset-1 shadow-sm" : "border-border bg-white hover:border-border"}`}
          >
            <at.icon className={`w-6 h-6 mx-auto mb-2 ${activityType === at.value ? "" : "text-muted-foreground"}`} />
            <p className={`text-sm font-medium ${activityType === at.value ? "" : "text-muted-foreground"}`}>{at.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function LocationBlock() {
  const { watch, setValue } = useFormContext();
  const { toast } = useToast();
  const lat = watch("lat") as string;
  const lon = watch("lon") as string;
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "success" | "error">("idle");

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      setLocationLoading(true);
      setLocationStatus("idle");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setValue("lat", String(pos.coords.latitude.toFixed(6)));
          setValue("lon", String(pos.coords.longitude.toFixed(6)));
          setLocationLoading(false);
          setLocationStatus("success");
          toast({ title: "تم تحديد الموقع بنجاح" });
        },
        () => {
          setLocationLoading(false);
          setLocationStatus("error");
          toast({ variant: "destructive", title: "تعذر تحديد الموقع — تأكد من تفعيل خدمة الموقع" });
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      toast({ variant: "destructive", title: "المتصفح لا يدعم تحديد الموقع" });
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
        <MapPin className="w-4 h-4" /> الموقع الجغرافي
      </h3>
      <FormGrid cols={3}>
        <FormNumberField name="lat" label="خط العرض" step="0.000001" placeholder="24.713600" className="[&_input]:font-mono" />
        <FormNumberField name="lon" label="خط الطول" step="0.000001" placeholder="46.675300" className="[&_input]:font-mono" />
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">&nbsp;</Label>
          <Button type="button" variant="outline" onClick={handleGetLocation} disabled={locationLoading} className="w-full">
            {locationLoading ? (
              <><Loader2 className="w-4 h-4 me-2 animate-spin" />جاري التحديد...</>
            ) : locationStatus === "success" ? (
              <><CheckCircle className="w-4 h-4 me-2 text-status-success-foreground" />تم التحديد</>
            ) : (
              <><MapPin className="w-4 h-4 me-2" />تحديد الموقع تلقائياً</>
            )}
          </Button>
        </div>
      </FormGrid>
      {locationStatus === "success" && lat && lon && (
        <div className="mt-2 flex items-center gap-2">
          <Badge className="bg-status-success-surface text-status-success-foreground text-xs">
            <MapPin className="w-3 h-3 me-1" /> {lat}, {lon}
          </Badge>
        </div>
      )}
    </div>
  );
}

function SubmitLabelOverride() {
  const { watch } = useFormContext();
  const activityType = watch("activityType") as ActivityType;
  const currentActivity = activityTypes.find((a) => a.value === activityType);
  // The override is rendered as a hidden child only to make FormShell's
  // submit label reflect the current activity. We don't need to render
  // anything because FormShell receives submitLabel as a prop, but we
  // surface this hook so the parent can read the same watch value.
  return <span className="sr-only">{currentActivity?.label}</span>;
}

export default function AttendanceCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const checkInMut = useApiMutation("/hr/check-in", "POST", [["attendance"]], {
    successMessage: "تم تسجيل الحضور بنجاح",
  });
  const checkOutMut = useApiMutation("/hr/check-out", "POST", [["attendance"]], {
    successMessage: "تم تسجيل الانصراف بنجاح",
  });
  const submitting = checkInMut.isPending || checkOutMut.isPending;

  return (
    <CreatePageLayout title="تسجيل حضور / انصراف" backPath="/hr/attendance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="الموظف" value={user?.name || "-"} />
        <AutoField label="الرقم الوظيفي" value={user?.empNumber || "-"} />
        <CreationDateField />
        <AutoField label="الوقت الحالي" value={new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ activityType: "check_in", lat: "", lon: "", notes: "" }}
        submitLabel={submitting ? "جاري التسجيل..." : "تسجيل"}
        disabled={submitting}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/attendance")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const mut = values.activityType === "check_out" ? checkOutMut : checkInMut;
          await new Promise<void>((resolve, reject) =>
            mut.mutate(
              {
                lat: values.lat ? Number(values.lat) : undefined,
                lon: values.lon ? Number(values.lon) : undefined,
                notes: values.notes || undefined,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/attendance");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <ActivityTypePicker />
        <LocationBlock />
        <FormTextareaField
          name="notes"
          label="ملاحظات"
          placeholder="ملاحظات إضافية (سبب التأخير، مهمة خارجية، إلخ)..."
          rows={3}
        />
        <SubmitLabelOverride />
      </FormShell>
    </CreatePageLayout>
  );
}
