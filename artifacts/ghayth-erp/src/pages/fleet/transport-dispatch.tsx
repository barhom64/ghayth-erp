import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell, PageStatusBadge } from "@workspace/ui-core";
import { Calendar, Clock, Truck, User, AlertCircle, ArrowLeft } from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

// #1733 Comment 9 — dispatch board surface. Shows scheduled dispatch
// orders grouped per-driver in a daily timeline column so the
// dispatcher can spot conflicts and gaps visually.
//
// True drag-and-drop scheduling (move a dispatch order from one driver
// column to another) requires the @dnd-kit/* dependency which isn't
// in this workspace. The pragmatic v1 here is read-only board view +
// per-order detail / reschedule via clicking through. The reschedule
// PATCH is already wired on the backend (PATCH
// /transport/dispatch-orders/:id) so adding dnd-kit later is purely a
// UI add-on; nothing else needs to change.

interface DispatchOrderRow {
  id: number;
  bookingId: number;
  bookingNumber: string;
  bookingLineId: number;
  vehicleId: number;
  vehiclePlate: string | null;
  driverId: number;
  driverName: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
  declinedReason: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار",
  notified: "تم الإبلاغ",
  accepted: "قَبِل",
  declined: "رفض",
  executing: "جارٍ التنفيذ",
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

function toDateInputValue(d: Date): string {
  // YYYY-MM-DD in local time so the operator's "today" matches their wall clock.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHourMinute(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TransportDispatchBoard() {
  const [, navigate] = useLocation();
  const today = toDateInputValue(new Date());
  const [dateFilter, setDateFilter] = useState<string>(today);

  // 24-hour window for the chosen day.
  const fromDate = dateFilter;
  const toDate = dateFilter;
  const qs = `?fromDate=${fromDate}&toDate=${toDate}T23:59:59`;
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: DispatchOrderRow[] }>(
    ["transport-dispatch", dateFilter],
    `/transport/dispatch-orders${qs}`,
  );
  const orders = data?.data || [];

  // Group orders by driverId so each driver gets a column.
  const byDriver = useMemo(() => {
    const map = new Map<number, { driverName: string; rows: DispatchOrderRow[] }>();
    for (const o of orders) {
      const key = o.driverId;
      if (!map.has(key)) {
        map.set(key, { driverName: o.driverName || `سائق #${o.driverId}`, rows: [] });
      }
      map.get(key)!.rows.push(o);
    }
    // Sort each driver's rows by scheduledStartAt.
    for (const v of map.values()) {
      v.rows.sort(
        (a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime(),
      );
    }
    return Array.from(map.entries()).sort(
      (a, b) => a[1].driverName.localeCompare(b[1].driverName, "ar"),
    );
  }, [orders]);

  // Conflict detection — two orders for the same driver overlapping
  // in time. The backend rejects new conflicting orders (#1776), but
  // pre-existing conflicts (or accepted-but-running-late ones) still
  // need to be visible to the dispatcher.
  const conflictRowIds = useMemo(() => {
    const flagged = new Set<number>();
    for (const [, { rows }] of byDriver) {
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i]!;
        const b = rows[i + 1]!;
        if (a.status === "declined" || a.status === "cancelled") continue;
        if (b.status === "declined" || b.status === "cancelled") continue;
        if (new Date(a.scheduledEndAt).getTime() > new Date(b.scheduledStartAt).getTime()) {
          flagged.add(a.id);
          flagged.add(b.id);
        }
      }
    }
    return flagged;
  }, [byDriver]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="لوحة توزيع الرحلات"
      subtitle="نظرة يومية على الإسنادات لكل سائق — اكتشاف التعارضات والفجوات"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "لوحة التوزيع" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/fleet/transport/bookings">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 me-1" />العودة للحجوزات
            </Button>
          </Link>
        </div>
      }
    >
      <FleetTabsNav />

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 px-3 rounded-md border bg-background text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
            <div className="text-xs text-muted-foreground ms-auto">
              {orders.length} أمر توزيع — {byDriver.length} سائق
              {conflictRowIds.size > 0 && (
                <span className="ms-2 text-rose-600 inline-flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />{conflictRowIds.size / 2} تعارض
                </span>
              )}
            </div>
          </div>

          {byDriver.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد إسنادات على هذا اليوم. اختر تاريخاً آخر أو أنشئ حجزاً جديداً ثم وزّعه.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {byDriver.map(([driverId, { driverName, rows }]) => (
                <Card key={driverId} className="border-2">
                  <CardHeader className="pb-2 bg-surface-subtle">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4 text-status-info-foreground" />
                      {driverName}
                      <span className="ms-auto text-xs font-normal text-muted-foreground">
                        {rows.length} مهمة
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 space-y-2">
                    {rows.map((o) => {
                      const isConflict = conflictRowIds.has(o.id);
                      return (
                        <button
                          key={o.id}
                          onClick={() => navigate(`/fleet/transport/bookings/${o.bookingId}`)}
                          className={`w-full text-start p-2 rounded-md border text-xs hover:bg-surface-subtle transition-colors ${isConflict ? "border-rose-300 bg-rose-50" : ""}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono">حجز #{o.bookingNumber}</span>
                            <Badge variant="outline" className={STATUS_TONE[o.status] ?? ""}>
                              {STATUS_LABEL[o.status] ?? o.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatHourMinute(o.scheduledStartAt)} – {formatHourMinute(o.scheduledEndAt)}
                            </span>
                            {o.vehiclePlate && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Truck className="h-3 w-3" />{o.vehiclePlate}
                              </span>
                            )}
                          </div>
                          {isConflict && (
                            <div className="mt-1 text-[10px] text-rose-700 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />تعارض في الجدولة مع مهمة أخرى
                            </div>
                          )}
                          {o.declinedReason && (
                            <div className="mt-1 text-[10px] text-rose-700">سبب الرفض: {o.declinedReason}</div>
                          )}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
