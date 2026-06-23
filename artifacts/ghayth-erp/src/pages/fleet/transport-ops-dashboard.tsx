import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import {
  Calendar, Clock, AlertCircle, CheckCircle2, Truck, Users, Activity,
  ArrowLeft, Wand2,
} from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { todayLocal } from "@/lib/formatters";

// #1812 — لوحة تشغيل اليوم. Wraps GET /transport/ops-dashboard which
// returns the full operational picture for a day: trips in progress,
// late, unassigned bookings, vehicle/driver availability rollups.
//
// The dispatcher's landing page for daily ops — answers the user's
// "النظام يخدم المستخدم" mandate: instead of digging through 3 lists,
// the operator sees today's reality at a glance.

interface OpsTrip {
  id: number;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  driverId: number;
  vehicleId: number;
  vehiclePlate: string | null;
  driverName: string | null;
  bookingId: number;
  bookingNumber: string;
  transportServiceType: string;
  fromLocationText: string | null;
  toLocationText: string | null;
}

interface OpsUnassigned {
  id: number;
  bookingNumber: string;
  transportServiceType: string;
  customerName: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  pickupWindowStart: string | null;
  fixedAppointmentTime: string | null;
  priority: number;
  status: string;
}

interface OpsDashboard {
  date: string;
  counters: {
    totalTrips: number;
    inProgress: number;
    late: number;
    completed: number;
    unassigned: number;
  };
  trips: OpsTrip[];
  late: OpsTrip[];
  unassigned: OpsUnassigned[];
  vehiclesByStatus: Record<string, number>;
  driversByStatus: Record<string, number>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار",
  notified: "تم الإبلاغ",
  accepted: "قَبِل",
  declined: "رفض",
  executing: "جاري التنفيذ",
  completed: "اكتمل",
  closed: "مغلق",
  cancelled: "ملغى",
};

const STATUS_TONE: Record<string, string> = {
  pending:   "bg-status-info-surface text-status-info-foreground",
  notified:  "bg-status-info-surface text-status-info-foreground",
  accepted:  "bg-purple-50 text-purple-700",
  declined:  "bg-rose-100 text-rose-700",
  executing: "bg-status-warning-surface text-status-warning-foreground",
  completed: "bg-status-success-surface text-status-success-foreground",
  closed:    "bg-surface-subtle text-muted-foreground",
  cancelled: "bg-surface-subtle text-muted-foreground",
};

const SERVICE_LABEL: Record<string, string> = {
  cargo_load: "نقل حمولة",
  passenger_umrah: "نقل معتمرين",
  passenger_general: "نقل ركاب",
  equipment_rental: "تأجير معدة",
  internal_transfer: "نقل داخلي",
  other: "أخرى",
};

