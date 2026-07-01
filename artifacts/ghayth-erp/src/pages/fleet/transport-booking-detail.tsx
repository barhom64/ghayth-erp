import { useMemo, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation, apiFetch, getErrorMessage } from "@/lib/api";
import { summarizeTripWeights, computeWeightShortage, TRIP_WEIGHT_KIND_LABEL } from "@/lib/trip-weight";
import { TripEventRecorder, TRIP_EVENT_LABEL } from "@/components/shared/trip-event-recorder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AssignmentSuggestDialog } from "@/components/shared/assignment-suggest-dialog";
import { BookingSourceContextPanel } from "@/components/shared/booking-source-context-panel";
import { DateField } from "@/components/shared/form-field-wrapper";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PageStatusBadge,
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import {
  ArrowLeft, Calendar, MapPin, Users, Package, User, Truck, Clock, Wand2, Plus,
} from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton, usePermission } from "@/components/shared/permission-gate";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

// #1733 Comment 9 — booking detail page. Single-screen view of the
// booking + its lines + the dispatch orders that came out of it.

// نقاط التشغيل (checkpoints) المنقولة من قالب المسار — عرض عربي.
const WAYPOINT_KIND_LABEL_AR: Record<string, string> = {
  loading: "تحميل", scale: "ميزان", inspection: "فحص",
  rest: "استراحة", fuel: "وقود", unloading: "تفريغ",
};

interface BookingDetail {
  id: number;
  bookingNumber: string;
  bookingSource: string;
  transportServiceType: string;
  customerId: number | null;
  customerName: string | null;
  linkedCustomerName: string | null;
  customerPhone: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  routeType: string | null;
  requestedPickupDate: string | null;
  requestedPickupTime: string | null;
  requestedDeliveryDate: string | null;
  requestedDeliveryTime: string | null;
  cargoDescription: string | null;
  cargoWeight: number | null;
  cargoOperationalMetadata: { waypoints?: { kind: string; notes?: string }[] } | null;
  passengerCount: number | null;
  umrahGroupId: number | null;
  flightNumber: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  hotelName: string | null;
  hotelLocation: string | null;
  beneficiaryType: string | null;
  contractId: number | null;
  projectId: number | null;
  waqfId: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  lines: BookingLine[];
  dispatchOrders: DispatchOrder[];
  tripEvents: TripEvent[];
  deductions: DeductionCandidate[];
  deductionRates?: { shortagePerKg: number | null; delayPerHour: number | null };
  // #2475-follow-up — resolved booking-cancel policy (guard|cascade), used by
  // the confirmation/preview dialog. Defaults to "guard" when absent.
  cancelPolicy?: "guard" | "cascade";
  // #1812 source-context (from loadSourceContext on backend).
  // Null when the booking is manual_entry or the FK didn't resolve.
  sourceContext: {
    source: string;
    entity: Record<string, unknown>;
  } | null;
}

interface BookingLine {
  id: number;
  lineNumber: number;
  requiredVehicleType: string | null;
  requiredCapacityKg: number | null;
  requiredSeatCount: number | null;
  requiredLicenseClass: string | null;
  scheduledPickupAt: string | null;
  scheduledDeliveryAt: string | null;
  lineDescription: string | null;
  quantity: number | null;
  unitOfMeasure: string | null;
  passengerCount: number | null;
  status: string;
}

interface DispatchOrder {
  id: number;
  bookingLineId: number;
  vehicleId: number;
  vehiclePlate: string | null;
  driverId: number;
  driverName: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
}

// شريحة 1 — واقعة الرحلة (تسجيل واقعة). سجل append-only يشتقّ منه الحالة والـPOD.
interface TripEvent {
  id: number;
  eventType: string;
  occurredAt: string;
  lat: number | null;
  lng: number | null;
  weightKg: number | null;
  weightKind: string | null;
  proofObjectPaths: string[] | null;
  notes: string | null;
}

// شريحة 4 — مرشّح خصم النقص/التأخير (تشغيلي؛ القيد يُرحَّل في المالية).
interface DeductionCandidate {
  id: number;
  basis: string;
  shortageKg: number | null;
  delayHours: number | null;
  amount: number;
  reason: string;
  status: string;
}
const DEDUCTION_STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  issued: "صدر إشعار دائن",
  rejected: "مرفوض",
};

// وقائع الرحلة: مُسجّل التسجيل (الأزرار/الوزن/الإثبات) في المكوّن المشترك
// TripEventRecorder؛ هنا نبقي بوابة الحالة + الجدول الزمني + ملخّص الوزن.
const TRIP_EVENT_EXECUTABLE = new Set([
  "approved", "scheduled", "dispatched", "in_progress",
]);

