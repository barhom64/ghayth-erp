import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useApiMutation, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Clock, CheckCircle, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function QRScannerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lastAction, setLastAction] = useState<string | null>(null);

  const checkInMut = useApiMutation("/hr/check-in", "POST", [["attendance"]]);
  const checkOutMut = useApiMutation("/hr/check-out", "POST", [["attendance"]]);

  const handleCheckIn = async () => {
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await checkInMut.mutateAsync({ lat: pos.coords.latitude, lon: pos.coords.longitude });
              setLastAction("checkin");
              toast({ title: "تم تسجيل الحضور بنجاح" });
            } catch (err: unknown) {
              toast({ variant: "destructive", title: getErrorMessage(err) || "حدث خطأ" });
            }
          },
          () => {
            toast({ variant: "destructive", title: "يرجى السماح بالوصول للموقع" });
          }
        );
      } else {
        toast({ variant: "destructive", title: "المتصفح لا يدعم تحديد الموقع" });
      }
    } catch (err: unknown) {
      toast({ variant: "destructive", title: getErrorMessage(err) || "حدث خطأ" });
    }
  };

  const handleCheckOut = async () => {
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await checkOutMut.mutateAsync({ lat: pos.coords.latitude, lon: pos.coords.longitude });
              setLastAction("checkout");
              toast({ title: "تم تسجيل الانصراف بنجاح" });
            } catch (err: unknown) {
              toast({ variant: "destructive", title: getErrorMessage(err) || "حدث خطأ" });
            }
          },
          async () => {
            try {
              await checkOutMut.mutateAsync({});
              setLastAction("checkout");
              toast({ title: "تم تسجيل الانصراف بنجاح" });
            } catch (err: unknown) {
              toast({ variant: "destructive", title: getErrorMessage(err) || "حدث خطأ" });
            }
          }
        );
      } else {
        await checkOutMut.mutateAsync({});
        setLastAction("checkout");
        toast({ title: "تم تسجيل الانصراف بنجاح" });
      }
    } catch (err: unknown) {
      toast({ variant: "destructive", title: getErrorMessage(err) || "حدث خطأ" });
    }
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">تسجيل الحضور السريع</h1>
        <p className="text-sm text-muted-foreground mt-0.5">تسجيل الحضور والانصراف عبر الموقع الجغرافي</p>
      </div>

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
            <div className={`mt-6 p-4 rounded-lg ${lastAction === "checkin" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="font-medium">{lastAction === "checkin" ? "تم تسجيل الحضور بنجاح" : "تم تسجيل الانصراف بنجاح"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
