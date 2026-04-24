import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailPageLayout, type ExtraTab } from "@/components/shared/detail-page-layout";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  Pencil,
  ShoppingCart,
  FileText,
  CreditCard,
  DollarSign,
  Clock,
} from "lucide-react";

export default function VendorDetailPage() {
  const [, params] = useRoute("/finance/vendors/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";

  const { data: vendor, isLoading, isError, refetch } = useApiQuery<any>(
    ["vendor", id],
    id ? `/finance/vendors/${id}` : null,
    !!id
  );

  const { data: poResp } = useApiQuery<any>(
    ["vendor-pos", id],
    id ? `/finance/purchase-orders` : null,
    !!id
  );
  const allPos: any[] = poResp?.data || [];
  const pos = useMemo(
    () => allPos.filter((p) => String(p.supplierId) === String(id) || String(p.vendorId) === String(id)),
    [allPos, id]
  );

  const { data: invoicesResp } = useApiQuery<any>(
    ["vendor-invoices", id],
    id ? `/finance/invoices?vendorId=${id}` : null,
    !!id
  );
  const invoices: any[] = (invoicesResp?.data || []).filter(
    (inv: any) => String(inv.supplierId ?? inv.vendorId) === String(id)
  );

  const { data: paymentsResp } = useApiQuery<any>(
    ["vendor-payments", id],
    id ? `/finance/payments?vendorId=${id}` : null,
    !!id
  );
  const payments: any[] = (paymentsResp?.data || []).filter(
    (p: any) => String(p.supplierId ?? p.vendorId) === String(id)
  );

  const totalPurchases = vendor?.totalPurchases != null
    ? Number(vendor.totalPurchases)
    : pos.reduce((sum, p) => sum + (Number(p.total) || Number(p.amount) || 0), 0);
  const activePos = vendor?.activeOrders != null
    ? Number(vendor.activeOrders)
    : pos.filter((p) => p.status !== "cancelled" && p.status !== "completed" && p.status !== "closed").length;
  const pendingPayments = invoices
    .filter((inv: any) => inv.status !== "paid" && inv.status !== "cancelled")
    .reduce((sum: number, inv: any) => sum + (Number(inv.balance) || Number(inv.total) || 0), 0);
  const lastInvoiceDate = vendor?.lastOrderAt || invoices
    .map((inv: any) => inv.issueDate || inv.date || inv.createdAt)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const poColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "total", header: "الإجمالي", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.total) || 0)}</span> },
  ];

  const invoiceColumns: DataTableColumn<any>[] = [
    { key: "invoiceNumber", header: "رقم الفاتورة", sortable: true, render: (r) => <span className="font-mono text-xs">{r.invoiceNumber || r.number || r.id}</span> },
    { key: "issueDate", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.issueDate || r.date || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "total", header: "الإجمالي", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.total) || 0)}</span> },
  ];

  const paymentColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.paymentDate || r.createdAt) },
    { key: "method", header: "الطريقة", sortable: true, render: (r) => r.method || r.paymentMethod || "-" },
    { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-semibold text-green-600">{formatCurrency(Number(r.amount) || 0)}</span> },
  ];

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-gray-500">{msg}</CardContent>
    </Card>
  );

  const overview = (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={DollarSign} label="إجمالي المشتريات" value={formatCurrency(totalPurchases)} color="text-blue-600 bg-blue-50" />
        <KpiCard icon={CreditCard} label="مدفوعات معلقة" value={formatCurrency(pendingPayments)} color="text-orange-600 bg-orange-50" />
        <KpiCard icon={ShoppingCart} label="أوامر شراء نشطة" value={String(activePos)} color="text-purple-600 bg-purple-50" />
        <KpiCard icon={Clock} label="آخر فاتورة" value={lastInvoiceDate ? formatDateAr(lastInvoiceDate) : "—"} color="text-green-600 bg-green-50" />
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="الاسم" value={vendor?.name} />
            <InfoRow label="جهة الاتصال" value={vendor?.contactPerson} />
            <InfoRow label="الهاتف" value={vendor?.phone} />
            <InfoRow label="البريد الإلكتروني" value={vendor?.email} />
            <InfoRow label="الرقم الضريبي" value={vendor?.taxNumber} />
            <InfoRow label="التصنيف" value={vendor?.category} />
            <InfoRow label="شروط الدفع" value={vendor?.paymentTerms} />
            <InfoRow label="العنوان" value={vendor?.address} />
          </div>
          {vendor?.notes && (
            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{vendor.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  const extraTabs: ExtraTab[] = [
    {
      key: "purchase-orders",
      label: "أوامر الشراء",
      icon: ShoppingCart,
      badge: pos.length || undefined,
      content: () =>
        pos.length === 0 ? (
          emptyMsg("لا توجد أوامر شراء مرتبطة بهذا المورد")
        ) : (
          <DataTable columns={poColumns} data={pos} pageSize={10} emptyMessage="لا توجد أوامر شراء" noToolbar />
        ),
    },
    {
      key: "invoices",
      label: "الفواتير",
      icon: FileText,
      badge: invoices.length || undefined,
      content: () =>
        invoices.length === 0 ? (
          emptyMsg("لا توجد فواتير مرتبطة بهذا المورد")
        ) : (
          <DataTable columns={invoiceColumns} data={invoices} pageSize={10} emptyMessage="لا توجد فواتير" noToolbar />
        ),
    },
    {
      key: "payments",
      label: "المدفوعات",
      icon: CreditCard,
      badge: payments.length || undefined,
      content: () =>
        payments.length === 0 ? (
          emptyMsg("لا توجد مدفوعات مرتبطة بهذا المورد")
        ) : (
          <DataTable columns={paymentColumns} data={payments} pageSize={10} emptyMessage="لا توجد مدفوعات" noToolbar />
        ),
    },
    {
      key: "financial",
      label: "الملف المالي",
      icon: DollarSign,
      content: () => (
        <div className="space-y-6">
          <EntityFinancialProfile entityType="vendor" entityId={id} />
          <FinancialTab entityType="supplier" entityId={id} />
        </div>
      ),
    },
  ];

  const actions = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={() => navigate("/finance/vendors")}
    >
      <Pencil className="h-4 w-4" />
      تعديل
    </Button>
  );

  return (
    <DetailPageLayout
      title={vendor?.name || "المورد"}
      subtitle={vendor?.contactPerson || undefined}
      backPath="/finance/vendors"
      backLabel="العودة للموردين"
      entityType="vendor"
      entityId={id}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      overview={overview}
      actions={actions}
      extraTabs={extraTabs}
    />
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const [textColor, bgColor] = color.split(" ");
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${bgColor}`}>
          <Icon className={`h-5 w-5 ${textColor}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
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
