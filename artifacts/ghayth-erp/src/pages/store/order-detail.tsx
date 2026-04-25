import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PrintPreviewModal, PrintActions, PrintDocument, directPrint } from "@/components/print-layout";
import { extractBranchFromResponse } from "@/lib/branch-utils";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ArrowRight, ShoppingCart, User, Phone, Calendar, Package, FileText } from "lucide-react";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function StoreOrderDetailPage() {
  const [, params] = useRoute("/store/orders/:id");
  const id = params?.id;
  const { data: order, isLoading, isError } = useApiQuery<any>(["store-order-detail", id || ""], `/store/orders/${id}`, !!id);
  const [showPreview, setShowPreview] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  if (!order) return (
    <div className="text-center py-12">
      <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">الطلب غير موجود</p>
      <Link href="/store"><Button variant="outline" className="mt-4">العودة للمتجر</Button></Link>
    </div>
  );

  const branch = extractBranchFromResponse(order);
  const items = (() => {
    try { return typeof order.items === "string" ? JSON.parse(order.items) : (order.items || []); }
    catch { return []; }
  })();

  const docDate = order.createdAt ? formatDateAr(order.createdAt) : "";

  return (
    <PageShell
      title={`طلب ${order.orderNumber || `#${order.id}`}`}
      subtitle={order.customerName || undefined}
      loading={isLoading}
      breadcrumbs={[{ href: "/store", label: "المتجر" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <PageStatusBadge status={order.status} />
          <PrintActions
            onPreview={() => setShowPreview(true)}
            onPrint={() => directPrint(printContainerRef.current, `طلب ${order.orderNumber || order.id}`)}
          />
          <Link href="/store">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><User className="h-4 w-4" /><span className="text-sm">بيانات العميل</span></div>
          <p className="font-bold text-lg">{order.customerName || "-"}</p>
          {order.customerPhone && <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{order.customerPhone}</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Package className="h-4 w-4" /><span className="text-sm">ملخص الطلب</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>رقم الطلب</span><span className="font-mono font-medium">{order.orderNumber || `#${order.id}`}</span></div>
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>المبلغ الإجمالي</span><span className="text-primary">{formatCurrency(Number(order.totalAmount || 0))}</span></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Calendar className="h-4 w-4" /><span className="text-sm">التواريخ</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>تاريخ الإنشاء</span><span>{formatDateAr(order.createdAt)}</span></div>
          </div>
        </CardContent></Card>
      </div>

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle>بنود الطلب</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "_index", header: "#", render: (_r: any, i: number) => <span className="text-gray-400">{i + 1}</span> },
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

      {order.notes && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-gray-600">{order.notes}</p></CardContent>
        </Card>
      )}

      {id && <EntityDocuments entityType="order" entityId={id} />}

      {id && (
        <Card>
          <CardHeader><CardTitle className="text-lg">سجل الأحداث</CardTitle></CardHeader>
          <CardContent>
            <EntityTimeline entityType="order" entityId={id} />
          </CardContent>
        </Card>
      )}

      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        branch={branch}
        documentTitle="طلب متجر"
        documentRef={order.orderNumber || `#${order.id}`}
        documentDate={docDate}
      >
        <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>العميل:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{order.customerName || "-"}</span>
          </div>
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>الهاتف:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{order.customerPhone || "-"}</span>
          </div>
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>الحالة:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{resolveStatus(order.status)?.label || order.status || "-"}</span>
          </div>
        </div>

        {items.length > 0 && (
          <table>
            <thead><tr>
              <th>#</th>
              <th>المنتج</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr></thead>
            <tbody>
              {items.map((item: any, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{item.name || item.description || "-"}</td>
                  <td>{item.quantity || 1}</td>
                  <td>{formatCurrency(Number(item.price || item.unitPrice || 0))}</td>
                  <td style={{ fontWeight: "bold" }}>{formatCurrency(Number(item.total || (item.quantity || 1) * (item.price || item.unitPrice || 0)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
          <tbody>
            <tr>
              <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ الإجمالي:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(order.totalAmount || 0))}</td>
            </tr>
          </tbody>
        </table>
      </PrintPreviewModal>

      <div ref={printContainerRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <PrintDocument branch={branch} documentTitle="طلب متجر" documentRef={order.orderNumber || `#${order.id}`} documentDate={docDate}>
          <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>العميل:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{order.customerName || "-"}</span>
            </div>
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>الهاتف:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{order.customerPhone || "-"}</span>
            </div>
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>الحالة:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{resolveStatus(order.status)?.label || order.status || "-"}</span>
            </div>
          </div>
          {items.length > 0 && (
            <table>
              <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={i}><td>{i + 1}</td><td>{item.name || item.description || "-"}</td><td>{item.quantity || 1}</td><td>{formatCurrency(Number(item.price || item.unitPrice || 0))}</td><td style={{ fontWeight: "bold" }}>{formatCurrency(Number(item.total || (item.quantity || 1) * (item.price || item.unitPrice || 0)))}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
            <tbody>
              <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ الإجمالي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(order.totalAmount || 0))}</td></tr>
            </tbody>
          </table>
        </PrintDocument>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>{id && <EntityDocuments entityType="store_order" entityId={id} />}</div>
        <Card>
          <CardHeader><CardTitle className="text-lg">السجل الزمني</CardTitle></CardHeader>
          <CardContent>
            {id && <EntityTimeline entityType="store_orders" entityId={id} maxItems={20} />}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
