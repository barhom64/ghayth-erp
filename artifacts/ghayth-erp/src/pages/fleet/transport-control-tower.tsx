import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@workspace/ui-core";
import {
  Truck, User, AlertTriangle, AlertCircle, Info, Calendar,
  CheckCircle2, Clock, Wrench, Activity, ExternalLink, RefreshCw,
} from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

// #1812 follow-up — Control Tower (the user's "أهم شاشة ناقصة").
//
// Single-page operator dashboard answering: "What's the state of my
// fleet RIGHT NOW?" — vehicles + drivers + today's dispatches +
// today's bookings + actionable alerts. Pulls from one endpoint
// `/transport/control-tower` so the operator sees coherent state.

interface ControlTowerSnapshot {
  date: string;
  vehicles: {
    total: number; available: number; inUse: number;
    maintenance: number; offDuty: number; suspended: number;
    utilizationRate: number;
  };
  drivers: {
    total: number; active: number; onDuty: number;
    onRest: number; onLeave: number; suspended: number;
    availabilityRate: number;
  };
  dispatches: {
    todayTotal: number; pending: number; notified: number;
    accepted: number; executing: number; completed: number; cancelled: number;
    lateCount: number; criticalCount: number;
  };
  bookings: {
    todayDraft: number; todayApproved: number;
    todayScheduled: number; todayCompleted: number;
    unassignedTodayCount: number;
  };
  alerts: Array<{
    severity: "info" | "warn" | "critical";
    kind: string;
    message: string;
    entityType?: string;
    entityId?: number;
  }>;
}

const todayLocal = (): string => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
};

