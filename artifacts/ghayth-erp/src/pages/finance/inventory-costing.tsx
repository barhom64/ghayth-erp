import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Package, Calculator, TrendingUp, CheckCircle, Info } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";

export default function InventoryCostingPage() {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [setupResult, setSetupResult] = useState<any>(null);

  const { data, isLoading, isError } = useApiQuery<any>(["inventory-costing"], "/finance/inventory-costing");
  const products = data?.products || [];
  const summary = data?.summary || {};

  const { data: productDetail, isLoading: loadingDetail } = useApiQuery<any>(
    ["inventory-costing-product", selectedProduct?.id],
    selectedProduct ? `/finance/inventory-costing/${selectedProduct.id}` : null,
    { enabled: !!selectedProduct }
  );

  const roundingSetup = useApiMutation("/finance/rounding-account/setup", "POST", [["rounding-account"]]);
  const { data: roundingAccount } = useApiQuery<any>(["rounding-account"], "/finance/rounding-account");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  async function handleSetupRounding() {
    try {
      const res = await roundingSetup.mutateAsync({});
      setSetupResult(res);
    } catch {
      // error handled by mutation hook toast
    }
  }

  const typeLabel: Record<string, string> = {
    in: "وارد", out: "صادر", transfer_in: "تحويل وارد",
    transfer_out: "تحويل صادر", return: "إرجاع",
  };

  const productColumns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "المنتج",
      searchable: true,
      render: (p: any) => (
        <div>
          <p className="font-medium text-sm">{p.name}</p>
          <p className="text-xs text-gray-400">{p.sku}</p>
        </div>
      ),
    },
    {
      key: "currentStock",
      header: "المخزون",
      render: (p: any) => Number(p.currentStock || 0).toFixed(2),
    },
    {
      key: "costPrice",
      header: "تكلفة الوحدة",
      className: "font-semibold",
      render: (p: any) => formatCurrency(Number(p.costPrice || 0)),
    },
    {
      key: "stockValue",
      header: "القيمة الإجمالية",
      className: "text-teal-600",
      render: (p: any) => formatCurrency(Number(p.stockValue || 0)),
    },
  ];

  const movementColumns: DataTableColumn<any>[] = [
    {
      key: "type",
      header: "الحركة",
      className: "text-xs",
      render: (m: any) => (
        <Badge variant="outline" className="text-xs">
          {typeLabel[m.type] || m.type}
        </Badge>
      ),
    },
    {
      key: "quantity",
      header: "الكمية",
      className: "text-xs",
      render: (m: any) => (
        <span className={m.quantity > 0 ? "text-green-600" : "text-red-600"}>
          {m.quantity > 0 ? "+" : ""}{Number(m.quantity).toFixed(2)}
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "تكلفة الوحدة",
      className: "text-xs",
      render: (m: any) => formatCurrency(Number(m.unitCost || 0)),
    },
    {
      key: "waCost",
      header: "المتوسط المرجح",
      className: "font-semibold text-xs text-teal-700",
      render: (m: any) => formatCurrency(Number(m.waCost || 0)),
    },
  ];

  return (
    <PageShell
      title="تقييم المخزون بالمتوسط المرجح"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تقييم المخزون بالمتوسط المرجح" }]}
      loading={isLoading}
    >
      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">عدد المنتجات</p>
          <p className="text-xl font-bold">{summary.totalProducts || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">إجمالي قيمة المخزون</p>
          <p className="text-xl font-bold text-teal-600">{formatCurrency(Number(summary.totalValue || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-gray-500">إجمالي الوحدات</p>
          <p className="text-xl font-bold">{Number(summary.totalItems || 0).toFixed(0)}</p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-500" />
              المنتجات وتكاليفها المرجحة
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={productColumns}
              data={products}
              isLoading={isLoading}
              rowKey={(p: any) => p.id}
              onRowClick={(p: any) => setSelectedProduct(p)}
              rowClassName={(p: any) =>
                `cursor-pointer hover:bg-teal-50 ${selectedProduct?.id === p.id ? "bg-teal-50" : ""}`
              }
              emptyMessage="لا توجد منتجات"
              searchPlaceholder="بحث في المنتجات..."
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedProduct ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-teal-500" />
                  حركات: {selectedProduct.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-teal-50 p-3 rounded">
                    <p className="text-xs text-gray-500">متوسط التكلفة الحالي</p>
                    <p className="text-lg font-bold text-teal-600">{formatCurrency(Number(productDetail?.currentWaCost || 0))}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-xs text-gray-500">قيمة المخزون الحالية</p>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(Number(productDetail?.currentStockValue || 0))}</p>
                  </div>
                </div>
                <DataTable
                  columns={movementColumns}
                  data={productDetail?.movements || []}
                  isLoading={loadingDetail}
                  rowKey={(_m: any, i: number) => i}
                  rowClassName={(m: any) => (m.quantity > 0 ? "bg-green-50/20" : "bg-red-50/20")}
                  noToolbar
                  pageSize={0}
                  emptyMessage="لا توجد حركات"
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-400">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>اختر منتجاً لعرض حركات المتوسط المرجح</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4 text-purple-500" />
                حساب فروقات التقريب
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {roundingAccount?.account ? (
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <p className="text-sm font-semibold text-green-700 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    الحساب مُعرَّف: {roundingAccount.account.code} — {roundingAccount.account.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">يُستخدم تلقائياً لمعالجة الفروقات أقل من 0.05 ﷼</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">لم يتم إنشاء حساب فروقات التقريب بعد.</p>
                  <Button
                    onClick={handleSetupRounding}
                    disabled={roundingSetup.isPending}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {roundingSetup.isPending ? "جارٍ الإنشاء..." : "إنشاء حساب التقريب (9999)"}
                  </Button>
                </div>
              )}
              {setupResult && (
                <p className="text-sm text-green-600">{setupResult.message}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
