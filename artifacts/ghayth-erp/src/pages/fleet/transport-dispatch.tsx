import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@workspace/ui-core";
import { Calendar, Clock, Truck, User, AlertCircle, ArrowLeft, GripVertical, Plus, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useVehicleDriverDefault } from "@/hooks/use-vehicle-driver-default";
import { statusLabel, statusDict } from "@/lib/transport-status-labels";

// The dispatch-order PATCH endpoint is an ACTION state-machine
// ({ action: notify|accept|decline|start|complete|close|cancel }) — not a raw
// status write. Map each selectable dispatch status back to the action that
// produces it (inverse of the server's DISPATCH_ACTION_TARGETS). 'pending' (the
// initial state) has no producing action, so it is intentionally absent.
const STATUS_TO_ACTION: Record<string, string> = {
  notified: "notify",
  accepted: "accept",
  declined: "decline",
  executing: "start",
  completed: "complete",
  closed: "close",
  cancelled: "cancel",
};

// #1733 Comment 9 — dispatch board surface. Shows scheduled dispatch
// orders grouped per-driver in a daily timeline column so the
// dispatcher can spot conflicts and gaps visually.
//
// Drag-and-drop reschedule is wired using the browser-native HTML5
// drag-and-drop API — no extra dependency needed. The card POSTs to
// /transport/dispatch-orders/:id/reschedule which re-runs eligibility
// + tstzrange conflict detection against the new combination on the
// server, so the UI can be optimistic but the server is the source of
// truth for safety.

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

