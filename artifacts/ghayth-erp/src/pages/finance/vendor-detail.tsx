import { useMemo } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { DetailPageLayout, type ExtraTab } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
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
  FileSpreadsheet,
  Phone,
  Mail,
  MessageCircle,
} from "lucide-react";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { PrintButton } from "@/components/shared/print-button";
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";

export default function VendorDetailPage() {
  const [, params] = useRoute("/finance/vendors/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const { hideTabs: registryHideTabs } = useRegistryTabs("vendor", id ?? "");

  const { data: vendor, isLoading, isError, refetch } = useApiQuery<any>(
    ["vendor", id],
    `/finance/vendors/${id}`,
    !!id
  );

  const editDelete = useDetailEditDelete({
    entityLabel: "المورد",
    patchPath: `/finance/vendors/${id}`,
    deletePath: `/finance/vendors/${id}`,
    listPath: "/finance/vendors",
    initialValues: vendor,
    fields: [
      { key: "name", label: "الاسم" },
      { key: "contactPerson", label: "جهة الاتصال" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "taxNumber", label: "الرقم الضريبي" },
      { key: "address", label: "العنوان" },
    ],
    invalidateKeys: [["vendor", id], ["vendors"]],
    onSaved: () => refetch(),
  });

  const { data: poResp } = useApiQuery<any>(
    ["vendor-pos", id],
    `/finance/purchase-orders`,
    !!id
  );
  const allPos: any[] = poResp?.data || [];
  const pos = useMemo(
    () => allPos.filter((p) => String(p.supplierId) === String(id) || String(p.vendorId) === String(id)),
    [allPos, id]
  );

  const { data: invoicesResp } = useApiQuery<any>(
    ["vendor-invoices", id],
    `/finance/invoices?vendorId=${id}`,
    !!id
  );
  const invoices: any[] = (invoicesResp?.data || []).filter(
    (inv: any) => String(inv.supplierId ?? inv.vendorId) === String(id)
  );

  const { data: paymentsResp } = useApiQuery<any>(
    ["vendor-payments", id],
    `/finance/payments?vendorId=${id}`,
    !!id
  );
  const payments: any[] = (paymentsResp?.data || []).filter(
    (p: any) => String(p.supplierId ?? p.vendorId) === String(id)
  );

  // GET /finance/payables — outstanding AP per vendor. The vendor
  // page already shows individual PO and invoice rows; this is the
  // aggregate roll-up that AR teams use to see what's due across all
  // documents for this vendor. Filtered client-side to this vendor.
  const { data: payablesResp } = useApiQuery<any>(
    ["finance-payables-vendor", id],
    "/finance/payables",
    !!id,
  );
  const allPayables: any[] = payablesResp?.data ?? payablesResp ?? [];
  const vendorPayables = allPayables.filter(
    (p: any) => String(p.supplierId ?? p.vendorId ?? p.agentId) === String(id),
  );
  const outstandingTotal = vendorPayables.reduce(
    (s: number, p: any) => s + Number(p.outstandingAmount ?? p.netCost ?? 0),
    0,
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
    { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-semibold text-status-success-foreground">{formatCurrency(Number(r.amount) || 0)}</span> },
  ];

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const overview = (
    <>
      <InlineEditCard hook={editDelete} />
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={DollarSign} label="إجمالي المشتريات" value={formatCurrency(totalPurchases)} color="text-status-info-foreground bg-status-info-surface" />
        <KpiCard icon={CreditCard} label="مدفوعات معلقة" value={formatCurrency(pendingPayments)} color="text-orange-600 bg-orange-50" />
        <KpiCard icon={ShoppingCart} label="أوامر شراء نشطة" value={String(activePos)} color="text-purple-600 bg-purple-50" />
        <KpiCard icon={Clock} label="آخر فاتورة" value={lastInvoiceDate ? formatDateAr(lastInvoiceDate) : "—"} color="text-status-success-foreground bg-status-success-surface" />
        {vendorPayables.length > 0 && (
          <KpiCard
            icon={CreditCard}
            label={`مستحقات قائمة (${vendorPayables.length})`}
            value={formatCurrency(outstandingTotal)}
            color="text-status-error-foreground bg-status-error-surface"
          />
        )}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="الاسم" value={vendor?.name} />
            <InfoRow label="جهة الاتصال" value={vendor?.contactPerson} />
            <div>
              <p className="text-xs text-muted-foreground">الهاتف</p>
              {vendor?.phone ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${String(vendor.phone).replace(/[^0-9+]/g, "")}`}
                    className="text-sm font-medium text-status-info-foreground hover:underline inline-flex items-center gap-1"
                    dir="ltr"
                    data-testid="vendor-phone-tel"
                  >
                    <Phone className="h-3 w-3" />
                    {vendor.phone}
                  </a>
                  <a
                    href={`https://wa.me/${String(vendor.phone).replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    title="واتساب"
                    className="text-xs text-emerald-600 hover:underline"
                    data-testid="vendor-phone-wa"
                  >
                    واتساب
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
              {vendor?.email ? (
                <a
                  href={`mailto:${vendor.email}`}
                  className="text-sm font-medium text-status-info-foreground hover:underline inline-flex items-center gap-1"
                  dir="ltr"
                  data-testid="vendor-email-mailto"
                >
                  <Mail className="h-3 w-3" />
                  {vendor.email}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
            <InfoRow label="الرقم الضريبي" value={vendor?.taxNumber} />
            <InfoRow label="التصنيف" value={vendor?.category} />
            <InfoRow label="شروط الدفع" value={vendor?.paymentTerms} />
            <InfoRow label="العنوان" value={vendor?.address} />
          </div>
          {vendor?.notes && (
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm text-status-neutral-foreground whitespace-pre-wrap">{vendor.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {id && <VendorContactSummaryCard vendorId={id} />}

      {/* WHT settings — surfaces the fields from #999 (residencyStatus,
         defaultWhtRate, whtCategoryDefault, taxResidenceCountry). Only
         shown when the vendor is non-resident — for resident vendors
         we hide the section to keep the overview clean. */}
      {vendor && (vendor.residencyStatus === "resident" || !vendor.residencyStatus) && (
        <Card className="border-muted">
          <CardContent className="p-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              ⓘ هذا المورد مُسجَّل كـ <strong className="text-foreground">مقيم</strong> — لا استقطاع ضريبة دخل عند الدفع.
            </span>
            <Button size="sm" variant="outline" onClick={() => navigate(`/finance/vendors/${id}/edit`)}>
              <Pencil className="h-3.5 w-3.5 me-1" /> تعديل إعدادات الإقامة الضريبية
            </Button>
          </CardContent>
        </Card>
      )}

      {vendor?.residencyStatus && vendor.residencyStatus !== "resident" && (
        <Card className="border-status-warning-surface bg-status-warning-surface/40">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <span className="text-status-warning-foreground">💰</span>
                إعدادات استقطاع ضريبة الدخل (WHT)
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-status-warning-foreground font-medium">
                  مورد غير مقيم — يُستقطع منه ضريبة عند الدفع
                </span>
                <Button size="sm" variant="outline" onClick={() => navigate(`/finance/vendors/${id}/edit`)}>
                  <Pencil className="h-3.5 w-3.5 me-1" /> تعديل
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-status-warning-surface">
              <InfoRow label="حالة الإقامة الضريبية"
                value={
                  vendor.residencyStatus === "non_resident_gcc" ? "غير مقيم — دول الخليج" :
                  vendor.residencyStatus === "non_resident_treaty" ? "غير مقيم — معاهدة (DTAA)" :
                  vendor.residencyStatus === "non_resident_other" ? "غير مقيم — أخرى" :
                  vendor.residencyStatus
                } />
              <InfoRow label="بلد الإقامة الضريبية" value={vendor.taxResidenceCountry || "—"} />
              <InfoRow label="فئة الاستقطاع الافتراضية"
                value={vendor.whtCategoryDefault ? (
                  <span className="font-mono">{vendor.whtCategoryDefault}</span>
                ) as any : "—"} />
              <InfoRow label="نسبة استقطاع افتراضية"
                value={vendor.defaultWhtRate != null
                  ? (<span className="font-mono font-bold text-status-warning-foreground">{Number(vendor.defaultWhtRate).toFixed(2)}%</span>) as any
                  : "—"} />
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-status-warning-surface">
              ⓘ عند دفع هذا المورد، سيتم استقطاع النسبة من المبلغ تلقائياً وقيد المستقطع على حساب
              "زاتكا — ضريبة استقطاع" (افتراضي 2330) ليُسدّد في الإقرار الشهري.
            </p>
          </CardContent>
        </Card>
      )}
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

  const actions = <DetailActionButtons hook={editDelete} editPerm="finance:update" deletePerm="finance:delete" />;

  return (
    <DetailPageLayout
      title={vendor?.name || "المورد"}
      subtitle={vendor?.contactPerson || undefined}
      backPath="/finance/vendors"
      backLabel="العودة للموردين"
      entityType="vendor"
      entityId={id}
      hideTabs={registryHideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      overview={overview}
      actions={
        <div className="flex items-center gap-2">
          {actions}
          <Button size="sm" variant="default" onClick={() => navigate(`/finance/vendor-360-sheet?vendorId=${id}`)}>
            ملف 360°
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/finance/vendors/${id}/statement`)}>
            <FileSpreadsheet className="h-4 w-4 me-1" /> كشف حساب
          </Button>
          <PrintButton entityType="vendor" entityId={(id as any) ?? 0} label="طباعة" />
          {id != null && <EntityPnlButton entityType="vendor" entityId={Number(id)} />}
        </div>
      }
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-status-neutral-foreground mt-0.5">{value || "—"}</p>
    </div>
  );
}

// ─── VendorContactSummaryCard ─────────────────────────────────────
// Mirror of ContactSummaryCard on client-detail. Pulls
// /finance/vendors/:id/contact-summary which returns the last
// message_log row matching the vendor's phone/email + per-channel
// breakdown. Same UX: tells the operator "when did we last talk to
// this supplier?" without opening the inbox.
function VendorContactSummaryCard({ vendorId }: { vendorId: string }) {
  const { data } = useApiQuery<{
    data: {
      lastContact: {
        id: number; channel: string; direction: string;
        fromAddress: string | null; toAddress: string | null;
        subject: string | null; createdAt: string;
      } | null;
      channelCounts: Array<{ channel: string; count: number }>;
      totalCount: number;
    };
  }>(["vendor-contact-summary", vendorId], `/finance/vendors/${vendorId}/contact-summary`, !!vendorId);

  const summary = data?.data;
  if (!summary) return null;

  const channelLabel: Record<string, string> = {
    email: "البريد", sms: "SMS", whatsapp: "واتساب", pbx: "السنترال",
    internal: "داخلي", push: "تنبيه", in_app: "داخل النظام",
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-500" /> آخر تواصل
          {summary.totalCount > 0 && (
            <Badge variant="outline" className="text-[10px] ms-auto">{summary.totalCount} رسالة</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary.lastContact ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">
                {channelLabel[summary.lastContact.channel] || summary.lastContact.channel}
                {" · "}
                {summary.lastContact.direction === "inbound" ? "وارد" : "صادر"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDateAr(summary.lastContact.createdAt)}
              </span>
            </div>
            {summary.lastContact.subject && (
              <p className="text-sm font-medium line-clamp-1">{summary.lastContact.subject}</p>
            )}
            <Link href={`/inbox?supplierId=${vendorId}`} asChild>
              <a className="text-xs text-status-info-foreground hover:underline inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                عرض كل المراسلات
              </a>
            </Link>
            {summary.channelCounts.length > 1 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {summary.channelCounts.map((c) => (
                  <span key={c.channel} className="text-[11px] text-muted-foreground">
                    {channelLabel[c.channel] || c.channel}: <span className="font-mono font-semibold">{c.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">لا توجد مراسلات سابقة مع هذا المورد</p>
        )}
      </CardContent>
    </Card>
  );
}
