import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { statusLabel } from "@/lib/transport-status-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageShell,
} from "@workspace/ui-core";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import {
  Truck, Package, MapPin, Activity, CheckCircle2, Route as RouteIcon, Weight, Navigation,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CargoCheckpointDialog } from "@/components/shared/cargo-checkpoint-dialog";

// #2079 TA-T18-03 — within-step operational checkpoints are recorded
// through a dialog mounted on each cargo card while the manifest sits
// in a driver-controlled state. The set mirrors the backend's
// CARGO_DRIVER_CHECKPOINT_OPEN_STATES gate at
// /api/fleet/me/cargo/:id/checkpoint (status ∈ driver_accepted ..
// delivered). Closing the SPA half of #2056 — the dialog NEVER
// changes the 7-state lifecycle; advance buttons own that.
const CARGO_CHECKPOINT_OPEN: ReadonlySet<string> = new Set([
  "driver_accepted", "trip_started", "arrived_pickup",
  "loaded", "in_transit", "arrived_delivery", "delivered",
]);

interface DriverMe {
  id: number; name: string; phone: string | null;
  licenseNumber: string | null; licenseExpiry: string | null;
  status: string; rating: number | null; totalTrips: number | null;
}

// #1733 — Driver UI is finance-blacked-out. The backend `/api/fleet/me/trips`
// endpoint may return `cost`, but the driver type intentionally OMITS it
// so a future render-by-accident can't leak pricing to the cab screen.
interface DriverTrip {
  id: number; status: string; tripDate: string | null;
  startTime: string | null; endTime: string | null;
  fromLocation: string | null; toLocation: string | null;
  distance: number | null;
  notes: string | null; vehiclePlate: string | null;
}

interface DriverCargo {
  id: number; manifestNumber: string; status: string;
  fromLocation: string | null; toLocation: string | null;
  pickupDate: string | null; deliveryDate: string | null;
  customerName: string | null; totalWeight: number;
  vehiclePlate: string | null;
}

// #TA-T18-UX-AUDIT-01 — حالات الرحلة والسائق والشحن كلها من القاموس الموحّد
// (lib/transport-status-labels): trip / driver / cargo — لا خرائط محلية،
// إنهاءً لـRM-03 «صفر fallback إنجليزي» على شاشة السائق.

