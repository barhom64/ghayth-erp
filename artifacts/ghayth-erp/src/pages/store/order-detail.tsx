import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/shared/print-button";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ShoppingCart, User, Phone, Calendar, Package } from "lucide-react";
import { DetailPageLayout } from "@workspace/entity-kit";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

export default function StoreOrderDetailPage() {
  const [, params] = useRoute("/store/orders/:id");
  const id = params?.id;
  const { extraTabs, hideTabs } = useRegistryTabs("store_order", id ?? "");

  const { data: order, isLoading, isError, refetch } = useApiQuery<any>(["store-order-detail", id || ""], `/store/orders/${id}`, !!id);

  const items = (() => {
    try { return typeof order?.items === "string" ? JSON.parse(order.items) : (order?.items || []); }
    catch { return []; }
  })();

  const docDate = order?.createdAt ? formatDateAr(order.createdAt) : "";

  const overview = (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><User className="h-4 w-4" /><span className="text-sm">بيانات العميل</span></div>
          <p className="font-bold text-lg">{order?.customerName || "-"}</p>
          {order?.customerPhone && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{order.customerPhone}</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><Package className="h-4 w-4" /><span className="text-sm">ملخص الطلب</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>رقم الطلب</span><span className="font-mono font-medium">{order?.orderNumber || `#${order?.id}`}</span></div>
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>المبلغ الإجمالي</span><span className="text-primary">{formatCurrency(Number(order?.totalAmount || 0))}</span></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><Calendar className="h-4 w-4" /><span className="text-sm">التواريخ</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>تاريخ الإنشاء</span><span>{order?.createdAt ? formatDateAr(order.createdAt) : "-"}</span></div>
          </div>
        </CardContent></Card>
      </div>

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle>بنود الطلب</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "_index", header: "#", render: (_r: any, i: number) => <span className="text-muted-foreground">{i + 1}</span> },
                { key: "name", header: "المنتج", render: (r: any) => <span className="font-medium">{r.name || r.description || "-"}</span> },
                { key: "quantity", header: "الكمية", sortable: true, render: (r: any) => r.quantity || 1 },
                { key: "price", header: "السعر", sortable: true, render: (r: any) => formatCurrency(Number(r.price || r.unitPrice || 0)) },
                { key: "total", header: "الإجمالي", sortable: true, render: (r: any) => <span className="font-bold">{formatCurrency(Number(r.total || (r.quantity || 1) * (r.price || r.unitPrice || 0)))}</span> },
              ] satisfies DataTableColumn<any>[]}
              data={items}
              pageSize={0}
              noToolbar
              searchPlaceholder={null}
              emptyMessage="لا توجد بنود"
            />
          </CardContent>
        </Card>
      )}

      {order?.notes && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{order.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );

  const statusTone = order?.status === "completed" || order?.status === "delivered" ? "success" as const
    : order?.status === "cancelled" ? "destructive" as const
    : order?.status === "pending" ? "warning" as const
    : "info" as const;

  const actions = order ? (
    <PrintButton
      entityType="store_order"
      entityId={order.id ?? params?.id ?? 0}
      formats={["a4"]}
      label="طباعة"
    />
  ) : undefined;

  return (
    <DetailPageLayout
      title={`طلب ${order?.orderNumber || (order ? `#${order.id}` : "")}`}
      subtitle={order?.customerName || undefined}
      backPath="/store/orders"
      backLabel="العودة"
      status={order?.status ? { label: order.status, tone: statusTone } : undefined}
      entityType="store_order"
      entityId={id || ""}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => { void refetch(); }}
      createdAt={order?.createdAt}
      updatedAt={order?.updatedAt}
      overview={overview}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={actions}
    />
  );
}
