import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Fuel, Gauge } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const FUEL_TYPES: Record<string, string> = {
  gasoline_91: "بنزين 91",
  gasoline_95: "بنزين 95",
  diesel: "ديزل",
  electric: "كهرباء",
};

export default function FuelDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/fleet/fuel/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["fuel-detail", String(id)],
    id ? `/fleet/fuel-logs/${id}` : null,
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
        sublabel: item.vehicleMake ? `${item.vehicleMake} ${item.vehicleModel || ""}` : "المركبة",
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
          { label: "نوع الوقود", value: FUEL_TYPES[item.fuelType] || item.fuelType || "-" },
          { label: "الكمية (لتر)", value: item.quantity ? `${item.quantity} لتر` : "-" },
          { label: "التكلفة", value: item.cost ? formatCurrency(item.cost) : "-" },
          { label: "عداد الكيلومترات", value: item.odometer ? `${item.odometer} كم` : "-" },
          { label: "المحطة", value: item.station || "-" },
          { label: "التاريخ", value: formatDateAr(item.date || item.createdAt) },
        ],
      },
    ];
  }, [item]);

  const costPerLiter = item?.cost && item?.quantity ? (Number(item.cost) / Number(item.quantity)).toFixed(2) : null;

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Fuel className="h-4 w-4 text-gray-500" />
            بيانات التعبئة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-baseline gap-4 border-b pb-3">
            <div>
              <span className="text-3xl font-bold text-gray-900">
                {item?.cost ? formatCurrency(item.cost) : "-"}
              </span>
              <span className="text-xs text-gray-500 ms-1">ر.س</span>
            </div>
            {item?.quantity && (
              <div className="text-sm text-gray-500">
                {item.quantity} لتر
                {costPerLiter && <span className="text-xs"> ({costPerLiter} ر.س/لتر)</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {item?.fuelType && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع الوقود</p>
                <Badge variant="outline">{FUEL_TYPES[item.fuelType] || item.fuelType}</Badge>
              </div>
            )}
            {item?.station && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المحطة</p>
                <span className="text-gray-800">{item.station}</span>
              </div>
            )}
            {item?.odometer && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">عداد الكيلومترات</p>
                <div className="flex items-center gap-1">
                  <Gauge className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-800 font-mono">{Number(item.odometer).toLocaleString()} كم</span>
                </div>
              </div>
            )}
            {(item?.date || item?.createdAt) && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ التعبئة</p>
                <span className="text-gray-800">{formatDateAr(item.date || item.createdAt)}</span>
              </div>
            )}
            {item?.receiptNumber && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">رقم الإيصال</p>
                <span className="text-gray-800 font-mono text-xs">{item.receiptNumber}</span>
              </div>
            )}
          </div>

          {item?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{item.notes}</p>
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
              {item.vehicleMake && (
                <p className="text-xs text-gray-500">{item.vehicleMake} {item.vehicleModel || ""}</p>
              )}
            </CardContent>
          </Card>
        )}
        {item?.driverName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">السائق</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{item.driverName}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="fuel" entityId={id} />}
      {id && <EntityTags entityType="fuel" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.plateNumber ? `تعبئة وقود — ${item.plateNumber}` : "تفاصيل تعبئة الوقود"}
      subtitle={item?.fuelType ? FUEL_TYPES[item.fuelType] || item.fuelType : undefined}
      backPath="/fleet/fuel"
      refNumber={item?.ref || (id ? `FUEL-${id}` : undefined)}
      createdAt={item?.date || item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      relatedEntities={relatedEntities}
      entityType="fuel"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <EntityPrintButton
            branchId={item?.branchId}
            title="سجل تعبئة وقود"
            ref={item?.ref || `FUEL-${id}`}
            date={formatDateAr(item?.date || item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton perm="fleet:update" variant="outline" size="sm" onClick={() => setLocation("/fleet/fuel")} disabled={!item}>
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