function MetricTile({
  label, value, total, icon: Icon, color, subtext,
}: {
  label: string;
  value: number;
  total?: number;
  icon: typeof Truck;
  color: string;
  subtext?: string;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="text-3xl font-bold">{value}</div>
            {total !== undefined && (
              <div className="text-xs text-muted-foreground mt-1">
                من إجمالي {total}
              </div>
            )}
            {subtext && (
              <div className="text-xs text-muted-foreground mt-1">{subtext}</div>
            )}
          </div>
          <div className={`p-2 rounded-md ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UtilizationBar({ rate, label }: { rate: number; label: string }) {
  const barColor =
    rate >= 90 ? "bg-rose-500" :
    rate >= 70 ? "bg-status-warning-foreground" :
    rate >= 30 ? "bg-status-success-foreground" :
                 "bg-status-info-foreground";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{rate}%</span>
      </div>
      <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, rate)}%` }}
        />
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: ControlTowerSnapshot["alerts"][number] }) {
  const cfg = {
    critical: {
      bg: "bg-rose-50 border-rose-300",
      iconColor: "text-rose-600",
      Icon: AlertTriangle,
      label: "حرج",
    },
    warn: {
      bg: "bg-amber-50 border-amber-300",
      iconColor: "text-amber-600",
      Icon: AlertCircle,
      label: "تنبيه",
    },
    info: {
      bg: "bg-blue-50 border-blue-300",
      iconColor: "text-blue-600",
      Icon: Info,
      label: "ملاحظة",
    },
  }[alert.severity];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-md border ${cfg.bg}`}>
      <cfg.Icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">{cfg.label}</Badge>
          <span className="text-xs text-muted-foreground font-mono">{alert.kind}</span>
        </div>
        <div className="text-sm">{alert.message}</div>
      </div>
    </div>
  );
}

export default function TransportControlTower() {
  const [date, setDate] = useState<string>(todayLocal());

  const { data, isLoading, isError, refetch, isFetching } = useApiQuery<{ data: ControlTowerSnapshot }>(
    ["transport-control-tower", date],
    `/transport/control-tower?date=${date}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  const s = data?.data;
  if (!s) return <ErrorState />;

  return (
    <PageShell
      title="مركز تشغيل النقل (Control Tower)"
      subtitle="حالة الأسطول في لحظة واحدة — مركبات + سائقون + رحلات + تنبيهات"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { label: "مركز التشغيل" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Label htmlFor="date" className="text-xs whitespace-nowrap">التاريخ</Label>
          <Input
            id="date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-36"
          />
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            rateLimitAware
          >
            <RefreshCw className={`h-4 w-4 ml-1 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      }
    >
      <FleetTabsNav />

      {/* Alerts at the top — operator's eye should land here first */}
      {s.alerts.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-status-warning-foreground" />
              تنبيهات تشغيلية ({s.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
          </CardContent>
        </Card>
      )}
      {s.alerts.length === 0 && (
        <Card className="mb-4 border-status-success-surface bg-status-success-surface/30">
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-5 w-5 text-status-success-foreground" />
            لا توجد تنبيهات تشغيلية — كل شيء يسير حسب الخطة.
          </CardContent>
        </Card>
      )}

      {/* Vehicles section */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4" />
            المركبات ({s.vehicles.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricTile
              label="متاحة" value={s.vehicles.available}
              icon={CheckCircle2}
              color="bg-status-success-surface text-status-success-foreground"
            />
            <MetricTile
              label="في الخدمة" value={s.vehicles.inUse}
              icon={Activity}
              color="bg-status-info-surface text-status-info-foreground"
            />
            <MetricTile
              label="في الصيانة" value={s.vehicles.maintenance}
              icon={Wrench}
              color="bg-status-warning-surface text-status-warning-foreground"
            />
            <MetricTile
              label="خارج الخدمة" value={s.vehicles.offDuty}
              icon={Clock}
              color="bg-surface-subtle text-muted-foreground"
            />
            <MetricTile
              label="موقوفة" value={s.vehicles.suspended}
              icon={AlertTriangle}
              color="bg-rose-100 text-rose-700"
            />
          </div>
          <UtilizationBar
            rate={s.vehicles.utilizationRate}
            label={`استغلال الأسطول (${s.vehicles.inUse} في الخدمة من ${s.vehicles.inUse + s.vehicles.available} قابلة للإسناد)`}
          />
        </CardContent>
      </Card>

      {/* Drivers section */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            السائقون ({s.drivers.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricTile
              label="فعّالون" value={s.drivers.active}
              icon={CheckCircle2}
              color="bg-status-success-surface text-status-success-foreground"
            />
            <MetricTile
              label="في رحلة" value={s.drivers.onDuty + s.drivers.onRest}
              icon={Activity}
              color="bg-status-info-surface text-status-info-foreground"
            />
            <MetricTile
              label="في راحة" value={s.drivers.onRest}
              icon={Clock}
              color="bg-status-warning-surface text-status-warning-foreground"
            />
            <MetricTile
              label="في إجازة" value={s.drivers.onLeave}
              icon={Clock}
              color="bg-surface-subtle text-muted-foreground"
            />
            <MetricTile
              label="موقوفون" value={s.drivers.suspended}
              icon={AlertTriangle}
              color="bg-rose-100 text-rose-700"
            />
          </div>
          <UtilizationBar
            rate={s.drivers.availabilityRate}
            label="جاهزية السائقين (فعّالون لا في راحة/إجازة)"
          />
        </CardContent>
      </Card>

      {/* Today's dispatches */}
      <Card className="mb-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            رحلات اليوم ({s.dispatches.todayTotal})
          </CardTitle>
          <Link href="/fleet/transport/dispatch">
            <Button variant="outline" size="sm">
              لوحة التوزيع <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <MetricTile
            label="معلّقة" value={s.dispatches.pending}
            icon={Clock}
            color="bg-surface-subtle text-muted-foreground"
          />
          <MetricTile
            label="مُبلَّغ بها" value={s.dispatches.notified}
            icon={AlertCircle}
            color="bg-blue-100 text-blue-700"
          />
          <MetricTile
            label="مقبولة" value={s.dispatches.accepted}
            icon={CheckCircle2}
            color="bg-status-info-surface text-status-info-foreground"
          />
          <MetricTile
            label="جارية" value={s.dispatches.executing}
            icon={Activity}
            color="bg-status-success-surface text-status-success-foreground"
          />
          <MetricTile
            label="متأخرة" value={s.dispatches.lateCount}
            icon={AlertTriangle}
            color="bg-rose-100 text-rose-700"
            subtext="بدء بعد الموعد بـ 15د+"
          />
          <MetricTile
            label="حرجة (<2س)" value={s.dispatches.criticalCount}
            icon={AlertTriangle}
            color="bg-amber-100 text-amber-700"
            subtext="موعد البدء قريب"
          />
        </CardContent>
      </Card>

      {/* Today's bookings */}
      <Card className="mb-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            حجوزات اليوم
          </CardTitle>
          <Link href="/fleet/transport/bookings">
            <Button variant="outline" size="sm">
              قائمة الحجوزات <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricTile
            label="مسودات" value={s.bookings.todayDraft}
            icon={Clock}
            color="bg-surface-subtle text-muted-foreground"
          />
          <MetricTile
            label="معتمدة" value={s.bookings.todayApproved}
            icon={CheckCircle2}
            color="bg-status-info-surface text-status-info-foreground"
          />
          <MetricTile
            label="مجدولة" value={s.bookings.todayScheduled}
            icon={Calendar}
            color="bg-status-success-surface text-status-success-foreground"
          />
          <MetricTile
            label="مكتملة" value={s.bookings.todayCompleted}
            icon={CheckCircle2}
            color="bg-status-success-surface text-status-success-foreground"
          />
          <MetricTile
            label="بلا إسناد" value={s.bookings.unassignedTodayCount}
            icon={AlertTriangle}
            color="bg-amber-100 text-amber-700"
            subtext="معتمدة أو مجدولة بلا dispatch"
          />
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center mt-4">
        آخر تحديث: {new Date().toLocaleString("ar")} —
        مركز التشغيل يقرأ الحالة الراهنة عند كل تحديث (لا ذاكرة مؤقتة).
      </div>
    </PageShell>
  );
}