function formatHourMinute(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface VehicleUtil {
  vehicleId: number;
  plateNumber: string | null;
  vehicleType: string | null;
  bookedMinutes: number;
  tripCount: number;
  utilisation: number;
}

interface WeeklyData {
  startDate: string;
  endDate: string;
  daily: Array<{ day: string; total: string; completed: string; cancelled: string; late: string }>;
  vehicleUtilisation: VehicleUtil[];
}

export default function TransportOpsDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(todayLocal());
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [planningAll, setPlanningAll] = useState(false);
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: OpsDashboard }>(
    ["transport-ops-dashboard", date],
    `/transport/ops-dashboard?date=${date}`,
  );

  const planAllUnassigned = async () => {
    if (!data?.data?.unassigned?.length) return;
    const ids = data.data.unassigned.map((b) => b.id);
    if (!confirm(`تخطيط ${ids.length} حجزاً غير مسند تلقائياً (سيقترح النظام مركبة وسائق لكل حجز)؟`)) return;
    setPlanningAll(true);
    try {
      const res = await apiFetch<{ data: { summary: {
        total: number; planned: number; needsAttention: number;
        noCandidate: number; noLine: number; skipped: number;
      } } }>("/transport/integration/plan-bookings", {
        method: "POST",
        body: JSON.stringify({ bookingIds: ids }),
      });
      const s = res?.data?.summary;
      toast({
        title: `تم تخطيط ${s?.planned ?? 0} من ${s?.total ?? 0} حجوزات`,
        description: s && s.needsAttention > 0
          ? `${s.needsAttention} يحتاج تدخلاً يدوياً — افتح لوحة التوزيع.`
          : undefined,
      });
      qc.invalidateQueries({ queryKey: ["transport-ops-dashboard", date] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر التخطيط", description: message });
    } finally {
      setPlanningAll(false);
    }
  };
  const weekly = useApiQuery<{ data: WeeklyData }>(
    ["transport-ops-weekly", date],
    tab === "weekly" ? `/transport/ops-weekly?startDate=${date}` : null,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;

  const vehicleUtilColumns: DataTableColumn<VehicleUtil>[] = [
    {
      key: "plateNumber",
      header: "المركبة",
      className: "font-mono",
      render: (v) => v.plateNumber ?? `#${v.vehicleId}`,
    },
    {
      key: "vehicleType",
      header: "النوع",
      className: "text-xs",
      render: (v) => v.vehicleType ?? "—",
    },
    {
      key: "tripCount",
      header: "عدد الرحلات",
      className: "font-mono",
      render: (v) => v.tripCount,
    },
    {
      key: "bookedMinutes",
      header: "الدقائق المحجوزة",
      className: "font-mono",
      render: (v) => v.bookedMinutes,
    },
    {
      key: "utilisation",
      header: "الاستغلال %",
      className: "font-mono",
      render: (v) => `${Number(v.utilisation) || 0}%`,
    },
    {
      key: "indicator",
      header: "المؤشر",
      sortable: false,
      render: (v) => {
        const util = Number(v.utilisation) || 0;
        const tone = util >= 60 ? "bg-status-success-surface text-status-success-foreground" :
                     util >= 30 ? "bg-status-warning-surface text-status-warning-foreground" :
                     util > 0   ? "bg-status-info-surface text-status-info-foreground" :
                                  "bg-surface-subtle text-muted-foreground";
        return (
          <Badge className={tone}>
            {util >= 60 ? "مرتفع" :
             util >= 30 ? "متوسط" :
             util > 0   ? "منخفض" : "خامل"}
          </Badge>
        );
      },
    },
  ];

  const dash = data.data;
  const vehiclesAvailable = dash.vehiclesByStatus.available ?? 0;
  const vehiclesInUse     = dash.vehiclesByStatus.in_use ?? 0;
  const vehiclesMaint     = dash.vehiclesByStatus.maintenance ?? 0;
  const vehiclesOOS       = dash.vehiclesByStatus.out_of_service ?? 0;
  const vehiclesTotal     = vehiclesAvailable + vehiclesInUse + vehiclesMaint + vehiclesOOS;
  const utilizationPct = vehiclesTotal > 0
    ? Math.round((vehiclesInUse / vehiclesTotal) * 100)
    : 0;

  const driversActive = dash.driversByStatus.active ?? 0;
  const driversOnLeave = dash.driversByStatus.on_leave ?? 0;
  const driversTotal = driversActive + driversOnLeave;

  return (
    <PageShell
      title="لوحة تشغيل اليوم"
      subtitle="نظرة موحّدة على رحلات اليوم، التعارضات، التأخيرات، والمركبات/السائقين المتاحين"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "لوحة تشغيل اليوم" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/dispatch">
              <Calendar className="h-4 w-4 me-1" />لوحة التوزيع
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/bookings">
              <ArrowLeft className="h-4 w-4 me-1" />العودة للحجوزات
            </Link></Button>
        </div>
      }
    >
      <FleetTabsNav />

      <div className="mt-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 px-3 rounded-md border bg-background text-sm"
        />
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "daily" | "weekly")} className="mt-3">
        <TabsList>
          <TabsTrigger value="daily">يومي</TabsTrigger>
          <TabsTrigger value="weekly">أسبوعي + استغلال الأسطول</TabsTrigger>
        </TabsList>
        <TabsContent value="weekly" className="mt-3">
          {weekly.isLoading ? (
            <LoadingSpinner />
          ) : weekly.data?.data ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-status-info-foreground" />
                    توزيع الأسبوع
                    <span className="ms-auto text-xs font-normal text-muted-foreground">
                      {weekly.data.data.startDate} → {weekly.data.data.endDate}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid grid-cols-7 gap-2 text-center">
                    {weekly.data.data.daily.map((d) => {
                      const total = Number(d.total);
                      const completed = Number(d.completed);
                      const late = Number(d.late);
                      const cancelled = Number(d.cancelled);
                      const ratio = total > 0 ? Math.round((completed / total) * 100) : 0;
                      const isWarning = late > 0;
                      return (
                        <div key={d.day} className={`p-2 rounded-md border ${
                          isWarning ? "border-rose-300 bg-rose-50" : total > 0 ? "bg-status-info-surface" : "bg-surface-subtle"
                        }`}>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {d.day.slice(5)}
                          </div>
                          <div className="text-xl font-bold mt-1">{total}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {completed > 0 && <span className="text-status-success-foreground">{completed} ✓ </span>}
                            {late > 0 && <span className="text-rose-600">{late} متأخر </span>}
                            {cancelled > 0 && <span className="text-muted-foreground">{cancelled} ملغى</span>}
                          </div>
                          {total > 0 && (
                            <div className="text-[10px] mt-1 text-muted-foreground">{ratio}% مكتمل</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Truck className="h-4 w-4 text-status-info-foreground" />
                    استغلال الأسطول
                    <span className="ms-auto text-xs font-normal text-muted-foreground">
                      مرتّب حسب الاستغلال الأعلى → الأقل
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={vehicleUtilColumns}
                    data={weekly.data.data.vehicleUtilisation}
                    rowKey={(v) => v.vehicleId}
                    noToolbar
                    emptyMessage="لا توجد بيانات استغلال في هذه الفترة"
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <ErrorState />
          )}
        </TabsContent>
        <TabsContent value="daily" className="mt-3">

      {/* KPI grid */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">إجمالي رحلات اليوم</div>
            <div className="text-2xl font-bold mt-1">{dash.counters.totalTrips}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Activity className="h-3 w-3" />قيد التنفيذ
            </div>
            <div className="text-2xl font-bold mt-1 text-status-warning-foreground">
              {dash.counters.inProgress}
            </div>
          </CardContent>
        </Card>
        <Card className={dash.counters.late > 0 ? "border-rose-300" : ""}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />متأخر
            </div>
            <div className={`text-2xl font-bold mt-1 ${dash.counters.late > 0 ? "text-rose-600" : ""}`}>
              {dash.counters.late}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />مكتمل
            </div>
            <div className="text-2xl font-bold mt-1 text-status-success-foreground">
              {dash.counters.completed}
            </div>
          </CardContent>
        </Card>
        <Card className={dash.counters.unassigned > 0 ? "border-status-warning-foreground" : ""}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Wand2 className="h-3 w-3" />غير مسند
            </div>
            <div className={`text-2xl font-bold mt-1 ${dash.counters.unassigned > 0 ? "text-status-warning-foreground" : ""}`}>
              {dash.counters.unassigned}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />الاستغلال
            </div>
            <div className="text-2xl font-bold mt-1">{utilizationPct}%</div>
            <div className="text-[10px] text-muted-foreground">
              {vehiclesInUse}/{vehiclesTotal} مركبة
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two columns: Late + Unassigned */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className={dash.late.length > 0 ? "border-rose-300" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              رحلات متأخرة
              <span className="ms-auto text-xs font-normal text-muted-foreground">
                {dash.late.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {dash.late.length === 0 ? (
              <div className="text-xs text-center py-4 text-muted-foreground">
                لا توجد رحلات متأخرة
              </div>
            ) : (
              dash.late.map((t) => (
                <Link key={t.id} href={`/fleet/transport/bookings/${t.bookingId}`} asChild>
                  <a className="block p-2 rounded-md border bg-rose-50 border-rose-200 hover:bg-rose-100 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono">حجز #{t.bookingNumber}</span>
                      <Badge variant="outline" className={STATUS_TONE[t.status]}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatHourMinute(t.scheduledStartAt)}
                      </span>
                      {t.vehiclePlate && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Truck className="h-3 w-3" />{t.vehiclePlate}
                        </span>
                      )}
                      {t.driverName && <span>{t.driverName}</span>}
                    </div>
                  </a>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={dash.unassigned.length > 0 ? "border-status-warning-foreground" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-status-warning-foreground" />
              حجوزات غير مسندة
              {dash.unassigned.length > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={planAllUnassigned}
                  disabled={planningAll}
                  className="h-7 text-xs"
                  rateLimitAware
                >
                  <Wand2 className="h-3 w-3 me-1" />
                  {planningAll ? "جاري التخطيط…" : "خطّط الكل"}
                </Button>
              )}
              <span className="ms-auto text-xs font-normal text-muted-foreground">
                {dash.unassigned.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {dash.unassigned.length === 0 ? (
              <div className="text-xs text-center py-4 text-muted-foreground">
                لا توجد حجوزات بانتظار الإسناد لهذا اليوم
              </div>
            ) : (
              dash.unassigned.map((b) => (
                <Link key={b.id} href={`/fleet/transport/bookings/${b.id}`} asChild>
                  <a className="block p-2 rounded-md border bg-status-warning-surface border-status-warning-foreground/30 hover:bg-status-warning-surface/80 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono">حجز #{b.bookingNumber}</span>
                      {b.priority > 0 && (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700">
                          أولوية {b.priority}
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground space-y-0.5">
                      <div>{SERVICE_LABEL[b.transportServiceType] ?? b.transportServiceType}</div>
                      {(b.fromLocationText || b.toLocationText) && (
                        <div className="text-[10px]">
                          {b.fromLocationText ?? "—"} ← {b.toLocationText ?? "—"}
                        </div>
                      )}
                      {(b.pickupWindowStart || b.fixedAppointmentTime) && (
                        <div className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatHourMinute(b.fixedAppointmentTime ?? b.pickupWindowStart)}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-status-info-foreground">
                      اضغط لاقتراح المركبة والسائق
                    </div>
                  </a>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Availability rollups */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4 text-status-info-foreground" />
              حالة المركبات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between p-2 rounded-md bg-status-success-surface">
              <span>متاحة</span><span className="font-mono">{vehiclesAvailable}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-status-warning-surface">
              <span>قيد الاستخدام</span><span className="font-mono">{vehiclesInUse}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-purple-50">
              <span>صيانة</span><span className="font-mono">{vehiclesMaint}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-rose-50">
              <span>خارج الخدمة</span><span className="font-mono">{vehiclesOOS}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-status-info-foreground" />
              حالة السائقين
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between p-2 rounded-md bg-status-success-surface">
              <span>نشط</span><span className="font-mono">{driversActive}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-purple-50">
              <span>في إجازة</span><span className="font-mono">{driversOnLeave}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between p-2 rounded-md bg-surface-subtle">
              <span>الإجمالي</span><span className="font-mono">{driversTotal}</span>
            </div>
          </CardContent>
        </Card>
      </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
