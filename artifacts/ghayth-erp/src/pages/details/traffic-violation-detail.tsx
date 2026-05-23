import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  paid: "مدفوع",
  disputed: "معترض",
  cancelled: "ملغى",
  pending: "معلق",
};

const SEVERITY_LABELS: Record<string, string> = {
  minor: "بسيطة",
  moderate: "متوسطة",
  major: "جسيمة",
  critical: "خطيرة",
};

function statusTone(status: string) {
  if (status === "paid") return "success" as const;
  if (status === "cancelled") return "muted" as const;
  if (status === "disputed") return "warning" as const;
  return "default" as const;
}

export default function TrafficViolationDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/fleet/traffic-violations/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("traffic-violation", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["traffic-violation", String(id)],
    id ? `/fleet/traffic-violations/${id}` : null,
    !!id,
  );

  const item = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.vehicleId) {
      out.push({
        type: "vehicle",
        id: item.vehicleId,
        label: item.plateNumber || `مركبة #${item.vehicleId}`,
        sublabel: "المركبة",
        href: `/fleet/${item.vehicleId}`,
      });
    }
    if (item.driverId) {
      out.push({
        type: "driver",
        id: item.driverId,
        label: item.driverName || `سائق #${item.driverId}`,
        sublabel: "السائق",
        href: `/fleet/drivers/${item.driverId}`,
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
          { label: "المركبة", value: item.plateNumber || "-" },
          { label: "السائق", value: item.driverName || "-" },
          { label: "نوع المخالفة", value: item.violationType || "-" },
          { label: "الدرجة", value: SEVERITY_LABELS[item.severity] || item.severity || "-" },
          { label: "الغرامة", value: item.fineAmount ? formatCurrency(item.fineAmount) : "-" },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status || "-" },
          { label: "تاريخ المخالفة", value: formatDateAr(item.violationDate || item.createdAt) },
          ...(item.location ? [{ label: "الموقع", value: item.location }] : []),
        ],
      },
    ];
  }, [item]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            بيانات المخالفة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {item?.fineAmount != null && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-status-error-foreground">{formatCurrency(item.fineAmount)}</span>
              <span className="text-xs text-muted-foreground">ر.س غرامة</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {item?.violationType && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">نوع المخالفة</p>
                <span className="text-status-neutral-foreground font-medium">{item.violationType}</span>
              </div>
            )}
            {item?.severity && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الدرجة</p>
                <Badge variant={item.severity === "critical" || item.severity === "major" ? "destructive" : "outline"}>
                  {SEVERITY_LABELS[item.severity] || item.severity}
                </Badge>
              </div>
            )}
            {(item?.violationDate || item?.createdAt) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ المخالفة</p>
                <span className="text-status-neutral-foreground">{formatDateAr(item.violationDate || item.createdAt)}</span>
              </div>
            )}
            {item?.location && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الموقع</p>
                <span className="text-status-neutral-foreground">{item.location}</span>
              </div>
            )}
            {item?.referenceNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم المخالفة</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{item.referenceNumber}</span>
              </div>
            )}
          </div>
          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">التفاصيل</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
          {item?.notes && (
            <div className="rounded-md bg-status-warning-surface border border-status-warning-surface p-3">
              <p className="text-xs text-status-warning-foreground font-medium mb-1">ملاحظات</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {item?.plateNumber && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">المركبة</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-semibold font-mono">{item.plateNumber}</p>
              {item.driverName && <p className="text-xs text-muted-foreground">السائق: {item.driverName}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="traffic-violation" entityId={id} />}
      {id && <EntityTags entityType="traffic-violation" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.violationType || "تفاصيل المخالفة المرورية"}
      backPath="/fleet/traffic-violations"
      refNumber={item?.ref || item?.referenceNumber || (id ? `TV-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.violationDate || item?.createdAt}
      updatedAt={item?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="traffic-violation"
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
            title="مخالفة مرورية"
            ref={item?.ref || `TV-${id}`}
            date={formatDateAr(item?.violationDate || item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton perm="fleet:update" variant="outline" size="sm" onClick={() => setLocation("/fleet/traffic-violations")} disabled={!item}>
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
