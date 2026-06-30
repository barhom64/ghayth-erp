import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { statusLabel } from "@/lib/transport-status-labels";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@workspace/ui-core";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import {
  MapPin, Navigation, CheckCircle2, AlertCircle, Truck, Package,
  ExternalLink, ArrowLeft, Play, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { TripEventRecorder } from "@/components/shared/trip-event-recorder";

// #1812 — driver in-app navigation screen. The user's mandate: "السائق
// يفتح تطبيق غيث فقط، يستلم أمر التشغيل، يبدأ الملاحة، يتابع
// التعليمات، يثبت الوصول والتنفيذ، وينهي الرحلة من نفس التطبيق."
//
// Phase 1 (this PR): in-app map placeholder + state-machine UI for the
// 4 lifecycle events (arrived_pickup → loaded → arrived_dropoff →
// delivered), with periodic GPS pings sent from the device. External
// Google-Maps deep link is the fallback when the in-app map can't
// render (no GPS, no key, low-spec device).
//
// Phase 2 (later PR): turn-by-turn directions inside the app once a
// real Maps SDK is wired (the abstraction is already in place via
// MapsService).

interface NavigationSession {
  id: number;
  dispatchOrderId: number;
  driverId: number;
  vehicleId: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  originLat: number | null;
  originLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  lastLat: number | null;
  lastLng: number | null;
  lastSpeedKmh: number | null;
  lastPingAt: string | null;
  etaSeconds: number | null;
  remainingMeters: number | null;
  provider: string;
  arrivedPickupAt: string | null;
  loadedAt: string | null;
  arrivedDropoffAt: string | null;
  deliveredAt: string | null;
  bookingNumber: string;
  transportServiceType: string;
  fromLocationText: string | null;
  toLocationText: string | null;
}

// #TA-T18-UX-AUDIT-01 — حالات جلسة الملاحة من القاموس الموحّد
// (lib/transport-status-labels، كيان "navigation") بدل خريطتين محليتين.

const NEXT_EVENT: Record<string, { event: string; label: string; icon: typeof CheckCircle2 } | null> = {
  active:          { event: "arrived_pickup",  label: "وصلت موقع التحميل", icon: MapPin },
  arrived_pickup:  { event: "loaded",          label: "تم التحميل",         icon: Package },
  loaded:          { event: "arrived_dropoff", label: "وصلت موقع التسليم",  icon: MapPin },
  arrived_dropoff: { event: "delivered",       label: "تم التسليم",         icon: CheckCircle2 },
  delivered:       null,
  ended:           null,
  cancelled:       null,
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}ث`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}س ${rem}د`;
}

function formatDistance(meters: number | null): string {
  if (meters == null) return "—";
  if (meters < 1000) return `${meters} م`;
  return `${(meters / 1000).toFixed(1)} كم`;
}

