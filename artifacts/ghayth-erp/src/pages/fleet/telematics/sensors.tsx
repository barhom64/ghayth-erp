import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Fuel, Gauge, Wind, ArrowUpDown, DoorOpen } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";

interface VehicleOption {
  id: number;
  plateNumber: string;
}

interface SensorReadingRow {
  id: number;
  vehicleId: number | null;
  sensorType: string;
  sensorChannel: string | null;
  readingValue: number | null;
  readingState: string | null;
  unit: string | null;
  occurredAt: string;
}

const SENSOR_LABELS: Record<string, { label: string; tone: string; icon: typeof Activity }> = {
  fuel_level: { label: "مستوى الوقود", tone: "bg-status-warning-surface text-status-warning-foreground", icon: Fuel },
  weight: { label: "الوزن", tone: "bg-status-info-surface text-status-info-foreground", icon: Gauge },
  air_pressure: { label: "ضغط الهواء", tone: "bg-purple-50 text-purple-700", icon: Wind },
  pto: { label: "PTO", tone: "bg-status-info-surface text-status-info-foreground", icon: Activity },
  dump_piston: { label: "بستم القلاب", tone: "bg-orange-50 text-orange-700", icon: ArrowUpDown },
  door: { label: "الباب / الصندوق", tone: "bg-surface-subtle text-muted-foreground", icon: DoorOpen },
  temperature: { label: "الحرارة", tone: "bg-rose-100 text-rose-700", icon: Gauge },
  engine_rpm: { label: "RPM", tone: "bg-surface-subtle", icon: Activity },
  battery_voltage: { label: "البطارية", tone: "bg-status-warning-surface text-status-warning-foreground", icon: Activity },
  odometer: { label: "العداد", tone: "bg-status-info-surface text-status-info-foreground", icon: Gauge },
  custom: { label: "أخرى", tone: "bg-surface-subtle", icon: Activity },
};

export default function FleetTelematicsSensors() {
  const [vehicleId, setVehicleId] = useState<string>("");

  const { data: vehicles } = useApiQuery<{ data: VehicleOption[] }>(
    ["fleet-vehicles-options"],
    "/fleet/vehicles?limit=500",
  );
  const vehicleList = asList(vehicles) as VehicleOption[];

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: SensorReadingRow[] }>(
    ["fleet-telematics-sensors", vehicleId],
    vehicleId
      ? `/fleet/telematics/vehicles/${vehicleId}/sensors`
      : "/fleet/telematics/vehicles/0/sensors",
    { enabled: Boolean(vehicleId) },
  );
  const rows = (vehicleId ? (asList(data) as SensorReadingRow[]) : []);

  const kpi = {
    total: rows.length,
    fuel: rows.filter((r) => r.sensorType === "fuel_level").length,
    weight: rows.filter((r) => r.sensorType === "weight").length,
    pto: rows.filter((r) => r.sensorType === "pto" || r.sensorType === "dump_piston").length,
  };

  const columns: DataTableColumn<SensorReadingRow>[] = [
    {
      key: "sensorType",
      header: "النوع",
      sortable: true,
      render: (r) => {
        const info = SENSOR_LABELS[r.sensorType] ?? SENSOR_LABELS.custom;
        const Icon = info.icon;
        return (
          <Badge variant="outline" className={`${info.tone} inline-flex items-center gap-1`}>
            <Icon className="h-3 w-3" />
            {info.label}
          </Badge>
        );
      },
    },
    {
      key: "readingValue",
      header: "القيمة",
      render: (r) =>
        r.readingValue !== null ? (
          <span className="font-mono">
            {Number(r.readingValue).toFixed(2)} {r.unit ?? ""}
          </span>
        ) : r.readingState ? (
          <Badge variant="outline" className="bg-surface-subtle">{r.readingState}</Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "sensorChannel",
      header: "القناة",
      render: (r) => r.sensorChannel || "—",
    },
    {
      key: "occurredAt",
      header: "الوقت",
      sortable: true,
      render: (r) => new Date(r.occurredAt).toLocaleString("ar-SA"),
    },
  ];

  return (
    <PageShell
      title="قراءات الحساسات"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "قراءات الحساسات" },
      ]}
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="اختر مركبة لعرض قراءاتها…" />
              </SelectTrigger>
              <SelectContent>
                {vehicleList.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.plateNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      {vehicleId && (
        <>
          <KpiGrid
            className="mt-4"
            items={[
              { label: "إجمالي القراءات", value: kpi.total, icon: Activity, color: "text-status-info-foreground bg-status-info-surface" },
              { label: "وقود", value: kpi.fuel, icon: Fuel, color: "text-status-warning-foreground bg-status-warning-surface" },
              { label: "وزن", value: kpi.weight, icon: Gauge, color: "text-purple-600 bg-purple-50" },
              { label: "PTO / بستم", value: kpi.pto, icon: ArrowUpDown, color: "text-orange-600 bg-orange-50" },
            ]}
          />
          <Card className="mt-4">
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingSpinner />
              ) : isError ? (
                <ErrorState />
              ) : (
                <DataTable
                  columns={columns}
                  data={rows}
                  onRetry={refetch}
                  searchPlaceholder="ابحث في القراءات…"
                  emptyMessage="لا توجد قراءات لهذه المركبة بعد"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
