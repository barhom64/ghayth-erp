import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
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
      <Card className={cn("border-gray-200 bg-gray-50/50 animate-pulse", className)}>
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
    <Card className={cn("border-amber-200 bg-amber-50/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-600" />
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
              product.status === "active" ? "bg-green-50 text-green-700 border-green-200" :
              "bg-gray-50 text-gray-700 border-gray-200"
            )}
          >
            {product.status === "active" ? "نشط" : product.status || "—"}
          </Badge>
        </div>

        {/* Stock grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className={cn(
            "bg-white rounded p-2 border",
            outOfStock ? "border-red-200" : lowStock ? "border-amber-200" : "border-gray-200"
          )}>
            <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
              <Box className="h-3 w-3" />
              <span>الرصيد الحالي</span>
            </p>
            <p className={cn(
              "text-sm font-semibold",
              outOfStock ? "text-red-700" : lowStock ? "text-amber-700" : "text-gray-800"
            )}>
              {current.toLocaleString()} {product.unit || ""}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">الحد الأدنى</p>
            <p className="text-sm font-semibold text-gray-800">
              {min.toLocaleString()} {product.unit || ""}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              <span>سعر التكلفة</span>
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {product.costPrice ? formatCurrency(Number(product.costPrice)) : "—"}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
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
          <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>المنتج غير نشط — يجب تفعيله أولاً قبل تسجيل حركات جديدة</span>
          </div>
        )}
        {outOfStock && section === "out" && (
          <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>المنتج نفد من المخزون — لا يمكن الصرف</span>
          </div>
        )}
        {issueRisk && !outOfStock && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">
            <TrendingDown className="h-3 w-3" />
            <span>الرصيد قريب من الحد الأدنى — راجع قبل الصرف الكبير</span>
          </div>
        )}

        {/* Recent movements */}
        {movements.length > 0 && (
          <div className="pt-2 border-t border-amber-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>آخر الحركات</span>
            </div>
            <div className="space-y-1">
              {movements.slice(0, 3).map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-white rounded p-1.5 text-xs border border-gray-200">
                  <span className="text-gray-600">
                    {new Date(m.createdAt).toLocaleDateString("ar-SA")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        m.type === "in" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
                      )}
                    >
                      {m.type === "in" ? "وارد" : "صادر"}
                    </Badge>
                    <span className="font-semibold">
                      {m.type === "in" ? "+" : "-"}{Number(m.quantity).toLocaleString()} {product.unit || ""}
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
