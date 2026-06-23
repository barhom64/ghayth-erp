import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Plus, Clipboard, Calendar, Truck, Users } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { GuardedButton } from "@/components/shared/permission-gate";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

// #1733 Comment 9 — booking list page. The dispatcher / operator
// surface for the new pre-trip pipeline (intake → booking → lines →
// dispatch order → cargo manifest / fleet trip / umrah transport row).

interface BookingRow {
  id: number;
  bookingNumber: string;
  bookingSource: string;
  transportServiceType: string;
  customerId: number | null;
  customerName: string | null;
  linkedCustomerName: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  routeType: string | null;
  requestedPickupDate: string | null;
  passengerCount: number | null;
  cargoWeight: number | null;
  umrahGroupId: number | null;
  status: string;
  createdAt: string;
}

// Same alphabet as backend BOOKING_TRANSITIONS; Arabic labels for the
// operator-facing dropdown. (Comment 9 mandates Arabic-first UI.)
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "كل الحالات" },
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

const SERVICE_TYPE_LABEL: Record<string, string> = {
  cargo_load: "نقل حمولة",
  passenger_umrah: "نقل معتمرين",
  passenger_general: "نقل ركاب",
  equipment_rental: "تأجير معدة",
  internal_transfer: "نقل داخلي",
  other: "أخرى",
};

export default function TransportBookingsList() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const qsParts: string[] = [];
  if (statusFilter !== "all") qsParts.push(`status=${statusFilter}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: BookingRow[] }>(
    ["transport-bookings", statusFilter],
    `/transport/bookings${qs}`,
  );
  const allRows = (data?.data || []) as BookingRow[];
  const rows = serviceFilter === "all"
    ? allRows
    : allRows.filter((r) => r.transportServiceType === serviceFilter);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const kpi = {
    total: rows.length,
    pending: rows.filter((r) => ["submitted", "pending_approval"].includes(r.status)).length,
    inProgress: rows.filter((r) => ["scheduled", "dispatched", "in_progress"].includes(r.status)).length,
    umrah: rows.filter((r) => r.transportServiceType === "passenger_umrah").length,
  };

  const columns: DataTableColumn<BookingRow>[] = [
    {
      key: "bookingNumber",
      header: "رقم الحجز",
      sortable: true,
      searchable: true,
      render: (r) => <span className="font-mono text-sm">{r.bookingNumber}</span>,
    },
    {
      key: "transportServiceType",
      header: "نوع الخدمة",
      render: (r) => (
        <span className="text-xs">{SERVICE_TYPE_LABEL[r.transportServiceType] || r.transportServiceType}</span>
      ),
    },
    {
      key: "customer",
      header: "العميل",
      sortKey: "customerName",
      searchable: true,
      render: (r) => r.linkedCustomerName || r.customerName || "—",
    },
    {
      key: "route",
      header: "المسار",
      render: (r) => (
        <span className="text-xs">
          {r.fromLocationText || "—"} <span className="text-muted-foreground">→</span> {r.toLocationText || "—"}
        </span>
      ),
    },
    {
      key: "scale",
      header: "الكمية",
      render: (r) => {
        if (r.transportServiceType === "cargo_load" && r.cargoWeight) {
          return <span className="text-xs">{r.cargoWeight} كغم</span>;
        }
        if (r.transportServiceType.startsWith("passenger_") && r.passengerCount) {
          return <span className="text-xs">{r.passengerCount} راكب</span>;
        }
        return <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      key: "requestedPickupDate",
      header: "تاريخ التحميل",
      sortable: true,
      render: (r) => r.requestedPickupDate || "—",
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => <PageStatusBadge status={r.status} />,
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="حجوزات النقل"
      subtitle="استقبال طلبات النقل وجدولتها وتوزيعها على السائقين"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "حجوزات النقل" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_transport_bookings"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "حجوزات النقل", total: printRows.length },
              items: printRows.map((r: any) => ({
                "رقم الحجز": r.bookingNumber,
                "نوع الخدمة": SERVICE_TYPE_LABEL[r.transportServiceType] || r.transportServiceType,
                "العميل": r.linkedCustomerName || r.customerName || "—",
                "المسار": `${r.fromLocationText || "—"} → ${r.toLocationText || "—"}`,
                "تاريخ التحميل": r.requestedPickupDate || "—",
                "الحالة": STATUS_OPTIONS.find((o) => o.value === r.status)?.label ?? r.status,
              })),
            })}
          />
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/ops-dashboard">
              <Calendar className="h-4 w-4 me-1" />لوحة تشغيل اليوم
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/integration">
              <Users className="h-4 w-4 me-1" />التكامل
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/itineraries">
              <Calendar className="h-4 w-4 me-1" />البرامج
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/dispatch">
              <Calendar className="h-4 w-4 me-1" />لوحة التوزيع
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/price-rules">
              <Clipboard className="h-4 w-4 me-1" />قواعد التسعير
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/fleet/transport/rules">
              <Clipboard className="h-4 w-4 me-1" />قواعد العمليات
            </Link></Button>
          <Link href="/fleet/transport/bookings/create">
            <GuardedButton perm="fleet.bookings:create" size="sm">
              <Plus className="h-4 w-4 me-1" />حجز جديد
            </GuardedButton>
          </Link>
        </div>
      }
    >
      <FleetTabsNav />

      <KpiGrid items={[
        { label: "إجمالي الحجوزات", value: kpi.total, icon: Clipboard, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "بانتظار الاعتماد", value: kpi.pending, icon: Clipboard, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "قيد التنفيذ", value: kpi.inProgress, icon: Truck, color: "text-purple-600 bg-purple-50" },
        { label: "حجوزات عمرة", value: kpi.umrah, icon: Users, color: "text-status-success-foreground bg-status-success-surface" },
      ]} />

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل أنواع الخدمات</SelectItem>
                <SelectItem value="cargo_load">نقل حمولة</SelectItem>
                <SelectItem value="passenger_umrah">نقل معتمرين</SelectItem>
                <SelectItem value="passenger_general">نقل ركاب</SelectItem>
                <SelectItem value="equipment_rental">تأجير معدة</SelectItem>
                <SelectItem value="internal_transfer">نقل داخلي</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
          </div>
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            onRowClick={(r) => navigate(`/fleet/transport/bookings/${r.id}`)}
            searchPlaceholder="ابحث برقم الحجز، اسم العميل…"
            emptyMessage="لا توجد حجوزات بعد"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