export default function MeDriverNavigation() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [advancing, setAdvancing] = useState(false);
  // شريحة 3 — تسليم العهدة لسائق آخر.
  const [showHandover, setShowHandover] = useState(false);
  const [candidates, setCandidates] = useState<{ id: number; name: string }[]>([]);
  const [incomingDriverId, setIncomingDriverId] = useState("");
  const [handoverProof, setHandoverProof] = useState<string[]>([]);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [uploadingHandover, setUploadingHandover] = useState(false);
  const [submittingHandover, setSubmittingHandover] = useState(false);
  // شريحة 4 — إبلاغ السائق عن خصم نقص/تأخير (المبلغ يُحسب من المعدّل المُعدّ).
  const [showDriverDeduction, setShowDriverDeduction] = useState(false);
  const [ddBasis, setDdBasis] = useState<"weight_shortage" | "delay">("weight_shortage");
  const [ddMeasure, setDdMeasure] = useState("");
  const [ddReason, setDdReason] = useState("");
  const [submittingDd, setSubmittingDd] = useState(false);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: NavigationSession | null }>(
    ["me-driver-navigation"],
    "/fleet/driver/me/navigation",
  );

  // Refresh session state every 30s so the operator → driver state
  // changes propagate without a manual refresh.
  useEffect(() => {
    const id = window.setInterval(() => refetch(), 30_000);
    return () => window.clearInterval(id);
  }, [refetch]);

  const session = data?.data;

  // Periodic GPS ping every 30s while the session is active.
  useEffect(() => {
    if (!session || ["ended", "cancelled", "delivered"].includes(session.status)) return;
    if (!("geolocation" in navigator)) return;

    const ping = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await apiFetch(`/transport/dispatch-orders/${session.dispatchOrderId}/navigation/ping`, {
              method: "POST",
              body: JSON.stringify({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
                heading: pos.coords.heading ?? undefined,
              }),
            });
          } catch {
            // Best-effort. Pings will resume on next tick.
          }
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 },
      );
    };
    ping();
    const intervalId = window.setInterval(ping, 30_000);
    return () => window.clearInterval(intervalId);
  }, [session?.id, session?.status, session?.dispatchOrderId]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  if (!session) {
    return (
      <PageShell
        title="الملاحة"
        breadcrumbs={[{ href: "/me/driver", label: "السائق" }, { label: "الملاحة" }]}
        actions={
          <Button asChild variant="outline" size="sm"><Link href="/me/driver">
              <ArrowLeft className="h-4 w-4 me-1" />العودة
            </Link></Button>
        }
      >
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            لا توجد مهمة نشطة حالياً. عند قبول مهمة من الشاشة الرئيسية ستبدأ
            جلسة الملاحة تلقائياً.
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const next = NEXT_EVENT[session.status];
  const isFinished = ["delivered", "ended"].includes(session.status);

  const advance = async () => {
    if (!next) return;
    setAdvancing(true);
    try {
      await apiFetch(`/transport/dispatch-orders/${session.dispatchOrderId}/navigation/event`, {
        method: "POST",
        body: JSON.stringify({ event: next.event }),
      });
      toast({ title: next.label });
      qc.invalidateQueries({ queryKey: ["me-driver-navigation"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر التحديث", description: message });
    } finally {
      setAdvancing(false);
    }
  };

  const complete = async () => {
    if (!confirm("هل أنهيت المهمة؟")) return;
    try {
      await apiFetch(`/transport/dispatch-orders/${session.dispatchOrderId}/navigation/complete`, {
        method: "POST",
      });
      toast({ title: "تم إنهاء المهمة" });
      qc.invalidateQueries({ queryKey: ["me-driver-navigation"] });
      navigate("/me/driver");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر الإنهاء", description: message });
    }
  };

  // شريحة 3 — تسليم العهدة: جلب المرشّحين، رفع الإثبات، ثم الإرسال.
  async function openHandover() {
    if (!session) return;
    setShowHandover(true);
    setIncomingDriverId(""); setHandoverProof([]); setHandoverNotes("");
    try {
      const r = await apiFetch<{ data: { id: number; name: string }[] }>(
        `/transport/dispatch-orders/${session.dispatchOrderId}/handover-candidates`);
      setCandidates(r.data ?? []);
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر جلب السائقين", description: getErrorMessage(e) });
    }
  }
  async function uploadHandoverProof(file: File) {
    setUploadingHandover(true);
    try {
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
      );
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("فشل رفع الصورة إلى التخزين");
      setHandoverProof((p) => [...p, objectPath]);
      toast({ title: "تم رفع الصورة" });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر رفع الصورة", description: getErrorMessage(e) });
    } finally {
      setUploadingHandover(false);
    }
  }
  async function submitHandover() {
    if (!session) return;
    if (!incomingDriverId) { toast({ variant: "destructive", title: "اختر السائق المستلِم" }); return; }
    if (handoverProof.length === 0) { toast({ variant: "destructive", title: "صورة إثبات الحالة مطلوبة" }); return; }
    setSubmittingHandover(true);
    let coords: { lat: number; lng: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 }));
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { /* الموقع اختياري */ }
    try {
      await apiFetch(`/transport/dispatch-orders/${session.dispatchOrderId}/handover`, {
        method: "POST",
        body: JSON.stringify({
          incomingDriverId: Number(incomingDriverId),
          proofObjectPaths: handoverProof,
          ...(handoverNotes.trim() ? { notes: handoverNotes.trim() } : {}),
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        }),
      });
      toast({ title: "تم تسليم العهدة" });
      setShowHandover(false);
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر تسليم العهدة", description: getErrorMessage(e) });
    } finally {
      setSubmittingHandover(false);
    }
  }

  async function submitDriverDeduction() {
    if (!session) return;
    const measure = Number(ddMeasure);
    if (!(measure > 0)) {
      toast({ variant: "destructive", title: ddBasis === "weight_shortage" ? "أدخل النقص (كغم)" : "أدخل التأخّر (ساعة)" });
      return;
    }
    if (!ddReason.trim()) { toast({ variant: "destructive", title: "أدخل السبب" }); return; }
    setSubmittingDd(true);
    try {
      await apiFetch(`/transport/dispatch-orders/${session.dispatchOrderId}/deduction`, {
        method: "POST",
        body: JSON.stringify({
          basis: ddBasis,
          ...(ddBasis === "weight_shortage" ? { shortageKg: measure } : { delayHours: measure }),
          reason: ddReason.trim(),
        }),
      });
      toast({ title: "تم إبلاغ الخصم" });
      setShowDriverDeduction(false); setDdMeasure(""); setDdReason("");
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الإبلاغ", description: getErrorMessage(e) });
    } finally {
      setSubmittingDd(false);
    }
  }

  // Build external Google Maps deep link for fallback.
  const fromCoords = session.originLat != null && session.originLng != null
    ? `${session.originLat},${session.originLng}` : null;
  const toCoords = session.destinationLat != null && session.destinationLng != null
    ? `${session.destinationLat},${session.destinationLng}` : null;
  // Target the appropriate destination depending on the current state.
  const isLeg1 = ["active"].includes(session.status);
  const navTarget = isLeg1 ? fromCoords : toCoords;
  const externalLink = navTarget
    ? `https://www.google.com/maps/dir/?api=1&destination=${navTarget}&travelmode=driving`
    : null;

  return (
    <PageShell
      title="الملاحة"
      subtitle={`حجز #${session.bookingNumber}`}
      breadcrumbs={[{ href: "/me/driver", label: "السائق" }, { label: "الملاحة" }]}
      actions={
        <Button asChild variant="outline" size="sm"><Link href="/me/driver">
            <ArrowLeft className="h-4 w-4 me-1" />العودة
          </Link></Button>
      }
    >
      <FleetTabsNav />
      {/* Hero status card */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Navigation className="h-5 w-5 text-status-info-foreground" />
            <Badge className={statusLabel("navigation", session.status).tone}>
              {statusLabel("navigation", session.status).label}
            </Badge>
            <span className="ms-auto text-xs text-muted-foreground">
              المزود: {session.provider}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-md bg-surface-subtle">
              <div className="text-xs text-muted-foreground mb-1">من</div>
              <div className="font-medium">{session.fromLocationText ?? "—"}</div>
              {fromCoords && (
                <div className="text-[10px] text-muted-foreground font-mono mt-1">{fromCoords}</div>
              )}
            </div>
            <div className="p-3 rounded-md bg-surface-subtle">
              <div className="text-xs text-muted-foreground mb-1">إلى</div>
              <div className="font-medium">{session.toLocationText ?? "—"}</div>
              {toCoords && (
                <div className="text-[10px] text-muted-foreground font-mono mt-1">{toCoords}</div>
              )}
            </div>
          </div>

          {/* Maps Provider Adapter (owner brief 2026-06-15) — until the
              in-app map widget lands (Phase 2), the primary action
              for the driver is the "ابدأ الملاحة" button that opens
              Google Maps directly. The deep link is keyless, so it
              works whether or not a Google API key is configured on
              the server. The driver never has to leave-and-search:
              the destination is pre-filled. */}
          <div className="mt-3 rounded-md border-2 border-dashed border-status-info-foreground/30 bg-status-info-surface/30 p-6 text-center">
            <MapPin className="h-12 w-12 mx-auto text-status-info-foreground/40 mb-2" />
            <div className="text-sm text-muted-foreground">
              خريطة الملاحة الداخلية ستظهر هنا فور تفعيل المزود
            </div>
            {session.lastLat != null && session.lastLng != null && (
              <div className="text-xs text-muted-foreground mt-2">
                موقعك الحالي: {Number(session.lastLat).toFixed(5)}, {Number(session.lastLng).toFixed(5)}
              </div>
            )}
            {externalLink ? (
              <Button
                asChild
                size="lg"
                className="mt-4 w-full sm:w-auto"
                data-testid="start-navigation-button"
              >
                <a href={externalLink} target="_blank" rel="noreferrer">
                  <Navigation className="h-5 w-5 me-2" />
                  ابدأ الملاحة
                  <ExternalLink className="h-3 w-3 ms-2 opacity-70" />
                </a>
              </Button>
            ) : (
              <div className="mt-4 text-xs text-muted-foreground">
                إحداثيات الوجهة غير متوفرة — راجع التحكم لتثبيت الإحداثيات على الحجز.
              </div>
            )}
          </div>

          {/* ETA + distance pills */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 rounded-md bg-surface-subtle flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">الوصول المتوقع</span>
              <span className="ms-auto font-mono">{formatDuration(session.etaSeconds)}</span>
            </div>
            <div className="p-2 rounded-md bg-surface-subtle flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">المسافة المتبقية</span>
              <span className="ms-auto font-mono">{formatDistance(session.remainingMeters)}</span>
            </div>
          </div>

          {/* Next-step CTA */}
          <div className="mt-4 flex items-center gap-2">
            {next ? (
              <Button onClick={advance} disabled={advancing} className="flex-1" size="lg" rateLimitAware>
                {(() => { const Icon = next.icon; return <Icon className="h-5 w-5 me-2" />; })()}
                {advancing ? "جاري التحديث…" : next.label}
              </Button>
            ) : !isFinished ? (
              <Button onClick={complete} size="lg" className="flex-1" rateLimitAware>
                <CheckCircle2 className="h-5 w-5 me-2" />إنهاء المهمة
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground text-center w-full">
                المهمة منتهية. شكراً لجهدك.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* شريحة تطبيق السائق — تسجيل وقائع الرحلة (تحميل/خروج/وصول/فحص/تفريغ +
          وزن + إثبات POD) على نفس سجل fleet_trip_events عبر المكوّن المشترك،
          على endpoint السائق (مفلتر بملكية أمر التوزيع). */}
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تسجيل وقائع الرحلة</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <TripEventRecorder
            endpoint={`/transport/dispatch-orders/${session.dispatchOrderId}/trip-event`}
            executable={!isFinished}
            disabledHint="المهمة منتهية — لا يمكن تسجيل وقائع جديدة."
            onRecorded={() => refetch()}
          />
        </CardContent>
      </Card>

      {/* شريحة 3 — تسليم العهدة لسائق آخر (يُعيد إسناد المهمة بعد فحص الأهلية). */}
      {!isFinished && (
        <Card className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>تسليم العهدة</span>
              <Button
                size="sm"
                variant={showHandover ? "default" : "outline"}
                onClick={() => (showHandover ? setShowHandover(false) : openHandover())}
              >
                {showHandover ? "إلغاء" : "تسليم لسائق آخر"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showHandover && (
            <CardContent className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-24">السائق المستلِم</label>
                <select
                  className="h-8 text-sm border rounded-md px-2 min-w-[12rem] bg-background"
                  value={incomingDriverId}
                  onChange={(e) => setIncomingDriverId(e.target.value)}
                >
                  <option value="">— اختر —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-24">إثبات الحالة</label>
                <input
                  type="file" accept="image/*" capture="environment"
                  disabled={uploadingHandover}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHandoverProof(f); e.currentTarget.value = ""; }}
                  className="text-xs"
                />
                <span className="text-xs text-muted-foreground">
                  {uploadingHandover ? "جاري الرفع…" : `${handoverProof.length} صورة`} — مطلوبة
                </span>
              </div>
              <Input
                value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="ملاحظة (اختياري)" className="h-8 text-sm"
              />
              <Button size="sm" onClick={submitHandover} disabled={submittingHandover || uploadingHandover}>
                {submittingHandover ? "جاري التسليم…" : "تأكيد تسليم العهدة"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* شريحة 4 — إبلاغ السائق عن خصم نقص/تأخير (المبلغ يُحسب من المعدّل؛
          المالية تُصدر إشعار الدائن). مرشّح تشغيلي — لا قيد من السائق. */}
      {!isFinished && (
        <Card className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>إبلاغ خصم (نقص/تأخّر)</span>
              <Button
                size="sm"
                variant={showDriverDeduction ? "default" : "outline"}
                onClick={() => setShowDriverDeduction(!showDriverDeduction)}
              >
                {showDriverDeduction ? "إلغاء" : "إبلاغ"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showDriverDeduction && (
            <CardContent className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">السبب</label>
                <select
                  className="h-8 text-sm border rounded-md px-2 bg-background"
                  value={ddBasis}
                  onChange={(e) => setDdBasis(e.target.value as "weight_shortage" | "delay")}
                >
                  <option value="weight_shortage">نقص وزن</option>
                  <option value="delay">تأخّر</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">
                  {ddBasis === "weight_shortage" ? "النقص (كغم)" : "التأخّر (ساعة)"}
                </label>
                <Input type="number" min="0" value={ddMeasure} onChange={(e) => setDdMeasure(e.target.value)} className="w-32 h-8" />
              </div>
              <Input value={ddReason} onChange={(e) => setDdReason(e.target.value)} placeholder="السبب التفصيلي" className="h-8 text-sm" />
              <div className="text-[11px] text-muted-foreground">
                يُحسب المبلغ من المعدّل المُعدّ؛ المالية تُصدر إشعار الدائن.
              </div>
              <Button size="sm" onClick={submitDriverDeduction} disabled={submittingDd}>
                {submittingDd ? "جاري الإبلاغ…" : "إرسال الإبلاغ"}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Lifecycle timeline */}
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">سجل المراحل</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2 text-xs">
          <TimelineRow icon={Play} label="بدأت الرحلة" at={session.startedAt} />
          <TimelineRow icon={MapPin} label="وصلت موقع التحميل" at={session.arrivedPickupAt} />
          <TimelineRow icon={Package} label="تم التحميل" at={session.loadedAt} />
          <TimelineRow icon={MapPin} label="وصلت موقع التسليم" at={session.arrivedDropoffAt} />
          <TimelineRow icon={CheckCircle2} label="تم التسليم" at={session.deliveredAt} />
          <TimelineRow icon={AlertCircle} label="انتهت المهمة" at={session.endedAt} />
        </CardContent>
      </Card>
    </PageShell>
  );
}

function TimelineRow({
  icon: Icon, label, at,
}: { icon: typeof CheckCircle2; label: string; at: string | null }) {
  const reached = at != null;
  return (
    <div className={`flex items-center gap-2 ${reached ? "" : "opacity-40"}`}>
      <Icon className={`h-4 w-4 ${reached ? "text-status-success-foreground" : "text-muted-foreground"}`} />
      <span>{label}</span>
      <span className="ms-auto font-mono text-[10px] text-muted-foreground">
        {at ? new Date(at).toLocaleTimeString("ar") : "—"}
      </span>
    </div>
  );
}
