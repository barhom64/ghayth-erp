import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, RefreshCw, LogOut, KeyRound, Activity, AlertCircle, CheckCircle, Route as RouteIcon } from "lucide-react";
import { driverFetch, getDriverToken, clearDriverSession } from "./lib";

interface DriverMe {
  id: number;
  name: string;
  phone: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  status: string;
  rating: number | null;
  totalTrips: number | null;
  portalEmail: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

const STATUS_TONE: Record<string, string> = {
  available: "bg-status-success-surface text-status-success-foreground",
  on_trip: "bg-status-info-surface text-status-info-foreground",
  off_duty: "bg-status-warning-surface text-status-warning-foreground",
  suspended: "bg-rose-100 text-rose-700",
};

const STATUS_LABEL: Record<string, string> = {
  available: "متاح",
  on_trip: "في رحلة",
  off_duty: "خارج الدوام",
  suspended: "موقوف",
};

export default function DriverPortalProfile() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const mustChangeOnLoad = new URLSearchParams(search).has("changePassword");
  const [me, setMe] = useState<DriverMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!getDriverToken()) {
      navigate("/driver-portal/login");
    }
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await driverFetch<{ data: DriverMe }>("/driver-portal/me");
      setMe(resp.data);
    } catch (err: any) {
      setError(err?.message || "تعذّر تحميل الملف");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setAvailability = async (status: "available" | "off_duty") => {
    setBusy(true);
    setError(null);
    try {
      await driverFetch("/driver-portal/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "تعذّر تحديث الحالة");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPwSuccess(false);
    try {
      await driverFetch("/driver-portal/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setPwSuccess(true);
      await load();
    } catch (err: any) {
      setError(err?.message || "تعذّر تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearDriverSession();
    navigate("/driver-portal/login");
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-status-info-surface flex items-center justify-center">
              <Truck className="h-4 w-4 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">{me?.name || "بوابة السائق"}</p>
              <p className="text-xs text-muted-foreground">الملف الشخصي</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/driver-portal/my-trips")}>
              <RouteIcon className="h-4 w-4 me-1" />رحلاتي
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 me-1" />خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {mustChangeOnLoad && (
          <Card className="border-status-warning-surface bg-status-warning-surface/30">
            <CardContent className="p-3 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-status-warning-foreground" />
              يجب تغيير كلمة المرور المؤقتة قبل المتابعة.
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="p-3 text-sm text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">جاري التحميل…</CardContent></Card>
        ) : me ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-status-info-foreground" />حالتي الحالية</span>
                  <Badge variant="outline" className={STATUS_TONE[me.status] || "bg-surface-subtle"}>
                    {STATUS_LABEL[me.status] || me.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {me.status === "on_trip" ? (
                  <p className="text-sm text-muted-foreground">
                    لديك رحلة جارية حالياً. لا يمكن تغيير الحالة حتى تكتمل الرحلة.
                  </p>
                ) : me.status === "suspended" ? (
                  <p className="text-sm text-rose-700">
                    الحساب موقوف. الرجاء التواصل مع إدارة الأسطول.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || me.status === "available"}
                      onClick={() => setAvailability("available")}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4 me-1" />متاح للعمل
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || me.status === "off_duty"}
                      onClick={() => setAvailability("off_duty")}
                      className="flex-1"
                    >
                      خارج الدوام
                    </Button>
                    <Button variant="ghost" size="sm" onClick={load} disabled={busy}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">معلوماتي</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">الاسم</p><p>{me.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">الهاتف</p><p className="font-mono">{me.phone || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">رقم الرخصة</p><p className="font-mono">{me.licenseNumber || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">انتهاء الرخصة</p><p>{me.licenseExpiry || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">عدد الرحلات</p><p>{me.totalTrips ?? 0}</p></div>
                  <div><p className="text-xs text-muted-foreground">التقييم</p><p>{me.rating ? `${Number(me.rating).toFixed(1)} / 5` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">بريد البوابة</p><p className="font-mono text-xs">{me.portalEmail}</p></div>
                  <div><p className="text-xs text-muted-foreground">آخر دخول</p><p className="text-xs">{me.lastLoginAt ? new Date(me.lastLoginAt).toLocaleString("ar-SA") : "—"}</p></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  تغيير كلمة المرور
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={changePassword} className="space-y-3 max-w-sm">
                  <div>
                    <Label htmlFor="cur-pw">كلمة المرور الحالية</Label>
                    <Input
                      id="cur-pw"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-pw">كلمة المرور الجديدة</Label>
                    <Input
                      id="new-pw"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="6 أحرف على الأقل"
                      minLength={6}
                      required
                    />
                  </div>
                  {pwSuccess && (
                    <p className="text-sm text-status-success-foreground inline-flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />تم تغيير كلمة المرور بنجاح
                    </p>
                  )}
                  <Button type="submit" rateLimitAware disabled={busy || !currentPassword || newPassword.length < 6}>
                    {busy ? "جاري الحفظ…" : "حفظ"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
