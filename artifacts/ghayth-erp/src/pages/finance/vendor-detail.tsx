import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  Building2,
  Phone,
  Mail,
  Pencil,
  Activity,
  ShoppingCart,
  FileText,
  CreditCard,
  History,
  MessageCircle,
  FolderOpen,
  DollarSign,
  Clock,
  Hash,
  MapPin,
  StickyNote,
  User,
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

  // Prefer server-computed stats when available, fall back to client aggregation.
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

  const overviewContent = () => (
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
  );

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-gray-500">{msg}</CardContent>
    </Card>
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
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
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="vendor" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="vendors" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="vendor" entityId={id} />,
    },
  ];

  const metaItems = [
    vendor?.phone && { icon: Phone, label: vendor.phone },
    vendor?.email && { icon: Mail, label: vendor.email },
    vendor?.taxNumber && { icon: Hash, label: vendor.taxNumber },
    vendor?.address && { icon: MapPin, label: vendor.address },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = vendor?.category ? <Badge variant="outline">{vendor.category}</Badge> : null;

  const notFound = !isLoading && !vendor;

  return (
    <EntityDetailPage
      title={vendor?.name || (notFound ? "المورد غير موجود" : "...")}
      subtitle={vendor?.contactPerson || undefined}
      avatar={{
        icon: Building2,
        gradientFrom: "from-blue-500",
        gradientTo: "to-indigo-600",
        text: vendor?.name?.slice(0, 2),
      }}
      badges={badges}
      metaItems={metaItems}
      backHref="/finance/vendors"
      backLabel="العودة للموردين"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على المورد المطلوب" : "تعذر تحميل بيانات المورد"}
      onRetry={() => refetch()}
      actions={[
        {
          label: "تعديل",
          icon: Pencil,
          variant: "outline",
          onClick: () => {
            // Dedicated edit page doesn't exist yet — navigate back to the list
            // where inline edit is available for now.
            navigate("/finance/vendors");
          },
        },
      ]}
      kpis={[
        {
          label: "إجمالي المشتريات",
          value: formatCurrency(totalPurchases),
          icon: DollarSign,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "مدفوعات معلقة",
          value: formatCurrency(pendingPayments),
          icon: CreditCard,
          color: "text-orange-600 bg-orange-50",
        },
        {
          label: "أوامر شراء نشطة",
          value: activePos,
          icon: ShoppingCart,
          color: "text-purple-600 bg-purple-50",
        },
        {
          label: "آخر فاتورة",
          value: lastInvoiceDate ? formatDateAr(lastInvoiceDate) : "—",
          icon: Clock,
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
