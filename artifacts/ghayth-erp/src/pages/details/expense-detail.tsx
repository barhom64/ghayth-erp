import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { FormGrid, FormTextareaField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { LineAllocationStatusBanner } from "@/components/shared/line-allocation-status-banner";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ActionHistory } from "@workspace/workflow-kit";
import { FinancialDecisionPanel } from "@/components/shared/financial-decision-panel";
import {
  FinancialAttachmentViewer,
  type FinancialAttachment,
} from "@/components/shared/financial-attachment-viewer";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import {
  DOCUMENT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  POSTING_STATUS_LABELS,
  mapJournalStatus,
  derivePaymentStatus,
} from "@/lib/finance/status-model";
import { Edit, Wallet, ScrollText, Receipt, Link2, ArrowLeftRight } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { useToast } from "@/hooks/use-toast";
import { EntityTags } from "@/components/shared/entity-tags";
import { ZatcaActions } from "@/components/finance/zatca-actions";

/**
 * ExpenseDetail — unified detail page for a single expense journal entry.
 *
 * The `/finance/expenses` list pulls from `journal_entries` rows whose
 * `ref` starts with `EXP-`; the backend does not expose a dedicated
 * `/finance/expenses/:id` GET handler, so this page reads the row via
 * `/finance/journal/:id` (which returns the full journal entry including
 * lines). Fields referenced here mirror exactly what the expense list
 * query projects plus the extra columns carried on `journal_entries`.
 */

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending: "معلق",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمد",
  paid: "مدفوع",
  rejected: "مرفوض",
  returned: "مُرجع",
  cancelled: "ملغى",
  posted: "مُرحَّل",
};

const OPERATION_LABELS: Record<string, string> = {
  expense: "مصروف عام",
  salary: "راتب",
  advance: "سلفة",
  fuel: "وقود",
  maintenance: "صيانة",
  insurance: "تأمين",
  rent: "إيجار",
  vendor_invoice: "فاتورة مورد",
  purchase: "مشتريات",
  legal_fee: "أتعاب قانونية",
  custody: "عهدة",
  custody_settlement: "تسوية عهدة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (["approved", "paid", "posted"].includes(status)) return "success" as const;
  if (["rejected", "cancelled"].includes(status)) return "destructive" as const;
  if (status === "returned") return "warning" as const;
  if (["pending_approval", "in_review", "submitted"].includes(status)) return "info" as const;
  return "default" as const;
}

// Expenses PATCH only accepts the description (the row is a posted-or-draft
// journal_entries record; structural fields are corrected via a reversing
// entry, not in-place). Backend rejects the call entirely once status='posted'.
const expenseEditSchema = z.object({
  description: z.string().min(1, "الوصف مطلوب"),
});
type ExpenseEditForm = z.infer<typeof expenseEditSchema>;

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

