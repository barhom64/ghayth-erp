import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, MapPin, Route as RouteIcon, RefreshCw, LogOut, User as UserIcon,
  Clock, AlertCircle, Package,
} from "lucide-react";
import { driverFetch, getDriverToken, getDriverProfile, clearDriverSession, type DriverPortalDriver } from "./lib";

interface DriverTripRow {
  id: number;
  status: string;
  tripDate: string | null;
  startTime: string | null;
  endTime: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  distance: number | null;
  cost: number | null;
  notes: string | null;
  vehiclePlate: string | null;
}

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-status-info-surface text-status-info-foreground",
  in_progress: "bg-status-warning-surface text-status-warning-foreground",
  completed: "bg-status-success-surface text-status-success-foreground",
  cancelled: "bg-surface-subtle text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "مجدولة",
  in_progress: "جارية",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

export default function DriverPortalMyTrips() {
  const [, navigate] = useLocation();
  const [driver, setDriver] = useState<DriverPortalDriver | null>(null);
  const [trips, setTrips] = useState<DriverTripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  // Bounce-to-login gate. We can't use the main app's `useAuth` here
  // because the driver portal has its own JWT in localStorage —
  // independent of the ERP session.
  useEffect(() => {
    if (!getDriverToken()) {
      navigate("/driver-portal/login");
      return;
    }
    setDriver(getDriverProfile());
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter !== "all" ? `?status=${encodeURIComponent(filter)}` : "";
      const resp = await driverFetch<{ data: DriverTripRow[] }>(`/driver-portal/me/trips${qs}`);
      setTrips(resp.data || []);
    } catch (err: any) {
      setError(err?.message || "تعذّر تحميل الرحلات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (driver) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [driver, filter]);

  const logout = () => {
    clearDriverSession();
    navigate("/driver-portal/login");
  };

  if (!driver) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-status-info-surface flex items-center justify-center">
              <Truck className="h-4 w-4 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">{driver.name}</p>
              <p className="text-xs text-muted-foreground">بوابة السائق</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/driver-portal/my-cargo")}>
              <Package className="h-4 w-4 me-1" />البضائع
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/driver-portal/profile")}>
              <UserIcon className="h-4 w-4 me-1" />الملف
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 me-1" />خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <RouteIcon className="h-5 w-5 text-status-info-foreground" />
            رحلاتي
          </h1>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 me-1" />تحديث
          </Button>
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="scheduled">مجدولة</TabsTrigger>
            <TabsTrigger value="in_progress">جارية</TabsTrigger>
            <TabsTrigger value="completed">مكتملة</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">جاري التحميل…</CardContent></Card>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-10 w-10 mx-auto text-rose-400 mb-2" />
              <p className="text-sm text-rose-700">{error}</p>
            </CardContent>
          </Card>
        ) : trips.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <RouteIcon className="h-10 w-10 mx-auto opacity-30 mb-2" />
              <p>لا توجد رحلات في هذه الفئة</p>
            </CardContent>
          </Card>
        ) : (
          trips.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-status-info-foreground" />
                    {t.fromLocation || "—"} → {t.toLocation || "—"}
                  </span>
                  <Badge variant="outline" className={STATUS_TONE[t.status] || "bg-surface-subtle"}>
                    {STATUS_LABEL[t.status] || t.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" />بدء</p>
                    <p>{t.startTime ? new Date(t.startTime).toLocaleString("ar-SA") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المركبة</p>
                    <p className="font-mono">{t.vehiclePlate || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المسافة</p>
                    <p>{t.distance != null ? `${Number(t.distance).toFixed(1)} كم` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    <p>{STATUS_LABEL[t.status] || t.status}</p>
                  </div>
                </div>
                {t.notes && (
                  <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{t.notes}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
