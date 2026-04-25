import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, ArrowDownCircle, AlertTriangle, Calendar, Receipt } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

/**
 * ReceivableDetail — unified detail page for a single accounts-receivable
 * entry. The `/finance/receivables` list is driven by invoice rows with
 * outstanding balances; this page reads the same row plus derived
 * collection fields (paidAmount, remainingAmount, dueDate) from
 * `/finance/receivables/:id`.
 */

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  partial: "مدفوع جزئياً",
  paid: "مدفوع",
  overdue: "متأخر",
  written_off: "مشطوب",
  cancelled: "ملغى",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "paid") return "success" as const;
  if (["cancelled", "written_off"].includes(status)) return "destructive" as const;
  if (status === "overdue") return "destructive" as const;
  if (status === "partial") return "warning" as const;
  if (status === "open") return "info" as const;
  return "default" as const;
}

// Aging bucket derivation: positive `daysOverdue` means the due date has
// already passed. Matches the standard AR aging buckets used across the
// finance module.
type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

function computeDaysOverdue(dueDate?: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = Date.now() - due;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days;
}

function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const AGING_LABEL: Record<AgingBucket, string> = {
  "current": "ضمن الاستحقاق",
  "1-30": "1-30 يوم",
  "31-60": "31-60 يوم",
  "61-90": "61-90 يوم",
  "90+": "أكثر من 90 يوم",
};

const AGING_TONE: Record<AgingBucket, "success" | "info" | "warning" | "destructive"> = {
  "current": "success",
  "1-30": "info",
  "31-60": "warning",
  "61-90": "warning",
  "90+": "destructive",
};

const AGING_CLASS: Record<AgingBucket, string> = {
  "current": "bg-green-100 text-green-700 border-green-300",
  "1-30": "bg-blue-100 text-blue-700 border-blue-300",
  "31-60": "bg-yellow-100 text-yellow-700 border-yellow-300",
  "61-90": "bg-orange-100 text-orange-700 border-orange-300",
  "90+": "bg-red-100 text-red-700 border-red-300",
};

