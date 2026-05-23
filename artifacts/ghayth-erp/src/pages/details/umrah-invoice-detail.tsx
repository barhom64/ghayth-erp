import { useMemo } from "react";
import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Users, Package, Calendar, Wallet } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  issued: "صادرة",
  paid: "مدفوعة",
  partially_paid: "مدفوعة جزئياً",
  overdue: "متأخرة",
  cancelled: "ملغاة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "paid") return "success" as const;
  if (status === "partially_paid") return "info" as const;
  if (status === "issued") return "info" as const;
  if (status === "overdue") return "destructive" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "draft") return "muted" as const;
  return "default" as const;
}

export default function UmrahInvoiceDetail() {
  const [, params] = useRoute("/umrah/invoices/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("umrah-invoice", id ?? 0);

  // C2: this detail page is the target of the "فواتير الوكلاء" list
  // (invoices.tsx → GET /umrah/agent-invoices). It must fetch the agent
  // invoice. GET /umrah/invoices/:id does not exist on the backend; the
  // sales-invoice collection (GET /umrah/invoices) has no detail route.
  const { data: invoice, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-invoice", String(id)],
    id ? `/umrah/agent-invoices/${id}` : null,
    !!id
  );

  // C2: agent-invoice payload exposes the headline figure as `total`.
  const amount = Number(invoice?.amount ?? invoice?.totalAmount ?? invoice?.total ?? 0);
  const paidAmount = Number(invoice?.paidAmount ?? 0);
  const remainingAmount = Number(
    invoice?.remainingAmount ?? Math.max(0, amount - paidAmount)
  );

  const payments: any[] = useMemo(() => {
    return Array.isArray(invoice?.payments) ? invoice.payments : [];
  }, [invoice?.payments]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!invoice) return out;
    if (invoice.pilgrimId) {
      out.push({
        type: "pilgrim",
        id: invoice.pilgrimId,
        label: invoice.pilgrimName || `معتمر #${invoice.pilgrimId}`,
        sublabel: "المعتمر",
        href: `/umrah/pilgrims/${invoice.pilgrimId}`,
        icon: Users,
      });
    }
    if (invoice.packageId) {
      out.push({
        type: "package",
        id: invoice.packageId,
        label: invoice.packageName || `باقة #${invoice.packageId}`,
        sublabel: "الباقة",
        href: `/umrah/packages/${invoice.packageId}`,
        icon: Package,
      });
    }
    if (invoice.seasonId) {
      out.push({
        type: "season",
        id: invoice.seasonId,
        label: invoice.seasonName || `موسم #${invoice.seasonId}`,
        sublabel: "الموسم",
        href: `/umrah/seasons/${invoice.seasonId}`,
        icon: Calendar,
      });
    }
    return out;
  }, [invoice]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!invoice) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم الفاتورة", value: invoice.invoiceNumber || `INV-${id}` },
      { label: "المعتمر", value: invoice.pilgrimName || "-" },
      { label: "الباقة", value: invoice.packageName || "-" },
      ...(invoice.seasonName
        ? [{ label: "الموسم", value: invoice.seasonName }]
        : []),
      { label: "المبلغ الإجمالي", value: formatCurrency(amount) },
      { label: "المبلغ المدفوع", value: formatCurrency(paidAmount) },
      { label: "المبلغ المتبقي", value: formatCurrency(remainingAmount) },
      ...(invoice.dueDate
        ? [{ label: "تاريخ الاستحقاق", value: formatDateAr(invoice.dueDate) }]
        : []),
      { label: "الحالة", value: STATUS_LABELS[invoice.status] || invoice.status || "-" },
      { label: "تاريخ الإنشاء", value: formatDateAr(invoice.createdAt) },
    ];
    const sections: PrintSection[] = [{ kind: "info-grid", items }];

    if (payments.length > 0) {
      sections.push({
        kind: "text",
        title: "سجل الدفعات",
        body: payments
          .map(
            (p: any, idx: number) =>
              `${idx + 1}. ${formatDateAr(p.date || p.paidAt || p.createdAt)} — ${formatCurrency(
                Number(p.amount || 0)
              )}${p.method ? ` (${p.method})` : ""}`
          )
          .join("\n"),
      });
    }

    if (invoice.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: invoice.notes });
    }

    sections.push({
      kind: "signature",
      parties: [
        { label: "المحاسب", name: invoice.createdByName || "" },
        { label: "المعتمد", name: invoice.approvedByName || "" },
      ],
    });
    return sections;
  }, [invoice, amount, paidAmount, remainingAmount, payments, id]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            بيانات الفاتورة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-muted-foreground">ر.س</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">رقم الفاتورة</p>
              <span className="text-status-neutral-foreground font-mono text-xs">
                {invoice?.invoiceNumber || `INV-${id}`}
              </span>
            </div>
            {invoice?.pilgrimName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المعتمر</p>
                <span className="text-status-neutral-foreground font-medium">{invoice.pilgrimName}</span>
              </div>
            )}
            {invoice?.packageName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الباقة</p>
                <Badge variant="outline">{invoice.packageName}</Badge>
              </div>
            )}
            {invoice?.seasonName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الموسم</p>
                <Badge variant="secondary">{invoice.seasonName}</Badge>
              </div>
            )}
            {invoice?.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الاستحقاق</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {formatDateAr(invoice.dueDate)}
                </span>
              </div>
            )}
            {invoice?.issuedDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإصدار</p>
                <span className="text-status-neutral-foreground">{formatDateAr(invoice.issuedDate)}</span>
              </div>
            )}
          </div>

          {invoice?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Payment summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              ملخص السداد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">المدفوع</span>
              <span className="text-status-success-foreground font-semibold">
                {formatCurrency(paidAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">المتبقي</span>
              <span className="text-status-error-foreground font-semibold">
                {formatCurrency(remainingAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">عدد الدفعات</span>
              <span className="text-status-neutral-foreground font-medium">{payments.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment history */}
        {payments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الدفعات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {payments.slice(0, 5).map((p: any, idx: number) => (
                <div
                  key={p.id ?? idx}
                  className="flex items-center justify-between gap-2 p-2 rounded border text-xs"
                >
                  <span className="text-muted-foreground">
                    {formatDateAr(p.date || p.paidAt || p.createdAt)}
                  </span>
                  <span className="text-gray-900 font-semibold">
                    {formatCurrency(Number(p.amount || 0))}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="umrah-invoice" entityId={id} />}
      {id && <EntityTags entityType="umrah-invoice" entityId={id} />}
      {/* C2: attachments panel removed — it was typed entityType="sales_invoice"
          while this page renders an agent invoice; the umrah attachments API
          has no "agent_invoice" entity type, so the panel surfaced another
          entity's documents. Removed to keep the page on one entity. */}
    </div>
  );

  return (
    <DetailPageLayout
      title={
        invoice?.invoiceNumber
          ? `فاتورة ${invoice.invoiceNumber}`
          : "تفاصيل الفاتورة"
      }
      subtitle={invoice?.pilgrimName ? `المعتمر: ${invoice.pilgrimName}` : undefined}
      backPath="/umrah/invoices"
      refNumber={invoice?.invoiceNumber || (id ? `INV-${id}` : undefined)}
      status={
        invoice
          ? {
              label: STATUS_LABELS[invoice.status] || invoice.status || "-",
              tone: statusTone(invoice.status),
            }
          : undefined
      }
      createdAt={invoice?.createdAt}
      updatedAt={invoice?.updatedAt}
      createdByName={invoice?.createdByName}
      relatedEntities={relatedEntities}
      entityType="umrah-invoice"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {invoice && (
            <EntityPrintButton
              branchId={invoice.branchId}
              title={
                invoice.invoiceNumber
                  ? `فاتورة ${invoice.invoiceNumber}`
                  : "فاتورة عمرة"
              }
              ref={invoice.invoiceNumber || `INV-${id}`}
              date={formatDateAr(invoice.createdAt)}
              sections={printSections}
              entityType="umrah_invoice"
              entityId={invoice.id ?? id}
              formats={["a4"]}
            />
          )}
        </>
      }
    />
  );
}
