import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailPageLayout, type ExtraTab } from "@/components/shared/detail-page-layout";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
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

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-gray-500">{msg}</CardContent>
    </Card>
  );

  const handleComplete = async () => {
    try {
      await apiFetch(`/fleet/trips/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
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
  };

  const handleCancel = async () => {
    try {
      await apiFetch(`/fleet/trips/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
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
  };

  const overview = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-blue-600 bg-blue-50">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{distance} كم</p>
              <p className="text-xs text-gray-500 truncate">المسافة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-purple-600 bg-purple-50">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{durationHours} س</p>
              <p className="text-xs text-gray-500 truncate">المدة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-orange-600 bg-orange-50">
              <Fuel className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{fuelConsumed} ل</p>
              <p className="text-xs text-gray-500 truncate">الوقود المستهلك</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-green-600 bg-green-50">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{formatCurrency(cost)}</p>
              <p className="text-xs text-gray-500 truncate">التكلفة</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <InfoRow label="الحالة" value={trip?.status} />
          </div>
          {trip?.notes && (
            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{trip.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={handleComplete}
        disabled={trip?.status === "completed" || trip?.status === "cancelled"}
        className="gap-1"
      >
        <CheckCircle2 className="h-4 w-4" />
        إكمال
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCancel}
        disabled={trip?.status === "completed" || trip?.status === "cancelled"}
        className="gap-1"
      >
        <XCircle className="h-4 w-4" />
        إلغاء
      </Button>
    </div>
  );

  const statusTone = trip?.status === "completed" ? "success" as const
    : trip?.status === "cancelled" ? "destructive" as const
    : trip?.status === "in_progress" ? "info" as const
    : "default" as const;

  const extraTabs: ExtraTab[] = [
    {
      key: "fuel",
      label: "سجلات الوقود",
      icon: Fuel,
      badge: fuelLogs.length || undefined,
      content: () =>
        fuelLogs.length === 0
          ? emptyMsg("لا توجد سجلات وقود لهذه الرحلة")
          : <DataTable columns={fuelColumns} data={fuelLogs} pageSize={10} emptyMessage="لا توجد سجلات" noToolbar />,
    },
    {
      key: "maintenance",
      label: "الصيانة",
      icon: Wrench,
      badge: maintenance.length || undefined,
      content: () =>
        maintenance.length === 0
          ? emptyMsg("لا توجد أعمال صيانة خلال هذه الرحلة")
          : <DataTable columns={maintColumns} data={maintenance} pageSize={10} emptyMessage="لا توجد صيانة" noToolbar />,
    },
  ];

  return (
    <DetailPageLayout
      title={trip ? `رحلة #${trip.id}` : "الرحلة"}
      subtitle={trip ? `${trip.fromLocation || trip.origin || ""} → ${trip.toLocation || trip.destination || ""}` : undefined}
      backPath="/fleet/trips"
      backLabel="العودة للرحلات"
      status={trip?.status ? { label: trip.status, tone: statusTone } : undefined}
      entityType="fleet_trip"
      entityId={id}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      createdAt={trip?.createdAt}
      updatedAt={trip?.updatedAt}
      overview={overview}
      actions={actions}
      extraTabs={extraTabs}
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
