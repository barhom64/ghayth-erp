import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery } from "@/lib/api";
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
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, Paperclip, Eye, Wallet } from "lucide-react";
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

  // Single attachment reference on the row (journal_entries.attachmentUrl).
  const hasAttachment = !!expense?.attachmentUrl;

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
        {/* Attachment — expenses carry a single attachmentUrl on the row */}
        {hasAttachment && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                المرفق
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 p-2 rounded border text-xs hover:bg-surface-subtle">
                <span className="truncate min-w-0">
                  {expense.attachmentType || "مستند المصروف"}
                </span>
                <a
                  href={expense.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-status-info-foreground hover:text-status-info-foreground shrink-0"
                  title="فتح"
                >
                  <Eye className="h-3.5 w-3.5" />
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approval actions — visible while pending */}
        {id && expense && ["pending", "pending_approval", "draft", "returned"].includes(expense.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="expense"
                entityId={id}
                currentStatus={expense.status}
                approveEndpoint={`/finance/expenses/${id}/approve`}
                rejectEndpoint={`/finance/expenses/${id}/approve`}
                returnEndpoint={`/finance/expenses/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["draft", "pending_approval", "returned"]}
                invalidateKeys={[["expenses"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث المصروف" });
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
              <ActionHistory entityType="expense" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

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
        <EntityEditDialog<ExpenseEditForm>
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
