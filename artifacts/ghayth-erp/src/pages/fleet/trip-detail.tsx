import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  Route,
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
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function TripDetailPage() {
  const [, params] = useRoute("/fleet/trips/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const queryClient = useQueryClient();

  const { data: trip, isLoading, isError, refetch } = useApiQuery<any>(
    ["fleet-trip", id],
    id ? `/fleet/trips/${id}` : null,
    !!id
  );

  // Fuel logs filtered by trip
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

  // Maintenance during trip — vehicle-wide filter scoped to trip dates
  const { data: maintResp } = useApiQuery<any>(
    ["trip-maintenance", id],
    id && trip?.vehicleId ? `/fleet/maintenance?vehicleId=${trip.vehicleId}` : null,
    !!(id && trip?.vehicleId)
  );
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

  const overviewContent = () => (
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
          <InfoRow label="الحالة" value={resolveStatus(trip?.status ?? "", "trip")?.label || trip?.status} />
        </div>
        {trip?.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{trip.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-gray-500">{msg}</CardContent>
    </Card>
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
    {
      key: "fuel",
      label: "سجلات الوقود",
      icon: Fuel,
      badge: fuelLogs.length || undefined,
      content: () =>
        fuelLogs.length === 0 ? (
          emptyMsg("لا توجد سجلات وقود لهذه الرحلة")
        ) : (
          <DataTable columns={fuelColumns} data={fuelLogs} pageSize={10} emptyMessage="لا توجد سجلات" noToolbar />
        ),
    },
    {
      key: "maintenance",
      label: "الصيانة",
      icon: Wrench,
      badge: maintenance.length || undefined,
      content: () =>
        maintenance.length === 0 ? (
          emptyMsg("لا توجد أعمال صيانة خلال هذه الرحلة")
        ) : (
          <DataTable columns={maintColumns} data={maintenance} pageSize={10} emptyMessage="لا توجد صيانة" noToolbar />
        ),
    },
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="fleet-trip" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="fleet-trip" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="fleet-trip" entityId={id} />,
    },
  ];

  const metaItems = [
    trip?.driverName && { icon: User, label: trip.driverName },
    (trip?.plateNumber || trip?.vehiclePlate) && { icon: Truck, label: trip.plateNumber || trip.vehiclePlate },
    trip?.fromLocation && { icon: MapPin, label: `${trip.fromLocation} → ${trip.toLocation || ""}` },
    trip?.startTime && { icon: Clock, label: formatDateAr(trip.startTime) },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = trip?.status ? <PageStatusBadge status={trip.status} domain="trip" /> : null;

  const notFound = !isLoading && !trip;

  return (
    <EntityDetailPage
      title={trip ? `رحلة #${trip.id}` : notFound ? "الرحلة غير موجودة" : "..."}
      subtitle={trip ? `${trip.fromLocation || trip.origin || ""} → ${trip.toLocation || trip.destination || ""}` : undefined}
      avatar={{
        icon: Route,
        gradientFrom: "from-sky-500",
        gradientTo: "to-blue-600",
      }}
      badges={badges}
      metaItems={metaItems}
      backHref="/fleet/trips"
      backLabel="العودة للرحلات"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على الرحلة المطلوبة" : "تعذر تحميل بيانات الرحلة"}
      onRetry={() => refetch()}
      actions={[
        {
          label: "إكمال",
          icon: CheckCircle2,
          variant: "default",
          onClick: async () => {
            try {
              await apiFetch(`/fleet/trips/${id}/complete`, {
                method: "POST",
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
          },
          disabled: trip?.status === "completed" || trip?.status === "cancelled",
        },
        {
          label: "إلغاء",
          icon: XCircle,
          variant: "outline",
          onClick: async () => {
            try {
              await apiFetch(`/fleet/trips/${id}/cancel`, {
                method: "POST",
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
          },
          disabled: trip?.status === "completed" || trip?.status === "cancelled",
        },
      ]}
      kpis={[
        {
          label: "المسافة",
          value: `${distance} كم`,
          icon: Gauge,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "المدة",
          value: `${durationHours} س`,
          icon: Clock,
          color: "text-purple-600 bg-purple-50",
        },
        {
          label: "الوقود المستهلك",
          value: `${fuelConsumed} ل`,
          icon: Fuel,
          color: "text-orange-600 bg-orange-50",
        },
        {
          label: "التكلفة",
          value: formatCurrency(cost),
          icon: DollarSign,
          color: "text-green-600 bg-green-50",
        },
      ]}
      tabs={tabs}
      defaultTab="overview"
    />
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}
