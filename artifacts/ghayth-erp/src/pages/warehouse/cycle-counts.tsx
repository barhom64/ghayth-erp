import { useMemo, useState } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ClipboardCheck, Plus, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDateAr, formatNumber, todayLocal } from "@/lib/formatters";
import { PageStatusBadge } from "@workspace/ui-core";

export default function CycleCountsPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayLocal());
  const [planPeriod, setPlanPeriod] = useState(todayLocal().slice(0, 7));

  const { data, refetch } = useApiQuery<any>(["cycle-counts"], "/warehouse/cycle-counts");
  const counts = asList(data?.data || data);

  async function schedule() {
    if (!warehouseId) { toast({ title: "حدد المخزن أولاً", variant: "destructive" }); return; }
    try {
      await apiFetch("/warehouse/cycle-counts", {
        method: "POST",
        body: JSON.stringify({ warehouseId: Number(warehouseId), scheduledDate }),
      });
      toast({ title: "تم جدولة الجرد" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function generatePlan() {
    if (!warehouseId) { toast({ title: "حدد المخزن أولاً", variant: "destructive" }); return; }
    try {
      const res = await apiFetch<any>("/warehouse/cycle-counts/plans", {
        method: "POST",
        body: JSON.stringify({ warehouseId: Number(warehouseId), period: planPeriod, scheduledDate }),
      });
      toast({
        title: res.data.reused ? "خطة موجودة مسبقاً" : "تم توليد خطة الجرد",
        description: `تم جدولة ${res.data.scheduledCount} جرد (A:${res.data.byCategory.A} B:${res.data.byCategory.B} C:${res.data.byCategory.C})`,
      });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function approve(id: number) {
    try { await apiFetch(`/warehouse/cycle-counts/${id}/approve`, { method: "POST" }); toast({ title: "تم الاعتماد" }); refetch(); }
    catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }
  async function submit(id: number) {
    try { await apiFetch(`/warehouse/cycle-counts/${id}/submit`, { method: "POST" }); toast({ title: "تم الإرسال للمراجعة" }); refetch(); }
    catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }
  async function postJournal(id: number) {
    try { await apiFetch(`/warehouse/cycle-counts/${id}/post`, { method: "POST" }); toast({ title: "تم ترحيل القيد" }); refetch(); }
    catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  const columns = useMemo<any[]>(() => [
    { key: "id", header: "#", cell: (r: any) => `#${r.id}` },
    { key: "warehouseName", header: "المخزن", cell: (r: any) => r.warehouseName ?? `#${r.warehouseId}` },
    { key: "scheduledDate", header: "التاريخ", cell: (r: any) => formatDateAr(r.scheduledDate) },
    { key: "lineCount", header: "الأسطر", cell: (r: any) => formatNumber(Number(r.lineCount ?? 0)) },
    { key: "netVarianceValue", header: "صافي الفرق (ر.س)", cell: (r: any) => formatNumber(Number(r.netVarianceValue ?? 0)) },
    { key: "planId", header: "خطة", cell: (r: any) => r.planId ? `#${r.planId}` : "—" },
    { key: "status", header: "الحالة", cell: (r: any) => <PageStatusBadge status={r.status} domain="cycle_count" /> },
    { key: "actions", header: "إجراءات", cell: (r: any) => (
      <div className="flex gap-2">
        {r.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => submit(r.id)}>إرسال للمراجعة</Button>}
        {r.status === "reviewed" && <Button size="sm" onClick={() => approve(r.id)}>اعتماد</Button>}
        {r.status === "approved" && <Button size="sm" variant="outline" onClick={() => postJournal(r.id)}>ترحيل قيد</Button>}
      </div>
    ) },
  ], []);

  return (
    <PageShell title="الجرد الدوري" >
      <WarehouseTabsNav />
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">المخزن (id)</label>
            <Input className="w-32" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">تاريخ الجرد</label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <Button onClick={schedule}><Plus className="ml-1 h-4 w-4" />جدولة جرد فردي</Button>
          <div className="ms-4">
            <label className="block text-sm mb-1">فترة الخطة (YYYY-MM)</label>
            <Input className="w-32" value={planPeriod} onChange={(e) => setPlanPeriod(e.target.value)} />
          </div>
          <Button variant="outline" onClick={generatePlan}><Wand2 className="ml-1 h-4 w-4" />توليد خطة ABC</Button>
        </CardContent>
      </Card>
      <Card><CardContent className="pt-6">
        <DataTable data={counts} columns={columns} emptyMessage="لا توجد عمليات جرد" />
      </CardContent></Card>
    </PageShell>
  );
}
