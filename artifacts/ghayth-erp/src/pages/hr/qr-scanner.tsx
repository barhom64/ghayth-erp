import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useApiMutation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Clock, CheckCircle, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * HR-U1 — تسجيل الحضور السريع عبر QR/الموقع.
 *
 * قبل التوحيد:
 *   - كان الصفحة تعرض `<div>` خامًا بدون `PageShell`، بلا breadcrumb ولا header موحّد.
 *   - كل استدعاء كان ملفوفًا بـ try/catch يبتلع الأخطاء المُكتَبة ويعرض toast
 *     عامًا "حدث خطأ"، ممّا يخفي أسباب الفشل الحقيقية (validation, conflict, forbidden).
 *
 * بعد التوحيد:
 *   - استُبدلت البنية الخام بـ `PageShell` مع breadcrumb للموارد البشرية.
 *   - حُذف try/catch حول `mutateAsync`؛ `useApiMutation` لديه بالفعل معالج خطأ
 *     افتراضي يعرض toast مكتوبًا حسب كود الخطأ عبر `toastTitleForCode` +
 *     `toastDescriptionForError` (انظر `lib/api.ts:431-470`).
 *   - رسائل النجاح مُعتمَدة عبر `successMessage` في خيارات `useApiMutation`
 *     لضمان التوحيد مع بقية الصفحات.
 *   - فقط خطأ تحديد الموقع الجغرافي (geolocation) يبقى toast يدويًا لأنه
 *     خطأ متصفّح لا يمرّ عبر الـ API.
 */
export default function QRScannerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lastAction, setLastAction] = useState<string | null>(null);

  const checkInMut = useApiMutation<unknown, { lat?: number; lon?: number }>(
    "/hr/check-in",
    "POST",
    [["attendance"]],
    {
      successMessage: "تم تسجيل الحضور بنجاح",
      onSuccess: () => setLastAction("checkin"),
    },
  );

  const checkOutMut = useApiMutation<unknown, { lat?: number; lon?: number }>(
    "/hr/check-out",
    "POST",
    [["attendance"]],
    {
      successMessage: "تم تسجيل الانصراف بنجاح",
      onSuccess: () => setLastAction("checkout"),
    },
  );

  const handleCheckIn = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "المتصفح لا يدعم تحديد الموقع" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        checkInMut.mutate({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        toast({ variant: "destructive", title: "يرجى السماح بالوصول للموقع" });
      },
    );
  };

  const handleCheckOut = () => {
    if (!navigator.geolocation) {
      checkOutMut.mutate({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        checkOutMut.mutate({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        // المستخدم رفض تحديد الموقع — نسجّل الانصراف بدون إحداثيات
        checkOutMut.mutate({});
      },
    );
  };

  return (
    <PageShell
      title="تسجيل الحضور السريع"
      subtitle="تسجيل الحضور والانصراف عبر الموقع الجغرافي"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { label: "تسجيل الحضور السريع" },
      ]}
    >
      <div className="max-w-lg mx-auto">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-6">
              <QrCode className="w-12 h-12 text-blue-600" />
            </div>
            <h4 className="text-xl font-bold mb-2">{user?.name || "موظف"}</h4>
            <p className="text-gray-500 mb-6">{user?.empNumber || ""}</p>

            <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>{new Date().toLocaleTimeString("ar-SA")}</span>
              <span>—</span>
              <span>{formatDateAr(new Date())}</span>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full h-14 text-lg bg-green-600 hover:bg-green-700"
                onClick={handleCheckIn}
                disabled={checkInMut.isPending}
              >
                <MapPin className="h-5 w-5 me-2" />
                {checkInMut.isPending ? "جاري التسجيل..." : "تسجيل حضور"}
              </Button>
              <Button
                className="w-full h-14 text-lg"
                variant="destructive"
                onClick={handleCheckOut}
                disabled={checkOutMut.isPending}
              >
                <CheckCircle className="h-5 w-5 me-2" />
                {checkOutMut.isPending ? "جاري التسجيل..." : "تسجيل انصراف"}
              </Button>
            </div>

            {lastAction && (
              <div
                className={`mt-6 p-4 rounded-lg ${
                  lastAction === "checkin"
                    ? "bg-green-50 text-green-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                <CheckCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="font-medium">
                  {lastAction === "checkin"
                    ? "تم تسجيل الحضور بنجاح"
                    : "تم تسجيل الانصراف بنجاح"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
