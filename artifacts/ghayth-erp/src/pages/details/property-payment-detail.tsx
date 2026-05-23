import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Banknote, Calendar, Hash, CreditCard } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@workspace/entity-kit";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

/**
 * PropertyPaymentDetail — unified detail page for a single property
 * payment record (rent, deposit, maintenance, utility, fine, etc.).
 *
 * Reads the row from `/properties/payments/:id`. The amount is shown as
 * a hero number; due/paid dates, method and period covered are
 * surfaced in the primary card. Related entities include the tenant,
 * the unit and (if present) the originating contract.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  paid: "مدفوع",
  partially_paid: "مدفوع جزئياً",
  overdue: "متأخر",
  cancelled: "ملغى",
  scheduled: "مجدول",
};

const TYPE_LABELS: Record<string, string> = {
  rent: "إيجار",
  deposit: "تأمين",
  maintenance: "صيانة",
  utility: "خدمات",
  fine: "غرامة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "paid") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "overdue") return "destructive" as const;
  if (status === "partially_paid") return "warning" as const;
  if (status === "scheduled") return "info" as const;
  if (status === "pending") return "warning" as const;
  return "default" as const;
}

export default function PropertyPaymentDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/properties/payments/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("property-payment", id ?? 0);
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["property-payment", String(id)],
    id ? `/properties/payments/${id}` : null,
    !!id
  );

  const payment = data;

  const amount = useMemo(() => {
    return Number(payment?.amount ?? 0);
  }, [payment?.amount]);

  const paidAmount = useMemo(() => {
    return Number(payment?.paidAmount ?? 0);
  }, [payment?.paidAmount]);

  const paymentMethodLabel = payment?.paymentMethod
    ? PAYMENT_METHODS[payment.paymentMethod] || payment.paymentMethod
    : null;

  const typeLabel = payment?.paymentType
    ? TYPE_LABELS[payment.paymentType] || payment.paymentType
    : null;

  // Period covered is either a free-text label or a pair of dates on the
  // record. Prefer the label if supplied.
  const periodLabel = useMemo(() => {
    if (!payment) return null;
    if (payment.periodLabel) return payment.periodLabel;
    if (payment.periodStart && payment.periodEnd) {
      return `${formatDateAr(payment.periodStart)} - ${formatDateAr(payment.periodEnd)}`;
    }
    if (payment.period) return payment.period;
    return null;
  }, [payment]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!payment) return out;
    if (payment.tenantId) {
      out.push({
        type: "tenant",
        id: payment.tenantId,
        label: payment.tenantName || `مستأجر #${payment.tenantId}`,
        sublabel: "المستأجر",
        href: `/properties/tenants/${payment.tenantId}`,
      });
    }
    if (payment.unitId) {
      out.push({
        type: "property",
        id: payment.unitId,
        label: payment.unitNumber || `وحدة #${payment.unitId}`,
        sublabel: "الوحدة",
        href: `/properties/${payment.unitId}`,
      });
    }
    if (payment.contractId) {
      out.push({
        type: "contract",
        id: payment.contractId,
        label: payment.contractRef || `عقد #${payment.contractId}`,
        sublabel: "العقد",
        href: `/properties/contracts/${payment.contractId}`,
      });
    }
    return out;
  }, [payment]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!payment) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: payment.ref || `PAY-${id}` },
          { label: "المبلغ", value: formatCurrency(amount) },
          ...(typeLabel ? [{ label: "نوع الدفعة", value: typeLabel }] : []),
          ...(payment.tenantName
            ? [{ label: "المستأجر", value: payment.tenantName }]
            : []),
          ...(payment.unitNumber
            ? [{ label: "رقم الوحدة", value: payment.unitNumber }]
            : []),
          ...(payment.dueDate
            ? [{ label: "تاريخ الاستحقاق", value: formatDateAr(payment.dueDate) }]
            : []),
          ...(payment.paidDate
            ? [{ label: "تاريخ الدفع", value: formatDateAr(payment.paidDate) }]
            : []),
          ...(paymentMethodLabel
            ? [{ label: "طريقة الدفع", value: paymentMethodLabel }]
            : []),
          ...(payment.reference
            ? [{ label: "الرقم المرجعي", value: payment.reference }]
            : []),
          ...(periodLabel
            ? [{ label: "الفترة المغطاة", value: periodLabel }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[payment.status] || payment.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(payment.createdAt) },
        ],
      },
    ];
    if (payment.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: payment.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المستأجر", name: payment.tenantName || "" },
        { label: "المستلم", name: payment.receivedByName || payment.createdByName || "" },
      ],
    });
    return sections;
  }, [payment, amount, typeLabel, paymentMethodLabel, periodLabel, id]);

  const handleEdit = () => {
    setLocation(`/properties/payments/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — hero amount + core metadata */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            بيانات الدفعة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-muted-foreground">ر.س</span>
            {payment?.status === "partially_paid" && paidAmount > 0 && (
              <span className="ms-2 text-xs text-status-warning-foreground">
                مدفوع: {formatCurrency(paidAmount)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {typeLabel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع الدفعة</p>
                <Badge variant="outline">{typeLabel}</Badge>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> طريقة الدفع
                </p>
                <Badge variant="secondary">{paymentMethodLabel}</Badge>
              </div>
            )}
            {payment?.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> تاريخ الاستحقاق
                </p>
                <span className="text-status-neutral-foreground">{formatDateAr(payment.dueDate)}</span>
              </div>
            )}
            {payment?.paidDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> تاريخ الدفع
                </p>
                <span className="text-status-neutral-foreground">{formatDateAr(payment.paidDate)}</span>
              </div>
            )}
            {payment?.tenantName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المستأجر</p>
                <span className="text-status-neutral-foreground">{payment.tenantName}</span>
              </div>
            )}
            {payment?.unitNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الوحدة</p>
                <span className="text-status-neutral-foreground">{payment.unitNumber}</span>
              </div>
            )}
            {payment?.reference && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Hash className="h-3 w-3" /> الرقم المرجعي
                </p>
                <span className="text-status-neutral-foreground font-mono text-xs">{payment.reference}</span>
              </div>
            )}
            {periodLabel && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الفترة المغطاة</p>
                <span className="text-status-neutral-foreground">{periodLabel}</span>
              </div>
            )}
          </div>

          {payment?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{payment.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Status quick card */}
        {payment?.status && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">الحالة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge
                variant={
                  payment.status === "paid"
                    ? "default"
                    : payment.status === "cancelled" || payment.status === "overdue"
                    ? "destructive"
                    : "secondary"
                }
              >
                {STATUS_LABELS[payment.status] || payment.status}
              </Badge>
              {payment.status === "partially_paid" && (
                <p className="text-xs text-muted-foreground">
                  المتبقي: {formatCurrency(Math.max(0, amount - paidAmount))}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pay quick-link when outstanding */}
        {id && payment && ["pending", "overdue", "partially_paid", "scheduled"].includes(payment.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات</CardTitle>
            </CardHeader>
            <CardContent>
              <GuardedButton
                perm="properties:update"
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => setLocation(`/properties/payments/${id}/pay`)}
              >
                <Banknote className="h-4 w-4 ms-1" />
                تسجيل دفعة
              </GuardedButton>
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="property-payment" entityId={id} />}
      {id && <EntityTags entityType="property-payment" entityId={id} />}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={payment?.ref ? `دفعة ${payment.ref}` : "تفاصيل الدفعة"}
        subtitle={
          payment
            ? [typeLabel, payment.tenantName, payment.unitNumber]
                .filter(Boolean)
                .join(" • ") || undefined
            : undefined
        }
        backPath="/properties/payments"
        refNumber={payment?.ref || (id ? `PAY-${id}` : undefined)}
        status={
          payment
            ? { label: STATUS_LABELS[payment.status] || payment.status || "-", tone: statusTone(payment.status) }
            : undefined
        }
        typeLabel={typeLabel || undefined}
        createdAt={payment?.createdAt}
        updatedAt={payment?.updatedAt}
        createdByName={payment?.createdByName}
        assignedToName={payment?.receivedByName}
        relatedEntities={relatedEntities}
        entityType="property-payment"
        entityId={id ?? 0}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        actions={
          <>
            {payment && (
              <EntityPrintButton
                branchId={payment.branchId}
                title={payment.ref ? `دفعة ${payment.ref}` : "دفعة"}
                ref={payment.ref || `PAY-${id}`}
                date={formatDateAr(payment.paidDate || payment.dueDate || payment.createdAt)}
                sections={printSections}
                entityType="receipt_voucher"
                entityId={payment.id ?? id}
                formats={["a4", "thermal_80"]}
              />
            )}
            <GuardedButton
              perm="properties:update"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={!payment || ["paid", "cancelled"].includes(payment?.status)}
            >
              <Edit className="h-4 w-4 ms-1" />
              تعديل
            </GuardedButton>
          </>
        }
      />
      <AttachmentPreview
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(o) => !o && setPreviewAttachment(null)}
      />
    </>
  );
}
