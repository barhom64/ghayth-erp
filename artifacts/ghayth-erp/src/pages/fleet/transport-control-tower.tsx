/**
 * Control Tower — single-page operator dashboard (audit doc file 22).
 *
 * One round-trip via GET /transport/control-tower returns a snapshot
 * of fleet state. The page renders:
 *
 *   - Alerts panel (operator's eye lands here first)
 *   - Vehicles tiles (5 status buckets + utilization-ish hint)
 *   - Drivers tiles (4 status buckets)
 *   - Today's dispatches (5 buckets + late + critical)
 *   - Today's bookings (total + unassigned)
 *
 * Read-only. Deep-links route to the action surfaces
 * (/fleet/transport/dispatch, /fleet/transport/bookings).
 */

import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import {
  AlertTriangle, RefreshCw, Car, Users, Activity, Clipboard, ArrowLeft,
} from "lucide-react";

interface ControlTowerSnapshot {
  date: string;
  vehicles: {
    total: number; available: number; inUse: number;
    maintenance: number; offDuty: number; suspended: number;
  };
  drivers: {
    total: number; available: number; onTrip: number;
    offDuty: number; suspended: number;
  };
  dispatches: {
    total: number; pending: number; notified: number;
    accepted: number; executing: number; completed: number;
    late: number; critical: number;
  };
  bookings: { total: number; unassigned: number };
  alerts: Array<{ kind: string; severity: "critical" | "warn" | "info"; label: string }>;
}

interface Resp { data: ControlTowerSnapshot }

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

function StatusTile({ label, value, tone = "default" }: {
  label: string; value: number;
  tone?: "default" | "success" | "warn" | "critical" | "info";
}) {
  const toneCls = {
    default:  "bg-slate-50 text-slate-700",
    success:  "bg-emerald-50 text-emerald-700",
    warn:     "bg-amber-50 text-amber-800",
    critical: "bg-rose-50 text-rose-700",
    info:     "bg-sky-50 text-sky-700",
  }[tone];
  return (
    <div className={`rounded p-3 border ${toneCls}`}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString("ar-SA")}</div>
    </div>
  );
}

const ALERT_TONE: Record<"critical" | "warn" | "info", string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-800",
  warn:     "border-amber-300 bg-amber-50 text-amber-800",
  info:     "border-sky-300 bg-sky-50 text-sky-800",
};

export default function ControlTowerPage() {
  const [date, setDate] = useState<string>(todayInRiyadh());
  const { data, isLoading, isFetching, refetch } = useApiQuery<Resp>(
    ["fleet-control-tower", date],
    `/transport/control-tower?date=${date}`,
  );

  const snap = data?.data;

  return (
    <PageShell
      title="برج المراقبة"
      subtitle="نظرة لحظية واحدة على حالة الأسطول كاملًا — مركبات، سائقون، رحلات، حجوزات، تنبيهات"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "برج المراقبة" }]}
    >
      <FleetTabsNav />

      {/* Date picker + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">التاريخ:</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          <Button size="sm" variant="ghost" onClick={() => setDate(todayInRiyadh())}>
            اليوم
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 me-1 ${isFetching ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {/* Alerts */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <div className="font-medium">التنبيهات التشغيلية</div>
          </div>
          {!snap?.alerts?.length && !isLoading && (
            <div className="text-sm text-muted-foreground py-3">لا توجد تنبيهات حالية — كل شيء ضمن النطاق.</div>
          )}
          {snap?.alerts?.map((a, i) => (
            <div key={i} className={`border rounded p-2 text-sm ${ALERT_TONE[a.severity]}`}>
              {a.label}
              <span className="text-xs opacity-60 ms-2 font-mono">{a.kind}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Vehicles */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-sky-600" />
            <div className="font-medium">المركبات</div>
            <span className="text-xs text-muted-foreground">
              · إجمالي {snap?.vehicles?.total ?? 0}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <StatusTile label="متاحة" value={snap?.vehicles?.available ?? 0} tone="success" />
            <StatusTile label="قيد الاستخدام" value={snap?.vehicles?.inUse ?? 0} tone="info" />
            <StatusTile label="صيانة" value={snap?.vehicles?.maintenance ?? 0} tone="warn" />
            <StatusTile label="خارج الخدمة" value={snap?.vehicles?.offDuty ?? 0} />
            <StatusTile label="موقوفة" value={snap?.vehicles?.suspended ?? 0} tone="critical" />
          </div>
        </CardContent>
      </Card>

      {/* Drivers */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            <div className="font-medium">السائقون</div>
            <span className="text-xs text-muted-foreground">
              · إجمالي {snap?.drivers?.total ?? 0}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatusTile label="متاحون" value={snap?.drivers?.available ?? 0} tone="success" />
            <StatusTile label="في رحلة" value={snap?.drivers?.onTrip ?? 0} tone="info" />
            <StatusTile label="خارج الدوام" value={snap?.drivers?.offDuty ?? 0} />
            <StatusTile label="موقوفون" value={snap?.drivers?.suspended ?? 0} tone="critical" />
          </div>
        </CardContent>
      </Card>

      {/* Today's dispatches */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-violet-600" />
              <div className="font-medium">رحلات اليوم</div>
              <span className="text-xs text-muted-foreground">
                · إجمالي {snap?.dispatches?.total ?? 0}
              </span>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fleet/transport/dispatch">
                <ArrowLeft className="h-3.5 w-3.5 me-1" />لوحة الإرسال
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <StatusTile label="تنفيذ" value={snap?.dispatches?.executing ?? 0} tone="info" />
            <StatusTile label="مقبولة" value={snap?.dispatches?.accepted ?? 0} tone="success" />
            <StatusTile label="بانتظار" value={snap?.dispatches?.pending ?? 0} tone="warn" />
            <StatusTile label="مكتملة" value={snap?.dispatches?.completed ?? 0} />
            <StatusTile label="متأخرة" value={snap?.dispatches?.late ?? 0} tone="critical" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatusTile label="ضمن نافذة حرجة (≤ ساعتين)" value={snap?.dispatches?.critical ?? 0} tone="warn" />
            <StatusTile label="إشعار مرسل" value={snap?.dispatches?.notified ?? 0} tone="info" />
          </div>
        </CardContent>
      </Card>

      {/* Today's bookings */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clipboard className="h-4 w-4 text-amber-600" />
              <div className="font-medium">حجوزات اليوم</div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fleet/transport/bookings">
                <ArrowLeft className="h-3.5 w-3.5 me-1" />قائمة الحجوزات
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatusTile label="إجمالي" value={snap?.bookings?.total ?? 0} tone="info" />
            <StatusTile label="بلا أمر تشغيل" value={snap?.bookings?.unassigned ?? 0} tone="warn" />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
