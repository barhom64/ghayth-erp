import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Wrench } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
  pending: "معلق",
  scheduled: "مجدول",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};

const TYPE_LABELS: Record<string, string> = {
  preventive: "وقائية",
  corrective: "تصحيحية",
  emergency: "طارئة",
  routine: "دورية",
  inspection: "فحص",
};

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "pending" || status === "scheduled") return "warning" as const;
  return "default" as const;
}

export default function PropertyMaintenanceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/properties/maintenance/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("property-maintenance", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["property-maintenance", String(id)],
    id ? `/properties/maintenance/${id}` : null,
    !!id,
  );

  const item = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.buildingId) {
      out.push({
        type: "building",
        id: item.buildingId,
        label: item.buildingName || `مبنى #${item.buildingId}`,
        sublabel: "المبنى",
        href: `/properties/buildings/${item.buildingId}`,
      });
    }
    if (item.unitId) {
      out.push({
        type: "property",
        id: item.unitId,
        label: item.unitNumber || `وحدة #${item.unitId}`,
        sublabel: "الوحدة",
        href: `/properties/${item.unitId}`,
      });
    }
    if (item.tenantId) {
      out.push({
        type: "tenant",
        id: item.tenantId,
        label: item.tenantName || `مستأجر #${item.tenantId}`,
        sublabel: "المستأجر",
        href: `/properties/tenants/${item.tenantId}`,
      });
    }
    return out;
  }, [item]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!item) return [];
    return [
      {
        kind: "info-grid",
        items: [
          { label: "نوع الصيانة", value: TYPE_LABELS[item.type] || item.type || "-" },
          { label: "الأولوية", value: PRIORITY_LABELS[item.priority] || item.priority || "-" },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status || "-" },
          { label: "التكلفة", value: item.cost ? formatCurrency(item.cost) : "-" },
          { label: "تاريخ الطلب", value: formatDateAr(item.createdAt) },
          ...(item.completedAt ? [{ label: "تاريخ الإنجاز", value: formatDateAr(item.completedAt) }] : []),
          ...(item.assignedTo ? [{ label: "المسؤول", value: item.assignedTo }] : []),
        ],
      },
      ...(item.description ? [{ kind: "text" as const, title: "الوصف", body: item.description }] : []),
      {
        kind: "signature",
        parties: [
          { label: "طالب الصيانة", name: item.createdByName || "" },
          { label: "المنفذ", name: item.assignedTo || "" },
        ],
      },
    ];
  }, [item]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4 text-gray-500" />
            بيانات الصيانة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {item?.cost != null && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(item.cost)}</span>
              <span className="text-xs text-gray-500">ر.س</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {item?.type && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع الصيانة</p>
                <Badge variant="outline">{TYPE_LABELS[item.type] || item.type}</Badge>
              </div>
            )}
            {item?.priority && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الأولوية</p>
                <Badge variant={item.priority === "urgent" || item.priority === "high" ? "destructive" : "outline"}>
                  {PRIORITY_LABELS[item.priority] || item.priority}
                </Badge>
              </div>
            )}
            {item?.assignedTo && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المسؤول</p>
                <span className="text-gray-800">{item.assignedTo}</span>
              </div>
            )}
            {item?.vendor && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المقاول/المورد</p>
                <span className="text-gray-800">{item.vendor}</span>
              </div>
            )}
            {item?.scheduledDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">التاريخ المجدول</p>
                <span className="text-gray-800">{formatDateAr(item.scheduledDate)}</span>
              </div>
            )}
            {item?.completedAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنجاز</p>
                <span className="text-gray-800">{formatDateAr(item.completedAt)}</span>
              </div>
            )}
          </div>
          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
          {item?.notes && (
            <div className="rounded-md bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-700 font-medium mb-1">ملاحظات</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {item?.buildingName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">الموقع</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{item.buildingName}</p>
              {item.unitNumber && <p className="text-xs text-gray-500">وحدة: {item.unitNumber}</p>}
              {item.tenantName && <p className="text-xs text-gray-500">المستأجر: {item.tenantName}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="property-maintenance" entityId={id} />}
      {id && <EntityTags entityType="property-maintenance" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.title || "تفاصيل طلب الصيانة"}
      subtitle={item?.type ? TYPE_LABELS[item.type] || item.type : undefined}
      backPath="/properties/maintenance"
      refNumber={item?.ref || (id ? `PMT-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      assignedToName={item?.assignedTo}
      relatedEntities={relatedEntities}
      entityType="property-maintenance"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <EntityPrintButton
            branchId={item?.branchId}
            title="طلب صيانة"
            ref={item?.ref || `PMT-${id}`}
            date={formatDateAr(item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton
            perm="properties:update"
            variant="outline"
            size="sm"
            onClick={() => setLocation("/properties/maintenance")}
            disabled={!item || item.status === "completed"}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