const SERVICE_TYPE_LABEL: Record<string, string> = {
  cargo_load: "نقل حمولة",
  passenger_umrah: "نقل معتمرين",
  passenger_general: "نقل ركاب",
  equipment_rental: "تأجير معدة",
  internal_transfer: "نقل داخلي",
  other: "أخرى",
};

const SOURCE_LABEL: Record<string, string> = {
  manual_entry: "إدخال يدوي",
  customer_request: "طلب عميل",
  umrah_group: "مجموعة عمرة",
  contract_schedule: "جدول عقد",
  import_excel: "استيراد Excel",
  api_integration: "تكامل API",
  recurring_schedule: "جدول متكرر",
};

const ROUTE_TYPE_LABEL: Record<string, string> = {
  airport_to_makkah: "المطار → مكة",
  makkah_to_madinah: "مكة → المدينة",
  madinah_to_airport: "المدينة → المطار",
  makkah_local: "تنقل محلي بمكة",
  madinah_local: "تنقل محلي بالمدينة",
  ziyarah: "زيارة",
  custom: "مخصص",
};

// Same alphabet as backend BOOKING_TRANSITIONS.
// #1812 operational review — the user explicitly called out:
//   "الحالات غير مؤتمتة. وجود Dropdown للحالة كآلية التشغيل الأساسية
//    يعتبر خطأ تصميمياً."
//
// Backend cascade (PR #1877) already auto-flips booking.status when the
// driver acts on the dispatch order:
//   dispatch.accepted   → booking_line.dispatched   → booking.dispatched
//   dispatch.executing  → booking_line.in_progress  → booking.in_progress
//   dispatch.completed  → booking_line.completed    → booking.completed
//
// So the UI dropdown must NOT offer those three states — they're system-driven.
// The dropdown only exposes states the operator legitimately drives:
//   draft → submitted
//   submitted → pending_approval
//   pending_approval → approved | rejected | cancelled
//   approved → scheduled | cancelled
//   scheduled → cancelled  (dispatched is auto-cascaded)
//   in_progress → cancelled  (completion is auto-cascaded)
//   cancelled / completed / rejected are terminal
//
// BOOKING_TRANSITIONS mirrors the server alphabet in transport-bookings.ts.
// The component filters to "next states reachable from current that are
// operator-driveable" — auto-cascaded transitions are dropped.

const ALL_STATUS_LABELS: Record<string, string> = {
  draft:            "مسودة",
  submitted:        "مُقدَّمة",
  pending_approval: "بانتظار الاعتماد",
  approved:         "معتمدة",
  scheduled:        "مجدولة",
  dispatched:       "موزّعة (تلقائياً)",
  in_progress:      "جارية (تلقائياً)",
  completed:        "مكتملة (تلقائياً)",
  cancelled:        "ملغاة",
  rejected:         "مرفوضة",
};

// حالات سطر الحجز (transport_booking_lines.status) بالعربية — للطباعة
// والعرض. الـenum الخادم: open | dispatched | in_progress | completed | cancelled.
const LINE_STATUS_LABELS: Record<string, string> = {
  open:        "مفتوح",
  dispatched:  "موزّع",
  in_progress: "قيد التنفيذ",
  completed:   "مكتمل",
  cancelled:   "ملغى",
};

// States the operator is NOT allowed to set manually — they cascade
// from driver actions on the dispatch order.
const AUTO_CASCADED_STATES = new Set(["dispatched", "in_progress", "completed"]);

// #2079 TA-T18-08 — approval decisions (approved / rejected) are
// SoD-gated by the separate `fleet.bookings:approve` permission and
// flow through the dedicated Approve / Reject buttons next to the
// dropdown. They are intentionally removed from the generic status
// dropdown so a holder of `update` alone cannot pick them.
const APPROVAL_DECISION_STATES = new Set(["approved", "rejected"]);

const BOOKING_TRANSITIONS: Record<string, string[]> = {
  draft:            ["submitted", "cancelled"],
  submitted:        ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved:         ["scheduled", "cancelled"],
  scheduled:        ["cancelled"],
  dispatched:       ["cancelled"],
  in_progress:      ["cancelled"],
  completed:        [],
  cancelled:        [],
  rejected:         [],
};

function operatorOptionsFor(current: string): { value: string; label: string }[] {
  const targets = BOOKING_TRANSITIONS[current] ?? [];
  return targets
    .filter((t) => !AUTO_CASCADED_STATES.has(t))
    // #2079 TA-T18-08 — approve/reject use the dedicated buttons.
    .filter((t) => !APPROVAL_DECISION_STATES.has(t))
    .map((t) => ({ value: t, label: ALL_STATUS_LABELS[t] ?? t }));
}

