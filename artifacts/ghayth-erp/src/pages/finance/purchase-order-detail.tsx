import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/shared/print-button";
import { LineAllocationStatusBanner } from "@/components/shared/line-allocation-status-banner";
import {
  DataTable,
  type DataTableColumn,
  resolveStatus,
} from "@workspace/ui-core";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ShoppingCart, User, Phone, Mail, Calendar, Package, Copy } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { DetailPageLayout } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { PurchaseOrderReceiveSection } from "@/components/finance/purchase-order-receive-section";

export default function PurchaseOrderDetailPage() {
  const [, params] = useRoute("/finance/purchase-orders/:id");
  const id = params?.id;
  const { extraTabs, hideTabs } = useRegistryTabs("purchase_order", id || "");
  const { data: po, isLoading, isError } = useApiQuery<any>(["po-detail", id || ""], `/finance/purchase-orders/${id}`, !!id);
  // GET /finance/purchase-orders/:id/receipts — goods-receipt notes
  // recorded against this PO. Fetched lazily once the PO is loaded.
  const { data: receiptsResp } = useApiQuery<any>(
    ["po-receipts", id || ""],
    id ? `/finance/purchase-orders/${id}/receipts` : null,
    { enabled: !!id },
  );
  const receipts: any[] = receiptsResp?.data ?? receiptsResp?.receipts ?? [];
  // GET /finance/purchase-orders/:id/match — 3-way match results
  // (PO ↔ GRN ↔ supplier invoice) for AP review.
  const { data: matchResp } = useApiQuery<any>(
    ["po-match", id || ""],
    id ? `/finance/purchase-orders/${id}/match` : null,
    { enabled: !!id },
  );
  const matchData = matchResp?.data ?? matchResp;

  if (!isLoading && !isError && !po) return (
    <div className="text-center py-12">
      <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-muted-foreground">أمر الشراء غير موجود</p>
      <Button asChild variant="outline" className="mt-4"><Link href="/finance/purchase-orders">العودة لطلبات الشراء</Link></Button>
    </div>
  );

  const lines = po?.lines || [];

  const overview = po ? (
    <>
      <LineAllocationStatusBanner lines={lines} documentType="purchase_order" />
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

      {po && (po.status === "approved" || po.status === "partially_received" || po.status === "received" || po.status === "invoiced") && (
        <PurchaseOrderReceiveSection poId={id || po.id} poStatus={po.status} />
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

      {receipts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">سندات استلام البضاعة ({receipts.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs">
              {receipts.slice(0, 10).map((r: any, i: number) => (
                <div key={r.id ?? i} className="px-3 py-2 flex items-center justify-between">
                  <span className="font-mono">{r.grnRef ?? r.ref ?? `#${r.id ?? i}`}</span>
                  <span className="text-muted-foreground">
                    {r.receivedAt ? new Date(r.receivedAt).toLocaleDateString("ar-SA") : ""}
                    {r.status && <span className="ms-2">· {r.status}</span>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {matchData && (
        <Card className="border-status-info-surface bg-status-info-surface/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">المطابقة الثلاثية (PO ↔ GRN ↔ فاتورة)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(matchData)
              .filter(([, v]) => typeof v !== "object" || v === null)
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k} className="border rounded p-1 bg-white">
                  <p className="text-muted-foreground text-[10px]">{k}</p>
                  <p className="font-mono">{v == null ? "—" : String(v)}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </>
  ) : null;

  const actions = po ? (
    <div className="flex items-center gap-2 flex-wrap">
      <Button asChild variant="outline" size="sm" className="gap-1"><Link href={`/finance/purchase-orders/create?copyFrom=${id}`}>
          <Copy className="h-4 w-4" />نسخ
        </Link></Button>
      <PrintButton
        entityType="purchase_order"
        entityId={po.id ?? id}
        formats={["a4", "excel"]}
        label="طباعة"
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

    </>
  );
}
