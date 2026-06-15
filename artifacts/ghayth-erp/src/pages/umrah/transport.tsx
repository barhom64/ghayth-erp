import { useState } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { formatUmrahDate, formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Plus } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";

interface VehicleOption { id: number; plateNumber: string; }
interface DriverOption { id: number; name: string; status?: string; }

interface TransportEntry {
  id: number;
  tripDate?: string;
  fromLocation?: string;
  toLocation?: string;
  capacity?: number;
  pilgrimCount?: number;
  cost?: number;
  status?: string;
  notes?: string;
  vehiclePlate?: string;
  driverName?: string;
}

// نقل العمرة كيان عمرة قديم بتسمياته المحروسة (umrahViolationStatusArabicSmoke)
// — يبقى محليًا ولا يُوحَّد على كيان "trip" الذي يستخدم تسميات شاشة السائق.
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  scheduled: { label: "مجدولة", color: "bg-status-info-surface text-status-info-foreground" },
  in_progress: { label: "في الطريق", color: "bg-status-warning-surface text-yellow-800" },
  completed: { label: "مكتملة", color: "bg-status-success-surface text-status-success-foreground" },
  cancelled: { label: "ملغاة", color: "bg-status-error-surface text-status-error-foreground" },
};

const columns: DataTableColumn<TransportEntry>[] = [
  { key: "tripDate", header: "تاريخ الرحلة", sortable: true, render: (r) => formatUmrahDate(r.tripDate) },
  { key: "fromLocation", header: "من", searchable: true },
  { key: "toLocation", header: "إلى", searchable: true },
  { key: "vehiclePlate", header: "المركبة", render: (r) => r.vehiclePlate || "-" },
  { key: "driverName", header: "السائق", render: (r) => r.driverName || "-" },
  { key: "capacity", header: "السعة" },
  { key: "pilgrimCount", header: "المعتمرين" },
  { key: "cost", header: "التكلفة", render: (r) => r.cost ? formatCurrency(Number(r.cost)) : "-" },
  {
    key: "status", header: "الحالة", sortable: true, render: (r) => {
      const s = STATUS_MAP[r.status || ""] || { label: r.status || "-", color: "bg-surface-subtle text-status-neutral-foreground" };
      return <Badge className={s.color}>{s.label}</Badge>;
    }
  },
];

export default function UmrahTransport() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["umrah-transport"], "/umrah/transport");
  const rows = asList(data?.data || data);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const { toast } = useToast();

  // Vehicle + driver pickers: load lazily when the form opens so the
  // hot transport list doesn't pay for the join on every page view.
  const { data: vehiclesResp } = useApiQuery<{ data: VehicleOption[] }>(
    ["fleet-vehicles-options"],
    "/fleet/vehicles?limit=500",
    showForm,
  );
  const vehicleOptions = asList(vehiclesResp) as VehicleOption[];
  const { data: driversResp } = useApiQuery<{ data: DriverOption[] }>(
    ["fleet-drivers-options"],
    "/fleet/drivers?limit=500",
    showForm,
  );
  // Filter out drivers that are not bookable (off_duty/suspended) —
  // the dispatcher can override by editing the trip later, but the
  // default picker keeps the UI honest about who's actually available.
  const allDrivers = asList(driversResp) as DriverOption[];
  const driverOptions = allDrivers.filter(
    (d) => d.status === "available" || d.status === "on_trip" || !d.status,
  );

  const save = async () => {
    try {
      await apiFetch("/umrah/transport", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إنشاء رحلة النقل" });
      setShowForm(false);
      setForm({});
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || err?.error || "خطأ في إنشاء الرحلة" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="النقل والمواصلات"
      subtitle="إدارة رحلات نقل المعتمرين والمواصلات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "النقل والمواصلات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_umrah_transport"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "نقل العمرة", total: printRows.length },
              items: printRows.map((t: any) => ({
                "التاريخ": t.tripDate || "—",
                "من": t.fromLocation || "—",
                "إلى": t.toLocation || "—",
                "المركبة": t.vehiclePlate || t.plateNumber || "—",
                "السائق": t.driverName || "—",
                "السعة": t.capacity ?? "—",
                "عدد المعتمرين": t.pilgrimCount ?? 0,
                "التكلفة": t.cost ?? 0,
                "الحالة": (t.status && STATUS_MAP[t.status]?.label) ?? t.status ?? "—",
              })),
            })}
          />
          <GuardedButton perm="umrah:create" onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="h-4 w-4" />رحلة جديدة</GuardedButton>
        </div>
      }
    >
      <UmrahTabsNav />
      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><Label>تاريخ الرحلة *</Label><UnifiedDateInput value={form.tripDate || ""} onChange={v => setForm({ ...form, tripDate: v })} showDualCalendar showPresets /></div>
            <div><Label>من *</Label><Input value={form.fromLocation || ""} onChange={e => setForm({ ...form, fromLocation: e.target.value })} placeholder="مكة" /></div>
            <div><Label>إلى *</Label><Input value={form.toLocation || ""} onChange={e => setForm({ ...form, toLocation: e.target.value })} placeholder="المدينة" /></div>
            <div>
              <Label>المركبة</Label>
              <Select
                value={form.vehicleId ? String(form.vehicleId) : "none"}
                onValueChange={(v) => setForm({ ...form, vehicleId: v === "none" ? undefined : Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="بدون تعيين" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تعيين</SelectItem>
                  {vehicleOptions.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>السائق</Label>
              <Select
                value={form.driverId ? String(form.driverId) : "none"}
                onValueChange={(v) => setForm({ ...form, driverId: v === "none" ? undefined : Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="بدون تعيين" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تعيين</SelectItem>
                  {driverOptions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}{d.status === "on_trip" ? " (في رحلة)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>السعة</Label><Input type="number" value={form.capacity || ""} onChange={e => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : undefined })} placeholder="45" /></div>
            <div><Label>عدد المعتمرين</Label><Input type="number" value={form.pilgrimCount || ""} onChange={e => setForm({ ...form, pilgrimCount: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div><Label>التكلفة</Label><Input type="number" value={form.cost || ""} onChange={e => setForm({ ...form, cost: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div className="col-span-full"><Label>ملاحظات</Label><Input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({}); }}>إلغاء</Button>
              <Button onClick={save} disabled={!form.tripDate || !form.fromLocation || !form.toLocation}>حفظ</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={rows}
        onRowClick={(r) => navigate(`/umrah/transport/${r.id}`)}
        emptyMessage="لا توجد رحلات نقل مسجلة"
      />
    </PageShell>
  );
}