export default function ExpenseDetail() {
  const [, params] = useRoute("/finance/expenses/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("expense_claim", id ?? 0);

  // Fetch via the generic journal endpoint — there is no dedicated
  // /finance/expenses/:id handler on the server, but the row itself is
  // a journal_entries row so this returns the full record + lines.
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["expense", String(id)],
    `/finance/journal/${id}`,
    !!id
  );

  const expense = data;

  // PATCH /finance/expenses/:id — backend only accepts `description` and
  // gates writes on status='draft'. DELETE /finance/expenses/:id soft-
  // deletes the draft and reverses the ledger atomically.
  const editDelete = useDetailEditDelete({
    entityLabel: "المصروف",
    patchPath: `/finance/expenses/${id}`,
    deletePath: `/finance/expenses/${id}`,
    listPath: "/finance/expenses",
    initialValues: expense,
    fields: [
      { key: "description", label: "الوصف" },
    ],
    invalidateKeys: [["expense", String(id)], ["expenses"]],
    onSaved: () => refetch(),
  });

  // The expense "amount" is the sum of the debit side of the main
  // expense line (the list query projects COALESCE(SUM(debit)) as
  // amount). The journal-by-id endpoint returns the raw lines instead,
  // so recompute here.
  const lines: any[] = useMemo(() => {
    return Array.isArray(expense?.lines) ? expense.lines : [];
  }, [expense?.lines]);

  const amount = useMemo(() => {
    // Pick the largest debit line — that's the expense account; the
    // other side is the cash / payable counter-line. Falls back to the
    // total debit if lines are not present or malformed.
    if (lines.length === 0) return Number(expense?.amount ?? 0);
    const debitSum = lines.reduce((s, l) => s + Number(l?.debit || 0), 0);
    return debitSum;
  }, [lines, expense?.amount]);

  // #2239 (FIN-P9-APPROVAL-WORKSPACE) — while the expense is awaiting a
  // decision, the bespoke attachment link + bespoke ApprovalActions cards are
  // REPLACED by the unified FinancialDecisionPanel. Everything else (history,
  // timeline, edit-description, comments) stays exactly as before.
  const isPending = !!expense && ["pending", "pending_approval", "draft", "returned"].includes(expense.status);

  // The same FinancialAttachment[] shape the viewer consumes; the row carries
  // at most one attachment (journal_entries.attachmentUrl).
  const decisionAttachments: FinancialAttachment[] = useMemo(() => {
    if (!expense?.attachmentUrl) return [];
    return [{
      id: expense.id ?? id ?? undefined,
      url: expense.attachmentUrl,
      name: expense.attachmentType || "مستند المصروف",
      type: expense.attachmentMimeType ?? null,
      documentType: expense.attachmentType ?? null,
      status: "linked",
    }];
  }, [expense?.attachmentUrl, expense?.attachmentType, expense?.attachmentMimeType, expense?.id, id]);

  // The REAL journal plan for review — built by the backend through the same
  // resolver the save path uses. Only fetched while pending (the decision
  // surface needs it); POSTs the expense's fields to impact-preview.
  const { data: previewData } = useQuery<any>({
    queryKey: ["expense-impact-preview", String(id), expense?.status],
    enabled: !!id && isPending,
    queryFn: () =>
      apiFetch<any>("/finance/expenses/impact-preview", {
        method: "POST",
        body: JSON.stringify({
          amount,
          expenseType: expense?.expenseType,
          paymentMethod: expense?.paymentMethod,
          operationType: expense?.operationType,
          accountCode: expense?.accountCode,
          sourceAccountCode: expense?.sourceAccountCode,
          relatedEntityType: expense?.relatedEntityType,
          relatedEntityId: expense?.relatedEntityId,
          costCenter: expense?.costCenter,
        }),
      }),
  });
  // preview-unify: for a SAVED expense the STORED journal IS the truth that
  // will post — show it, don't re-derive. The journal_entries row doesn't carry
  // the expense's routing context (operationType / relatedEntity), so
  // impact-preview falls to a GENERIC fallback and both DIVERGES from the real
  // posted lines AND falsely blocks approval («الحساب غير قابل للترحيل») even
  // though the stored lines are valid. Build the review preview from the stored
  // journal; fall back to the re-computed preview only when no journal exists.
  const journalPreview = useMemo(() => {
    if (Array.isArray(expense?.lines) && expense.lines.length > 0) {
      const mapped = lines.map((l: any, i: number) => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        return {
          lineNo: i + 1,
          accountCode: l.accountCode ?? "",
          accountName: l.accountName ?? null,
          debit, credit,
          role: debit > 0 ? "debit" : "credit",
          dimensions: {},
          derivationReason: "القيد المخزَّن",
          accountSource: "selected" as const,
          status: "ok" as const,
        };
      });
      const totals = mapped.reduce(
        (a, l) => ({ debit: a.debit + l.debit, credit: a.credit + l.credit }),
        { debit: 0, credit: 0 },
      );
      return {
        ready: true,
        lines: mapped,
        totals,
        balanced: Math.abs(totals.debit - totals.credit) < 0.01,
        blockers: [],
        warnings: [],
        sourceContext: { paymentMethod: expense?.paymentMethod ?? null, sourceAccountCode: null, sourceAccountName: null },
        suggestedDocumentStatus: "draft",
        suggestedPaymentStatus: "paid",
        suggestedPostingStatus: "unposted",
      };
    }
    return previewData?.journalPreview ?? null;
  }, [expense, lines, previewData]);

  // Governance/causedBy effects derived from the record: a vehicle-linked or
  // fuel/maintenance expense emits an OPERATIONAL event on approval — surfaced
  // read-only so the approver understands the cross-domain consequence.
  const governanceEffects = useMemo(() => {
    if (!expense) return [];
    const out: { type: string; label: string; note?: string }[] = [];
    const isVehicle = expense.relatedEntityType === "vehicle";
    const isFuelOrMaint = ["fuel", "maintenance"].includes(expense.operationType);
    if (isVehicle || isFuelOrMaint) {
      out.push({
        type: "fleet_operational",
        label: isFuelOrMaint
          ? `اعتماد ${expense.operationType === "fuel" ? "وقود" : "صيانة"} مركبة سيُسجّل سجلًا تشغيليًا للأسطول`
          : "اعتماد مصروف مرتبط بمركبة سيُصدر حدثًا تشغيليًا للأسطول",
        note: "هذا الاعتماد سيُصدر حدثًا تشغيليًا — لا يُقرَّر نيابةً عن الأسطول/الموارد البشرية",
      });
    }
    return out;
  }, [expense]);

  // A required attachment when ZATCA-linked or a vendor invoice — used to gate
  // the approve button (mirrors the backend's expectation of a source document).
  const attachmentRequired = !!expense && (
    expense.isTaxLinked === true || expense.operationType === "vendor_invoice"
  );

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!expense) return out;
    if (expense.supplierId) {
      out.push({
        type: "vendor",
        id: expense.supplierId,
        label: expense.supplierName || `مورد #${expense.supplierId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${expense.supplierId}`,
      });
    }
    if (expense.projectId) {
      out.push({
        type: "project",
        id: expense.projectId,
        label: expense.projectName || `مشروع #${expense.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${expense.projectId}`,
      });
    }
    if (expense.relatedEntityType === "vehicle" && expense.relatedEntityId) {
      out.push({
        type: "vehicle",
        id: expense.relatedEntityId,
        label: expense.relatedEntityName || `مركبة #${expense.relatedEntityId}`,
        sublabel: "المركبة",
        href: `/fleet/${expense.relatedEntityId}`,
      });
    }
    if (expense.relatedEntityType === "employee" && expense.relatedEntityId) {
      out.push({
        type: "employee",
        id: expense.relatedEntityId,
        label: expense.relatedEntityName || `موظف #${expense.relatedEntityId}`,
        sublabel: "الموظف",
        href: `/hr/employees/${expense.relatedEntityId}`,
      });
    }
    if (expense.relatedEntityType === "property" && expense.relatedEntityId) {
      out.push({
        type: "property",
        id: expense.relatedEntityId,
        label: expense.relatedEntityName || `عقار #${expense.relatedEntityId}`,
        sublabel: "العقار",
      });
    }
    if (expense.relatedEntityType === "contract" && expense.relatedEntityId) {
      out.push({
        type: "contract",
        id: expense.relatedEntityId,
        label: expense.relatedEntityName || `عقد #${expense.relatedEntityId}`,
        sublabel: "العقد",
      });
    }
    if (expense.linkedRequestId) {
      out.push({
        type: "request",
        id: expense.linkedRequestId,
        label: `طلب اعتماد #${expense.linkedRequestId}`,
        sublabel: "طلب مرتبط",
        href: `/requests/${expense.linkedRequestId}`,
      });
    }
    return out;
  }, [expense]);

  const paymentMethodLabel = expense?.paymentMethod
    ? PAYMENT_METHODS[expense.paymentMethod] || expense.paymentMethod
    : null;


  // Figure out the cost center display: a single chip that summarises
  // which project/vehicle/employee (or raw costCenter text) this expense
  // is charged against. This is one of the headline pieces of context
  // for anyone reviewing the expense.
  const costCenterDisplay = useMemo(() => {
    if (!expense) return null;
    if (expense.projectId) {
      return { label: "مشروع", value: expense.projectName || `#${expense.projectId}` };
    }
    if (expense.relatedEntityType === "vehicle" && expense.relatedEntityId) {
      return { label: "مركبة", value: expense.relatedEntityName || `#${expense.relatedEntityId}` };
    }
    if (expense.relatedEntityType === "employee" && expense.relatedEntityId) {
      return { label: "موظف", value: expense.relatedEntityName || `#${expense.relatedEntityId}` };
    }
    if (expense.costCenter) {
      return { label: "مركز تكلفة", value: expense.costCenter };
    }
    return null;
  }, [expense]);

  // ── #2240 (FIN-P10-DETAIL-WORKSPACE) — read-only detail-workspace trace ──
  //
  // The non-pending view is the TRACE: document → journal → operational effect.
  // It reuses the shared status-model helpers, the FinancialAttachmentViewer in
  // its read-only "detail" mode, the fetched journal `lines` (which ARE the GL
  // entry), and wouter <Link> navigation to every entity present on the record.

  // (1) the THREE separated status axes derived from the single backend column.
  const { documentStatus, postingStatus } = useMemo(
    () => mapJournalStatus(expense?.status),
    [expense?.status],
  );
  const paymentStatus = useMemo(() => {
    // A money-out leg exists when a treasury/bank/cash source was credited
    // (paymentMethod present, or a sourceAccountCode). Partial settlements are
    // tracked via paidAmount when the backend carries it.
    const hasMoneySource = !!(expense?.paymentMethod || expense?.sourceAccountCode);
    return derivePaymentStatus({
      doc: documentStatus,
      hasMoneySource,
      paidAmount: expense?.paidAmount != null ? Number(expense.paidAmount) : undefined,
      totalAmount: amount || undefined,
    });
  }, [documentStatus, expense?.paymentMethod, expense?.sourceAccountCode, expense?.paidAmount, amount]);

  // (3) attachment in read-only detail mode — reuse the SAME FinancialAttachment[]
  // shape the decision panel consumes (the row carries at most one attachment).
  const detailAttachments: FinancialAttachment[] = decisionAttachments;

  // (4) totals for the linked journal trace.
  const totalDebit = useMemo(
    () => lines.reduce((s, l) => s + Number(l?.debit || 0), 0),
    [lines],
  );
  const totalCredit = useMemo(
    () => lines.reduce((s, l) => s + Number(l?.credit || 0), 0),
    [lines],
  );

  // (5) linked VOUCHER — only when the record references a payment/voucher.
  const linkedVoucher = useMemo(() => {
    if (!expense) return null;
    const vid = expense.voucherId ?? expense.paymentVoucherId ?? null;
    if (!vid) return null;
    return {
      id: vid,
      ref: expense.voucherRef ?? expense.voucherNumber ?? `سند #${vid}`,
      date: expense.voucherDate ?? null,
      method: expense.paymentMethod
        ? PAYMENT_METHODS[expense.paymentMethod] || expense.paymentMethod
        : null,
      source: expense.sourceAccountName ?? expense.sourceAccountCode ?? null,
    };
  }, [expense]);

  // (6) operational EFFECT navigation links — only entities present on the row.
  const traceLinks = useMemo(() => {
    const out: { key: string; label: string; value: string; href: string }[] = [];
    if (!expense) return out;
    // the journal entry the expense IS / posted into.
    if (id) {
      out.push({
        key: "journal",
        label: "القيد المحاسبي",
        value: expense.ref || `قيد #${id}`,
        href: `/finance/journal/${id}`,
      });
    }
    if (linkedVoucher) {
      out.push({
        key: "voucher",
        label: "سند الصرف",
        value: String(linkedVoucher.ref),
        href: `/finance/vouchers/${linkedVoucher.id}`,
      });
    }
    if (expense.supplierId) {
      out.push({
        key: "supplier",
        label: "المورد",
        value: expense.supplierName || `مورد #${expense.supplierId}`,
        href: `/finance/vendors/${expense.supplierId}`,
      });
    }
    if (expense.relatedEntityType === "vehicle" && expense.relatedEntityId) {
      out.push({
        key: "vehicle",
        label: "المركبة",
        value: expense.relatedEntityName || `مركبة #${expense.relatedEntityId}`,
        href: `/fleet/${expense.relatedEntityId}`,
      });
    }
    if (expense.projectId) {
      out.push({
        key: "project",
        label: "المشروع",
        value: expense.projectName || `مشروع #${expense.projectId}`,
        href: `/projects/${expense.projectId}`,
      });
    }
    if (expense.relatedEntityType === "property" && expense.relatedEntityId) {
      out.push({
        key: "property",
        label: "العقار",
        value: expense.relatedEntityName || `عقار #${expense.relatedEntityId}`,
        href: `/properties/${expense.relatedEntityId}`,
      });
    }
    // the resulting fleet operational effect (fuel log / maintenance ticket).
    if (expense.relatedEntityType === "vehicle" && expense.relatedEntityId) {
      if (expense.fuelLogId) {
        out.push({
          key: "fuelLog",
          label: "سجل الوقود",
          value: `سجل #${expense.fuelLogId}`,
          href: `/fleet/${expense.relatedEntityId}/fuel/${expense.fuelLogId}`,
        });
      }
      if (expense.maintenanceTicketId ?? expense.maintenanceId) {
        const mid = expense.maintenanceTicketId ?? expense.maintenanceId;
        out.push({
          key: "maintenance",
          label: "بطاقة الصيانة",
          value: `بطاقة #${mid}`,
          href: `/fleet/maintenance/${mid}`,
        });
      }
    }
    if (expense.fixedAssetId) {
      out.push({
        key: "fixedAsset",
        label: "الأصل الثابت",
        value: `أصل #${expense.fixedAssetId}`,
        href: `/finance/fixed-assets/${expense.fixedAssetId}`,
      });
    }
    if (expense.claimId) {
      out.push({
        key: "claim",
        label: "المطالبة الناتجة",
        value: `مطالبة #${expense.claimId}`,
        href: `/finance/claims/${expense.claimId}`,
      });
    }
    return out;
  }, [expense, id, linkedVoucher]);

  const overview = (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — big amount + core metadata */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            بيانات المصروف
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
            {expense?.operationType && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع العملية</p>
                <Badge variant="outline">
                  {OPERATION_LABELS[expense.operationType] || expense.operationType}
                </Badge>
              </div>
            )}
            {expense?.expenseType && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تصنيف المصروف</p>
                <span className="text-status-neutral-foreground">{expense.expenseType}</span>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">طريقة الدفع</p>
                <Badge variant="secondary">{paymentMethodLabel}</Badge>
              </div>
            )}
            {expense?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ المصروف</p>
                <span className="text-status-neutral-foreground">{formatDateAr(expense.createdAt)}</span>
              </div>
            )}
            {expense?.supplierName && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">المورد</p>
                <span className="text-status-neutral-foreground">{expense.supplierName}</span>
              </div>
            )}
            {costCenterDisplay && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">مخصوم على</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{costCenterDisplay.label}</Badge>
                  <span className="text-status-neutral-foreground">{costCenterDisplay.value}</span>
                </div>
              </div>
            )}
            {expense?.reference && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">المرجع الخارجي</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{expense.reference}</span>
              </div>
            )}
          </div>

          {expense?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{expense.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* #2239 — while pending, the bespoke attachment link + bespoke
            ApprovalActions are REPLACED by the unified FinancialDecisionPanel.
            The approved/posted view keeps the bespoke attachment card below. */}
        {id && isPending && (
          <FinancialDecisionPanel
            documentType="expense"
            documentId={id}
            record={expense}
            lines={lines}
            attachments={decisionAttachments}
            journalPreview={journalPreview}
            governanceEffects={governanceEffects}
            approveEndpoint={`/finance/expenses/${id}/approve`}
            rejectEndpoint={`/finance/expenses/${id}/approve`}
            returnEndpoint={`/finance/expenses/${id}/approve`}
            requestAttachmentEndpoint={`/finance/expenses/${id}/request-attachment`}
            commentEndpoint={`/finance/expenses/${id}/comment`}
            attachmentRequired={attachmentRequired}
            invalidateKeys={[["expense", String(id)], ["expenses"]]}
            onDone={() => {
              refetch();
              toast({ title: "تم تحديث المصروف" });
            }}
          />
        )}

        {/* #2240 (FIN-P10) — read-only attachment in the unified "detail" mode.
            Shown only when NOT pending (the decision panel owns the attachment
            while a decision is in flight). The viewer renders its own empty
            placeholder when the row carries no attachment, so the trace always
            documents the «المرفق» axis. */}
        {!isPending && (
          <FinancialAttachmentViewer
            attachments={detailAttachments}
            mode="detail"
            documentType={expense?.attachmentType ?? "مستند المصروف"}
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
              <ActionHistory entityType="expense" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          #2240 (FIN-P10-DETAIL-WORKSPACE) — the read-only TRACE workspace.
          Rendered only in the NON-pending view (the pending view is owned by
          P9's FinancialDecisionPanel). It traces: document → three status axes
          → journal (the lines ARE the GL entry) → voucher → operational effect,
          all with wouter <Link> navigation. NO editors here. */}
      {!isPending && expense && (
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

          {/* (2)+(4) read-only ITEMS table = the linked JOURNAL. The fetched
              `lines` ARE the GL entry; present them with the journal ref/date,
              account code/name, debit/credit, and dimensions. NO inputs. */}
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
                    {expense.ref || `قيد #${id}`}
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>المرجع: <span className="font-mono text-status-neutral-foreground">{expense.ref || `#${id}`}</span></span>
                {expense.createdAt && <span>التاريخ: {formatDateAr(expense.createdAt)}</span>}
                <span>
                  التوازن:{" "}
                  <span className={totalDebit === totalCredit ? "text-status-success-foreground" : "text-status-error-foreground"}>
                    {totalDebit === totalCredit ? "متوازن" : "غير متوازن"}
                  </span>
                </span>
              </div>
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد بنود للقيد.</p>
              ) : (
                <div className="overflow-x-auto" data-testid="lines-table">
                  <DataTable
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

          {/* (5) linked VOUCHER — only when the record references a payment. */}
          {linkedVoucher && (
            <Card data-testid="linked-voucher">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  سند الصرف المرتبط
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">رقم السند</p>
                    <Link
                      href={`/finance/vouchers/${linkedVoucher.id}`}
                      className="text-status-info-foreground hover:underline"
                    >
                      {linkedVoucher.ref}
                    </Link>
                  </div>
                  {linkedVoucher.date && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">التاريخ</p>
                      <span className="text-status-neutral-foreground">{formatDateAr(linkedVoucher.date)}</span>
                    </div>
                  )}
                  {linkedVoucher.method && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">طريقة الدفع</p>
                      <span className="text-status-neutral-foreground">{linkedVoucher.method}</span>
                    </div>
                  )}
                  {linkedVoucher.source && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">المصدر</p>
                      <span className="text-status-neutral-foreground">{linkedVoucher.source}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* (6) operational EFFECT — navigation links to every entity present
              on the record (supplier / vehicle / project / property / journal /
              voucher / fuel log / maintenance ticket / fixed asset / claim). */}
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

      {id && expense && (
        <ZatcaActions
          entityType="expense"
          subject={{
            id,
            ref: expense.ref ?? null,
            isTaxLinked: expense.isTaxLinked ?? false,
            invoiceTypeCode: expense.invoiceTypeCode ?? null,
            taxCategoryCode: expense.taxCategoryCode ?? null,
            exemptionReason: expense.exemptionReason ?? null,
            zatcaStatus: expense.zatcaStatus ?? null,
          }}
          onRefresh={refetch}
          invalidateKeys={[["expense", String(id)], ["expenses"]]}
        />
      )}

      {id && <ApprovalTimeline entityType="expense" entityId={id} />}

      {id && <EntityComments entityType="expense" entityId={id} />}
      {id && <EntityTags entityType="expense" entityId={id} />}
      </div>
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={expense?.ref ? `مصروف ${expense.ref}` : "تفاصيل المصروف"}
        subtitle={
          expense?.operationType
            ? OPERATION_LABELS[expense.operationType] || expense.operationType
            : undefined
        }
        backPath="/finance/expenses"
        refNumber={expense?.ref || (id ? `EXP-${id}` : undefined)}
        status={
          expense
            ? { label: STATUS_LABELS[expense.status] || expense.status || "-", tone: statusTone(expense.status) }
            : undefined
        }
        typeLabel={
          expense?.expenseType
            ? expense.expenseType
            : expense?.operationType
            ? OPERATION_LABELS[expense.operationType]
            : undefined
        }
        createdAt={expense?.createdAt}
        updatedAt={expense?.updatedAt}
        createdByName={expense?.createdByName}
        assignedToName={expense?.approvedByName || expense?.reviewedByName}
        relatedEntities={relatedEntities}
        entityType="expense"
        entityId={id ?? 0}
        overview={overview}
        extraTabs={registryExtraTabs}
        hideTabs={registryHideTabs}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        actions={
          <>
            {expense && (
              <PrintButton
                entityType="expense"
                entityId={id ?? 0}
               />
            )}
            <GuardedButton
              perm="finance:update"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={!expense || expense?.status === "posted"}
            >
              <Edit className="h-4 w-4 ms-1" />
              تعديل
            </GuardedButton>
            <DetailActionButtons hook={editDelete} editPerm="finance:update" deletePerm="finance:delete" />
          </>
        }
      />
      <AttachmentPreview
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(o) => !o && setPreviewAttachment(null)}
      />
      {expense && id && (
        <EntityEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="تعديل وصف المصروف"
          description="فقط الوصف قابل للتعديل — التعديلات البنيوية تتم عبر قيد عاكس."
          schema={expenseEditSchema}
          defaultValues={{ description: expense.description ?? "" }}
          endpoint={`/finance/expenses/${id}`}
          invalidateKeys={[["expense", String(id)], ["expenses"]]}
          onSaved={() => refetch()}
        >
          <FormGrid cols={1}>
            <FormTextareaField name="description" label="الوصف" />
          </FormGrid>
        </EntityEditDialog>
      )}
    </>
  );
}
