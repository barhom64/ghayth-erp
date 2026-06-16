import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { DetailPageLayout, type ExtraTab } from "@workspace/entity-kit";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  MapPin,
  User,
  Truck,
  Activity,
  Fuel,
  Wrench,
  FolderOpen,
  History,
  MessageCircle,
  Clock,
  Gauge,
  DollarSign,
  Radio,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

export default function TripDetailPage() {
  const [, params] = useRoute("/fleet/trips/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("fleet_trip", id);
  const queryClient = useQueryClient();

  const { data: trip, isLoading, isError, refetch } = useApiQuery<any>(
    ["fleet-trip", id],
    id ? `/fleet/trips/${id}` : null,
    !!id
  );

  // PATCH + DELETE wired through the shared edit/delete hook. Backend
  // accepts fromLocation/toLocation/destination/status/notes/cost.
  const editDelete = useDetailEditDelete({
    entityLabel: "الرحلة",
    patchPath: `/fleet/trips/${id}`,
    deletePath: `/fleet/trips/${id}`,
    listPath: "/fleet/trips",
    initialValues: trip,
    fields: [
      { key: "fromLocation", label: "نقطة الانطلاق" },
      { key: "toLocation", label: "الوجهة" },
      { key: "destination", label: "موقع آخر" },
      { key: "notes", label: "ملاحظات" },
      { key: "cost", label: "التكلفة", type: "number" },
    ],
    invalidateKeys: [["fleet-trip", id], ["trips"]],
    onSaved: () => refetch(),
  });

  const { data: fuelResp } = useApiQuery<any>(
    ["trip-fuel", id],
    id ? `/fleet/fuel-logs?tripId=${id}` : null,
    !!id
  );
  const allFuel: any[] = fuelResp?.data || [];
  const fuelLogs = useMemo(
    () =>
      allFuel.filter(
        (f) =>
          String(f.tripId ?? "") === String(id) ||
          (trip && String(f.vehicleId) === String(trip.vehicleId))
      ),
    [allFuel, trip, id]
  );

  const { data: maintResp } = useApiQuery<any>(
    ["trip-maintenance", id],
    id && trip?.vehicleId ? `/fleet/maintenance?vehicleId=${trip.vehicleId}` : null,
    !!(id && trip?.vehicleId)
  );

  // Live telematics for the trip's vehicle. Enabled only while the trip is
  // in-progress or scheduled (no point polling for completed trips). React
  // Query caches it; the operator can hit "تحديث" or re-open the tab for
  // fresh data. (No setInterval — the trip page is heavy enough already.)
  const liveEnabled = !!trip?.vehicleId
    && (trip.status === "in_progress" || trip.status === "scheduled");
  const { data: liveResp, refetch: refetchLive } = useApiQuery<any>(
    ["trip-telematics-live", id, String(trip?.vehicleId ?? "")],
    trip?.vehicleId ? `/fleet/telematics/vehicles/${trip.vehicleId}/live` : null,
    liveEnabled,
  );
  const live = liveResp?.data;

  const allMaint: any[] = maintResp?.data || [];
  const maintenance = useMemo(
    () =>
      allMaint.filter((m) => {
        if (!trip) return false;
        if (String(m.vehicleId) !== String(trip.vehicleId)) return false;
        const mDate = m.date || m.serviceDate || m.createdAt;
        const start = trip.startTime || trip.tripDate;
        const end = trip.endTime || new Date().toISOString();
        if (!mDate || !start) return false;
        const t = new Date(mDate).getTime();
        return t >= new Date(start).getTime() && t <= new Date(end).getTime();
      }),
    [allMaint, trip]
  );

  const distance = Number(trip?.distance) || 0;
  const cost = Number(trip?.cost) || 0;
  const fuelConsumed = fuelLogs.reduce((s, f) => s + (Number(f.liters) || Number(f.quantity) || 0), 0);
  const durationHours = useMemo(() => {
    if (!trip?.startTime) return 0;
    const end = trip.endTime ? new Date(trip.endTime).getTime() : Date.now();
    return Math.max(0, Math.round(((end - new Date(trip.startTime).getTime()) / (1000 * 60 * 60)) * 10) / 10);
  }, [trip]);

  const fuelColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.fillDate || r.createdAt) },
    { key: "liters", header: "اللترات", sortable: true, render: (r) => r.liters || r.quantity || 0 },
    { key: "cost", header: "التكلفة", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.cost) || Number(r.amount) || 0)}</span> },
  ];

  const maintColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.serviceDate || r.createdAt) },
    { key: "type", header: "النوع", sortable: true, render: (r) => r.type || r.serviceType || "-" },
    { key: "cost", header: "التكلفة", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.cost) || 0)}</span> },
  ];

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const handleComplete = async () => {
    try {
      // FLT-001: trip lifecycle is driven by the dedicated endpoint, not a
      // raw PATCH of `status` — the server rejects a terminal status via
      // PATCH with 409. /complete computes cost, posts the GL entry and
      // frees the vehicle + driver. completeTripSchema is all-optional, so
      // an empty body completes the trip with no extra metering data.
      await apiFetch(`/fleet/trips/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      queryClient.invalidateQueries({ queryKey: ["fleet-trip", id] });
      toast({ title: "تم إكمال الرحلة بنجاح" });
      refetch();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذر إكمال الرحلة",
        description: err.message || "حدث خطأ",
      });
    }
  };

  // POST /fleet/trips/:id/waypoints — append an intermediate waypoint
  // (lat/lon required by backend zod schema). Uses the browser's
  // geolocation API to read the dispatcher's current position; the driver
  // would typically be the one posting from the mobile app, but the
  // desktop dispatcher can also record an ad-hoc stop.
  const handleAddWaypoint = async () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "الموقع الجغرافي غير متاح في هذا المتصفح" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch(`/fleet/trips/${id}/waypoints`, {
            method: "POST",
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              speed: pos.coords.speed ?? undefined,
            }),
          });
          queryClient.invalidateQueries({ queryKey: ["fleet-trip", id] });
          toast({ title: "تمت إضافة النقطة" });
        } catch (err: any) {
          toast({ variant: "destructive", title: "تعذر إضافة النقطة", description: err.message });
        }
      },
      (err) => {
        toast({ variant: "destructive", title: "فشل قراءة الموقع", description: err.message });
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  };

  // Cancellation dialog state — FLT-001 requires a non-empty reason.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const handleCancel = () => {
    setCancelReason("");
    setCancelOpen(true);
  };
  const confirmCancel = async () => {
    if (!cancelReason.trim()) {
      toast({ variant: "destructive", title: "سبب الإلغاء مطلوب" });
      return;
    }
    setCancelOpen(false);
    try {
      await apiFetch(`/fleet/trips/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ["fleet-trip", id] });
      toast({ title: "تم إلغاء الرحلة" });
      navigate("/fleet/trips");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذر إلغاء الرحلة",
        description: err.message || "حدث خطأ",
      });
    }
  };

  const overview = (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-status-info-foreground bg-status-info-surface">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{distance} كم</p>
              <p className="text-xs text-muted-foreground truncate">المسافة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-purple-600 bg-purple-50">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{durationHours} س</p>
              <p className="text-xs text-muted-foreground truncate">المدة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-orange-600 bg-orange-50">
              <Fuel className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{fuelConsumed} ل</p>
              <p className="text-xs text-muted-foreground truncate">الوقود المستهلك</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-status-success-foreground bg-status-success-surface">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{formatCurrency(cost)}</p>
              <p className="text-xs text-muted-foreground truncate">التكلفة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="السائق" value={trip?.driverName} />
            <InfoRow label="المركبة" value={trip?.plateNumber || trip?.vehiclePlate} />
            <InfoRow label="من" value={trip?.fromLocation || trip?.origin} />
            <InfoRow label="إلى" value={trip?.toLocation || trip?.destination} />
            <InfoRow label="وقت البداية" value={trip?.startTime ? formatDateAr(trip.startTime) : undefined} />
            <InfoRow label="وقت النهاية" value={trip?.endTime ? formatDateAr(trip.endTime) : undefined} />
            <InfoRow label="المسافة" value={distance ? `${distance} كم` : undefined} />
            <InfoRow label="الحالة" value={trip?.status} />
          </div>
          {trip?.notes && (
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm text-status-neutral-foreground whitespace-pre-wrap">{trip.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <GuardedButton
        perm="fleet:create"
        size="sm"
        onClick={handleComplete}
        disabled={trip?.status === "completed" || trip?.status === "cancelled"}
        className="gap-1"
      >
        <CheckCircle2 className="h-4 w-4" />
        إكمال
      </GuardedButton>
      <GuardedButton
        perm="fleet:create"
        size="sm"
        variant="outline"
        onClick={handleCancel}
        disabled={trip?.status === "completed" || trip?.status === "cancelled"}
        className="gap-1"
      >
        <XCircle className="h-4 w-4" />
        إلغاء
      </GuardedButton>
      <GuardedButton
        perm="fleet:update"
        size="sm"
        variant="outline"
        onClick={handleAddWaypoint}
        disabled={trip?.status === "completed" || trip?.status === "cancelled"}
        rateLimitAware
      >
        + نقطة
      </GuardedButton>
      <PrintButton entityType="fleet_trip" entityId={id ?? ""} />
      <DetailActionButtons hook={editDelete} editPerm="fleet:create" deletePerm="fleet:delete" />
    </div>
  );

  const statusTone = trip?.status === "completed" ? "success" as const
    : trip?.status === "cancelled" ? "destructive" as const
    : trip?.status === "in_progress" ? "info" as const
    : "default" as const;

  const extraTabs: ExtraTab[] = [
    {
      key: "live",
      label: "تتبع مباشر",
      icon: Radio,
      content: () => {
        if (!trip?.vehicleId) return emptyMsg("لا توجد مركبة مرتبطة بهذه الرحلة");
        if (!liveEnabled) {
          return emptyMsg("التتبع المباشر متاح فقط للرحلات الجارية أو المجدولة");
        }
        if (!live?.device) {
          return emptyMsg("هذه المركبة لا تحتوي على جهاز MDVR مرتبط — اربط جهاز من شاشة الأجهزة");
        }
        const pos = live.position;
        const events = (live.events || []) as any[];
        const alerts = (live.alerts || []) as any[];
        return (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Radio className="w-4 h-4 text-status-info-foreground" />
                    آخر موقع
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchLive()}>تحديث</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/fleet/telematics/live-map?vehicleId=${trip.vehicleId}`)}
                    >
                      <MapPin className="w-3 h-3 me-1" />
                      الخريطة المباشرة
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">السرعة</p><p className="font-mono">{pos?.speed != null ? `${Number(pos.speed).toFixed(0)} كم/س` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">الموقع</p><p className="font-mono text-xs">{pos?.lat != null ? `${Number(pos.lat).toFixed(5)}, ${Number(pos.lng).toFixed(5)}` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">الاتجاه</p><p className="font-mono">{pos?.direction != null ? `${Number(pos.direction).toFixed(0)}°` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">آخر تحديث</p><p className="text-xs">{pos?.occurredAt ? formatDateAr(pos.occurredAt) : "—"}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-purple-600" />
                  أحدث الأحداث ({events.length})
                </h3>
                {events.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4 text-sm">لا أحداث</p>
                ) : (
                  <DataTable
                    columns={[
                      { key: "occurredAt", header: "الوقت", render: (e: any) => <span className="text-xs">{formatDateAr(e.occurredAt)}</span> },
                      { key: "eventType", header: "النوع", render: (e: any) => e.eventType },
                      { key: "severity", header: "الخطورة", render: (e: any) => <span className="text-xs">{e.severity || "—"}</span> },
                    ]}
                    data={events}
                    noToolbar
                    pageSize={0}
                    searchPlaceholder={null}
                  />
                )}
              </CardContent>
            </Card>
            {alerts.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-rose-600" />
                    تنبيهات السلامة الذكية ({alerts.length})
                  </h3>
                  <DataTable
                    columns={[
                      { key: "occurredAt", header: "الوقت", render: (a: any) => <span className="text-xs">{formatDateAr(a.occurredAt)}</span> },
                      { key: "category", header: "الفئة", render: (a: any) => a.category },
                      { key: "alertType", header: "التنبيه", render: (a: any) => a.alertType },
                      { key: "severity", header: "الخطورة", render: (a: any) => <span className="text-xs">{a.severity}</span> },
                    ]}
                    data={alerts}
                    noToolbar
                    pageSize={0}
                    searchPlaceholder={null}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        );
      },
    },
    {
      key: "fuel",
      label: "سجلات الوقود",
      icon: Fuel,
      badge: fuelLogs.length || undefined,
      content: () =>
        fuelLogs.length === 0
          ? emptyMsg("لا توجد سجلات وقود لهذه الرحلة")
          : <DataTable columns={fuelColumns} data={fuelLogs} pageSize={10} emptyMessage="لا توجد سجلات" noToolbar />,
    },
    {
      key: "maintenance",
      label: "الصيانة",
      icon: Wrench,
      badge: maintenance.length || undefined,
      content: () =>
        maintenance.length === 0
          ? emptyMsg("لا توجد أعمال صيانة خلال هذه الرحلة")
          : <DataTable columns={maintColumns} data={maintenance} pageSize={10} emptyMessage="لا توجد صيانة" noToolbar />,
    },
  ];

  return (
    <>
    <DetailPageLayout
      title={trip ? `رحلة #${trip.id}` : "الرحلة"}
      subtitle={trip ? `${trip.fromLocation || trip.origin || ""} → ${trip.toLocation || trip.destination || ""}` : undefined}
      backPath="/fleet/trips"
      backLabel="العودة للرحلات"
      status={trip?.status ? { label: trip.status, tone: statusTone } : undefined}
      entityType="fleet_trip"
      entityId={id}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      createdAt={trip?.createdAt}
      updatedAt={trip?.updatedAt}
      overview={overview}
      actions={actions}
      extraTabs={[...extraTabs, ...registryExtraTabs]}
      hideTabs={registryHideTabs}
    />
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء الرحلة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">سبب الإلغاء (مطلوب)</Label>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelOpen(false)}>تراجع</Button>
          <Button variant="destructive" onClick={confirmCancel} rateLimitAware>تأكيد الإلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-status-neutral-foreground mt-0.5">{value || "—"}</p>
    </div>
  );
}
