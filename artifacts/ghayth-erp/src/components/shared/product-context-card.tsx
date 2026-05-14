import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  Package, AlertTriangle, TrendingDown, TrendingUp, DollarSign, Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProductContextSection = "in" | "out";

export interface ProductContextCardProps {
  productId: string | number | null | undefined;
  section?: ProductContextSection;
  className?: string;
}

interface ProductDetail {
  id: number;
  name: string;
  sku?: string;
  status?: string;
  categoryName?: string;
  currentStock?: number | string;
  minStock?: number | string;
  maxStock?: number | string;
  unit?: string;
  costPrice?: number | string;
  sellPrice?: number | string;
}

interface Movement {
  id: number;
  type: string;
  quantity: number | string;
  createdAt: string;
  productName?: string;
}

/**
 * Product context for warehouse forms. Shows:
 *  - current stock vs minimum (low-stock warning)
 *  - cost/sell prices
 *  - status (inactive warning)
 *  - recent movements (in/out)
 */
export function ProductContextCard({
  productId,
  section,
  className,
}: ProductContextCardProps) {
  const hasId = productId !== null && productId !== undefined && String(productId).trim() !== "";

  const { data: product, isLoading } = useApiQuery<ProductDetail>(
    ["product-context", String(productId ?? "")],
    hasId ? `/warehouse/products/${productId}` : null,
    { enabled: hasId },
  );

  const { data: movementsData } = useApiQuery<{ data: Movement[] }>(
    ["product-movements", String(productId ?? "")],
    hasId ? `/warehouse/movements?productId=${productId}&limit=10` : null,
    { enabled: hasId },
  );

  if (!hasId) return null;

  if (isLoading) {
    return (
      <Card className={cn("border-border bg-surface-subtle/50 animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!product) return null;

  const current = Number(product.currentStock || 0);
  const min = Number(product.minStock || 0);
  const max = Number(product.maxStock || 0);
  const lowStock = min > 0 && current <= min;
  const outOfStock = current <= 0;
  const inactive = product.status && product.status !== "active";
  const movements = movementsData?.data || [];

  // Estimate issue risk: trying to issue (section="out") when stock is low
  const issueRisk = section === "out" && lowStock;

  return (
    <Card className={cn("border-status-warning-surface bg-status-warning-surface/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-status-warning-surface">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-status-warning-foreground" />
            <span className="font-semibold text-sm">{product.name}</span>
            {product.sku && (
              <Badge variant="outline" className="text-xs font-mono">
                {product.sku}
              </Badge>
            )}
            {product.categoryName && (
              <Badge variant="outline" className="text-xs">
                {product.categoryName}
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              product.status === "active" ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" :
              "bg-surface-subtle text-gray-700 border-border"
            )}
          >
            {product.status === "active" ? "نشط" : product.status || "—"}
          </Badge>
        </div>

        {/* Stock grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className={cn(
            "bg-white rounded p-2 border",
            outOfStock ? "border-status-error-surface" : lowStock ? "border-status-warning-surface" : "border-border"
          )}>
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Box className="h-3 w-3" />
              <span>الرصيد الحالي</span>
            </p>
            <p className={cn(
              "text-sm font-semibold",
              outOfStock ? "text-status-error-foreground" : lowStock ? "text-status-warning-foreground" : "text-gray-800"
            )}>
              {formatNumber(current)} {product.unit || ""}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5">الحد الأدنى</p>
            <p className="text-sm font-semibold text-gray-800">
              {formatNumber(min)} {product.unit || ""}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              <span>سعر التكلفة</span>
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {product.costPrice ? formatCurrency(Number(product.costPrice)) : "—"}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              <span>سعر البيع</span>
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {product.sellPrice ? formatCurrency(Number(product.sellPrice)) : "—"}
            </p>
          </div>
        </div>

        {/* Warnings */}
        {inactive && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>المنتج غير نشط — يجب تفعيله أولاً قبل تسجيل حركات جديدة</span>
          </div>
        )}
        {outOfStock && section === "out" && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>المنتج نفد من المخزون — لا يمكن الصرف</span>
          </div>
        )}
        {issueRisk && !outOfStock && (
          <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground bg-status-warning-surface border border-status-warning-surface rounded p-1.5">
            <TrendingDown className="h-3 w-3" />
            <span>الرصيد قريب من الحد الأدنى — راجع قبل الصرف الكبير</span>
          </div>
        )}

        {/* Recent movements */}
        {movements.length > 0 && (
          <div className="pt-2 border-t border-status-warning-surface space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-status-warning-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>آخر الحركات</span>
            </div>
            <div className="space-y-1">
              {movements.slice(0, 3).map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-white rounded p-1.5 text-xs border border-border">
                  <span className="text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString("ar-SA")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        m.type === "in" ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground",
                      )}
                    >
                      {m.type === "in" ? "وارد" : "صادر"}
                    </Badge>
                    <span className="font-semibold">
                      {m.type === "in" ? "+" : "-"}{formatNumber(Number(m.quantity))} {product.unit || ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
