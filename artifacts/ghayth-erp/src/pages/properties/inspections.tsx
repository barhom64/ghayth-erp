import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, CheckCircle, Clock, Star } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";

const TYPES: Record<string, string> = {
  move_in: "دخول مستأجر",
  move_out: "خروج مستأجر",
  routine: "دوري",
  maintenance: "صيانة",
};

// Status filter options — label lookup only. Actual chip rendering
// goes through PageStatusBadge (shared domain falls back to the trip
// domain for "scheduled" via `resolveStatus`'s last-resort scan).

export default function InspectionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ unitId: "", type: "routine", scheduledDate: "", inspectorName: "", conditionRating: "", notes: "" });

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["inspections", statusFilter],
    `/properties/inspections${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
  );
  const inspections = asList(data?.data || data);

  const { data: units } = useApiQuery<any>(["property-units"], "/properties/units?limit=200");
  const unitList = asList(units?.data || units);

  const handleSave = async () => {
    if (!form.unitId || !form.type) { toast({ title: "الوحدة والنوع مطلوبان", variant: "destructive" }); return; }
    try {
      await apiFetch("/properties/inspections", { method: "POST", body: JSON.stringify({ ...form, unitId: Number(form.unitId), conditionRating: form.conditionRating ? Number(form.conditionRating) : null }) });
      toast({ title: "تم جدولة الفحص" });
      setShowForm(false);
      setForm({ unitId: "", type: "routine", scheduledDate: "", inspectorName: "", conditionRating: "", notes: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const handleComplete = async (id: number) => {
    const rating = prompt("تقييم حالة الوحدة (1-5):");
    const notes = prompt("ملاحظات الفحص:");
    try {
      await apiFetch(`/properties/inspections/${id}`, { method: "PATCH", body: JSON.stringify({
        status: "completed",
        inspectionDate: todayLocal(),
        conditionRating: rating ? Number(rating) : null,
        notes: notes || null,
      }) });
      refetch();
      toast({ title: "تم إكمال الفحص" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="فحص الوحدات العقارية"
      subtitle="جدولة وتتبع عمليات فحص الوحدات"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "فحص الوحدات العقارية" }]}
      actions={
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> جدولة فحص
        </Button>
      }
    >
      <PropertyTabsNav />
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">جدولة فحص جديد</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>الوحدة *</Label>
              <Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر وحدة" /></SelectTrigger>
                <SelectContent>{unitList.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber} — {u.buildingName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>نوع الفحص *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ الفحص</Label>
              <UnifiedDateInput value={form.scheduledDate} onChange={(iso) => setForm({ ...form, scheduledDate: iso })} />
            </div>
            <div>
              <Label>اسم المفتش</Label>
              <Input value={form.inspectorName} onChange={(e) => setForm({ ...form, inspectorName: e.target.value })} placeholder="اسم المفتش" />
            </div>
            <div>
              <Label>التقييم الأولي (1-5)</Label>
              <Input type="number" min="1" max="5" value={form.conditionRating} onChange={(e) => setForm({ ...form, conditionRating: e.target.value })} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-3 flex gap-2">
              <Button onClick={handleSave} rateLimitAware>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {["all", "scheduled", "completed", "cancelled"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
            {s === "all" ? "الكل" : resolveStatus(s)?.label ?? s}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {inspections.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-gray-400">لا توجد عمليات فحص</CardContent></Card>
        ) : inspections.map((insp: any) => (
          <Card key={insp.id} className="hover:shadow-md">
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{insp.unitNumber} — {insp.buildingName}</span>
                  <PageStatusBadge status={insp.status} />
                  <Badge className="bg-gray-100 text-gray-600">{TYPES[insp.type] || insp.type}</Badge>
                </div>
                <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                  {insp.inspectorName && <p>المفتش: {insp.inspectorName}</p>}
                  <p>
                    {insp.status === "scheduled" ? "موعد الفحص:" : "تاريخ الفحص:"}
                    {" "}{(insp.inspectionDate || insp.scheduledDate)?.split("T")[0]}
                  </p>
                  {insp.notes && <p>{insp.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {insp.conditionRating && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-medium">{insp.conditionRating}/5</span>
                  </div>
                )}
                {insp.status === "scheduled" && (
                  <Button size="sm" onClick={() => handleComplete(insp.id)}>
                    <CheckCircle className="w-3.5 h-3.5 me-1" /> إتمام
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
