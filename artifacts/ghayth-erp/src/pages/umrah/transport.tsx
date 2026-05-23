import { useState } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Plus } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";

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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  scheduled: { label: "مجدولة", color: "bg-status-info-surface text-status-info-foreground" },
  in_progress: { label: "في الطريق", color: "bg-status-warning-surface text-yellow-800" },
  completed: { label: "مكتملة", color: "bg-status-success-surface text-status-success-foreground" },
  cancelled: { label: "ملغاة", color: "bg-status-error-surface text-status-error-foreground" },
};

const columns: DataTableColumn<TransportEntry>[] = [
  { key: "tripDate", header: "تاريخ الرحلة", sortable: true, render: (r) => formatDateAr(r.tripDate) },
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
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const { toast } = useToast();

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
      actions={<GuardedButton perm="umrah:create" onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="h-4 w-4" />رحلة جديدة</GuardedButton>}
    >
      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><Label>تاريخ الرحلة *</Label><UnifiedDateInput value={form.tripDate || ""} onChange={v => setForm({ ...form, tripDate: v })} showDualCalendar showPresets /></div>
            <div><Label>من *</Label><Input value={form.fromLocation || ""} onChange={e => setForm({ ...form, fromLocation: e.target.value })} placeholder="مكة" /></div>
            <div><Label>إلى *</Label><Input value={form.toLocation || ""} onChange={e => setForm({ ...form, toLocation: e.target.value })} placeholder="المدينة" /></div>
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
        data={rows}
        onRowClick={(r) => navigate(`/umrah/transport/${r.id}`)}
        emptyMessage="لا توجد رحلات نقل مسجلة"
      />
    </PageShell>
  );
}
