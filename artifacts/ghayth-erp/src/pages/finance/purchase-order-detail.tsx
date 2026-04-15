import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageStatusBadge } from "@/components/page-status-badge";
import { PrintPreviewModal, PrintActions, PrintDocument, directPrint } from "@/components/print-layout";
import { extractBranchFromResponse } from "@/lib/branch-utils";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ArrowRight, ShoppingCart, User, Phone, Mail, Calendar, Package, FileText, Truck, Copy } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";

export default function PurchaseOrderDetailPage() {
  const [, params] = useRoute("/finance/purchase-orders/:id");
  const id = params?.id;
  const { data: po, isLoading } = useApiQuery<any>(["po-detail", id || ""], `/finance/purchase-orders/${id}`, !!id);
  const [showPreview, setShowPreview] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!po) return (
    <div className="text-center py-12">
      <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">أمر الشراء غير موجود</p>
      <Link href="/finance/purchase-orders"><Button variant="outline" className="mt-4">العودة لطلبات الشراء</Button></Link>
    </div>
  );

  const branch = extractBranchFromResponse(po);
  const lines = po.lines || [];
  const docDate = po.createdAt ? formatDateAr(po.createdAt) : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance/purchase-orders">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">أمر شراء {po.ref || `#${po.id}`}</h1>
          <PageStatusBadge status={po.status} />
        </div>
        <div className="flex gap-2">
          <Link href={`/finance/purchase-orders/create?copyFrom=${id}`}>
            <Button variant="outline" size="sm" className="gap-1">
              <Copy className="h-4 w-4" />نسخ
            </Button>
          </Link>
          <ExportButton endpoint={`/export/pdf/purchase-order/${id}`} filename={`po-${id}.pdf`} type="pdf" label="ملف طباعي" />
          <PrintActions
            onPreview={() => setShowPreview(true)}
            onPrint={() => directPrint(printContainerRef.current, `أمر شراء ${po.ref || po.id}`)}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><User className="h-4 w-4" /><span className="text-sm">المورد</span></div>
          <p className="font-bold text-lg">{po.supplierName || "-"}</p>
          {po.supplierPhone && <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{po.supplierPhone}</p>}
          {po.supplierEmail && <p className="text-sm text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" />{po.supplierEmail}</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Package className="h-4 w-4" /><span className="text-sm">ملخص مالي</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>المبلغ الإجمالي</span><span className="text-primary">{formatCurrency(Number(po.totalAmount || 0))}</span></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Calendar className="h-4 w-4" /><span className="text-sm">التواريخ</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>تاريخ الإنشاء</span><span>{formatDateAr(po.createdAt)}</span></div>
            {po.expectedDelivery && <div className="flex justify-between"><span>التسليم المتوقع</span><span className="font-medium">{formatDateAr(po.expectedDelivery)}</span></div>}
          </div>
        </CardContent></Card>
      </div>

      {lines.length > 0 && (
        <Card>
          <CardHeader><CardTitle>بنود أمر الشراء</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">#</th>
                <th className="p-3 text-start">الوصف</th>
                <th className="p-3 text-start">الكمية</th>
                <th className="p-3 text-start">سعر الوحدة</th>
                <th className="p-3 text-start">الإجمالي</th>
              </tr></thead>
              <tbody>
                {lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="p-3 text-gray-400">{i + 1}</td>
                    <td className="p-3 font-medium">{l.description || l.name || "-"}</td>
                    <td className="p-3">{l.quantity || 1}</td>
                    <td className="p-3">{formatCurrency(Number(l.unitPrice || 0))}</td>
                    <td className="p-3 font-bold">{formatCurrency(Number(l.lineTotal || l.total || (l.quantity || 1) * (l.unitPrice || 0)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {po.status === "pending" && (
        <Card>
          <CardHeader><CardTitle>إجراءات الاعتماد</CardTitle></CardHeader>
          <CardContent>
            <ApprovalActions
              entityType="purchase_order"
              entityId={Number(id)}
              approveEndpoint={`/finance/purchase-orders/${id}/approve`}
              rejectEndpoint={`/finance/purchase-orders/${id}/approve`}
              returnEndpoint={`/finance/purchase-orders/${id}/approve`}
              approveMethod="PATCH"
              rejectMethod="PATCH"
              returnMethod="PATCH"
              approveBody={() => ({ approved: true })}
              rejectBody={(r) => ({ approved: false, notes: r })}
              returnBody={(r) => ({ approved: "returned", notes: r })}
              invalidateKeys={[["po-detail", id || ""], ["purchase-orders"]]}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>سجل الإجراءات</CardTitle></CardHeader>
        <CardContent>
          <ActionHistory entityType="purchase_order" entityId={Number(id)} defaultOpen />
        </CardContent>
      </Card>

      {po.notes && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-gray-600 whitespace-pre-wrap">{po.notes}</p></CardContent>
        </Card>
      )}

      {id && <EntityDocuments entityType="purchase_order" entityId={id} />}

      {id && (
        <Card>
          <CardHeader><CardTitle className="text-lg">سجل الأحداث</CardTitle></CardHeader>
          <CardContent>
            <EntityTimeline entityType="purchase_order" entityId={id} />
          </CardContent>
        </Card>
      )}

      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        branch={branch}
        documentTitle="أمر شراء"
        documentRef={po.ref || `#${po.id}`}
        documentDate={docDate}
      >
        <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>المورد:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{po.supplierName || "-"}</span>
          </div>
          {po.supplierPhone && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>هاتف المورد:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{po.supplierPhone}</span>
          </div>}
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>الحالة:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{po.status || "-"}</span>
          </div>
          {po.expectedDelivery && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>التسليم المتوقع:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{formatDateAr(po.expectedDelivery)}</span>
          </div>}
        </div>

        {lines.length > 0 && (
          <table>
            <thead><tr>
              <th>#</th>
              <th>الوصف</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الإجمالي</th>
            </tr></thead>
            <tbody>
              {lines.map((l: any, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{l.description || l.name || "-"}</td>
                  <td>{l.quantity || 1}</td>
                  <td>{Number(l.unitPrice || 0).toLocaleString()} ﷼</td>
                  <td style={{ fontWeight: "bold" }}>{Number(l.lineTotal || l.total || (l.quantity || 1) * (l.unitPrice || 0)).toLocaleString()} ﷼</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
          <tbody>
            <tr>
              <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ الإجمالي:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{Number(po.totalAmount || 0).toLocaleString()} ﷼</td>
            </tr>
          </tbody>
        </table>

        {po.notes && <p style={{ marginTop: "16px", color: "#555" }}>ملاحظات: {po.notes}</p>}
      </PrintPreviewModal>

      <div ref={printContainerRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <PrintDocument branch={branch} documentTitle="أمر شراء" documentRef={po.ref || `#${po.id}`} documentDate={docDate}>
          <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>المورد:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{po.supplierName || "-"}</span>
            </div>
            {po.supplierPhone && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>هاتف المورد:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{po.supplierPhone}</span>
            </div>}
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>الحالة:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{po.status || "-"}</span>
            </div>
            {po.expectedDelivery && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>التسليم المتوقع:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{formatDateAr(po.expectedDelivery)}</span>
            </div>}
          </div>
          {lines.length > 0 && (
            <table>
              <thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {lines.map((l: any, i: number) => (
                  <tr key={i}><td>{i + 1}</td><td>{l.description || l.name || "-"}</td><td>{l.quantity || 1}</td><td>{Number(l.unitPrice || 0).toLocaleString()} ﷼</td><td style={{ fontWeight: "bold" }}>{Number(l.lineTotal || l.total || (l.quantity || 1) * (l.unitPrice || 0)).toLocaleString()} ﷼</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
            <tbody>
              <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ الإجمالي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{Number(po.totalAmount || 0).toLocaleString()} ﷼</td></tr>
            </tbody>
          </table>
          {po.notes && <p style={{ marginTop: "16px", color: "#555" }}>ملاحظات: {po.notes}</p>}
        </PrintDocument>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>{id && <EntityDocuments entityType="purchase_order" entityId={id} />}</div>
        <Card>
          <CardHeader><CardTitle className="text-lg">السجل الزمني</CardTitle></CardHeader>
          <CardContent>
            {id && <EntityTimeline entityType="purchase_orders" entityId={id} maxItems={20} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
