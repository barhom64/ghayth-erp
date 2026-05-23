import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Users, DollarSign } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ProcessStages, type StageStep } from "@workspace/entity-kit";

const STATUS_MAP: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "info" | "muted" | "default" }> = {
  scheduled: { label: "مجدولة", tone: "info" },
  in_progress: { label: "في الطريق", tone: "warning" },
  completed: { label: "مكتملة", tone: "success" },
  cancelled: { label: "ملغاة", tone: "destructive" },
};

const LIFECYCLE = [
  { key: "scheduled", label: "مجدولة" },
  { key: "in_progress", label: "في الطريق" },
  { key: "completed", label: "مكتملة" },
];

function buildSteps(status: string | undefined): StageStep[] {
  const s = status ?? "scheduled";
  if (s === "cancelled") return [{ label: "ملغاة", status: "rejected" }];
  const idx = LIFECYCLE.findIndex((x) => x.key === s);
  return LIFECYCLE.map((step, i): StageStep => {
    if (idx === -1) return { label: step.label, status: "pending" };
    if (i < idx) return { label: step.label, status: "completed" };
    if (i === idx) return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

const pilgrimColumns: DataTableColumn<any>[] = [
  { key: "fullName", header: "الاسم", sortable: true, render: (p) => <span className="font-medium">{p.fullName}</span> },
  { key: "passportNumber", header: "رقم الجواز", render: (p) => <span className="font-mono text-xs">{p.passportNumber}</span> },
  { key: "nationality", header: "الجنسية" },
  { key: "status", header: "الحالة", render: (p) => <Badge variant="outline">{p.status}</Badge> },
];

export default function UmrahTransportDetail() {
  const [, params] = useRoute("/umrah/transport/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("transport", id ?? 0);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["umrah-transport-detail", String(id)],
    id ? `/umrah/transport/${id}` : null
  );
  const item = data?.data ?? data;
  const pilgrims = item?.pilgrims || [];

  const st = STATUS_MAP[item?.status] || { label: item?.status || "—", tone: "default" as const };

  const editDelete = useDetailEditDelete({
    entityLabel: "رحلة النقل",
    patchPath: `/umrah/transport/${id}`,
    deletePath: `/umrah/transport/${id}`,
    listPath: "/umrah/transport",
    initialValues: item,
    fields: [
      { key: "fromLocation", label: "من" },
      { key: "toLocation", label: "إلى" },
      { key: "capacity", label: "السعة", type: "number" },
      { key: "cost", label: "التكلفة", type: "number" },
    ],
    invalidateKeys: [["umrah-transport", String(id)], ["umrah-transport"]],
    onSaved: () => refetch(),
  });

  const overview = item ? (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <KpiGrid items={[
        { label: "من", value: item.fromLocation || "—", icon: MapPin, color: "text-status-info-foreground bg-status-info-surface", size: "sm" },
        { label: "إلى", value: item.toLocation || "—", icon: MapPin, color: "text-status-success-foreground bg-status-success-surface", size: "sm" },
        { label: "السعة", value: `${item.pilgrimCount || 0} / ${item.capacity || 45}`, icon: Users, color: "text-purple-600 bg-purple-50", size: "sm" },
        { label: "التكلفة", value: formatCurrency(Number(item.cost || 0)), icon: DollarSign, color: "text-status-warning-foreground bg-status-warning-surface", size: "sm" },
      ]} />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">مراحل الرحلة</p>
          <ProcessStages steps={buildSteps(item.status)} />
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل الرحلة</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">تاريخ الرحلة</p><p className="font-medium">{item.tripDate ? formatDateAr(item.tripDate) : "—"}</p></div>
            <div><p className="text-muted-foreground">من</p><p className="font-medium">{item.fromLocation || "—"}</p></div>
            <div><p className="text-muted-foreground">إلى</p><p className="font-medium">{item.toLocation || "—"}</p></div>
            <div><p className="text-muted-foreground">المركبة</p><p className="font-medium">{item.vehiclePlate ? `${item.vehicleMake || ""} ${item.vehicleModel || ""} — ${item.vehiclePlate}` : "—"}</p></div>
            <div><p className="text-muted-foreground">السائق</p><p className="font-medium">{item.driverName || "—"}</p>{item.driverPhone && <p className="text-xs text-muted-foreground">{item.driverPhone}</p>}</div>
            <div><p className="text-muted-foreground">التكلفة</p><p className="font-medium text-status-success-foreground">{formatCurrency(Number(item.cost || 0))}</p></div>
            {item.notes && <div className="col-span-full"><p className="text-muted-foreground">ملاحظات</p><p className="font-medium">{item.notes}</p></div>}
          </div>
        </CardContent>
      </Card>

      {pilgrims.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> المعتمرين المسندين ({pilgrims.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={pilgrimColumns} data={pilgrims} noToolbar emptyMessage="لا يوجد معتمرين" pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  ) : null;

  return (
    <DetailPageLayout
      title={item ? `رحلة ${item.fromLocation || ""} → ${item.toLocation || ""}` : "رحلة نقل"}
      subtitle={item ? formatDateAr(item.tripDate) : undefined}
      backPath="/umrah/transport"
      status={item ? { label: st.label, tone: st.tone } : undefined}
      entityType="transport"
      entityId={id || 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
     
      createdAt={item?.createdAt}
      overview={overview}
      actions={
        <DetailActionButtons
          hook={editDelete}
          editPerm="umrah:update"
          deletePerm="umrah:delete"
          extra={item ? <Badge className="text-sm px-3 py-1">{st.label}</Badge> : null}
        />
      }
    />
  );
}
