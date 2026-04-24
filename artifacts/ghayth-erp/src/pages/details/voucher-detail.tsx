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

import { Edit, Paperclip, Eye, Receipt } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { useToast } from "@/hooks/use-toast";

/**
 * VoucherDetail — unified detail page for a single finance voucher.
 *
 * Vouchers are payment/receipt documents that track financial transactions.
 * The page fetches via `/finance/vouchers/:id` and displays the full
 * voucher record including amount, type, payee/payer, and approval state.
 */

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending: "معلق",
  approved: "معتمد",
  paid: "مدفوع",
  rejected: "مرفوض",
  cancelled: "ملغى",
  posted: "مُرحَّل",
};

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  payment_voucher: "سند صرف",
  receipt_voucher: "سند قبض",
  journal_voucher: "سند قيد",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (["approved", "paid", "posted"].includes(status)) return "success" as const;
  if (["rejected", "cancelled"].includes(status)) return "destructive" as const;
  if (["pending"].includes(status)) return "info" as const;
  return "default" as const;
}

export default function VoucherDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/vouchers/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["voucher", String(id)],
    id ? `/finance/vouchers/${id}` : null,
    !!id
  );

  const voucher = data;

  const amount = useMemo(() => {
    return Number(voucher?.amount ?? 0);
  }, [voucher?.amount]);

  const hasAttachment = !!voucher?.attachmentUrl;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!voucher) return out;
    if (voucher.vendorId) {
      out.push({
        type: "vendor",
        id: voucher.vendorId,
        label: voucher.vendorName || `مورد #${voucher.vendorId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${voucher.vendorId}`,
      });
    }
    if (voucher.projectId) {
      out.push({
        type: "project",
        id: voucher.projectId,
        label: voucher.projectName || `مشروع #${voucher.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${voucher.projectId}`,
      });
    }
    if (voucher.clientId) {
      out.push({
        type: "client",
        id: voucher.clientId,
        label: voucher.clientName || `عميل #${voucher.clientId}`,
        sublabel: "العميل",
        href: `/clients/${voucher.clientId}`,
      });
    }
    if (voucher.employeeId) {
      out.push({
        type: "employee",
        id: voucher.employeeId,
        label: voucher.employeeName || `موظف #${voucher.employeeId}`,
        sublabel: "الموظف",
        href: `/hr/employees/${voucher.employeeId}`,
      });
    }
    return out;
  }, [voucher]);

  const paymentMethodLabel = voucher?.paymentMethod
    ? PAYMENT_METHODS[voucher.paymentMethod] || voucher.paymentMethod
    : null;

  const voucherTypeLabel = voucher?.voucherType
    ? VOUCHER_TYPE_LABELS[voucher.voucherType] || voucher.voucherType
    : null;

  const printSections: PrintSection[] = useMemo(() => {
    if (!voucher) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: voucher.ref || `VCH-${id}` },
          { label: "المبلغ", value: formatCurrency(amount) },
          ...(voucherTypeLabel
            ? [{ label: "نوع السند", value: voucherTypeLabel }]
            : []),
          ...(voucher.payeeName
            ? [{ label: "المستفيد / الدافع", value: voucher.payeeName }]
            : []),
          ...(paymentMethodLabel
            ? [{ label: "طريقة الدفع", value: paymentMethodLabel }]
            : []),
          ...(voucher.costCenter
            ? [{ label: "مركز التكلفة", value: voucher.costCenter }]
            : []),
          ...(voucher.reference
            ? [{ label: "الرقم المرجعي", value: voucher.reference }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[voucher.status] || voucher.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(voucher.createdAt) },
        ],
      },
    ];
    if (voucher.description) {
      sections.push({ kind: "text", title: "وصف السند", body: voucher.description });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "مُعِد السند", name: voucher.createdByName || "" },
        { label: "المعتمد", name: voucher.approvedByName || "" },
      ],
    });
    return sections;
  }, [voucher, amount, voucherTypeLabel, paymentMethodLabel, id]);

  const handleEdit = () => {
    setLocation(`/finance/vouchers/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — big amount + core metadata */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-gray-500" />
            بيانات السند
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-gray-500">ر.س</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {voucherTypeLabel && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع السند</p>
                <Badge variant="outline">{voucherTypeLabel}</Badge>
              </div>
            )}
            {voucher?.payeeName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المستفيد / الدافع</p>
                <span className="text-gray-800">{voucher.payeeName}</span>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">طريقة الدفع</p>
                <Badge variant="secondary">{paymentMethodLabel}</Badge>
              </div>
            )}
            {voucher?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ السند</p>
                <span className="text-gray-800">{formatDateAr(voucher.createdAt)}</span>
              </div>
            )}
            {voucher?.costCenter && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">مركز التكلفة</p>
                <span className="text-gray-800">{voucher.costCenter}</span>
              </div>
            )}
            {voucher?.reference && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">الرقم المرجعي</p>
                <span className="text-gray-800 font-mono text-xs">{voucher.reference}</span>
              </div>
            )}
          </div>

          {voucher?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{voucher.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Attachment */}
        {hasAttachment && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-gray-500" />
                المرفق
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 p-2 rounded border text-xs hover:bg-gray-50">
                <span className="truncate min-w-0">
                  {voucher.attachmentType || "مستند السند"}
                </span>
                <a
                  href={voucher.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-700 shrink-0"
                  title="فتح"
                >
                  <Eye className="h-3.5 w-3.5" />
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approval actions — visible while pending */}
        {id && voucher && ["pending", "draft"].includes(voucher.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="voucher"
                entityId={id}
                currentStatus={voucher.status}
                approveEndpoint={`/finance/vouchers/${id}/approve`}
                rejectEndpoint={`/finance/vouchers/${id}/approve`}
                returnEndpoint={`/finance/vouchers/${id}/approve`}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث السند" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Action history */}
        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="voucher" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={voucher?.ref ? `سند ${voucher.ref}` : "تفاصيل السند"}
        subtitle={voucherTypeLabel || undefined}
        backPath="/finance/vouchers"
        refNumber={voucher?.ref || (id ? `VCH-${id}` : undefined)}
        status={
          voucher
            ? { label: STATUS_LABELS[voucher.status] || voucher.status || "-", tone: statusTone(voucher.status) }
            : undefined
        }
        typeLabel={voucherTypeLabel || undefined}
        createdAt={voucher?.createdAt}
        updatedAt={voucher?.updatedAt}
        createdByName={voucher?.createdByName}
        assignedToName={voucher?.approvedByName}
        relatedEntities={relatedEntities}
        entityType="voucher"
        entityId={id ?? 0}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        actions={
          <>
            {voucher && (
              <EntityPrintButton
                branchId={voucher.branchId}
                title={voucher.ref ? `سند ${voucher.ref}` : "سند"}
                ref={voucher.ref || `VCH-${id}`}
                date={formatDateAr(voucher.createdAt)}
                sections={printSections}
              />
            )}
            <GuardedButton
              perm="finance:update"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={
                !voucher || ["posted", "paid", "rejected", "cancelled"].includes(voucher.status)
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
