import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  ArrowLeft, Calendar, MapPin, Users, Package, User, Truck, Clock,
} from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

// #1733 Comment 9 — booking detail page. Single-screen view of the
// booking + its lines + the dispatch orders that came out of it.

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
  passengerCount: number | null;
  umrahGroupId: number | null;
  flightNumber: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  hotelName: string | null;
  hotelLocation: string | null;
  beneficiaryType: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  lines: BookingLine[];
  dispatchOrders: DispatchOrder[];
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
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "مسودة" },
  { value: "submitted", label: "مُقدَّمة" },
  { value: "pending_approval", label: "بانتظار الاعتماد" },
  { value: "approved", label: "معتمدة" },
  { value: "scheduled", label: "مجدولة" },
  { value: "dispatched", label: "موزّعة" },
  { value: "in_progress", label: "جارية" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "rejected", label: "مرفوضة" },
];

export default function TransportBookingDetail() {
  const [, params] = useRoute("/fleet/transport/bookings/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: BookingDetail }>(
    ["transport-booking", id || ""],
    id ? `/transport/bookings/${id}` : null,
    !!id,
  );
  const b = data?.data;

  const statusMut = useApiMutation<unknown, { status: string }>(
    () => `/transport/bookings/${id}`,
    "PATCH",
    [["transport-booking", id || ""], ["transport-bookings"]],
    { successMessage: "تم تحديث حالة الحجز" },
  );

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
          <Link href="/fleet/transport/dispatch">
            <Button variant="outline" size="sm"><Calendar className="h-4 w-4 me-1" />لوحة التوزيع</Button>
          </Link>
          <Select
            value={b.status}
            onValueChange={(v) => statusMut.mutate({ status: v })}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
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
            <GuardedButton perm="fleet.bookings:update" variant="outline" size="sm" onClick={() => refetch()}>تحديث</GuardedButton>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {b.lines.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              لا توجد سطور بعد. أضف سطراً لكل مركبة مطلوبة قبل التوزيع.
            </div>
          ) : (
            <DataTable<BookingLine>
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
            <Link href="/fleet/transport/dispatch">
              <Button variant="outline" size="sm"><Calendar className="h-4 w-4 me-1" />فتح لوحة التوزيع</Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {b.dispatchOrders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              لم يتم توزيع هذا الحجز على سائق بعد.
            </div>
          ) : (
            <DataTable<DispatchOrder>
              columns={dispatchColumns}
              data={b.dispatchOrders}
              emptyMessage="لا توجد أوامر توزيع"
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
