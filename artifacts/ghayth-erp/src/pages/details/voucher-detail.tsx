import { useMemo, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { z } from "zod";
import {
  DetailPageLayout,
  type RelatedEntity,
} from "@workspace/entity-kit";
import {
  FormGrid,
  FormTextareaField,
} from "@workspace/ui-core";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ActionHistory } from "@workspace/workflow-kit";
import { FinancialDecisionPanel } from "@/components/shared/financial-decision-panel";
import {
  FinancialAttachmentViewer,
  type FinancialAttachment,
} from "@/components/shared/financial-attachment-viewer";
import {
  DOCUMENT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  POSTING_STATUS_LABELS,
  mapJournalStatus,
  derivePaymentStatus,
} from "@/lib/finance/status-model";

import { Edit, Receipt, Trash2, ScrollText, Link2, ArrowLeftRight } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { useToast } from "@/hooks/use-toast";
import { EntityTags } from "@/components/shared/entity-tags";

const voucherEditSchema = z.object({
  description: z.string().min(1, "الوصف مطلوب"),
});
type VoucherEditForm = z.infer<typeof voucherEditSchema>;

// Read-only journal-line columns for the linked-journal trace table. The
// cell renderers reproduce the prior raw-<table> markup byte-for-byte (mono
// account code + name, dimensions joined with " · ", and the exact
// `Number(l?.debit||0) ? formatCurrency(...) : "-"` amount formatting) so the
// GL display is unchanged — only the table shell is now the canonical DataTable.
const JOURNAL_LINE_COLUMNS: DataTableColumn<any>[] = [
  {
    key: "account",
    header: "الحساب",
    sortable: false,
    render: (l: any) => (
      <>
        <span className="font-mono text-muted-foreground">{l?.accountCode ?? "-"}</span>{" "}
        <span className="text-status-neutral-foreground">{l?.accountName ?? ""}</span>
      </>
    ),
  },
  {
    key: "dims",
    header: "الأبعاد",
    sortable: false,
    className: "text-muted-foreground",
    render: (l: any) => {
      const dims = [
        l?.vehicleId ? `مركبة #${l.vehicleId}` : null,
        l?.costCenter ? `مركز: ${l.costCenter}` : null,
        l?.projectId ? `مشروع #${l.projectId}` : null,
        l?.project ? `مشروع: ${l.project}` : null,
      ].filter(Boolean);
      return dims.length ? dims.join(" · ") : "-";
    },
  },
  {
    key: "debit",
    header: "مدين",
    sortable: false,
    align: "end",
    className: "tabular-nums",
    render: (l: any) => (Number(l?.debit || 0) ? formatCurrency(Number(l.debit)) : "-"),
  },
  {
    key: "credit",
    header: "دائن",
    sortable: false,
    align: "end",
    className: "tabular-nums",
    render: (l: any) => (Number(l?.credit || 0) ? formatCurrency(Number(l.credit)) : "-"),
  },
];

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
  const [, params] = useRoute("/finance/vouchers/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("voucher", id ?? 0);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["voucher", String(id)],
    `/finance/vouchers/${id}`,
    !!id
  );

  const voucher = data;
  // Both PATCH and DELETE are restricted to draft/pending/returned states
  // on the backend — terminal states require a reversing entry instead.
  const isEditable = voucher && ["draft", "pending_approval", "returned"].includes(voucher.status);
  const isDeletable = voucher && voucher.status === "draft";

  const amount = useMemo(() => {
    return Number(voucher?.amount ?? 0);
  }, [voucher?.amount]);

  // The voucher GET (/finance/vouchers/:id) projects the GROUPed header only —
  // it does NOT return `lines` (the voucher IS a journal_entries row whose id is
  // the journal id). Read whatever lines the row may carry, else an empty trace.
  const lines: any[] = useMemo(() => {
    return Array.isArray(voucher?.lines) ? voucher.lines : [];
  }, [voucher?.lines]);

  // #2240 (FIN-P10-DETAIL-WORKSPACE) — while the voucher is awaiting a decision
  // the bespoke attachment card + bespoke ApprovalActions are REPLACED by the
  // unified FinancialDecisionPanel. Everything else (history, edit, delete,
  // tags) stays exactly as before.
  const isPending = !!voucher && ["pending", "pending_approval", "draft", "returned"].includes(voucher.status);

  // The FinancialAttachment[] shape both the decision panel and the read-only
  // detail viewer consume; the row carries at most one attachment.
  const decisionAttachments: FinancialAttachment[] = useMemo(() => {
    if (!voucher?.attachmentUrl) return [];
    return [{
      id: voucher.id ?? id ?? undefined,
      url: voucher.attachmentUrl,
      name: voucher.attachmentType || "مستند السند",
      type: voucher.attachmentMimeType ?? null,
      documentType: voucher.attachmentType ?? null,
      status: "linked",
    }];
  }, [voucher?.attachmentUrl, voucher?.attachmentType, voucher?.attachmentMimeType, voucher?.id, id]);

  // ── #2240 — the read-only TRACE: document → journal → operational effect ──
  // (1) the THREE separated status axes. Prefer the backend-derived axes the
  //     voucher GET now surfaces (documentStatus/paymentStatus/postingStatus —
  //     FIN-SUB-03b); fall back to the shared status-model when absent.
  const { documentStatus, postingStatus } = useMemo(
    () => mapJournalStatus(voucher?.status),
    [voucher?.status],
  );
  const paymentStatus = useMemo(() => {
    const hasMoneySource = !!(voucher?.paymentMethod || voucher?.sourceAccountCode);
    return derivePaymentStatus({
      doc: documentStatus,
      hasMoneySource,
      paidAmount: voucher?.paidAmount != null ? Number(voucher.paidAmount) : undefined,
      totalAmount: amount || undefined,
    });
  }, [documentStatus, voucher?.paymentMethod, voucher?.sourceAccountCode, voucher?.paidAmount, amount]);

  const totalDebit = useMemo(
    () => lines.reduce((s, l) => s + Number(l?.debit || 0), 0),
    [lines],
  );
  const totalCredit = useMemo(
    () => lines.reduce((s, l) => s + Number(l?.credit || 0), 0),
    [lines],
  );

  // (3) operational EFFECT navigation links — only entities present on the row.
  //     The voucher IS the journal entry, so its id doubles as the journal id.
  const traceLinks = useMemo(() => {
    const out: { key: string; label: string; value: string; href: string }[] = [];
    if (!voucher) return out;
    if (id) {
      out.push({
        key: "journal",
        label: "القيد المحاسبي",
        value: voucher.ref || `قيد #${id}`,
        href: `/finance/journal/${id}`,
      });
    }
    if (voucher.vendorId) {
      out.push({
        key: "vendor",
        label: "المورد",
        value: voucher.vendorName || `مورد #${voucher.vendorId}`,
        href: `/finance/vendors/${voucher.vendorId}`,
      });
    }
    if (voucher.clientId) {
      out.push({
        key: "client",
        label: "العميل",
        value: voucher.clientName || `عميل #${voucher.clientId}`,
        href: `/clients/${voucher.clientId}`,
      });
    }
    if (voucher.employeeId) {
      out.push({
        key: "employee",
        label: "الموظف",
        value: voucher.employeeName || `موظف #${voucher.employeeId}`,
        href: `/hr/employees/${voucher.employeeId}`,
      });
    }
    if (voucher.relatedEntityType === "supplier" && voucher.relatedEntityId) {
      out.push({
        key: "supplier",
        label: "المورد",
        value: voucher.relatedEntityName || `مورد #${voucher.relatedEntityId}`,
        href: `/finance/vendors/${voucher.relatedEntityId}`,
      });
    }
    if (voucher.relatedEntityType === "vehicle" && voucher.relatedEntityId) {
      out.push({
        key: "vehicle",
        label: "المركبة",
        value: voucher.relatedEntityName || `مركبة #${voucher.relatedEntityId}`,
        href: `/fleet/${voucher.relatedEntityId}`,
      });
    }
    if (voucher.projectId) {
      out.push({
        key: "project",
        label: "المشروع",
        value: voucher.projectName || `مشروع #${voucher.projectId}`,
        href: `/projects/${voucher.projectId}`,
      });
    }
    if (voucher.relatedEntityType === "property" && voucher.relatedEntityId) {
      out.push({
        key: "property",
        label: "العقار",
        value: voucher.relatedEntityName || `عقار #${voucher.relatedEntityId}`,
        href: `/properties/${voucher.relatedEntityId}`,
      });
    }
    return out;
  }, [voucher, id]);

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


  const overview = (
    <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — big amount + core metadata */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            بيانات السند
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
            {voucherTypeLabel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع السند</p>
                <Badge variant="outline">{voucherTypeLabel}</Badge>
              </div>
            )}
            {voucher?.payeeName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المستفيد / الدافع</p>
                <span className="text-status-neutral-foreground">{voucher.payeeName}</span>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">طريقة الدفع</p>
                <Badge variant="secondary">{paymentMethodLabel}</Badge>
              </div>
            )}
            {voucher?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ السند</p>
                <span className="text-status-neutral-foreground">{formatDateAr(voucher.createdAt)}</span>
              </div>
            )}
            {voucher?.costCenter && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">مركز التكلفة</p>
                <span className="text-status-neutral-foreground">{voucher.costCenter}</span>
              </div>
            )}
            {voucher?.reference && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الرقم المرجعي</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{voucher.reference}</span>
              </div>
            )}
          </div>

          {voucher?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{voucher.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* #2240 — while pending, the bespoke attachment card + bespoke
            ApprovalActions are REPLACED by the unified FinancialDecisionPanel.
            No voucher impact-preview endpoint exists, so journalPreview is
            omitted (the panel renders without it). request-attachment / comment
            endpoints have no voucher equivalent and are omitted too. */}
        {id && isPending && (
          <FinancialDecisionPanel
            documentType="voucher"
            documentId={id}
            record={voucher}
            lines={lines}
            attachments={decisionAttachments}
            journalPreview={undefined}
            approveEndpoint={`/finance/vouchers/${id}/approve`}
            rejectEndpoint={`/finance/vouchers/${id}/approve`}
            returnEndpoint={`/finance/vouchers/${id}/approve`}
            invalidateKeys={[["voucher", String(id)], ["vouchers"]]}
            onDone={() => {
              refetch();
              toast({ title: "تم تحديث السند" });
            }}
          />
        )}

        {/* #2240 — read-only attachment in the unified "detail" mode. Shown
            only when NOT pending (the decision panel owns the attachment while
            a decision is in flight). The viewer renders its own empty
            placeholder when the row carries no attachment. */}
        {!isPending && (
          <FinancialAttachmentViewer
            attachments={decisionAttachments}
            mode="detail"
            documentType={voucher?.attachmentType ?? "مستند السند"}
            documentId={id ?? undefined}
          />
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

      {/* ──────────────────────────────────────────────────────────────────
          #2240 (FIN-P10-DETAIL-WORKSPACE) — the read-only TRACE workspace.
          Rendered only in the NON-pending view (the pending view is owned by
          P9's FinancialDecisionPanel). It traces: document → three status axes
          → journal (the voucher IS the journal entry) → operational effect,
          all with wouter <Link> navigation. NO editors here. */}
      {!isPending && voucher && (
        <div className="space-y-4" data-testid="detail-trace">
          {/* (1) the THREE status axes — separated per the owner mandate. */}
          <Card data-testid="status-axes">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">حالة المستند</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">حالة المستند</p>
                  <Badge variant="outline">{DOCUMENT_STATUS_LABELS[documentStatus]}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">حالة الدفع</p>
                  <Badge variant="outline">{PAYMENT_STATUS_LABELS[paymentStatus]}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">حالة الترحيل</p>
                  <Badge variant="outline">{POSTING_STATUS_LABELS[postingStatus]}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* (2) read-only ITEMS table = the linked JOURNAL. The voucher IS the
              GL entry; present its lines (when the row carries them) with the
              account code/name, debit/credit and dimensions. NO inputs. */}
          <Card data-testid="journal-lines">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  القيد المحاسبي
                </span>
                {id && (
                  <Link
                    href={`/finance/journal/${id}`}
                    className="text-xs font-normal text-status-info-foreground hover:underline"
                  >
                    {voucher.ref || `قيد #${id}`}
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>المرجع: <span className="font-mono text-status-neutral-foreground">{voucher.ref || `#${id}`}</span></span>
                {voucher.createdAt && <span>التاريخ: {formatDateAr(voucher.createdAt)}</span>}
                {lines.length > 0 && (
                  <span>
                    التوازن:{" "}
                    <span className={totalDebit === totalCredit ? "text-status-success-foreground" : "text-status-error-foreground"}>
                      {totalDebit === totalCredit ? "متوازن" : "غير متوازن"}
                    </span>
                  </span>
                )}
              </div>
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  عرض بنود القيد عبر <Link href={`/finance/journal/${id}`} className="text-status-info-foreground hover:underline">القيد المحاسبي</Link>.
                </p>
              ) : (
                <div className="overflow-x-auto" data-testid="lines-table">
                  <DataTable<any>
                    columns={JOURNAL_LINE_COLUMNS}
                    data={lines}
                    rowKey={(l, i) => l?.id ?? i}
                    noToolbar
                    pageSize={0}
                    className="text-xs"
                    renderGrandTotal={() => (
                      <div className="flex items-center gap-2 font-semibold tabular-nums">
                        <span className="flex-1">الإجمالي</span>
                        <span className="text-end">{formatCurrency(totalDebit)}</span>
                        <span className="text-end">{formatCurrency(totalCredit)}</span>
                      </div>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* (3) operational EFFECT — navigation links to every entity present
              on the record (journal / vendor / client / employee / vehicle /
              project / property). */}
          {traceLinks.length > 0 && (
            <Card data-testid="trace-links">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  الأثر التشغيلي والروابط
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {traceLinks.map((t) => (
                    <Link
                      key={t.key}
                      href={t.href}
                      data-testid={`trace-link-${t.key}`}
                      className="flex items-center justify-between gap-2 rounded border p-2 text-xs hover:bg-surface-subtle"
                    >
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        {t.label}
                      </span>
                      <span className="truncate min-w-0 text-status-info-foreground">{t.value}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
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
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        actions={
          <>
            {voucher && (
              <PrintButton
                entityType={voucher.voucherType === "receipt" ? "receipt_voucher" : "payment_voucher"}
                entityId={voucher.id ?? id}
                formats={["a4", "thermal_80"]}/>
            )}
            <GuardedButton
              perm="finance:update"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={!isEditable}
              title={!isEditable && voucher ? "السند المعتمد/المرحَّل يُصحَّح بقيد عاكس" : undefined}
            >
              <Edit className="h-4 w-4 ms-1" />تعديل الوصف
            </GuardedButton>
            <GuardedButton
              perm="finance:delete"
              variant="outline"
              size="sm"
              className="text-status-error-foreground"
              onClick={() => setDeleteOpen(true)}
              disabled={!isDeletable}
              title={!isDeletable && voucher ? "الحذف متاح للمسودات فقط" : undefined}
            >
              <Trash2 className="h-4 w-4 ms-1" />حذف
            </GuardedButton>
          </>
        }
      />
      <AttachmentPreview
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(o) => !o && setPreviewAttachment(null)}
      />
      {voucher && id && (
        <EntityEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="تعديل وصف السند"
          schema={voucherEditSchema}
          defaultValues={{ description: voucher.description ?? "" }}
          endpoint={`/finance/vouchers/${id}`}
          invalidateKeys={[["voucher", String(id)], ["vouchers"]]}
          onSaved={() => refetch()}
        >
          <FormGrid cols={1}>
            <FormTextareaField
              name="description"
              label="الوصف"
              rows={3}
            />
          </FormGrid>
        </EntityEditDialog>
      )}
      {voucher && id && (
        <ConfirmDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          entity={{ type: "voucher", id, name: voucher.ref || `سند #${id}` }}
          deletePath={`/finance/vouchers/${id}`}
          invalidateKeys={[["voucher", String(id)], ["vouchers"]]}
          successMessage="تم حذف السند"
          onDeleted={() => setLocation("/finance/vouchers")}
        />
      )}
    </>
  );
}
