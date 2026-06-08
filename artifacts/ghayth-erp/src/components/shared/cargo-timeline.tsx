import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, CheckCircle2, AlertCircle, Truck, User, MapPin, Package,
  FileText, Calendar, ArrowRight,
} from "lucide-react";

// #1733 Comment 6 — operational timeline component. Consumes
// GET /api/cargo/manifests/:id/timeline (merged audit_logs + event_logs
// + billing-candidate events) and renders a per-event vertical strip
// with Arabic labels from the FREIGHT_EVENTS catalogue.

interface TimelineEvent {
  source: "audit" | "event";
  action: string;
  userId: number | null;
  createdAt: string;
  before_json: string | null;
  after_json: string | null;
  details: string | null;
}

interface Props {
  manifestId: number;
}

// Mirrors api-server/src/lib/fleet/freightEvents.ts. Keeping this in
// sync is a small price for one source of truth; the events smoke test
// (transportSpaSurface.test.ts can be extended later) catches drift.
const EVENT_LABEL_AR: Record<string, string> = {
  // Operational lifecycle
  "fleet.cargo.manifest.created": "تم إنشاء البوليصة",
  "fleet.cargo.manifest.status_changed": "تغيّرت حالة البوليصة",
  "fleet.cargo.driver_notified": "تم إبلاغ السائق",
  "fleet.cargo.trip_started": "بدأت الرحلة",
  "fleet.cargo.arrived_pickup": "وصل لموقع التحميل",
  "fleet.cargo.loaded": "تم التحميل",
  "fleet.cargo.in_transit": "في الطريق",
  "fleet.cargo.arrived_delivery": "وصل لموقع التسليم",
  "fleet.cargo.delivered": "تم التسليم",
  "fleet.cargo.completed": "اكتمل تشغيلياً",
  "fleet.cargo.manifest.cancelled": "ألغيت البوليصة",
  // Financial handoff
  "fleet.cargo.ready_for_invoice": "جاهزة للمحاسبة",
  "fleet.cargo.billing_candidate.created": "تم تسليم الأثر للمحاسب",
  "finance.transport_billing.materialized": "تم ترحيل الأثر للمحاسب",
  "finance.transport_billing.rejected": "رفض المحاسب الترشيح",
  "finance.transport_billing.batch.ready": "حزمة فواتير جاهزة",
  // Guards
  "fleet.vehicle.capacity.unknown": "سعة المركبة غير معروفة",
  "fleet.vehicle.capacity.exception": "استثناء تجاوز سعة المركبة",
  "fleet.driver.eligibility.unknown": "أهلية السائق غير معروفة",
  "fleet.driver.eligibility.exception": "استثناء عدم أهلية السائق",
};

function iconForAction(action: string): React.ComponentType<{ className?: string }> {
  if (action.includes("billing") || action.includes("ready_for_invoice")) return FileText;
  if (action.includes("capacity") || action.includes("eligibility")) return AlertCircle;
  if (action.includes("driver_notified") || action.includes("dispatch")) return User;
  if (action.includes("trip_started") || action.includes("in_transit")) return Truck;
  if (action.includes("arrived")) return MapPin;
  if (action.includes("loaded") || action.includes("delivered") || action.includes("completed")) return CheckCircle2;
  if (action.includes("cancelled")) return AlertCircle;
  if (action.includes("created")) return Package;
  if (action.includes("status_changed")) return ArrowRight;
  return Activity;
}

function toneForAction(action: string): string {
  if (action.includes("exception") || action.includes("cancelled") || action.includes("rejected"))
    return "bg-rose-100 text-rose-700";
  if (action.includes("ready_for_invoice") || action.includes("materialized") || action.includes("batch.ready"))
    return "bg-purple-50 text-purple-700";
  if (action.includes("delivered") || action.includes("completed"))
    return "bg-status-success-surface text-status-success-foreground";
  if (action.includes("in_transit") || action.includes("trip_started"))
    return "bg-status-warning-surface text-status-warning-foreground";
  return "bg-status-info-surface text-status-info-foreground";
}

function summarizeStatusChange(detailsJson: string | null): string | null {
  if (!detailsJson) return null;
  try {
    const d = JSON.parse(detailsJson);
    if (d && typeof d === "object" && "from" in d && "to" in d) {
      return `${d.from} → ${d.to}`;
    }
  } catch {
    // ignore — show raw if it isn't JSON
  }
  return null;
}

export function CargoTimeline({ manifestId }: Props) {
  const { data, isLoading, isError } = useApiQuery<{ data: TimelineEvent[] }>(
    ["cargo-timeline", String(manifestId)],
    `/cargo/manifests/${manifestId}/timeline`,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          جاري تحميل السجل الزمني…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-600 text-center">
          تعذّر تحميل السجل الزمني. حاول لاحقاً.
        </CardContent>
      </Card>
    );
  }

  const events = data?.data || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-status-info-foreground" />
          السجل الزمني التشغيلي
          <span className="ms-auto text-xs font-normal text-muted-foreground">
            {events.length} حدث
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            لا توجد أحداث مسجّلة على هذه البوليصة بعد.
          </div>
        ) : (
          <div className="relative space-y-3 ps-4 border-s-2 border-border">
            {events.map((evt, idx) => {
              const Icon = iconForAction(evt.action);
              const tone = toneForAction(evt.action);
              const label = EVENT_LABEL_AR[evt.action] || evt.action;
              const statusChange = summarizeStatusChange(evt.details);
              return (
                <div
                  key={`${evt.createdAt}-${idx}`}
                  className="relative"
                >
                  <span
                    className={`absolute -start-[1.65rem] top-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${tone}`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{label}</span>
                      {statusChange && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {statusChange}
                        </Badge>
                      )}
                      {evt.source === "audit" && (
                        <Badge variant="outline" className="text-[10px] bg-surface-subtle">
                          مراجعة
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(evt.createdAt).toLocaleString("ar")}
                      {evt.userId != null && (
                        <span className="ms-2">— مستخدم #{evt.userId}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
