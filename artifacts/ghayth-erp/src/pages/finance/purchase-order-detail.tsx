import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintPreviewModal, PrintActions, PrintDocument, directPrint } from "@/components/print-layout";
import { PrintButton } from "@/components/shared/print-button";
import { extractBranchFromResponse } from "@/lib/branch-utils";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ShoppingCart, User, Phone, Mail, Calendar, Package, Copy } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { resolveStatus } from "@workspace/ui-core";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

export default function PurchaseOrderDetailPage() {
  const [, params] = useRoute("/finance/purchase-orders/:id");
  const id = params?.id;
  const { extraTabs, hideTabs } = useRegistryTabs("purchase_order", id || "");
  const { data: po, isLoading, isError } = useApiQuery<any>(["po-detail", id || ""], `/finance/purchase-orders/${id}`, !!id);
  const [showPreview, setShowPreview] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (!isLoading && !isError && !po) return (
    <div className="text-center py-12">
      <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-muted-foreground">أمر الشراء غير موجود</p>
      <Link href="/finance/purchase-orders"><Button variant="outline" className="mt-4">العودة لطلبات الشراء</Button></Link>
    </div>
  );

  const branch = po ? extractBranchFromResponse(po) : undefined;
  const lines = po?.lines || [];
  const docDate = po?.createdAt ? formatDateAr(po.createdAt) : "";

  const overview = po ? (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><User className="h-4 w-4" /><span className="text-sm">المورد</span></div>
          <p className="font-bold text-lg">{po.supplierName || "-"}</p>
          {po.supplierPhone && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{po.supplierPhone}</p>}
          {po.supplierEmail && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{po.supplierEmail}</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><Package className="h-4 w-4" /><span className="text-sm">ملخص مالي</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>المبلغ الإجمالي</span><span className="text-primary">{formatCurrency(Number(po.totalAmount || 0))}</span></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><Calendar className="h-4 w-4" /><span className="text-sm">التواريخ</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>تاريخ الإنشاء</span><span>{formatDateAr(po.createdAt)}</span></div>
            {po.expectedDelivery && <div className="flex justify-between"><span>التسليم المتوقع</span><span className="font-medium">{formatDateAr(po.expectedDelivery)}</span></div>}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>بنود أمر الشراء</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "_index", header: "#", render: (_r, i) => <span className="text-muted-foreground">{i + 1}</span> },
              { key: "description", header: "الوصف", render: (r) => <span className="font-medium">{r.description || r.name || "-"}</span> },
              { key: "quantity", header: "الكمية", sortable: true, render: (r) => r.quantity || 1 },
              { key: "unitPrice", header: "سعر الوحدة", sortable: true, render: (r) => formatCurrency(Number(r.unitPrice || 0)) },
              { key: "lineTotal", header: "الإجمالي", sortable: true, render: (r) => <span className="font-bold">{formatCurrency(Number(r.lineTotal || r.total || (r.quantity || 1) * (r.unitPrice || 0)))}</span> },
            ] satisfies DataTableColumn<any>[]}
            data={lines}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد بنود"
          />
        </CardContent>
      </Card>

      {po.status === "pending" && (
        <Card>
          <CardHeader><CardTitle>إجراءات الاعتماد</CardTitle></CardHeader>
          <CardContent>
            <ApprovalActions
              entityType="purchase-order"
              entityId={Number(id)}
              approveEndpoint={`/finance/purchase-orders/${id}/approve`}
              rejectEndpoint={`/finance/purchase-orders/${id}/reject`}
              returnEndpoint={`/finance/purchase-orders/${id}/return`}
              approveMethod="PATCH"
              rejectMethod="PATCH"
              returnMethod="PATCH"
              invalidateKeys={[["po-detail", id || ""], ["purchase-orders"]]}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>سجل الإجراءات</CardTitle></CardHeader>
        <CardContent>
          <ActionHistory entityType="purchase-order" entityId={Number(id)} defaultOpen />
        </CardContent>
      </Card>

      {po.notes && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground whitespace-pre-wrap">{po.notes}</p></CardContent>
        </Card>
      )}
    </>
  ) : null;

  const actions = po ? (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={`/finance/purchase-orders/create?copyFrom=${id}`}>
        <Button variant="outline" size="sm" className="gap-1">
          <Copy className="h-4 w-4" />نسخ
        </Button>
      </Link>
      <ExportButton endpoint={`/export/pdf/purchase-order/${id}`} filename={`po-${id}.pdf`} type="pdf" label="ملف طباعي" />
      <PrintButton
        entityType="purchase_order"
        entityId={po.id ?? id}
        formats={["a4", "excel"]}
        label="طباعة"
      />
      <PrintActions
        onPreview={() => setShowPreview(true)}
        onPrint={() => directPrint(printContainerRef.current, `أمر شراء ${po.ref || po.id}`)}
      />
    </div>
  ) : undefined;

  return (
    <>
      <DetailPageLayout
        title={po ? `أمر شراء ${po.ref || `#${po.id}`}` : "أمر شراء"}
        subtitle={po?.supplierName || undefined}
        backPath="/finance/purchase-orders"
        backLabel="العودة"
        status={po?.status ? { label: resolveStatus(po.status, "purchase")?.label || po.status } : undefined}
        refNumber={po?.ref || (po ? `#${po.id}` : undefined)}
        createdAt={po?.createdAt}
        updatedAt={po?.updatedAt}
        entityType="purchase-order"
        entityId={id || ""}
        overview={overview}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        actions={actions}
        isLoading={isLoading}
        error={isError ? true : undefined}
       
      />

      {po && (
        <>
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
                <span className="info-value" style={{ fontWeight: 600 }}>{resolveStatus(po.status, "purchase")?.label || po.status || "-"}</span>
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
                      <td>{formatCurrency(Number(l.unitPrice || 0))}</td>
                      <td style={{ fontWeight: "bold" }}>{formatCurrency(Number(l.lineTotal || l.total || (l.quantity || 1) * (l.unitPrice || 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
              <tbody>
                <tr>
                  <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ الإجمالي:</td>
                  <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(po.totalAmount || 0))}</td>
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
                  <span className="info-value" style={{ fontWeight: 600 }}>{resolveStatus(po.status, "purchase")?.label || po.status || "-"}</span>
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
                      <tr key={i}><td>{i + 1}</td><td>{l.description || l.name || "-"}</td><td>{l.quantity || 1}</td><td>{formatCurrency(Number(l.unitPrice || 0))}</td><td style={{ fontWeight: "bold" }}>{formatCurrency(Number(l.lineTotal || l.total || (l.quantity || 1) * (l.unitPrice || 0)))}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
                <tbody>
                  <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ الإجمالي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(po.totalAmount || 0))}</td></tr>
                </tbody>
              </table>
              {po.notes && <p style={{ marginTop: "16px", color: "#555" }}>ملاحظات: {po.notes}</p>}
            </PrintDocument>
          </div>
        </>
      )}
    </>
  );
}
