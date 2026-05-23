import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Package, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

/**
 * WarehouseProductDetail — unified detail page for a single warehouse product.
 *
 * Fetches from `/warehouse/products/:id` and renders stock levels, pricing,
 * and supplier/category relations, with visual warnings when current stock
 * is at or below the configured min threshold.
 */

const STATUS_LABELS: Record<string, string> = {
  in_stock: "متوفر",
  low_stock: "مخزون منخفض",
  out_of_stock: "نفذ",
  discontinued: "متوقف",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "in_stock") return "success" as const;
  if (status === "low_stock") return "warning" as const;
  if (status === "out_of_stock") return "destructive" as const;
  if (status === "discontinued") return "muted" as const;
  return "default" as const;
}

export default function WarehouseProductDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/warehouse/products/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("warehouse_product", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["warehouse-product", String(id)],
    id ? `/warehouse/products/${id}` : null,
    !!id
  );

  const product = data;

  const currentStock = Number(product?.currentStock ?? product?.stock ?? 0);
  const minStock = Number(product?.minStock ?? 0);
  const maxStock = Number(product?.maxStock ?? 0);
  const unitCost = Number(product?.unitCost ?? 0);
  const sellingPrice = Number(product?.sellingPrice ?? product?.price ?? 0);

  // Stock warning: red if below min, amber if within 20% of min.
  const stockWarning = useMemo(() => {
    if (!product) return null;
    if (currentStock <= 0) {
      return { tone: "red", label: "نفذ المخزون", icon: true };
    }
    if (minStock > 0 && currentStock < minStock) {
      return { tone: "red", label: "أقل من الحد الأدنى", icon: true };
    }
    if (minStock > 0 && currentStock <= minStock * 1.2) {
      return { tone: "amber", label: "يقترب من الحد الأدنى", icon: true };
    }
    return null;
  }, [product, currentStock, minStock]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!product) return out;
    if (product.supplierId) {
      out.push({
        type: "supplier",
        id: product.supplierId,
        label: product.supplierName || `مورد #${product.supplierId}`,
        sublabel: "المورد",
        href: `/warehouse/suppliers/${product.supplierId}`,
      });
    }
    if (product.categoryId) {
      out.push({
        type: "category",
        id: product.categoryId,
        label: product.categoryName || `تصنيف #${product.categoryId}`,
        sublabel: "التصنيف",
        href: `/warehouse/categories/${product.categoryId}`,
      });
    }
    return out;
  }, [product]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!product) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "اسم الصنف", value: product.name || "-" },
          { label: "الرمز (SKU)", value: product.sku || "-" },
          ...(product.barcode ? [{ label: "الباركود", value: product.barcode }] : []),
          ...(product.categoryName ? [{ label: "التصنيف", value: product.categoryName }] : []),
          ...(product.supplierName ? [{ label: "المورد", value: product.supplierName }] : []),
          ...(product.location ? [{ label: "الموقع في المستودع", value: product.location }] : []),
          { label: "المخزون الحالي", value: String(currentStock) },
          { label: "الحد الأدنى", value: String(minStock) },
          { label: "الحد الأقصى", value: String(maxStock) },
          { label: "تكلفة الوحدة", value: formatCurrency(unitCost) },
          { label: "سعر البيع", value: formatCurrency(sellingPrice) },
          { label: "الحالة", value: STATUS_LABELS[product.status] || product.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(product.createdAt) },
        ],
      },
    ];
    if (product.description) {
      sections.push({ kind: "text", title: "الوصف", body: product.description });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "أمين المستودع", name: "" },
        { label: "المدير", name: "" },
      ],
    });
    return sections;
  }, [product, currentStock, minStock, maxStock, unitCost, sellingPrice]);

  const handleEdit = () => {
    setLocation(`/warehouse/products/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            بيانات الصنف
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero: current stock */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">{currentStock}</span>
            <span className="text-xs text-muted-foreground">وحدة في المخزون</span>
          </div>

          {stockWarning && (
            <div
              className={`flex items-center gap-2 rounded border p-2 text-xs ${
                stockWarning.tone === "red"
                  ? "bg-status-error-surface border-status-error-surface text-status-error-foreground"
                  : "bg-status-warning-surface border-status-warning-surface text-status-warning-foreground"
              }`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{stockWarning.label}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {product?.sku && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الرمز (SKU)</p>
                <span className="text-status-neutral-foreground font-mono">{product.sku}</span>
              </div>
            )}
            {product?.barcode && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الباركود</p>
                <span className="text-status-neutral-foreground font-mono">{product.barcode}</span>
              </div>
            )}
            {product?.categoryName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التصنيف</p>
                <Badge variant="outline">{product.categoryName}</Badge>
              </div>
            )}
            {product?.supplierName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المورد</p>
                <span className="text-status-neutral-foreground">{product.supplierName}</span>
              </div>
            )}
            {product?.location && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الموقع في المستودع</p>
                <Badge variant="secondary">{product.location}</Badge>
              </div>
            )}
          </div>

          {product?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{product.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock & pricing sidebar */}
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">حدود المخزون</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">الحالي</span>
              <span className="font-semibold">{currentStock}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">الحد الأدنى</span>
              <span>{minStock}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">الحد الأقصى</span>
              <span>{maxStock}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">الأسعار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">تكلفة الوحدة</span>
              <span>{formatCurrency(unitCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">سعر البيع</span>
              <span className="font-semibold text-gray-900">{formatCurrency(sellingPrice)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="warehouse-product" entityId={id} />}
      {id && <EntityTags entityType="warehouse-product" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={product?.name ? product.name : "تفاصيل الصنف"}
      subtitle={product?.sku ? `SKU: ${product.sku}` : undefined}
      backPath="/warehouse"
      refNumber={id ? `PROD-${id}` : undefined}
      status={
        product
          ? { label: STATUS_LABELS[product.status] || product.status || "-", tone: statusTone(product.status) }
          : undefined
      }
      typeLabel={product?.categoryName || undefined}
      createdAt={product?.createdAt}
      updatedAt={product?.updatedAt}
      createdByName={product?.createdByName}
      relatedEntities={relatedEntities}
      entityType="warehouse-product"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {product && (
            <EntityPrintButton
              branchId={product.branchId}
              title={product.name ? `صنف ${product.name}` : "صنف"}
              ref={`PROD-${id}`}
              date={formatDateAr(product.createdAt)}
              sections={printSections}
              entityType="item_barcode_label"
              entityId={product.id ?? id}
              formats={["label", "a4"]}
              label="طباعة ملصق / باركود"
            />
          )}
          <GuardedButton perm="warehouse:update" variant="outline" size="sm" onClick={handleEdit} disabled={!product}>
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
