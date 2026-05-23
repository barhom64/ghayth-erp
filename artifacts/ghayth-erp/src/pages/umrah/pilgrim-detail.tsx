import { useState } from "react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@workspace/ui-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Save, User, Calendar, AlertTriangle } from "lucide-react";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { UmrahAttachmentsPanel } from "@/components/shared/umrah-attachments-panel";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_OPTIONS = [
  { value: "pending", label: "لم يصل" },
  { value: "arrived", label: "وصل" },
  { value: "active", label: "نشط" },
  { value: "overstayed", label: "متأخر" },
  { value: "departed", label: "غادر" },
  { value: "violated", label: "مخالف" },
  { value: "cancelled", label: "ملغي" },
];

const STATUS_TONES: Record<string, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  pending: "muted",
  arrived: "info",
  active: "success",
  overstayed: "warning",
  departed: "muted",
  violated: "destructive",
  cancelled: "destructive",
};

export default function PilgrimDetail() {
  const [, params] = useRoute("/umrah/pilgrims/:id");
  const id = params?.id || "";
  const { extraTabs, hideTabs } = useRegistryTabs("pilgrim", id ?? "");
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["umrah-pilgrim", id], id ? `/umrah/pilgrims/${id}` : null);
  const [newStatus, setNewStatus] = useState("");
  const { toast } = useToast();

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
    { label: "الاسم الكامل", value: data?.fullName },
    { label: "رقم الجواز", value: data?.passportNumber },
    { label: "رقم التأشيرة", value: data?.visaNumber },
    { label: "الجنسية", value: data?.nationality },
    { label: "الجنس", value: data?.gender === "male" ? "ذكر" : data?.gender === "female" ? "أنثى" : "-" },
    { label: "الهاتف", value: data?.phone },
  ];

  const tripFields = [
    { label: "الموسم", value: data?.seasonTitle },
    { label: "الوكيل", value: data?.agentName },
    { label: "الباقة", value: data?.packageName },
    { label: "تاريخ الوصول المخطط", value: data?.arrivalDate ? formatDateAr(data.arrivalDate) : "-" },
    { label: "تاريخ المغادرة المخطط", value: data?.departureDate ? formatDateAr(data.departureDate) : "-" },
    { label: "الوصول الفعلي", value: data?.actualArrival ? formatDateAr(data.actualArrival) : "-" },
    { label: "المغادرة الفعلية", value: data?.actualDeparture ? formatDateAr(data.actualDeparture) : "-" },
    { label: "الفندق", value: data?.hotelName },
    { label: "رقم الغرفة", value: data?.roomNumber },
  ];

  const overview = (
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

      {(data?.penalties || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-status-error" />الغرامات ({data.penalties.length})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "type", header: "النوع", render: (p) => p.type === "overstay" ? "تجاوز مدة" : p.type },
                { key: "daysOverstayed", header: "أيام التأخر", render: (p) => `${p.daysOverstayed} يوم` },
                { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold text-status-error-foreground">{formatCurrency(Number(p.amount))}</span> },
                { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
              ] as DataTableColumn<any>[]}
              data={data.penalties}
              noToolbar
              pageSize={0}
            />
          </CardContent>
        </Card>
      )}

      {data?.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{data.notes}</p></CardContent>
        </Card>
      )}

      {data?.id && (
        <UmrahAttachmentsPanel entityType="mutamer" entityId={data.id} />
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={newStatus} onValueChange={setNewStatus}>
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="تغيير الحالة" /></SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <GuardedButton perm="umrah:create" onClick={updateStatus} disabled={!newStatus} className="gap-2" size="sm">
        <Save className="h-4 w-4" />تحديث
      </GuardedButton>
    </div>
  );

  return (
    <DetailPageLayout
      title={data?.fullName || "المعتمر"}
      subtitle={`${data?.passportNumber || ""}${data?.nationality ? ` • ${data.nationality}` : ""}`}
      backPath="/umrah/pilgrims"
      backLabel="العودة"
      status={data?.status ? { label: STATUS_OPTIONS.find(o => o.value === data.status)?.label || data.status, tone: STATUS_TONES[data.status] || "default" } : undefined}
      entityType="pilgrim"
      entityId={data?.id || id}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      createdAt={data?.createdAt}
      updatedAt={data?.updatedAt}
      overview={overview}
      actions={actions}
    />
  );
}
