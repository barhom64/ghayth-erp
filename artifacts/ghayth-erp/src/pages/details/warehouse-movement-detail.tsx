import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, ArrowRightLeft } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

/**
 * WarehouseMovementDetail — unified detail page for a single stock
 * movement (in, out, transfer, adjustment, return). Fetches from
 * `/warehouse/movements/:id` and surfaces the product + value + locations
 * involved in the move.
 */

const TYPE_LABELS: Record<string, string> = {
  in: "وارد",
  out: "صادر",
  transfer: "نقل",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  adjustment: "تسوية",
  adjustment_in: "تسوية - زيادة",
  adjustment_out: "تسوية - نقص",
  return: "مرتجع",
};

function typeTone(type?: string | null) {
  if (!type) return "default" as const;
  if (type === "in" || type === "transfer_in") return "success" as const;
  if (type === "out" || type === "transfer_out") return "destructive" as const;
  if (type === "transfer") return "info" as const;
  if (type.startsWith("adjustment")) return "warning" as const;
  if (type === "return") return "warning" as const;
  return "default" as const;
}

export default function WarehouseMovementDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/warehouse/movements/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("warehouse-movement", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["warehouse-movement", String(id)],
    id ? `/warehouse/movements/${id}` : null,
    !!id
  );

  const movement = data;

  const quantity = Number(movement?.quantity ?? 0);
  const unitCost = Number(movement?.unitCost ?? 0);
  const totalValue = Number(movement?.totalValue ?? quantity * unitCost);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!movement) return out;
    if (movement.productId) {
      out.push({
        type: "product",
        id: movement.productId,
        label: movement.productName || `صنف #${movement.productId}`,
        sublabel: "الصنف",
        href: `/warehouse/products/${movement.productId}`,
      });
    }
    if (movement.fromWarehouseId) {
      out.push({
        type: "warehouse",
        id: movement.fromWarehouseId,
        label: movement.fromWarehouseName || movement.fromLocation || `مستودع #${movement.fromWarehouseId}`,
        sublabel: "المستودع المصدر",
      });
    }
    if (movement.toWarehouseId) {
      out.push({
        type: "warehouse",
        id: movement.toWarehouseId,
        label: movement.toWarehouseName || movement.toLocation || `مستودع #${movement.toWarehouseId}`,
        sublabel: "المستودع الوجهة",
      });
    }
    return out;
  }, [movement]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!movement) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم الحركة", value: movement.ref || `MVT-${id}` },
          { label: "النوع", value: TYPE_LABELS[movement.type] || movement.type || "-" },
          ...(movement.productName ? [{ label: "الصنف", value: movement.productName }] : []),
          { label: "الكمية", value: String(quantity) },
          ...(movement.fromLocation ? [{ label: "من", value: movement.fromLocation }] : []),
          ...(movement.toLocation ? [{ label: "إلى", value: movement.toLocation }] : []),
          ...(movement.reason ? [{ label: "السبب", value: movement.reason }] : []),
          ...(movement.reference ? [{ label: "المرجع", value: movement.reference }] : []),
          { label: "تكلفة الوحدة", value: formatCurrency(unitCost) },
          { label: "القيمة الإجمالية", value: formatCurrency(totalValue) },
          { label: "التاريخ", value: formatDateAr(movement.date || movement.createdAt) },
          ...(movement.performedByName
            ? [{ label: "بواسطة", value: movement.performedByName }]
            : []),
        ],
      },
    ];
    if (movement.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: movement.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "منفذ الحركة", name: movement.performedByName || "" },
        { label: "المعتمد", name: "" },
      ],
    });
    return sections;
  }, [movement, id, quantity, unitCost, totalValue]);

  const handleEdit = () => {
    setLocation(`/warehouse/movements/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            بيانات الحركة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero: total value */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(totalValue)}</span>
            <span className="text-xs text-muted-foreground">إجمالي القيمة</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {movement?.type && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع الحركة</p>
                <Badge variant="outline">{TYPE_LABELS[movement.type] || movement.type}</Badge>
              </div>
            )}
            {movement?.productName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الصنف</p>
                <span className="text-status-neutral-foreground">{movement.productName}</span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الكمية</p>
              <span className="text-status-neutral-foreground font-semibold">{quantity}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">تكلفة الوحدة</p>
              <span className="text-status-neutral-foreground">{formatCurrency(unitCost)}</span>
            </div>
            {movement?.fromLocation && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">من</p>
                <Badge variant="secondary">{movement.fromLocation}</Badge>
              </div>
            )}
            {movement?.toLocation && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">إلى</p>
                <Badge variant="secondary">{movement.toLocation}</Badge>
              </div>
            )}
            {movement?.reference && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">المرجع (PO/SO)</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{movement.reference}</span>
              </div>
            )}
            {movement?.reason && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">السبب</p>
                <span className="text-status-neutral-foreground">{movement.reason}</span>
              </div>
            )}
            {(movement?.date || movement?.createdAt) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التاريخ</p>
                <span className="text-status-neutral-foreground">{formatDateAr(movement.date || movement.createdAt)}</span>
              </div>
            )}
            {movement?.performedByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">بواسطة</p>
                <span className="text-status-neutral-foreground">{movement.performedByName}</span>
              </div>
            )}
          </div>

          {movement?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{movement.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملخص القيمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">الكمية</span>
              <span>{quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">سعر الوحدة</span>
              <span>{formatCurrency(unitCost)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">الإجمالي</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalValue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="warehouse-movement" entityId={id} />}
      {id && <EntityTags entityType="warehouse-movement" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={movement?.ref ? `حركة ${movement.ref}` : "تفاصيل الحركة"}
      subtitle={movement?.type ? TYPE_LABELS[movement.type] || movement.type : undefined}
      backPath="/warehouse/movements"
      refNumber={movement?.ref || (id ? `MVT-${id}` : undefined)}
      status={
        movement
          ? { label: TYPE_LABELS[movement.type] || movement.type || "-", tone: typeTone(movement.type) }
          : undefined
      }
      typeLabel={movement?.type ? TYPE_LABELS[movement.type] : undefined}
      createdAt={movement?.createdAt}
      updatedAt={movement?.updatedAt}
      createdByName={movement?.createdByName || movement?.performedByName}
      relatedEntities={relatedEntities}
      entityType="warehouse-movement"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {movement && (
            <EntityPrintButton
              branchId={movement.branchId}
              title={movement.ref ? `حركة ${movement.ref}` : "حركة مخزون"}
              ref={movement.ref || `MVT-${id}`}
              date={formatDateAr(movement.date || movement.createdAt)}
              sections={printSections}
              entityType={String(movement.type ?? "").startsWith("adjustment") ? "stock_adjustment" : "stock_transfer"}
              entityId={movement.id ?? id}
              formats={["a4", "label"]}
            />
          )}
          <GuardedButton perm="warehouse:update" variant="outline" size="sm" onClick={handleEdit} disabled={!movement}>
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