export default function MeDriver() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"trips" | "cargo">("trips");
  const [busy, setBusy] = useState<string | null>(null);

  const meQ = useApiQuery<{ data: DriverMe }>(["fleet-me"], "/fleet/me");
  const tripsQ = useApiQuery<{ data: DriverTrip[] }>(["fleet-me-trips"], "/fleet/me/trips");
  const cargoQ = useApiQuery<{ data: DriverCargo[] }>(["fleet-me-cargo"], "/fleet/me/cargo");
  const inspQ = useApiQuery<{ data: { id: number; plateNumber: string | null; status: string; dueDate: string | null }[] }>(["fleet-me-inspections"], "/fleet/me/inspections");
  const me = meQ.data?.data;
  const trips = tripsQ.data?.data || [];
  const cargo = cargoQ.data?.data || [];

  // Auto-refresh while a trip/cargo is in motion so the dispatcher
  // sees the driver's status flips live without F5.
  useEffect(() => {
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["fleet-me"] });
      qc.invalidateQueries({ queryKey: ["fleet-me-trips"] });
      qc.invalidateQueries({ queryKey: ["fleet-me-cargo"] });
    }, 30_000);
    return () => clearInterval(t);
  }, [qc]);

  const flipAvailability = async (status: "available" | "off_duty") => {
    setBusy(`avail-${status}`);
    try {
      await apiFetch("/fleet/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({ queryKey: ["fleet-me"] });
      toast({ title: status === "available" ? "أنت الآن متاح" : "خارج الدوام" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر التحديث", description: getErrorMessage(err) });
    } finally { setBusy(null); }
  };

  const tripAction = async (tripId: number, action: "start" | "complete") => {
    setBusy(`trip-${tripId}-${action}`);
    try {
      await apiFetch(`/fleet/me/trips/${tripId}/${action}`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["fleet-me"] });
      qc.invalidateQueries({ queryKey: ["fleet-me-trips"] });
      toast({ title: action === "start" ? "بدأت الرحلة" : "اكتملت الرحلة" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الإجراء", description: getErrorMessage(err) });
    } finally { setBusy(null); }
  };

  // #1733 Blocker #3 — the driver now walks the 7 operational states the
  // backend's DRIVER_ALLOWED_TRANSITIONS accepts (driver_accepted →
  // trip_started → arrived_pickup → loaded → in_transit →
  // arrived_delivery → delivered), one step per click.
  type CargoDriverAdvance =
    | "driver_accepted"
    | "trip_started"
    | "arrived_pickup"
    | "loaded"
    | "in_transit"
    | "arrived_delivery"
    | "delivered";
  const cargoAdvance = async (manifestId: number, status: CargoDriverAdvance) => {
    setBusy(`cargo-${manifestId}-${status}`);
    try {
      await apiFetch(`/fleet/me/cargo/${manifestId}/advance`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({ queryKey: ["fleet-me-cargo"] });
      toast({ title: status === "delivered" ? "تم تأكيد التسليم" : "بدء النقل" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الإجراء", description: getErrorMessage(err) });
    } finally { setBusy(null); }
  };

  if (meQ.isLoading) {
    return <PageShell title="لوحة السائق"><p className="text-muted-foreground p-4">جاري التحميل…</p></PageShell>;
  }
  if (meQ.isError || !me) {
    return (
      <PageShell title="لوحة السائق">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          لا يوجد سجل سائق مرتبط بحسابك. يرجى التواصل مع مدير الأسطول لربط حسابك بسجل سائق.
        </CardContent></Card>
      </PageShell>
    );
  }

  const driverTone = statusLabel("driver", me.status);
  const activeTrip = trips.find((t) => t.status === "in_progress");
  const activeCargo = cargo.find((m) => m.status === "in_transit");

  return (
    <PageShell
      title={`مرحباً، ${me.name}`}
      subtitle="لوحة السائق — رحلاتك وبضائعك"
      actions={
        <Button asChild size="sm" variant="default"><Link href="/me/driver/navigation">
            <Navigation className="h-4 w-4 me-1" />الملاحة
          </Link></Button>
      }
    >
      <FleetTabsNav />
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-status-info-foreground" />حالتي الحالية</span>
            <Badge variant="outline" className={driverTone.tone}>{driverTone.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {me.status === "on_trip" ? (
            <p className="text-sm text-muted-foreground">لديك رحلة جارية — لا يمكن تغيير الحالة حتى تكتمل.</p>
          ) : me.status === "suspended" ? (
            <p className="text-sm text-rose-700">الحساب موقوف. الرجاء التواصل مع الإدارة.</p>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1"
                disabled={busy === "avail-available" || me.status === "available"}
                onClick={() => flipAvailability("available")}>
                <CheckCircle2 className="h-4 w-4 me-1" />متاح للعمل
              </Button>
              <Button size="sm" variant="outline" className="flex-1"
                disabled={busy === "avail-off_duty" || me.status === "off_duty"}
                onClick={() => flipAvailability("off_duty")}>
                خارج الدوام
              </Button>
            </div>
          )}
          {(activeTrip || activeCargo) && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {activeTrip && (
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">رحلة جارية</p>
                  <p className="font-medium">{activeTrip.fromLocation || "—"} → {activeTrip.toLocation || "—"}</p>
                </div>
              )}
              {activeCargo && (
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">شحنة في الطريق</p>
                  <p className="font-mono">{activeCargo.manifestNumber}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const pending = (inspQ.data?.data ?? []).filter((i) => i.status === "pending");
        if (pending.length === 0) return null;
        return (
          <Card className="mb-4 border-status-warning/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-status-warning" />
                الفحص اليومي ({pending.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>المركبة {i.plateNumber ?? "—"} {i.dueDate ? `· ${i.dueDate}` : ""}</span>
                  <Button size="sm" asChild>
                    <Link href={`/fleet/me/inspections/${i.id}`}>تصوير العداد</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "trips" | "cargo")}>
        <TabsList>
          <TabsTrigger value="trips"><RouteIcon className="h-3.5 w-3.5 me-1" />رحلاتي ({trips.length})</TabsTrigger>
          <TabsTrigger value="cargo"><Package className="h-3.5 w-3.5 me-1" />بضائعي ({cargo.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "trips" && (
        <div className="mt-3 space-y-3">
          {trips.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">
              <RouteIcon className="h-10 w-10 mx-auto opacity-30 mb-2" />لا توجد رحلات مسندة إليك
            </CardContent></Card>
          ) : trips.map((t) => {
            const tone = statusLabel("trip", t.status);
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-status-info-foreground" />
                      {t.fromLocation || "—"} → {t.toLocation || "—"}
                    </span>
                    <Badge variant="outline" className={tone.tone}>{tone.label}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">المركبة</p><p className="font-mono">{t.vehiclePlate || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">المسافة</p><p>{t.distance != null ? `${Number(t.distance).toFixed(1)} كم` : "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">بدء</p><p className="text-xs">{t.startTime ? new Date(t.startTime).toLocaleString("ar-SA") : "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">انتهاء</p><p className="text-xs">{t.endTime ? new Date(t.endTime).toLocaleString("ar-SA") : "—"}</p></div>
                  </div>
                  {(t.status === "scheduled" || t.status === "planned") && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `trip-${t.id}-start`}
                      onClick={() => tripAction(t.id, "start")}>بدء الرحلة</Button>
                  )}
                  {t.status === "in_progress" && (
                    <Button className="w-full mt-3" size="sm" variant="outline"
                      disabled={busy === `trip-${t.id}-complete`}
                      onClick={() => tripAction(t.id, "complete")}>إنهاء الرحلة (وصلت)</Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "cargo" && (
        <div className="mt-3 space-y-3">
          {cargo.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto opacity-30 mb-2" />لا توجد بوالص مسندة إليك
            </CardContent></Card>
          ) : cargo.map((m) => {
            const tone = statusLabel("cargo", m.status);
            return (
              <Card key={m.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="font-mono text-sm">{m.manifestNumber}</span>
                    <Badge variant="outline" className={tone.tone}>{tone.label}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm mb-2">{m.fromLocation || "—"} <span className="text-muted-foreground">→</span> {m.toLocation || "—"}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">العميل</p><p>{m.customerName || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">المركبة</p><p className="font-mono">{m.vehiclePlate || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">التحميل</p><p className="text-xs">{m.pickupDate || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Weight className="h-3 w-3" />الوزن</p>
                      <p>{m.totalWeight ? `${Number(m.totalWeight).toFixed(0)} كغ` : "—"}</p></div>
                  </div>
                  {/* #1733 Blocker #3 — driver walks the operational
                      states one step at a time. Each label matches the
                      corresponding action verb so the cab UI reads as a
                      real workflow, not a generic "advance" button. */}
                  {m.status === "assigned_to_driver" && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `cargo-${m.id}-driver_accepted`}
                      onClick={() => cargoAdvance(m.id, "driver_accepted")}>قبول المهمة</Button>
                  )}
                  {m.status === "driver_accepted" && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `cargo-${m.id}-trip_started`}
                      onClick={() => cargoAdvance(m.id, "trip_started")}>بدء الرحلة</Button>
                  )}
                  {m.status === "trip_started" && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `cargo-${m.id}-arrived_pickup`}
                      onClick={() => cargoAdvance(m.id, "arrived_pickup")}>وصلت لموقع التحميل</Button>
                  )}
                  {m.status === "arrived_pickup" && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `cargo-${m.id}-loaded`}
                      onClick={() => cargoAdvance(m.id, "loaded")}>تم التحميل</Button>
                  )}
                  {m.status === "loaded" && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `cargo-${m.id}-in_transit`}
                      onClick={() => cargoAdvance(m.id, "in_transit")}>بدء النقل (في الطريق)</Button>
                  )}
                  {m.status === "in_transit" && (
                    <Button className="w-full mt-3" size="sm"
                      disabled={busy === `cargo-${m.id}-arrived_delivery`}
                      onClick={() => cargoAdvance(m.id, "arrived_delivery")}>وصلت لموقع التسليم</Button>
                  )}
                  {m.status === "arrived_delivery" && (
                    <Button className="w-full mt-3" size="sm" variant="outline"
                      disabled={busy === `cargo-${m.id}-delivered`}
                      onClick={() => cargoAdvance(m.id, "delivered")}>تأكيد التسليم</Button>
                  )}
                  {/* TA-T18-03 — log within-step checkpoints (weighing,
                      rest, inspection, customs, fueling, (un)loading
                      milestones) without touching the headline status.
                      Gated to driver-controlled states only — matches
                      the backend's CARGO_DRIVER_CHECKPOINT_OPEN_STATES. */}
                  <CargoCheckpointDialog
                    manifestId={m.id}
                    manifestNumber={m.manifestNumber}
                    disabled={!CARGO_CHECKPOINT_OPEN.has(m.status)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