// #TA-T18-UX-AUDIT-01 UX-05 — حالة التوزيع تُعرض من القاموس الموحّد
// (lib/transport-status-labels) بدل خريطة محلية كانت تسقط لقيمة إنجليزية خام.

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
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = toDateInputValue(new Date());
  const [dateFilter, setDateFilter] = useState<string>(today);
  // Native HTML5 drag-and-drop state — track which order is being dragged
  // and which driver column is currently the drop target.
  const [draggingOrderId, setDraggingOrderId] = useState<number | null>(null);
  const [dropTargetDriverId, setDropTargetDriverId] = useState<number | null>(null);
  const [rescheduling, setRescheduling] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ bookingLineId: "", vehicleId: "", driverId: "", scheduledStartAt: "", scheduledEndAt: "" });
  // الكيان يقود التجربة: اختيار المركبة يُعبّئ سائقها الحالي تلقائيًا (قابل للتغيير).
  useVehicleDriverDefault(createForm.vehicleId, createForm.driverId, (v) => setCreateForm((f) => ({ ...f, driverId: v })));
  const [editingOrder, setEditingOrder] = useState<DispatchOrderRow | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const { data: vehiclesResp } = useApiQuery<any>(["fleet-vehicles-dispatch"], "/fleet/vehicles?limit=500");
  const { data: driversResp } = useApiQuery<any>(["fleet-drivers-dispatch"], "/fleet/drivers?limit=500");
  const drivers = asList(driversResp);
  // Show ALL vehicles (the backend guards eligibility on assign), but
  // surface each vehicle's status and float "available" to the top so
  // the dispatcher's default pick is the sensible one.
  const vehicles = [...asList(vehiclesResp)].sort((a: any, b: any) => {
    const rank = (s: string) => (s === "available" ? 0 : s === "in_use" || s === "on_trip" ? 1 : 2);
    return rank(a?.status) - rank(b?.status);
  });

  const createOrder = async () => {
    try {
      await apiFetch("/transport/dispatch-orders", {
        method: "POST",
        body: JSON.stringify({
          bookingLineId: createForm.bookingLineId ? Number(createForm.bookingLineId) : undefined,
          vehicleId: createForm.vehicleId ? Number(createForm.vehicleId) : undefined,
          driverId: createForm.driverId ? Number(createForm.driverId) : undefined,
          scheduledStartAt: createForm.scheduledStartAt || undefined,
          scheduledEndAt: createForm.scheduledEndAt || undefined,
        }),
      });
      toast({ title: "تم إنشاء أمر التوزيع" });
      setShowCreate(false);
      setCreateForm({ bookingLineId: "", vehicleId: "", driverId: "", scheduledStartAt: "", scheduledEndAt: "" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإنشاء", description: err?.message });
    }
  };

  const saveEdit = async () => {
    if (!editingOrder) return;
    const action = STATUS_TO_ACTION[editStatus];
    if (!action) {
      toast({ variant: "destructive", title: "هذه الحالة لا يمكن تعيينها يدويًا" });
      return;
    }
    try {
      await apiFetch(`/transport/dispatch-orders/${editingOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      toast({ title: "تم تحديث الأمر" });
      setEditingOrder(null);
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التحديث", description: err?.message });
    }
  };

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

  // #1733 Comment 9 — drag-and-drop reschedule. The dispatcher drags an
  // order from one driver column and drops it on another. The backend
  // POST /transport/dispatch-orders/:id/reschedule re-runs eligibility +
  // conflict-detection guards against the NEW combination.
  const reschedule = async (orderId: number, newDriverId: number) => {
    if (rescheduling != null) return;
    setRescheduling(orderId);
    try {
      await apiFetch(`/transport/dispatch-orders/${orderId}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ driverId: newDriverId }),
      });
      toast({ title: "تم تغيير السائق" });
      qc.invalidateQueries({ queryKey: ["transport-dispatch", dateFilter] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "تعذّر إعادة الجدولة", description: message });
    } finally {
      setRescheduling(null);
      setDraggingOrderId(null);
      setDropTargetDriverId(null);
    }
  };

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
          <GuardedButton perm="fleet.dispatch:create" size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4 me-1" />{showCreate ? "إلغاء" : "أمر توزيع جديد"}
          </GuardedButton>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/bookings">
              <ArrowLeft className="h-4 w-4 me-1" />العودة للحجوزات
            </Link></Button>
        </div>
      }
    >
      <FleetTabsNav />

      {showCreate && (
        <div className="rounded-lg border bg-white p-4 mb-4 space-y-3">
          <h3 className="font-semibold">إنشاء أمر توزيع</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>رقم بند الحجز *</Label>
              <Input type="number" value={createForm.bookingLineId}
                onChange={(e) => setCreateForm((f) => ({ ...f, bookingLineId: e.target.value }))} />
            </div>
            <div>
              <Label>المركبة</Label>
              <select className="w-full h-10 border rounded-md px-2" value={createForm.vehicleId}
                onChange={(e) => setCreateForm((f) => ({ ...f, vehicleId: e.target.value }))}>
                <option value="">— اختر —</option>
                {vehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}{v.status ? ` — ${statusLabel("vehicle", v.status).label}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>السائق</Label>
              <select className="w-full h-10 border rounded-md px-2" value={createForm.driverId}
                onChange={(e) => setCreateForm((f) => ({ ...f, driverId: e.target.value }))}>
                <option value="">— اختر —</option>
                {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name || d.driverName}</option>)}
              </select>
            </div>
            <div>
              <Label>بداية مجدولة</Label>
              <Input type="datetime-local" value={createForm.scheduledStartAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, scheduledStartAt: e.target.value }))} />
            </div>
            <div>
              <Label>نهاية مجدولة</Label>
              <Input type="datetime-local" value={createForm.scheduledEndAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, scheduledEndAt: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled={!createForm.bookingLineId} onClick={createOrder}>إنشاء</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
          </div>
        </div>
      )}

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
              {byDriver.map(([driverId, { driverName, rows }]) => {
                const draggedOrder = draggingOrderId != null
                  ? orders.find((x) => x.id === draggingOrderId)
                  : null;
                const isValidDropTarget =
                  draggedOrder != null && draggedOrder.driverId !== driverId;
                const isHotTarget =
                  isValidDropTarget && dropTargetDriverId === driverId;
                return (
                  <Card
                    key={driverId}
                    className={`border-2 transition-all ${
                      isHotTarget
                        ? "ring-2 ring-status-info-foreground border-status-info-foreground"
                        : ""
                    } ${
                      isValidDropTarget && !isHotTarget ? "border-dashed" : ""
                    }`}
                    onDragOver={(e) => {
                      if (!isValidDropTarget) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropTargetDriverId !== driverId) {
                        setDropTargetDriverId(driverId);
                      }
                    }}
                    onDragLeave={(e) => {
                      // Only clear if leaving the card entirely (not moving between children).
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (dropTargetDriverId === driverId) setDropTargetDriverId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingOrderId != null && isValidDropTarget) {
                        reschedule(draggingOrderId, driverId);
                      }
                    }}
                  >
                    <CardHeader className="pb-2 bg-surface-subtle">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4 text-status-info-foreground" />
                        {driverName}
                        <span className="ms-auto text-xs font-normal text-muted-foreground">
                          {rows.length} مهمة
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 space-y-2 min-h-[80px]">
                      {rows.length === 0 && isValidDropTarget && (
                        <div className="text-[10px] text-center text-muted-foreground py-4 border border-dashed rounded-md">
                          أفلت هنا لإسناد المهمة إلى {driverName}
                        </div>
                      )}
                      {rows.map((o) => {
                        const isConflict = conflictRowIds.has(o.id);
                        const isDragging = draggingOrderId === o.id;
                        const isBusy = rescheduling === o.id;
                        const isDraggable =
                          rescheduling == null &&
                          (o.status === "pending" || o.status === "notified");
                        return (
                          <div
                            key={o.id}
                            draggable={isDraggable}
                            onDragStart={(e) => {
                              if (!isDraggable) {
                                e.preventDefault();
                                return;
                              }
                              e.dataTransfer.effectAllowed = "move";
                              // Some browsers require setData to start the drag.
                              try {
                                e.dataTransfer.setData("text/plain", String(o.id));
                              } catch {
                                /* ignore — firefox legacy */
                              }
                              setDraggingOrderId(o.id);
                            }}
                            onDragEnd={() => {
                              setDraggingOrderId(null);
                              setDropTargetDriverId(null);
                            }}
                            className={`w-full text-start p-2 rounded-md border text-xs hover:bg-surface-subtle transition-all ${
                              isConflict ? "border-rose-300 bg-rose-50" : ""
                            } ${isDragging ? "opacity-40" : ""} ${
                              isBusy ? "opacity-60 pointer-events-none" : ""
                            } ${isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                            onClick={() =>
                              !isBusy &&
                              !isDragging &&
                              navigate(`/fleet/transport/bookings/${o.bookingId}`)
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === " ") && !isBusy) {
                                e.preventDefault();
                                navigate(`/fleet/transport/bookings/${o.bookingId}`);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono inline-flex items-center gap-1">
                                {isDraggable && (
                                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                                )}
                                حجز #{o.bookingNumber}
                              </span>
                              <Badge variant="outline" className={statusLabel("dispatch", o.status).tone}>
                                {statusLabel("dispatch", o.status).label}
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
                            {isBusy && (
                              <div className="mt-1 text-[10px] text-status-info-foreground">جاري إعادة الجدولة…</div>
                            )}
                            <div className="mt-1 flex justify-end">
                              <GuardedButton perm="fleet.dispatch:update" variant="ghost" size="sm" className="h-5 w-5 p-0"
                                onClick={(e) => { e.stopPropagation(); setEditingOrder(o); setEditStatus(o.status); }}>
                                <Pencil className="h-2.5 w-2.5" />
                              </GuardedButton>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {draggingOrderId != null && (
            <div className="mt-3 text-xs text-muted-foreground text-center">
              اسحب البطاقة وأفلتها على عمود سائق آخر لإعادة الإسناد. لا يمكن نقل
              المهام بعد القبول أو البدء.
            </div>
          )}
        </CardContent>
      </Card>
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingOrder(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-72 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm">تعديل أمر التوزيع #{editingOrder.id}</h3>
            <div>
              <Label>الحالة</Label>
              <select className="w-full h-10 border rounded-md px-2 mt-1" value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}>
                {Object.entries(statusDict("dispatch")).filter(([k]) => STATUS_TO_ACTION[k]).map(([k, info]) => <option key={k} value={k}>{info.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingOrder(null)}>إلغاء</Button>
              <Button size="sm" onClick={saveEdit}>حفظ</Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
