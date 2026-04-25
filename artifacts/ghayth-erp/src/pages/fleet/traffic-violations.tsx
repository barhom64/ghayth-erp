import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, CheckCircle, DollarSign } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const VIOLATION_TYPES: Record<string, string> = {
  speeding: "تجاوز السرعة",
  red_light: "تجاوز الإشارة الحمراء",
  no_seatbelt: "عدم الحزام",
  wrong_parking: "وقوف خاطئ",
  phone: "استخدام الجوال",
  other: "أخرى",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "غير مدفوعة" },
  { value: "paid", label: "مدفوعة" },
];

export default function TrafficViolationsPage() {
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useFilters();
  const [form, setForm] = useState({ vehicleId: "", driverId: "", violationType: "speeding", violationDate: new Date().toISOString().split("T")[0], fineAmount: "", location: "", violationNumber: "", notes: "" });

  const { data, refetch } = useApiQuery<any>(["traffic-violations"], "/fleet/traffic-violations");
  const violations = asList(data?.data || data);

  const { data: vehicles } = useApiQuery<any>(["fleet-vehicles"], "/fleet/vehicles?limit=200");
  const { data: drivers } = useApiQuery<any>(["fleet-drivers"], "/fleet/drivers?limit=200");
  const vehicleList = asList(vehicles?.data || vehicles);
  const driverList = asList(drivers?.data || drivers);

  const pendingFines = violations.filter((v: any) => v.status !== "paid").reduce((s: number, v: any) => s + Number(v.fineAmount || 0), 0);
  const paidFines = violations.filter((v: any) => v.status === "paid").reduce((s: number, v: any) => s + Number(v.fineAmount || 0), 0);

  const handleSave = async () => {
    if (!form.vehicleId || !form.violationType) { toast({ title: "المركبة ونوع المخالفة مطلوبان", variant: "destructive" }); return; }
    try {
      await apiFetch("/fleet/traffic-violations", { method: "POST", body: JSON.stringify({ ...form, vehicleId: Number(form.vehicleId), driverId: form.driverId ? Number(form.driverId) : null, fineAmount: Number(form.fineAmount || 0) }) });
      toast({ title: "تم تسجيل المخالفة" });
      setShowForm(false);
      setForm({ vehicleId: "", driverId: "", violationType: "speeding", violationDate: new Date().toISOString().split("T")[0], fineAmount: "", location: "", violationNumber: "", notes: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const handlePay = async (id: number) => {
    try { await apiFetch(`/fleet/traffic-violations/${id}/pay`, { method: "PATCH", body: JSON.stringify({}) }); refetch(); toast({ title: "تم تسجيل الدفع" }); }
    catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const filtered = applyFilters(violations, filters, {
    searchFields: ["plateNumber", "driverName", "violationNumber", "location"],
    statusField: "status",
    dateField: "violationDate",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "plateNumber",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (v) => (
        <div>
          <div className="font-medium">{v.plateNumber}</div>
          {v.driverName && <div className="text-xs text-gray-500">{v.driverName}</div>}
        </div>
      ),
    },
    {
      key: "violationType",
      header: "نوع المخالفة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline">{VIOLATION_TYPES[v.violationType] || v.violationType}</Badge>
      ),
    },
    {
      key: "violationDate",
      header: "التاريخ",
      sortable: true,
      render: (v) => v.violationDate?.split("T")[0] || "-",
    },
    {
      key: "violationNumber",
      header: "رقم المخالفة",
      sortable: true,
      searchable: true,
      render: (v) => v.violationNumber ? (
        <span className="font-mono text-xs">#{v.violationNumber}</span>
      ) : "-",
    },
    {
      key: "location",
      header: "الموقع",
      searchable: true,
      render: (v) => v.location || "-",
    },
    {
      key: "fineAmount",
      header: "الغرامة",
      sortable: true,
      align: "end",
      render: (v) => (
        <span className="font-bold text-red-600">{Number(v.fineAmount || 0).toFixed(0)} ر.س</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => (
        <Badge className={v.status === "paid" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
          {v.status === "paid" ? "مدفوعة" : "غير مدفوعة"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      align: "center",
      render: (v) => v.status !== "paid" ? (
        <Button size="sm" variant="outline" onClick={() => handlePay(v.id)}>
          <DollarSign className="w-3.5 h-3.5 me-1" /> دفع
        </Button>
      ) : (
        <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
      ),
    },
  ];

  return (
    <PageShell
      title="المخالفات المرورية"
      subtitle="تتبع وإدارة مخالفات مركبات الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "المخالفات المرورية" }]}
      actions={
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> تسجيل مخالفة
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold">{violations.length}</div><div className="text-xs text-gray-500">إجمالي المخالفات</div></CardContent></Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-red-600">{pendingFines.toFixed(0)} ر.س</div>
            <div className="text-xs text-gray-500">غرامات غير مدفوعة</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-green-600">{paidFines.toFixed(0)} ر.س</div>
            <div className="text-xs text-gray-500">غرامات مدفوعة</div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">تسجيل مخالفة جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>المركبة *</Label>
              <Select value={form.vehicleId} onValueChange={(v) => setForm({ ...form, vehicleId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر مركبة" /></SelectTrigger>
                <SelectContent>{vehicleList.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>السائق</Label>
              <Select value={form.driverId} onValueChange={(v) => setForm({ ...form, driverId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر سائقاً" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {driverList.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع المخالفة *</Label>
              <Select value={form.violationType} onValueChange={(v) => setForm({ ...form, violationType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(VIOLATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ المخالفة</Label>
              <UnifiedDateInput value={form.violationDate} onChange={(v) => setForm({ ...form, violationDate: v })} showDualCalendar showPresets />
            </div>
            <div>
              <Label>مبلغ الغرامة (ر.س)</Label>
              <Input type="number" value={form.fineAmount} onChange={(e) => setForm({ ...form, fineAmount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>رقم المخالفة</Label>
              <Input value={form.violationNumber} onChange={(e) => setForm({ ...form, violationNumber: e.target.value })} placeholder="رقم المخالفة الرسمي" />
            </div>
            <div>
              <Label>الموقع</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="موقع المخالفة" />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSave} className="w-full">حفظ</Button>
            </div>
            <div className="col-span-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AdvancedFilters
        config={{
          showSearch: true,
          searchPlaceholder: "بحث بالمركبة، السائق، رقم المخالفة...",
          statuses: STATUS_OPTIONS,
          showDateRange: true,
          extraFilters: [
            ...(vehicleList.length > 0 ? [{
              key: "violationType",
              label: "نوع المخالفة",
              options: Object.entries(VIOLATION_TYPES).map(([value, label]) => ({ value, label })),
            }] : []),
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد مخالفات مسجلة"
        emptyIcon={<AlertTriangle className="w-10 h-10 text-gray-300" />}
        rowClassName={(v) => v.status === "paid" ? "opacity-60" : undefined as any}
      />
    </PageShell>
  );
}
