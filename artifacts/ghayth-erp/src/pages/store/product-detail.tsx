import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  Package,
  Activity,
  ArrowUpDown,
  ShoppingCart,
  ShoppingBag,
  FolderOpen,
  History,
  MessageCircle,
  Pencil,
  Warehouse,
  Box,
  DollarSign,
  TrendingUp,
} from "lucide-react";

export default function ProductDetailPage() {
  const [, params] = useRoute("/store/products/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";

  const { data: product, isLoading, isError, refetch } = useApiQuery<any>(
    ["store-product", id],
    id ? `/store/products/${id}` : null,
    !!id
  );

  // Stock movements — try filter, fallback to client filter
  // TODO: prefer a dedicated /warehouse/movements?productId= endpoint with real join
  const { data: movementsResp } = useApiQuery<any>(
    ["product-movements", id],
    id ? `/warehouse/movements?productId=${id}` : null,
    !!id
  );
  const allMovements: any[] = movementsResp?.data || [];
  const movements = useMemo(
    () => allMovements.filter((m) => String(m.productId ?? m.itemId ?? "") === String(id)),
    [allMovements, id]
  );

  // Sales history — filter orders containing this product
  // TODO: prefer /store/orders?productId= with server-side join
  const { data: ordersResp } = useApiQuery<any>(
    ["product-orders", id],
    id ? `/store/orders` : null,
    !!id
  );
  const allOrders: any[] = ordersResp?.data || [];
  const sales = useMemo(
    () =>
      allOrders.filter((o) => {
        const items: any[] = o.items || o.orderItems || [];
        return items.some((it) => String(it.productId) === String(id));
      }),
    [allOrders, id]
  );

  // Purchase orders — no dedicated endpoint filter by product
  // TODO: prefer /finance/purchase-orders?productId= with server filter
  const { data: poResp } = useApiQuery<any>(
    ["product-purchase-orders", id],
    id ? `/finance/purchase-orders` : null,
    !!id
  );
  const allPos: any[] = poResp?.data || [];
  const purchaseOrders = useMemo(
    () =>
      allPos.filter((p) => {
        const items: any[] = p.items || p.orderItems || [];
        return items.some((it) => String(it.productId) === String(id));
      }),
    [allPos, id]
  );

  const currentStock = Number(product?.quantity) || 0;
  const reserved = Number(product?.reservedQuantity) || 0;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sold30d = sales.filter((s) => new Date(s.createdAt || 0).getTime() >= thirtyDaysAgo).length;
  const revenue30d = sales
    .filter((s) => new Date(s.createdAt || 0).getTime() >= thirtyDaysAgo)
    .reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

  const movementsColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.createdAt) },
    { key: "type", header: "النوع", sortable: true, render: (r) => <Badge variant="outline">{r.type || r.movementType || "-"}</Badge> },
    { key: "quantity", header: "الكمية", sortable: true, render: (r) => r.quantity || 0 },
  ];

  const salesColumns: DataTableColumn<any>[] = [
    { key: "orderNumber", header: "رقم الطلب", sortable: true, render: (r) => <span className="font-mono text-xs">{r.orderNumber || `#${r.id}`}</span> },
    { key: "customerName", header: "العميل", sortable: true, render: (r) => r.customerName || "-" },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.createdAt) },
    { key: "totalAmount", header: "المبلغ", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.totalAmount) || 0)}</span> },
  ];

  const poColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <Badge variant="outline">{r.status || "-"}</Badge> },
    { key: "total", header: "الإجمالي", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.total) || 0)}</span> },
  ];

  const overviewContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="الاسم" value={product?.name} />
          <InfoRow label="رمز المنتج" value={product?.sku} />
          <InfoRow label="التصنيف" value={product?.category} />
          <InfoRow label="السعر" value={product?.price != null ? formatCurrency(Number(product.price)) : undefined} />
          <InfoRow label="سعر التكلفة" value={product?.costPrice != null ? formatCurrency(Number(product.costPrice)) : undefined} />
          <InfoRow label="الكمية الحالية" value={String(currentStock)} />
          <InfoRow label="الحالة" value={product?.status} />
          <InfoRow label="تاريخ الإنشاء" value={product?.createdAt ? formatDateAr(product.createdAt) : undefined} />
        </div>
        {product?.description && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-1">الوصف</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-gray-500">{msg}</CardContent>
    </Card>
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
    {
      key: "movements",
      label: "حركة المخزون",
      icon: ArrowUpDown,
      badge: movements.length || undefined,
      content: () =>
        movements.length === 0 ? (
          emptyMsg("لا توجد حركات مخزون لهذا المنتج")
        ) : (
          <DataTable columns={movementsColumns} data={movements} pageSize={10} emptyMessage="لا توجد حركات" noToolbar />
        ),
    },
    {
      key: "sales",
      label: "المبيعات",
      icon: ShoppingCart,
      badge: sales.length || undefined,
      content: () =>
        sales.length === 0 ? (
          emptyMsg("لا توجد مبيعات لهذا المنتج")
        ) : (
          <DataTable columns={salesColumns} data={sales} pageSize={10} emptyMessage="لا توجد مبيعات" noToolbar />
        ),
    },
    {
      key: "purchase-orders",
      label: "أوامر الشراء",
      icon: ShoppingBag,
      badge: purchaseOrders.length || undefined,
      content: () =>
        purchaseOrders.length === 0 ? (
          emptyMsg("لا توجد أوامر شراء لهذا المنتج")
        ) : (
          <DataTable columns={poColumns} data={purchaseOrders} pageSize={10} emptyMessage="لا توجد أوامر" noToolbar />
        ),
    },
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="store_product" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="store_products" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="store_product" entityId={id} />,
    },
  ];

  const metaItems = [
    product?.sku && { icon: Box, label: product.sku },
    product?.category && { icon: Package, label: product.category },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = (
    <>
      {product?.price != null && <Badge variant="outline">{formatCurrency(Number(product.price))}</Badge>}
      {product?.quantity != null && (
        <Badge className={currentStock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
          {currentStock > 0 ? `متوفر: ${currentStock}` : "نفد المخزون"}
        </Badge>
      )}
    </>
  );

  const notFound = !isLoading && !product;

  return (
    <EntityDetailPage
      title={product?.name || (notFound ? "المنتج غير موجود" : "...")}
      subtitle={product?.sku || undefined}
      avatar={{
        icon: Package,
        gradientFrom: "from-purple-500",
        gradientTo: "to-pink-600",
        text: product?.name?.slice(0, 2),
      }}
      badges={badges}
      metaItems={metaItems}
      backHref="/store"
      backLabel="العودة للمنتجات"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على المنتج المطلوب" : "تعذر تحميل بيانات المنتج"}
      onRetry={() => refetch()}
      actions={[
        {
          label: "تعديل",
          icon: Pencil,
          variant: "outline",
          onClick: () => {
            // Inline edit on the list page for now
            navigate("/store");
          },
        },
      ]}
      kpis={[
        {
          label: "المخزون الحالي",
          value: currentStock,
          icon: Warehouse,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "محجوز",
          value: reserved,
          icon: Box,
          color: "text-orange-600 bg-orange-50",
        },
        {
          label: "مبيعات 30 يوم",
          value: sold30d,
          icon: TrendingUp,
          color: "text-purple-600 bg-purple-50",
        },
        {
          label: "إيرادات 30 يوم",
          value: formatCurrency(revenue30d),
          icon: DollarSign,
          color: "text-green-600 bg-green-50",
        },
      ]}
      tabs={tabs}
      defaultTab="overview"
    />
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}
