import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Plus, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const SERVICE_TYPES: Record<string, string> = {
  oil_change: "تغيير زيت",
  filter: "فلتر",
  tire_rotation: "دوران الإطارات",
  brake_check: "فحص الفرامل",
  battery: "بطارية",
  ac: "مكيف",
  full_service: "صيانة شاملة",
  other: "أخرى",
};

function getDueDays(nextDate?: string): number | null {
  if (!nextDate) return null;
  return Math.round((new Date(nextDate).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function getDueStatus(nextDate?: string): "overdue" | "due_soon" | "ok" | "none" {
  const d = getDueDays(nextDate);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 7) return "due_soon";
  return "ok";
}

export default function PreventivePlansPage() {
  const [showForm, setShowForm] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("__all__");
  const [filters, setFilters] = useFilters();
  const [form, setForm] = useState({
    vehicleId: "", serviceType: "oil_change",
    intervalKm: "", intervalDays: "",
    lastServiceDate: "", lastServiceMileage: "",
    nextServiceDate: "", estimatedCost: "", notes: "",
  });

  const { data, refetch } = useApiQuery<any>(
    ["preventive-plans", vehicleFilter],
    `/fleet/preventive-plans${vehicleFilter && vehicleFilter !== "__all__" ? `?vehicleId=${vehicleFilter}` : ""}`
  );
  const plans = asList(data?.data || data);

  const { data: vehicles } = useApiQuery<any>(["fleet-vehicles"], "/fleet/vehicles?limit=200");
  const vehicleList = asList(vehicles?.data || vehicles);

  const handleSave = async () => {
    if (!form.vehicleId || !form.serviceType) { toast({ title: "المركبة ونوع الخدمة مطلوبان", variant: "destructive" }); return; }
    try {
      await apiFetch("/fleet/preventive-plans", { method: "POST", body: JSON.stringify({
        ...form,
        vehicleId: Number(form.vehicleId),
        intervalKm: form.intervalKm ? Number(form.intervalKm) : null,
        intervalDays: form.intervalDays ? Number(form.intervalDays) : null,
        lastServiceMileage: form.lastServiceMileage ? Number(form.lastServiceMileage) : null,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : 0,
      }) });
      toast({ title: "تم إضافة خطة الصيانة الوقائية" });
      setShowForm(false);
      setForm({ vehicleId: "", serviceType: "oil_change", intervalKm: "", intervalDays: "", lastServiceDate: "", lastServiceMileage: "", nextServiceDate: "", estimatedCost: "", notes: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const overdueCount = plans.filter((p: any) => getDueStatus(p.nextServiceDate) === "overdue").length;
  const dueSoonCount = plans.filter((p: any) => getDueStatus(p.nextServiceDate) === "due_soon").length;

  const filtered = applyFilters(plans, filters, {
    searchFields: ["plateNumber", "serviceType"],
    statusField: "serviceType",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "plateNumber",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (row) => <span className="font-semibold">{row.plateNumber || "-"}</span>,
    },
    {
      key: "serviceType",
      header: "نوع الخدمة",
      sortable: true,
      render: (row) => (
        <Badge variant="outline">{SERVICE_TYPES[row.serviceType] || row.serviceType}</Badge>
      ),
    },
    {
      key: "intervalKm",
      header: "الفترة (كم)",
      sortable: true,
      render: (row) => row.intervalKm ? `${row.intervalKm} كم` : "-",
    },
    {
      key: "intervalDays",
      header: "الفترة (أيام)",
      sortable: true,
      render: (row) => row.intervalDays ? `${row.intervalDays} يوم` : "-",
    },
    {
      key: "lastServiceDate",
      header: "آخر خدمة",
      sortable: true,
      render: (row) => row.lastServiceDate ? row.lastServiceDate.split("T")[0] : "-",
    },
    {
      key: "nextServiceDate",
      header: "الخدمة القادمة",
      sortable: true,
      render: (row) => row.nextServiceDate ? row.nextServiceDate.split("T")[0] : "-",
    },
    {
      key: "dueStatus",
      header: "الحالة",
      render: (row) => {
        const dueDays = getDueDays(row.nextServiceDate);
        const status = getDueStatus(row.nextServiceDate);
        if (status === "overdue") return (
          <div className="flex items-center gap-1">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <Badge className="bg-red-100 text-red-700">متأخر {Math.abs(dueDays!)} يوم</Badge>
          </div>
        );
        if (status === "due_soon") return (
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-yellow-500" />
            <Badge className="bg-yellow-100 text-yellow-700">خلال {dueDays} يوم</Badge>
          </div>
        );
        if (status === "ok") return (
          <Badge className="bg-green-100 text-green-700">{dueDays} يوم</Badge>
        );
        return <span className="text-gray-400">-</span>;
      },
    },
    {
      key: "estimatedCost",
      header: "التكلفة التقديرية",
      sortable: true,
      align: "end",
      render: (row) => row.estimatedCost > 0 ? `${row.estimatedCost} ر.س` : "-",
    },
  ];

  return (
    <PageShell
      title="خطط الصيانة الوقائية"
      subtitle="جدولة الصيانة الدورية لمركبات الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "خطط الصيانة الوقائية" }]}
      actions={
        <>
          {overdueCount > 0 && <Badge className="bg-red-100 text-red-700">{overdueCount} متأخر</Badge>}
          {dueSoonCount > 0 && <Badge className="bg-yellow-100 text-yellow-700">{dueSoonCount} قريب</Badge>}
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="w-4 h-4 me-1" /> إضافة خطة
          </Button>
        </>
      }
    >
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">خطة صيانة وقائية جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>المركبة *</Label>
              <Select value={form.vehicleId} onValueChange={(v) => setForm({ ...form, vehicleId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر مركبة" /></SelectTrigger>
                <SelectContent>
                  {vehicleList.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} — {v.make} {v.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع الخدمة *</Label>
              <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفترة (أيام)</Label>
              <Input type="number" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} placeholder="مثال: 90" />
            </div>
            <div>
              <Label>الفترة (كم)</Label>
              <Input type="number" value={form.intervalKm} onChange={(e) => setForm({ ...form, intervalKm: e.target.value })} placeholder="مثال: 5000" />
            </div>
            <div>
              <Label>آخر خدمة</Label>
              <UnifiedDateInput value={form.lastServiceDate} onChange={(v) => setForm({ ...form, lastServiceDate: v })} showDualCalendar showPresets />
            </div>
            <div>
              <Label>موعد الخدمة القادمة</Label>
              <UnifiedDateInput value={form.nextServiceDate} onChange={(v) => setForm({ ...form, nextServiceDate: v })} showDualCalendar showPresets />
            </div>
            <div>
              <Label>التكلفة التقديرية (ر.س)</Label>
              <Input type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} />
            </div>
            <div>
              <Label>آخر عداد خدمة (كم)</Label>
              <Input type="number" value={form.lastServiceMileage} onChange={(e) => setForm({ ...form, lastServiceMileage: e.target.value })} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-3 flex gap-2">
              <Button onClick={handleSave}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AdvancedFilters
        config={{
          showSearch: true,
          searchPlaceholder: "بحث بالمركبة أو نوع الخدمة...",
          statuses: Object.entries(SERVICE_TYPES).map(([value, label]) => ({ value, label })),
          showDateRange: false,
          extraFilters: vehicleList.length > 0 ? [{
            key: "vehicle",
            label: "المركبة",
            options: vehicleList.map((v: any) => ({ value: String(v.id), label: v.plateNumber })),
          }] : [],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد خطط صيانة وقائية"
        emptyIcon={<Wrench className="w-10 h-10 text-gray-300" />}
        rowClassName={(row) => {
          const status = getDueStatus(row.nextServiceDate);
          if (status === "overdue") return "bg-red-50/40";
          if (status === "due_soon") return "bg-yellow-50/40";
          return undefined as any;
        }}
      />
    </PageShell>
  );
}
