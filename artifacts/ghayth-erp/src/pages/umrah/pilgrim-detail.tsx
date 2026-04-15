import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useRoute, Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Save, User, Calendar, AlertTriangle } from "lucide-react";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";

const STATUS_OPTIONS = [
  { value: "pending", label: "لم يصل" },
  { value: "arrived", label: "وصل" },
  { value: "active", label: "نشط" },
  { value: "overstayed", label: "متأخر" },
  { value: "departed", label: "غادر" },
  { value: "violated", label: "مخالف" },
  { value: "cancelled", label: "ملغي" },
];

export default function PilgrimDetail() {
  const [, params] = useRoute("/umrah/pilgrims/:id");
  const id = params?.id || "";
  const { data, refetch, isLoading } = useApiQuery<any>(["umrah-pilgrim", id], `/umrah/pilgrims/${id}`);
  const [newStatus, setNewStatus] = useState("");
  const { toast } = useToast();

  if (!data) return <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>;

  const updateStatus = async () => {
    if (!newStatus) return;
    try {
      await apiFetch(`/umrah/pilgrims/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      toast({ title: "تم تحديث الحالة" });
      setNewStatus("");
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ في التحديث" }); }
  };

  const personalFields = [
    { label: "الاسم الكامل", value: data.fullName },
    { label: "رقم الجواز", value: data.passportNumber },
    { label: "رقم التأشيرة", value: data.visaNumber },
    { label: "الجنسية", value: data.nationality },
    { label: "الجنس", value: data.gender === "male" ? "ذكر" : data.gender === "female" ? "أنثى" : "-" },
    { label: "الهاتف", value: data.phone },
  ];

  const tripFields = [
    { label: "الموسم", value: data.seasonTitle },
    { label: "الوكيل", value: data.agentName },
    { label: "الباقة", value: data.packageName },
    { label: "تاريخ الوصول المخطط", value: data.arrivalDate ? formatDateAr(data.arrivalDate) : "-" },
    { label: "تاريخ المغادرة المخطط", value: data.departureDate ? formatDateAr(data.departureDate) : "-" },
    { label: "الوصول الفعلي", value: data.actualArrival ? formatDateAr(data.actualArrival) : "-" },
    { label: "المغادرة الفعلية", value: data.actualDeparture ? formatDateAr(data.actualDeparture) : "-" },
    { label: "الفندق", value: data.hotelName },
    { label: "رقم الغرفة", value: data.roomNumber },
  ];

  return (
    <PageShell
      title={data.fullName || "المعتمر"}
      subtitle={`${data.passportNumber || ""}${data.nationality ? ` • ${data.nationality}` : ""}`}
      loading={isLoading}
      breadcrumbs={[{ href: "/umrah", label: "العمرة" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <PageStatusBadge status={data.status} />
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="تغيير الحالة" /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={updateStatus} disabled={!newStatus} className="gap-2">
            <Save className="h-4 w-4" />تحديث
          </Button>
          <Link href="/umrah/pilgrims">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />البيانات الشخصية</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {personalFields.map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="font-medium text-sm">{f.value || "-"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />بيانات الرحلة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {tripFields.map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="font-medium text-sm">{f.value || "-"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {(data.penalties || []).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />الغرامات ({data.penalties.length})</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  { key: "type", header: "النوع", render: (p) => p.type === "overstay" ? "تجاوز مدة" : p.type },
                  { key: "daysOverstayed", header: "أيام التأخر", render: (p) => `${p.daysOverstayed} يوم` },
                  { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold text-red-600">{Number(p.amount).toLocaleString()} ريال</span> },
                  { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
                ] as DataTableColumn<any>[]}
                data={data.penalties}
                noToolbar
                pageSize={0}
              />
            </CardContent>
          </Card>
        )}

        {data.notes && (
          <Card>
            <CardHeader><CardTitle className="text-base">ملاحظات</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{data.notes}</p></CardContent>
          </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">سجل الأحداث</CardTitle></CardHeader>
          <CardContent>
            <EntityTimeline entityType="pilgrim" entityId={data.id} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
