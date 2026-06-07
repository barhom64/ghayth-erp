import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, Package, RefreshCw, LogOut, User as UserIcon,
  AlertCircle, Route as RouteIcon, Weight,
} from "lucide-react";
import { driverFetch, getDriverToken, getDriverProfile, clearDriverSession, type DriverPortalDriver } from "./lib";

interface DriverCargoRow {
  id: number;
  manifestNumber: string;
  status: string;
  fromLocation: string | null;
  toLocation: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  customerName: string | null;
  totalWeight: number;
  vehiclePlate: string | null;
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-surface-subtle text-muted-foreground",
  confirmed: "bg-status-info-surface text-status-info-foreground",
  loading: "bg-purple-50 text-purple-700",
  in_transit: "bg-status-warning-surface text-status-warning-foreground",
  delivered: "bg-status-success-surface text-status-success-foreground",
  closed: "bg-status-success-surface text-status-success-foreground",
  cancelled: "bg-rose-100 text-rose-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  confirmed: "مؤكدة",
  loading: "تحميل",
  in_transit: "في الطريق",
  delivered: "مسلّمة",
  closed: "مغلقة",
  cancelled: "ملغاة",
};

export default function DriverPortalMyCargo() {
  const [, navigate] = useLocation();
  const [driver, setDriver] = useState<DriverPortalDriver | null>(null);
  const [rows, setRows] = useState<DriverCargoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

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
      const resp = await driverFetch<{ data: DriverCargoRow[] }>(`/driver-portal/me/cargo${qs}`);
      setRows(resp.data || []);
    } catch (err: any) {
      setError(err?.message || "تعذّر تحميل البوالص");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (driver) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [driver, filter]);

  const [acting, setActing] = useState<number | null>(null);
  const advance = async (manifestId: number, status: "in_transit" | "delivered") => {
    setActing(manifestId);
    setError(null);
    try {
      await driverFetch(`/driver-portal/me/cargo/${manifestId}/advance`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "تعذّر تنفيذ الإجراء");
    } finally {
      setActing(null);
    }
  };

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
            <Button variant="ghost" size="sm" onClick={() => navigate("/driver-portal/my-trips")}>
              <RouteIcon className="h-4 w-4 me-1" />الرحلات
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
            <Package className="h-5 w-5 text-status-info-foreground" />
            بوالص الشحن
          </h1>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 me-1" />تحديث
          </Button>
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="confirmed">مؤكدة</TabsTrigger>
            <TabsTrigger value="loading">تحميل</TabsTrigger>
            <TabsTrigger value="in_transit">في الطريق</TabsTrigger>
            <TabsTrigger value="delivered">مسلّمة</TabsTrigger>
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
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto opacity-30 mb-2" />
              <p>لا توجد بوالص شحن في هذه الفئة</p>
            </CardContent>
          </Card>
        ) : (
          rows.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="font-mono text-sm">{m.manifestNumber}</span>
                  <Badge variant="outline" className={STATUS_TONE[m.status] || "bg-surface-subtle"}>
                    {STATUS_LABEL[m.status] || m.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm mb-2">
                  {m.fromLocation || "—"} <span className="text-muted-foreground">→</span> {m.toLocation || "—"}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">العميل</p>
                    <p>{m.customerName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المركبة</p>
                    <p className="font-mono">{m.vehiclePlate || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">التحميل</p>
                    <p className="text-xs">{m.pickupDate || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Weight className="h-3 w-3" />الوزن</p>
                    <p>{m.totalWeight ? `${Number(m.totalWeight).toFixed(0)} كغ` : "—"}</p>
                  </div>
                </div>
                {(m.status === "confirmed" || m.status === "loading") && (
                  <Button
                    className="w-full mt-3"
                    size="sm"
                    disabled={acting === m.id}
                    onClick={() => advance(m.id, "in_transit")}
                  >
                    {acting === m.id ? "جاري…" : "بدء النقل (في الطريق)"}
                  </Button>
                )}
                {m.status === "in_transit" && (
                  <Button
                    className="w-full mt-3"
                    size="sm"
                    variant="outline"
                    disabled={acting === m.id}
                    onClick={() => advance(m.id, "delivered")}
                  >
                    {acting === m.id ? "جاري…" : "تأكيد التسليم"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
