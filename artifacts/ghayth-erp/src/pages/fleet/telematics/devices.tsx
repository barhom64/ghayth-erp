import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HardDrive, Plus, Cable, Wifi, PlayCircle } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface DeviceRow {
  id: number;
  cmsv6DeviceNo: string;
  deviceLabel: string | null;
  deviceModel: string | null;
  vehicleId: number | null;
  vehiclePlate: string | null;
  status: string;
  channelCount: number;
  lastOnlineAt: string | null;
  lastPositionAt: string | null;
}

interface VehicleOption {
  id: number;
  plateNumber: string;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  online: { label: "متصل", tone: "bg-status-success-surface text-status-success-foreground" },
  offline: { label: "غير متصل", tone: "bg-rose-100 text-rose-700" },
  linked: { label: "مربوط", tone: "bg-status-info-surface text-status-info-foreground" },
  unlinked: { label: "غير مربوط", tone: "bg-surface-subtle text-muted-foreground" },
  error: { label: "خطأ", tone: "bg-rose-100 text-rose-700" },
  decommissioned: { label: "موقوف", tone: "bg-surface-subtle text-muted-foreground" },
};

export default function FleetTelematicsDevices() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cmsv6DeviceNo: "",
    vehicleId: "",
    deviceLabel: "",
    deviceModel: "",
    channelCount: "4",
    imei: "",
    sim: "",
  });

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: DeviceRow[] }>(
    ["fleet-telematics-devices"],
    "/fleet/telematics/devices",
  );
  const rows = asList(data) as DeviceRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const { data: vehicles } = useApiQuery<{ data: VehicleOption[] }>(
    ["fleet-vehicles-options"],
    "/fleet/vehicles?limit=500",
  );
  const vehicleList = asList(vehicles) as VehicleOption[];

  const openVideoMut = useApiMutation<
    { data?: { proxyUrl?: string; id?: number } },
    { deviceId: number; channelNo: number; streamType?: string }
  >(
    "/fleet/telematics/video/session",
    "POST",
    [["fleet-telematics-video-sessions"]],
    {
      successMessage: "تم فتح جلسة بث مباشر",
      onSuccess: (resp) => {
        const url = resp?.data?.proxyUrl;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },
    },
  );

  const linkMut = useApiMutation<unknown, typeof form>(
    "/fleet/telematics/devices/link",
    "POST",
    [["fleet-telematics-devices"], ["fleet-telematics-live"]],
    {
      successMessage: "تم ربط جهاز MDVR بالمركبة",
      onSuccess: () => {
        setOpen(false);
        setForm({
          cmsv6DeviceNo: "",
          vehicleId: "",
          deviceLabel: "",
          deviceModel: "",
          channelCount: "4",
          imei: "",
          sim: "",
        });
      },
    },
  );

  const columns: DataTableColumn<DeviceRow>[] = [
    {
      key: "cmsv6DeviceNo",
      header: "رقم الجهاز",
      sortable: true,
      searchable: true,
      render: (d) => (
        <div className="text-sm font-mono">{d.cmsv6DeviceNo}</div>
      ),
    },
    {
      key: "deviceLabel",
      header: "الوصف",
      sortable: true,
      searchable: true,
      render: (d) => d.deviceLabel || d.deviceModel || "—",
    },
    {
      key: "vehiclePlate",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (d) => d.vehiclePlate || <span className="text-muted-foreground">غير مربوط</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (d) => {
        const info = STATUS_LABEL[d.status] ?? { label: d.status, tone: "bg-surface-subtle" };
        return <Badge variant="outline" className={info.tone}>{info.label}</Badge>;
      },
    },
    {
      key: "channelCount",
      header: "القنوات",
      render: (d) => `${d.channelCount} CH`,
    },
    {
      key: "lastOnlineAt",
      header: "آخر اتصال",
      render: (d) => d.lastOnlineAt ? new Date(d.lastOnlineAt).toLocaleString("ar-SA") : "—",
    },
    {
      key: "actions",
      header: "إجراء",
      render: (d) => (
        <GuardedButton
          perm="fleet.telematics.video:create"
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            openVideoMut.mutate({ deviceId: d.id, channelNo: 1, streamType: "hls" });
          }}
          disabled={openVideoMut.isPending || d.status !== "active"}
          title="فتح بث القناة 1 (HLS)"
        >
          <PlayCircle className="h-4 w-4 me-1" />
          بث مباشر
        </GuardedButton>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="أجهزة MDVR"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "أجهزة MDVR" },
      ]}
      actions={
        <div className="flex items-center gap-2">
        <PrintButton
          entityType="report_fleet_mdvr_devices"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "أجهزة MDVR", total: printRows.length },
            items: printRows.map((d: any) => ({
              "رقم الجهاز": d.cmsv6DeviceNo,
              "الوصف": d.deviceLabel || d.deviceModel || "—",
              "المركبة": d.vehiclePlate || "غير مربوط",
              "الحالة": (STATUS_LABEL[d.status] ?? { label: d.status }).label,
              "القنوات": `${d.channelCount} CH`,
              "آخر اتصال": d.lastOnlineAt ? new Date(d.lastOnlineAt).toLocaleString("ar-SA") : "—",
            })),
          })}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <GuardedButton perm="fleet.telematics.devices:create" size="sm">
              <Plus className="h-4 w-4 me-1" />
              ربط جهاز MDVR
            </GuardedButton>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ربط جهاز MDVR بمركبة</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>رقم الجهاز (CMSV6 deviceNo) *</Label>
                <Input
                  value={form.cmsv6DeviceNo}
                  onChange={(e) => setForm({ ...form, cmsv6DeviceNo: e.target.value })}
                />
              </div>
              <div>
                <Label>المركبة *</Label>
                <Select
                  value={form.vehicleId}
                  onValueChange={(v) => setForm({ ...form, vehicleId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المركبة" />
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
              <div>
                <Label>الوصف</Label>
                <Input
                  value={form.deviceLabel}
                  onChange={(e) => setForm({ ...form, deviceLabel: e.target.value })}
                />
              </div>
              <div>
                <Label>طراز الجهاز</Label>
                <Input
                  value={form.deviceModel}
                  onChange={(e) => setForm({ ...form, deviceModel: e.target.value })}
                />
              </div>
              <div>
                <Label>عدد القنوات</Label>
                <Input
                  type="number"
                  value={form.channelCount}
                  onChange={(e) => setForm({ ...form, channelCount: e.target.value })}
                />
              </div>
              <div>
                <Label>IMEI</Label>
                <Input
                  value={form.imei}
                  onChange={(e) => setForm({ ...form, imei: e.target.value })}
                />
              </div>
              <div>
                <Label>رقم الشريحة (SIM)</Label>
                <Input
                  value={form.sim}
                  onChange={(e) => setForm({ ...form, sim: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <GuardedButton
                perm="fleet.telematics.devices:create"
                onClick={() => linkMut.mutate(form)}
                disabled={
                  linkMut.isPending ||
                  !form.cmsv6DeviceNo ||
                  !form.vehicleId
                }
              >
                <Cable className="h-4 w-4 me-1" />
                ربط
              </GuardedButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />
      <KpiGrid
        items={[
          { label: "إجمالي الأجهزة", value: rows.length, icon: HardDrive, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "متصلة", value: rows.filter((r) => r.status === "online").length, icon: Wifi, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "مربوطة بمركبات", value: rows.filter((r) => r.vehicleId !== null).length, icon: Cable, color: "text-purple-600 bg-purple-50" },
          { label: "بانتظار الربط", value: rows.filter((r) => r.vehicleId === null).length, icon: HardDrive, color: "text-orange-600 bg-orange-50" },
        ]}
      />
      <Card className="mt-4">
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            searchPlaceholder="ابحث برقم الجهاز أو المركبة…"
            emptyMessage="لا توجد أجهزة MDVR — اضغط زر الربط لإضافة أول جهاز"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