export default function ReceivableDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/receivables/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["receivable", String(id)],
    id ? `/finance/receivables/${id}` : null,
    !!id
  );

  const receivable = data;

  const total = Number(receivable?.total ?? receivable?.totalAmount ?? 0);
  const paid = Number(receivable?.paidAmount ?? 0);
  const remaining = Number(receivable?.remainingAmount ?? Math.max(total - paid, 0));

  const daysOverdue = useMemo(
    () => computeDaysOverdue(receivable?.dueDate),
    [receivable?.dueDate]
  );

  // Only show the overdue indicator if there's actually something left to
  // collect — a fully-paid invoice past its due date is not "overdue".
  const isActuallyOverdue = daysOverdue > 0 && remaining > 0;

  const bucket = useMemo<AgingBucket>(() => {
    if (!isActuallyOverdue) return "current";
    return agingBucket(daysOverdue);
  }, [daysOverdue, isActuallyOverdue]);

  const paymentHistory: any[] = useMemo(() => {
    if (Array.isArray(receivable?.payments)) return receivable.payments;
    if (Array.isArray(receivable?.paymentHistory)) return receivable.paymentHistory;
    return [];
  }, [receivable?.payments, receivable?.paymentHistory]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!receivable) return out;
    if (receivable.clientId) {
      out.push({
        type: "client",
        id: receivable.clientId,
        label: receivable.clientName || `عميل #${receivable.clientId}`,
        sublabel: "العميل",
        href: `/clients/${receivable.clientId}`,
      });
    }
    if (receivable.invoiceId) {
      out.push({
        type: "invoice",
        id: receivable.invoiceId,
        label: receivable.invoiceRef || `فاتورة #${receivable.invoiceId}`,
        sublabel: "الفاتورة",
        href: `/finance/invoices/${receivable.invoiceId}`,
      });
    }
    return out;
  }, [receivable]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!receivable) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: receivable.ref || `AR-${id}` },
          { label: "الإجمالي", value: formatCurrency(total) },
          { label: "المدفوع", value: formatCurrency(paid) },
          { label: "المتبقي", value: formatCurrency(remaining) },
          ...(receivable.clientName
            ? [{ label: "العميل", value: receivable.clientName }]
            : []),
          ...(receivable.invoiceRef
            ? [{ label: "الفاتورة", value: receivable.invoiceRef }]
            : []),
          ...(receivable.dueDate
            ? [{ label: "تاريخ الاستحقاق", value: formatDateAr(receivable.dueDate) }]
            : []),
          ...(isActuallyOverdue
            ? [{ label: "أيام التأخر", value: String(daysOverdue) }]
            : []),
          { label: "شريحة العمر", value: AGING_LABEL[bucket] },
          { label: "الحالة", value: STATUS_LABELS[receivable.status] || receivable.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(receivable.createdAt) },
        ],
      },
    ];
    if (paymentHistory.length > 0) {
      sections.push({
        kind: "info-grid",
        items: paymentHistory.map((p: any, i: number) => ({
          label: p.date ? formatDateAr(p.date) : `دفعة #${i + 1}`,
          value: `${formatCurrency(Number(p.amount || 0))}${p.method ? ` — ${p.method}` : ""}`,
        })),
      });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المحاسب", name: receivable.createdByName || "" },
        { label: "المستلم", name: receivable.clientName || "" },
      ],
    });
    return sections;
  }, [receivable, total, paid, remaining, daysOverdue, isActuallyOverdue, bucket, paymentHistory, id]);

  const handleEdit = () => {
    setLocation(`/finance/receivables/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — hero total + payment breakdown */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4 text-gray-500" />
            بيانات المستحق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(total)}
            </span>
            <span className="text-xs text-gray-500">ر.س</span>
            <span className="text-xs text-gray-400 ms-2">إجمالي الفاتورة</span>
          </div>

          {/* Paid / remaining split — the collection snapshot */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border bg-green-50 p-3">
              <p className="text-xs text-gray-500 mb-0.5">المدفوع</p>
              <p className="text-lg font-semibold text-green-700">{formatCurrency(paid)}</p>
            </div>
            <div className="rounded border bg-red-50 p-3">
              <p className="text-xs text-gray-500 mb-0.5">المتبقي</p>
              <p className="text-lg font-semibold text-red-700">{formatCurrency(remaining)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {receivable?.clientName && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">العميل</p>
                <span className="text-gray-800">{receivable.clientName}</span>
              </div>
            )}
            {receivable?.invoiceRef && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">رقم الفاتورة</p>
                <span className="text-gray-800 font-mono text-xs">{receivable.invoiceRef}</span>
              </div>
            )}
            {receivable?.dueDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> تاريخ الاستحقاق
                </p>
                <span className="text-gray-800">{formatDateAr(receivable.dueDate)}</span>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-0.5">شريحة العمر</p>
              <Badge variant="outline" className={AGING_CLASS[bucket]}>
                {AGING_LABEL[bucket]}
              </Badge>
            </div>
            {isActuallyOverdue && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" /> أيام التأخر
                </p>
                <span className="text-red-600 font-semibold">{daysOverdue} يوم</span>
              </div>
            )}
          </div>

          {receivable?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{receivable.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Payment history summary — compact list of collected payments */}
        {paymentHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-gray-500" />
                سجل الدفعات ({paymentHistory.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {paymentHistory.slice(0, 5).map((p: any, i: number) => (
                <div
                  key={p.id || i}
                  className="flex items-center justify-between text-xs border-b last:border-b-0 pb-1.5 last:pb-0"
                >
                  <span className="text-gray-600">
                    {p.date ? formatDateAr(p.date) : `دفعة #${i + 1}`}
                  </span>
                  <span className="font-semibold text-green-700">
                    {formatCurrency(Number(p.amount || 0))}
                  </span>
                </div>
              ))}
              {paymentHistory.length > 5 && (
                <p className="text-[11px] text-gray-400 pt-1">
                  و {paymentHistory.length - 5} دفعة أخرى...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Approval actions — only surface when an adjustment workflow applies */}
        {id && receivable && ["pending", "pending_approval", "draft", "returned"].includes(receivable.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="receivable"
                entityId={id}
                currentStatus={receivable.status}
                approveEndpoint={`/finance/receivables/${id}/approve`}
                rejectEndpoint={`/finance/receivables/${id}/approve`}
                returnEndpoint={`/finance/receivables/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "pending_approval", "draft", "returned"]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث المستحق" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الإجراءات</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="receivable" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {id && <ApprovalTimeline entityType="receivable" entityId={id} />}

      {id && <EntityComments entityType="receivable" entityId={id} />}
      {id && <EntityTags entityType="receivable" entityId={id} />}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={receivable?.ref ? `مستحق ${receivable.ref}` : "تفاصيل المستحق"}
        subtitle={receivable?.clientName || undefined}
        backPath="/finance/receivables"
        refNumber={receivable?.ref || (id ? `AR-${id}` : undefined)}
        status={
          receivable
            ? { label: STATUS_LABELS[receivable.status] || receivable.status || "-", tone: statusTone(receivable.status) }
            : undefined
        }
        typeLabel={
          isActuallyOverdue ? AGING_LABEL[bucket] : undefined
        }
        createdAt={receivable?.createdAt}
        updatedAt={receivable?.updatedAt}
        createdByName={receivable?.createdByName}
        assignedToName={receivable?.clientName}
        relatedEntities={relatedEntities}
        entityType="receivable"
        entityId={id ?? 0}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        actions={
          <>
            {receivable && (
              <EntityPrintButton
                branchId={receivable.branchId}
                title={receivable.ref ? `مستحق ${receivable.ref}` : "مستحق"}
                ref={receivable.ref || `AR-${id}`}
                date={formatDateAr(receivable.createdAt)}
                sections={printSections}
              />
            )}
            <GuardedButton
              perm="finance:update"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={
                !receivable || ["paid", "cancelled", "written_off"].includes(receivable.status)
              }
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