export default function TransportBookingDetail() {
  const [, params] = useRoute("/fleet/transport/bookings/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const { toast } = useToast();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [showLineForm, setShowLineForm] = useState(false);
  const [lineForm, setLineForm] = useState({ requiredVehicleType: "", lineDescription: "", quantity: "", unitOfMeasure: "", scheduledPickupAt: "", scheduledDeliveryAt: "" });

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: BookingDetail }>(
    ["transport-booking", id || ""],
    id ? `/transport/bookings/${id}` : null,
    !!id,
  );
  const b = data?.data;

  // صفوف الطباعة = سطور الحجز (تفصيل المركبات المطلوبة). تُحسب قبل أي return مبكر
  // (قواعد الـHooks). القيم المُشتقّة في render الجدول (المتطلبات، الموعد) تُعاد بناؤها هنا.
  const lineRows = useMemo(
    () =>
      (b?.lines ?? []).map((l) => {
        const req = [
          l.requiredVehicleType && `النوع: ${l.requiredVehicleType}`,
          l.requiredCapacityKg && `الحمولة: ${l.requiredCapacityKg} كغم`,
          l.requiredSeatCount && `المقاعد: ${l.requiredSeatCount}`,
          l.requiredLicenseClass && `الرخصة: ${l.requiredLicenseClass}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          "#": l.lineNumber,
          "الوصف": l.lineDescription || "—",
          "متطلبات المركبة": req || "—",
          "الموعد المجدول": l.scheduledPickupAt
            ? new Date(l.scheduledPickupAt).toLocaleString("ar")
            : "—",
          "الحالة": LINE_STATUS_LABELS[l.status] ?? l.status,
        };
      }),
    [b?.lines],
  );
  // ملاحظة: الجدول يعرض كائنات BookingLine الخام (بمفاتيح مختلفة عن صفوف الطباعة
  // المُعرّبة)، لذا لا نربط onSortedDataChange — صفوف الطباعة تتبع ترتيب lineNumber الطبيعي.
  const { sortedRows: printRows } = usePrintRows<any>(lineRows);

  const statusMut = useApiMutation<unknown, { status: string }>(
    () => `/transport/bookings/${id}`,
    "PATCH",
    [["transport-booking", id || ""], ["transport-bookings"]],
    { successMessage: "تم تحديث حالة الحجز" },
  );
  // #2475-follow-up — cancelling is destructive (under "cascade" it also cancels
  // the dispatch orders + trips and frees the vehicle/driver), so route the
  // "cancelled" transition through a policy-aware confirmation dialog.
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // #2079 TA-T18-08 — dedicated approval mutations.
  const canApprove = usePermission("fleet.bookings:approve");
  const approveMut = useApiMutation<unknown, { note?: string }>(
    () => `/transport/bookings/${id}/approve`,
    "POST",
    [["transport-booking", id || ""], ["transport-bookings"]],
    { successMessage: "تم اعتماد الحجز" },
  );
  const rejectMut = useApiMutation<unknown, { reason: string }>(
    () => `/transport/bookings/${id}/reject`,
    "POST",
    [["transport-booking", id || ""], ["transport-bookings"]],
    { successMessage: "تم رفض الحجز" },
  );

  // وقائع الرحلة: التسجيل عبر المكوّن المشترك TripEventRecorder (أدناه).

  // شريحة 4 — مرشّح خصم النقص/التأخير (يُنشئ مرشّحًا؛ المالية تُصدر الإشعار).
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [dedBasis, setDedBasis] = useState<"weight_shortage" | "delay">("weight_shortage");
  const [dedMeasure, setDedMeasure] = useState("");
  const [dedAmount, setDedAmount] = useState("");
  const [dedReason, setDedReason] = useState("");
  const deductionMut = useApiMutation<
    unknown,
    { basis: string; shortageKg?: number; delayHours?: number; amount: number; reason: string }
  >(
    () => `/transport/bookings/${id}/deductions`,
    "POST",
    [["transport-booking", id || ""]],
    { successMessage: "تم تسجيل مرشّح الخصم" },
  );
  const submitDeduction = () => {
    const amount = Number(dedAmount);
    const measure = Number(dedMeasure);
    if (!(amount > 0)) { toast({ variant: "destructive", title: "أدخل مبلغ الخصم" }); return; }
    if (!(measure > 0)) {
      toast({ variant: "destructive", title: dedBasis === "weight_shortage" ? "أدخل نقص الوزن" : "أدخل ساعات التأخّر" });
      return;
    }
    if (!dedReason.trim()) { toast({ variant: "destructive", title: "أدخل السبب" }); return; }
    deductionMut.mutate(
      {
        basis: dedBasis,
        ...(dedBasis === "weight_shortage" ? { shortageKg: measure } : { delayHours: measure }),
        amount, reason: dedReason.trim(),
      },
      { onSuccess: () => { setShowDeductionForm(false); setDedMeasure(""); setDedAmount(""); setDedReason(""); } },
    );
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !b) return <ErrorState />;

  const lineColumns: DataTableColumn<BookingLine>[] = [
    { key: "lineNumber", header: "#", render: (l) => <span className="font-mono">{l.lineNumber}</span> },
    { key: "lineDescription", header: "الوصف", render: (l) => l.lineDescription || "—" },
    {
      key: "required",
      header: "متطلبات المركبة",
      render: (l) => (
        <div className="text-xs space-y-0.5">
          {l.requiredVehicleType && <div>النوع: {l.requiredVehicleType}</div>}
          {l.requiredCapacityKg && <div>الحمولة: {l.requiredCapacityKg} كغم</div>}
          {l.requiredSeatCount && <div>المقاعد: {l.requiredSeatCount}</div>}
          {l.requiredLicenseClass && <div>الرخصة: {l.requiredLicenseClass}</div>}
          {!l.requiredVehicleType && !l.requiredCapacityKg && !l.requiredSeatCount && !l.requiredLicenseClass && "—"}
        </div>
      ),
    },
    {
      key: "scheduled",
      header: "الموعد المجدول",
      render: (l) => (
        <div className="text-xs">
          {l.scheduledPickupAt ? new Date(l.scheduledPickupAt).toLocaleString("ar") : "—"}
        </div>
      ),
    },
    { key: "status", header: "الحالة", render: (l) => <PageStatusBadge status={l.status} /> },
  ];

  const dispatchColumns: DataTableColumn<DispatchOrder>[] = [
    {
      key: "driverName",
      header: "السائق",
      render: (d) => (
        <div className="flex items-center gap-1 text-xs">
          <User className="h-3 w-3" />{d.driverName || `#${d.driverId}`}
        </div>
      ),
    },
    {
      key: "vehiclePlate",
      header: "المركبة",
      render: (d) => (
        <span className="font-mono text-xs flex items-center gap-1">
          <Truck className="h-3 w-3" />{d.vehiclePlate || `#${d.vehicleId}`}
        </span>
      ),
    },
    {
      key: "scheduledStartAt",
      header: "البداية",
      render: (d) => <span className="text-xs"><Clock className="inline h-3 w-3 me-1" />{new Date(d.scheduledStartAt).toLocaleString("ar")}</span>,
    },
    {
      key: "scheduledEndAt",
      header: "النهاية",
      render: (d) => <span className="text-xs">{new Date(d.scheduledEndAt).toLocaleString("ar")}</span>,
    },
    { key: "status", header: "حالة التوزيع", render: (d) => <PageStatusBadge status={d.status} /> },
  ];

  return (
    <PageShell
      title={`حجز #${b.bookingNumber}`}
      subtitle={`${SERVICE_TYPE_LABEL[b.transportServiceType] || b.transportServiceType} — ${b.linkedCustomerName || b.customerName || "بدون عميل"}`}
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: b.bookingNumber },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_fleet_transport_booking"
            entityId={String(b.id)}
            size="icon"
            payload={() => ({
              entity: {
                title: `حجز نقل #${b.bookingNumber}`,
                total: printRows.length,
                status: ALL_STATUS_LABELS[b.status] ?? b.status,
                serviceType: SERVICE_TYPE_LABEL[b.transportServiceType] ?? b.transportServiceType,
                customer: b.linkedCustomerName || b.customerName || "بدون عميل",
                source: SOURCE_LABEL[b.bookingSource] ?? b.bookingSource,
              },
              items: printRows,
            })}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSuggestOpen(true)}
            disabled={!id}
          >
            <Wand2 className="h-4 w-4 me-1" />اقترح إسناداً
          </Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/dispatch"><Calendar className="h-4 w-4 me-1" />لوحة التوزيع</Link></Button>
          {/* #1812 — booking confirmation (gap #10). Opens a print-friendly
              Arabic confirmation page with QR for customer pickup. */}
          <Button asChild variant="outline" size="sm"><Link href={`/fleet/transport/bookings/${id}/confirmation`}>تأكيد الحجز (طباعة / PDF)</Link></Button>
          {/* #1812 — auto-cascade dropdown from #1900 (merged). */}
          {(() => {
            const opts = operatorOptionsFor(b.status);
            const isAutoState = AUTO_CASCADED_STATES.has(b.status);
            return (
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">الحالة:</div>
                <PageStatusBadge status={b.status} />
                {isAutoState && (
                  <span className="text-xs text-muted-foreground italic">
                    (تتغير تلقائياً من إجراءات السائق)
                  </span>
                )}
                {opts.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (!v) return;
                      if (v === "cancelled") setCancelConfirm(true);
                      else statusMut.mutate({ status: v });
                    }}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder={`تغيير الحالة (${opts.length})`} />
                    </SelectTrigger>
                    <SelectContent>
                      {opts.map((o) => (
                        <SelectItem key={o.value} value={o.value}>→ {o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {/* #2079 TA-T18-08 — dedicated approval controls,
                    gated on the new fleet.bookings:approve permission
                    so a holder of update alone cannot drive the
                    approval decision. */}
                {b.status === "pending_approval" && canApprove && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => approveMut.mutate({})}
                      disabled={approveMut.isPending}
                    >
                      اعتماد
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        const reason = prompt("سبب الرفض (مطلوب)");
                        if (reason && reason.trim()) {
                          rejectMut.mutate({ reason: reason.trim() });
                        }
                      }}
                      disabled={rejectMut.isPending}
                    >
                      رفض
                    </Button>
                  </>
                )}
                {b.status === "pending_approval" && !canApprove && (
                  <span className="text-[10px] text-muted-foreground italic">
                    (يلزم صلاحية fleet.bookings:approve للاعتماد/الرفض)
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      }
    >
      {/* #1812 source-context panel — full upstream entity summary
          (umrah group dates/supervisor, customer phone, contract dates).
          Renders only when the backend sourceContext resolver returned
          a non-null payload — the FK-based banner below remains as a
          quick links strip even when this panel renders. */}
      <BookingSourceContextPanel sourceContext={(b as unknown as { sourceContext: any }).sourceContext} />
      {/* #1812 linked-source banner — proves the booking isn't an
          island. Surfaces the source entity (umrah group, contract,
          project, waqf) and lets the operator jump back to it. */}
      {(b.umrahGroupId || b.contractId || b.projectId || b.waqfId || b.customerId || b.bookingSource !== "manual_entry") && (
        <Card className="mb-4 border-status-info-foreground/30 bg-status-info-surface/40">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap text-xs">
            <Badge variant="outline" className="bg-status-info-surface">
              مصدر: {SOURCE_LABEL[b.bookingSource] ?? b.bookingSource}
            </Badge>
            {b.umrahGroupId && (
              <Link href={`/umrah/groups/${b.umrahGroupId}`} asChild>
                <a className="inline-flex items-center gap-1 text-status-info-foreground hover:underline">
                  <Users className="h-3 w-3" />مجموعة عمرة #{b.umrahGroupId}
                </a>
              </Link>
            )}
            {b.contractId && (
              <span className="inline-flex items-center gap-1 text-status-info-foreground">
                <Calendar className="h-3 w-3" />عقد #{b.contractId}
              </span>
            )}
            {b.projectId && (
              <span className="inline-flex items-center gap-1 text-status-info-foreground">
                مشروع #{b.projectId}
              </span>
            )}
            {b.waqfId && (
              <span className="inline-flex items-center gap-1 text-status-info-foreground">
                وقف #{b.waqfId}
              </span>
            )}
            {b.customerId && (
              <Link href={`/clients/${b.customerId}`} asChild>
                <a className="inline-flex items-center gap-1 text-status-info-foreground hover:underline">
                  <User className="h-3 w-3" />عميل #{b.customerId}
                </a>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-status-info-foreground" />المسار
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">من:</span> {b.fromLocationText || "—"}</div>
            <div><span className="text-muted-foreground">إلى:</span> {b.toLocationText || "—"}</div>
            {b.routeType && (
              <div><span className="text-muted-foreground">نوع المسار:</span> {ROUTE_TYPE_LABEL[b.routeType] || b.routeType}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-status-warning-foreground" />التوقيت المطلوب
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">التحميل:</span> {b.requestedPickupDate || "—"} {b.requestedPickupTime || ""}</div>
            <div><span className="text-muted-foreground">التسليم:</span> {b.requestedDeliveryDate || "—"} {b.requestedDeliveryTime || ""}</div>
            <div><span className="text-muted-foreground">المصدر:</span> {SOURCE_LABEL[b.bookingSource] || b.bookingSource}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {b.transportServiceType.startsWith("passenger_") ? <Users className="h-4 w-4 text-purple-600" /> : <Package className="h-4 w-4 text-purple-600" />}
              تفاصيل الخدمة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {b.transportServiceType === "cargo_load" && (
              <>
                <div><span className="text-muted-foreground">الحمولة:</span> {b.cargoDescription || "—"}</div>
                <div><span className="text-muted-foreground">الوزن:</span> {b.cargoWeight ? `${b.cargoWeight} كغم` : "—"}</div>
              </>
            )}
            {b.transportServiceType.startsWith("passenger_") && (
              <>
                <div><span className="text-muted-foreground">عدد الركاب:</span> {b.passengerCount || "—"}</div>
                {b.umrahGroupId && <div><span className="text-muted-foreground">مجموعة عمرة:</span> #{b.umrahGroupId}</div>}
                {b.flightNumber && <div><span className="text-muted-foreground">رقم الرحلة:</span> {b.flightNumber}</div>}
                {b.hotelName && <div><span className="text-muted-foreground">الفندق:</span> {b.hotelName}</div>}
                {b.supervisorName && (
                  <div><span className="text-muted-foreground">المشرف:</span> {b.supervisorName} {b.supervisorPhone && `(${b.supervisorPhone})`}</div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {Array.isArray(b.cargoOperationalMetadata?.waypoints) && b.cargoOperationalMetadata!.waypoints!.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-600" /> نقاط التشغيل
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ol className="flex flex-wrap items-center gap-2">
              {b.cargoOperationalMetadata!.waypoints!.map((w, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="inline-flex items-center rounded border bg-surface-subtle px-2 py-0.5">
                    <span className="text-[10px] text-muted-foreground me-1">{i + 1}.</span>
                    {WAYPOINT_KIND_LABEL_AR[w.kind] ?? w.kind}
                    {w.notes ? <span className="text-xs text-muted-foreground ms-1">— {w.notes}</span> : null}
                  </span>
                  {i < b.cargoOperationalMetadata!.waypoints!.length - 1 && <span className="text-muted-foreground">←</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {b.notes && (
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">ملاحظات</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{b.notes}</CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>سطور الحجز ({b.lines.length})</span>
            <div className="flex gap-2">
              <GuardedButton perm="fleet.bookings:update" variant="outline" size="sm"
                onClick={() => setShowLineForm(v => !v)}>
                <Plus className="h-4 w-4 me-1" />{showLineForm ? "إلغاء" : "سطر جديد"}
              </GuardedButton>
            </div>
          </CardTitle>
        </CardHeader>
        {showLineForm && (
          <CardContent className="border-t pt-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><label className="text-xs text-muted-foreground">نوع المركبة المطلوبة</label>
                <Input className="h-8 mt-1 text-sm" value={lineForm.requiredVehicleType}
                  onChange={e => setLineForm(f => ({ ...f, requiredVehicleType: e.target.value }))} placeholder="مثال: bus, truck" />
              </div>
              <div><label className="text-xs text-muted-foreground">الوصف</label>
                <Input className="h-8 mt-1 text-sm" value={lineForm.lineDescription}
                  onChange={e => setLineForm(f => ({ ...f, lineDescription: e.target.value }))} />
              </div>
              <div><label className="text-xs text-muted-foreground">الكمية</label>
                <Input type="number" className="h-8 mt-1 text-sm" value={lineForm.quantity}
                  onChange={e => setLineForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div><label className="text-xs text-muted-foreground">وحدة القياس</label>
                <Input className="h-8 mt-1 text-sm" value={lineForm.unitOfMeasure}
                  onChange={e => setLineForm(f => ({ ...f, unitOfMeasure: e.target.value }))} placeholder="trip, kg, pax..." />
              </div>
              <DateField label="موعد الاستلام" mode="datetime" value={lineForm.scheduledPickupAt}
                onChange={v => setLineForm(f => ({ ...f, scheduledPickupAt: v }))} />
              <DateField label="موعد التسليم" mode="datetime" value={lineForm.scheduledDeliveryAt}
                onChange={v => setLineForm(f => ({ ...f, scheduledDeliveryAt: v }))} />
            </div>
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={async () => {
                try {
                  await apiFetch(`/transport/bookings/${id}/lines`, {
                    method: "POST",
                    body: JSON.stringify({
                      requiredVehicleType: lineForm.requiredVehicleType || undefined,
                      lineDescription: lineForm.lineDescription || undefined,
                      quantity: lineForm.quantity ? Number(lineForm.quantity) : undefined,
                      unitOfMeasure: lineForm.unitOfMeasure || undefined,
                      scheduledPickupAt: lineForm.scheduledPickupAt || undefined,
                      scheduledDeliveryAt: lineForm.scheduledDeliveryAt || undefined,
                    }),
                  });
                  toast({ title: "تم إضافة السطر" });
                  setShowLineForm(false);
                  setLineForm({ requiredVehicleType: "", lineDescription: "", quantity: "", unitOfMeasure: "", scheduledPickupAt: "", scheduledDeliveryAt: "" });
                  refetch();
                } catch (err) {
                  toast({ variant: "destructive", title: "فشل الإضافة", description: getErrorMessage(err) });
                }
              }}>إضافة السطر</Button>
            </div>
          </CardContent>
        )}
        <CardContent className="p-0">
          {b.lines.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              لا توجد سطور بعد. أضف سطراً لكل مركبة مطلوبة قبل التوزيع.
            </div>
          ) : (
            <DataTable
              columns={lineColumns}
              data={b.lines}
              emptyMessage="لا توجد سطور"
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>أوامر التوزيع ({b.dispatchOrders.length})</span>
            <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/dispatch"><Calendar className="h-4 w-4 me-1" />فتح لوحة التوزيع</Link></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {b.dispatchOrders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              لم يتم توزيع هذا الحجز على سائق بعد.
            </div>
          ) : (
            <DataTable
              columns={dispatchColumns}
              data={b.dispatchOrders}
              emptyMessage="لا توجد أوامر توزيع"
            />
          )}
        </CardContent>
      </Card>

      {/* شريحة 1 — وقائع الرحلة (تسجيل واقعة): سجّل ما حدث وارفق الإثبات،
          والنظام يشتقّ حالة الحجز. الإغلاق التشغيلي (تفريغ/تسليم) يتطلب POD. */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">وقائع الرحلة ({b.tripEvents.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TripEventRecorder
            endpoint={`/transport/bookings/${id}/events`}
            executable={TRIP_EVENT_EXECUTABLE.has(b.status)}
            disabledHint={`تسجيل الوقائع متاح بعد اعتماد الحجز وجدولته (الحالة الحالية: ${ALL_STATUS_LABELS[b.status] ?? b.status}).`}
            onRecorded={refetch}
          />

          {/* شريحة 2 — ملخّص الوزن (مشتقّ من الوقائع: صافي = محمّل − فارغ). */}
          {(() => {
            const w = summarizeTripWeights(b.tripEvents);
            if (w.tareKg == null && w.grossKg == null) return null;
            return (
              <div className="flex flex-wrap gap-3 text-xs border rounded-md p-2 bg-muted/20">
                <span>الوزن الفارغ: <strong>{w.tareKg != null ? `${w.tareKg} كغم` : "—"}</strong></span>
                <span>الوزن المحمّل: <strong>{w.grossKg != null ? `${w.grossKg} كغم` : "—"}</strong></span>
                <span>صافي الحمولة: <strong>{w.netKg != null ? `${w.netKg} كغم` : "—"}</strong></span>
              </div>
            );
          })()}

          {b.tripEvents.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">لا توجد وقائع مسجّلة بعد.</div>
          ) : (
            <ol className="space-y-1.5">
              {b.tripEvents.map((ev) => (
                <li key={ev.id} className="flex flex-wrap items-center gap-2 text-sm border-b pb-1.5 last:border-0">
                  <Badge variant="outline" className="shrink-0">{TRIP_EVENT_LABEL[ev.eventType] ?? ev.eventType}</Badge>
                  <span className="text-muted-foreground text-xs">{new Date(ev.occurredAt).toLocaleString("ar")}</span>
                  {ev.weightKg != null && (
                    <span className="text-xs">· {ev.weightKg} كغم{ev.weightKind ? ` (${TRIP_WEIGHT_KIND_LABEL[ev.weightKind] ?? ev.weightKind})` : ""}</span>
                  )}
                  {ev.proofObjectPaths && ev.proofObjectPaths.length > 0 && (
                    <span className="text-xs">· {ev.proofObjectPaths.length} صورة</span>
                  )}
                  {ev.notes && <span className="text-xs text-muted-foreground truncate max-w-[40%]">· {ev.notes}</span>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* شريحة 4 — خصومات النقص/التأخير: يُنشئ مرشّح خصم؛ المالية تُصدر منه
          إشعارًا دائنًا (تخفيض إيراد العميل) عبر تدفّقها — لا قيد من النقل. */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>خصومات النقص/التأخير ({b.deductions.length})</span>
            <Button
              size="sm"
              variant={showDeductionForm ? "default" : "outline"}
              onClick={() => setShowDeductionForm(!showDeductionForm)}
            >
              {showDeductionForm ? "إلغاء" : "تسجيل خصم"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {showDeductionForm && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">السبب</label>
                <select
                  className="h-8 text-sm border rounded-md px-2 bg-background"
                  value={dedBasis}
                  onChange={(e) => setDedBasis(e.target.value as "weight_shortage" | "delay")}
                >
                  <option value="weight_shortage">نقص وزن</option>
                  <option value="delay">تأخّر</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">
                  {dedBasis === "weight_shortage" ? "النقص (كغم)" : "التأخّر (ساعة)"}
                </label>
                <Input type="number" min="0" value={dedMeasure} onChange={(e) => setDedMeasure(e.target.value)} className="w-32 h-8" />
                {/* اشتقاق نقص الحمولة من الأوزان المسجّلة (محمّل المنشأ − الوجهة). */}
                {dedBasis === "weight_shortage" && (() => {
                  const sug = computeWeightShortage(b.tripEvents);
                  return sug != null ? (
                    <Button
                      type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => setDedMeasure(String(sug))}
                    >
                      اقتراح من الأوزان: {sug} كغم
                    </Button>
                  ) : null;
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground w-20">المبلغ (ريال)</label>
                <Input type="number" min="0" value={dedAmount} onChange={(e) => setDedAmount(e.target.value)} className="w-32 h-8" />
                {/* اقتراح المبلغ من المعدّل المُعدّ (قياس × معدّل). */}
                {(() => {
                  const rate = dedBasis === "weight_shortage"
                    ? b.deductionRates?.shortagePerKg
                    : b.deductionRates?.delayPerHour;
                  const measure = Number(dedMeasure);
                  if (rate == null || !(measure > 0)) return null;
                  const suggested = Math.round(measure * rate * 100) / 100;
                  return (
                    <Button
                      type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => setDedAmount(String(suggested))}
                    >
                      اقتراح: {suggested} ريال
                    </Button>
                  );
                })()}
              </div>
              <Input value={dedReason} onChange={(e) => setDedReason(e.target.value)} placeholder="السبب التفصيلي" className="h-8 text-sm" />
              <div className="text-[11px] text-muted-foreground">
                يُنشئ مرشّح خصم؛ المالية تُصدر منه إشعارًا دائنًا (تخفيض إيراد العميل).
              </div>
              <Button size="sm" onClick={submitDeduction} disabled={deductionMut.isPending}>
                {deductionMut.isPending ? "جاري التسجيل…" : "تسجيل المرشّح"}
              </Button>
            </div>
          )}
          {b.deductions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">لا خصومات مسجّلة.</div>
          ) : (
            <ol className="space-y-1.5">
              {b.deductions.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm border-b pb-1.5 last:border-0">
                  <Badge variant="outline" className="shrink-0">
                    {d.basis === "weight_shortage" ? "نقص وزن" : "تأخّر"}
                  </Badge>
                  <span className="text-xs">{d.amount} ريال</span>
                  <span className="text-xs text-muted-foreground">· {DEDUCTION_STATUS_LABEL[d.status] ?? d.status}</span>
                  {d.reason && <span className="text-xs text-muted-foreground truncate max-w-[40%]">· {d.reason}</span>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      {id && (
        <AssignmentSuggestDialog
          bookingId={Number(id)}
          open={suggestOpen}
          onOpenChange={setSuggestOpen}
          onSelect={(_c, dispatchOrderId) => {
            // After auto-create the dispatch list on this booking
            // is stale — refetch instead of navigating away so the
            // operator stays in context.
            if (dispatchOrderId) refetch();
            else navigate("/fleet/transport/dispatch");
          }}
        />
      )}
      {/* #2475-follow-up — policy-aware confirmation/preview before a cancel. */}
      {(() => {
        const policy = b.cancelPolicy === "cascade" ? "cascade" : "guard";
        const ACTIVE_ORDER = new Set(["pending", "notified", "accepted", "executing"]);
        const activeOrders = (b.dispatchOrders || []).filter((o) => ACTIVE_ORDER.has(String(o.status)));
        const hasActive = activeOrders.length > 0;
        const guardBlocked = policy === "guard" && hasActive;
        return (
          <ConfirmActionDialog
            open={cancelConfirm}
            onOpenChange={setCancelConfirm}
            variant={guardBlocked ? "caution" : "destructive"}
            title={guardBlocked ? "تنبيه: يوجد أمر توزيع نشط" : "تأكيد إلغاء الحجز"}
            description={
              guardBlocked
                ? `سياسة الإلغاء الحالية «حماية»: لا يمكن إلغاء الحجز ما دام هناك ${activeOrders.length} أمر توزيع نشط. ألغِ أوامر التوزيع أولاً من لوحة التوزيع (تُلغى معها الرحلة وتُحرَّر المركبة والسائق) ثم أعد المحاولة.`
                : hasActive
                  ? `سياسة الإلغاء الحالية «تتالٍ»: سيُلغى ${activeOrders.length} أمر توزيع نشط ورحلاتها، وتُحرَّر المركبة والسائق، وتُلغى الأسطر غير المنتهية. لا يمكن التراجع.`
                  : "سيُعلَّم هذا الحجز كملغى. لا يمكن التراجع."
            }
            confirmLabel={guardBlocked ? "محاولة الإلغاء" : "تأكيد الإلغاء"}
            pending={statusMut.isPending}
            onConfirm={() => statusMut.mutate({ status: "cancelled" }, { onSuccess: () => setCancelConfirm(false) })}
          >
            {hasActive && (
              <ul className="text-xs list-disc ps-5 space-y-0.5 max-h-40 overflow-auto">
                {activeOrders.map((o) => (
                  <li key={o.id}>
                    {o.driverName || "بلا سائق"}{o.vehiclePlate ? ` — ${o.vehiclePlate}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </ConfirmActionDialog>
        );
      })()}
    </PageShell>
  );
}
