import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/shared/print-button";
import {
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
  resolveStatus,
} from "@workspace/ui-core";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ShoppingCart, User, Phone, Mail, Calendar, Package, Copy, Truck, CheckSquare } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { DetailPageLayout, type ExtraTab } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { PurchaseOrderReceiveSection } from "@/components/finance/purchase-order-receive-section";

export default function PurchaseOrderDetailPage() {
  const [, params] = useRoute("/finance/purchase-orders/:id");
  const id = params?.id;
  const { extraTabs: registryExtraTabs, hideTabs } = useRegistryTabs("purchase_order", id || "");
  const { data: po, isLoading, isError } = useApiQuery<any>(["po-detail", id || ""], `/finance/purchase-orders/${id}`, !!id);

  // PO receipts / 3-way match endpoints — lazy GET, only when the
  // user actually opens the tab. Keeps initial load fast.
  const { data: receiptsResp } = useApiQuery<any>(
    ["po-receipts", id || ""],
    id ? `/finance/purchase-orders/${id}/receipts` : null,
    !!id,
  );
  const receipts: any[] = receiptsResp?.data || (Array.isArray(receiptsResp) ? receiptsResp : []);

  const { data: matchResp } = useApiQuery<any>(
    ["po-match", id || ""],
    id ? `/finance/purchase-orders/${id}/match` : null,
    !!id,
  );
  const matchData = matchResp?.data ?? matchResp ?? null;

  const receiptColumns: DataTableColumn<any>[] = [
    { key: "ref", header: "المرجع", sortable: true, render: (r) => <span className="font-mono text-xs">{r.ref || r.grnRef || `#${r.id}`}</span> },
    { key: "receivedAt", header: "تاريخ الاستلام", sortable: true, render: (r) => r.receivedAt || r.createdAt ? formatDateAr(r.receivedAt || r.createdAt) : "—" },
    { key: "totalQty", header: "الكمية", sortable: true, render: (r) => Number(r.totalQty || r.quantity || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status || "received"} /> },
  ];

  const extraTabs: ExtraTab[] = [
    ...(receipts.length > 0 ? [{
      key: "receipts",
      label: "إيصالات الاستلام",
      icon: Truck,
      badge: receipts.length || undefined,
      content: () => (
        <DataTable columns={receiptColumns} data={receipts} pageSize={10} noToolbar emptyMessage="لا توجد إيصالات استلام" />
      ),
    } as ExtraTab] : []),
    ...(matchData ? [{
      key: "match",
      label: "المطابقة الثلاثية",
      icon: CheckSquare,
      content: () => (
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي PO</span><span className="font-mono">{formatCurrency(Number(matchData.poTotal || 0))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي الاستلام</span><span className="font-mono">{formatCurrency(Number(matchData.grnTotal || 0))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي الفواتير</span><span className="font-mono">{formatCurrency(Number(matchData.invoiceTotal || 0))}</span></div>
            <div className="flex justify-between border-t pt-2 font-semibold"><span>حالة المطابقة</span><span>{matchData.matchStatus || matchData.status || "—"}</span></div>
          </CardContent>
        </Card>
      ),
    } as ExtraTab] : []),
    ...registryExtraTabs,
  ];

  if (!isLoading && !isError && !po) return (
    <div className="text-center py-12">
      <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-muted-foreground">أمر الشراء غير موجود</p>
      <Link href="/finance/purchase-orders"><Button variant="outline" className="mt-4">العودة لطلبات الشراء</Button></Link>
    </div>
  );

  const lines = po?.lines || [];

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
    </>
  ) : null;

  const actions = po ? (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={`/finance/purchase-orders/create?copyFrom=${id}`}>
        <Button variant="outline" size="sm" className="gap-1">
          <Copy className="h-4 w-4" />نسخ
        </Button>
      </Link>
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
