import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useIdempotencyKey } from "@/lib/idempotency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintButton } from "@/components/shared/print-button";
import {
  Banknote,
  DollarSign,
  Calendar,
  User,
  Phone,
  Mail,
  BookOpen,
  Copy,
  Zap,
  Send,
  FileText,
  FilePlus,
  CheckCircle,
} from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageStatusBadge,
} from "@workspace/ui-core";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  ProcessStages,
  type StageStep,
  DetailPageLayout,
  type DetailStatus,
} from "@workspace/entity-kit";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { LineAllocationStatusBanner } from "@/components/shared/line-allocation-status-banner";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { CreditMemoDialog } from "@/components/shared/credit-memo-dialog";
import { InvoiceAmendDialog } from "@/components/shared/invoice-amend-dialog";
import { DebitMemoDialog } from "@/components/shared/debit-memo-dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

/**
 * Invoice detail page — migrated to DetailPageLayout which provides
 * automatic Documents, Timeline, Comments, and Tasks tabs.
 *
 * DetailPageLayout handles:
 *   • Back button + header strip with status badge, ref, dates
 *   • Loading / error / not-found states
 *   • Standard tabs: Overview, Documents, Timeline, Comments, Tasks
 *
 * This page provides:
 *   • overview — payment lifecycle strip, financial summary cards,
 *     client info, dates, ZATCA integration banner, payment recording
 *     form, invoice lines table, payments table, journal entries,
 *     approval actions, action history, notes, and obligations
 *   • actions — copy, record payment, PDF export, print buttons
 *   • Print modal + print document (preserved verbatim)
 */

const PAYMENT_LIFECYCLE: ReadonlyArray<{ key: string; label: string }> = [
  { key: "draft",          label: "مسودة"       },
  { key: "pending",        label: "قيد الانتظار" },
  { key: "partially_paid", label: "مدفوعة جزئياً" },
  { key: "paid",           label: "مدفوعة"      },
];

// Map the many invoice status values to a slot on the four-step strip.
// Terminal states (void, cancelled) render as a single red/grey dot.
function buildLifecycleSteps(status: string | undefined): StageStep[] {
  const s = status ?? "draft";
  if (s === "void" || s === "cancelled") {
    return [
      { label: "مسودة",       status: "completed" },
      { label: "ملغاة",       status: "rejected"  },
    ];
  }
  // Treat both `sent` and `pending` as the middle "awaiting payment" stage.
  const normalised =
    s === "sent" ? "pending" :
    s === "partial" ? "partially_paid" :
    s === "overdue" ? "pending" :
    s;
  const currentIdx = PAYMENT_LIFECYCLE.findIndex((x) => x.key === normalised);
  return PAYMENT_LIFECYCLE.map((step, i): StageStep => {
    if (currentIdx === -1) return { label: step.label, status: "pending" };
    if (i < currentIdx)    return { label: step.label, status: "completed" };
    if (i === currentIdx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

/** Map invoice status to DetailPageLayout status tone. */
function statusToDetailStatus(status: string | undefined): DetailStatus | undefined {
  if (!status) return undefined;
  const map: Record<string, DetailStatus> = {
    draft:          { label: "مسودة",           tone: "muted" },
    pending:        { label: "قيد الانتظار",    tone: "warning" },
    sent:           { label: "مُرسَلة",          tone: "info" },
    partially_paid: { label: "مدفوعة جزئياً",   tone: "warning" },
    partial:        { label: "مدفوعة جزئياً",   tone: "warning" },
    paid:           { label: "مدفوعة",          tone: "success" },
    overdue:        { label: "متأخرة",          tone: "destructive" },
    void:           { label: "ملغاة",           tone: "muted" },
    cancelled:      { label: "ملغى",            tone: "muted" },
    credit_memo:    { label: "إشعار دائن",      tone: "info" },
    debit_memo:     { label: "إشعار مدين",      tone: "info" },
  };
  return map[status] ?? { label: status, tone: "default" };
}

export default function InvoiceDetailPage() {
  const [, params] = useRoute("/finance/invoices/:id");
  const id = params?.id;
  const { data: invoice, isLoading, isError, refetch } = useApiQuery<any>(
    ["invoice-detail", id || ""],
    id ? `/finance/invoices/${id}` : null,
    !!id,
  );
  const { data: memos, refetch: refetchMemos } = useApiQuery<{
    creditMemos: any[];
    debitMemos: any[];
  }>(
    ["invoice-memos", id || ""],
    id ? `/finance/invoices/${id}/memos` : null,
    !!id,
  );
  const [showPayment, setShowPayment] = useState(false);
  const [showCreditMemo, setShowCreditMemo] = useState(false);
  const [showDebitMemo, setShowDebitMemo] = useState(false);
  const [showAmend, setShowAmend] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [confirmPost, setConfirmPost] = useState(false);

  // R.4 iter 4 — both mutations now flow through useApiMutation so
  // typed errors (VALIDATION_ERROR with field, CONFLICT with meta,
  // FORBIDDEN with requiredRoles) surface through R.1.2's toast
  // pipeline automatically. The old handlers swallowed the server's
  // structured detail into a generic "حدث خطأ" toast.
  const paymentIdem = useIdempotencyKey();
  const paymentMut = useApiMutation<unknown, { amount: number; method: string }>(
    () => `/finance/invoices/${id}/payment`,
    "POST",
    [
      ["invoice-detail", id || ""],
      ["invoices"],
      ["finance-stats"],
    ],
    {
      successMessage: "تم تسجيل الدفعة",
      headers: () => paymentIdem.headers,
      onSuccess: () => {
        paymentIdem.reset();
        setShowPayment(false);
      },
    },
  );

  const zatcaMut = useApiMutation<{ message?: string }, Record<string, never>>(
    () => `/finance/zatca/invoice/${id}/submit`,
    "POST",
    [["invoice-detail", id || ""]],
    {
      successMessage: "تم الإرسال لهيئة الزكاة",
    },
  );

  // POST /finance/invoices/:id/post — moves approved → posted, the
  // final state that locks the GL entry. Permission gate matches the
  // backend (finance.invoices/approve).
  const postMut = useApiMutation<unknown, Record<string, never>>(
    `/finance/invoices/${id}/post`,
    "POST",
    [["invoice-detail", id || ""], ["invoices"]],
    { successMessage: "تم ترحيل الفاتورة" },
  );

  // Loading / error states are now handled by DetailPageLayout.

  const lines = invoice?.lines || [];
  const payments = invoice?.payments || [];
  const journalEntries = invoice?.journalEntries || [];
  const remaining = invoice
    ? Number(invoice.total) - Number(invoice.paidAmount || 0)
    : 0;
  const lifecycleSteps = buildLifecycleSteps(invoice?.status);

  const handleRecordPayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = parseFloat(fd.get("amount") as string);
    if (!amount || !paymentMethod) return;
    paymentMut.mutate({ amount, method: paymentMethod });
  };

  const handleZatcaSubmit = () => {
    zatcaMut.mutate({});
  };

  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("invoice", id || "");

  const editDelete = useDetailEditDelete({
    entityLabel: "الفاتورة",
    patchPath: `/finance/invoices/${id}`,
    deletePath: `/finance/invoices/${id}`,
    listPath: "/finance/invoices",
    initialValues: invoice,
    fields: [
      { key: "notes", label: "ملاحظات" },
      { key: "dueDate", label: "تاريخ الاستحقاق" },
    ],
    invalidateKeys: [["invoice-detail", String(id)], ["invoices"]],
    onSaved: () => refetch(),
  });

  // --- Action buttons for the header ---
  const actions = (
    <div className="flex items-center gap-2">
      <DetailActionButtons hook={editDelete} editPerm="finance:update" deletePerm="finance:delete" />
      <Button asChild variant="outline" size="sm" className="gap-1"><Link href={`/finance/invoices/create?copyFrom=${id}`}>
          <Copy className="h-4 w-4" />
          نسخ
        </Link></Button>
      {invoice && remaining > 0 && (
        <GuardedButton perm="finance:create" variant="outline" size="sm" onClick={() => setShowPayment(!showPayment)}>
          <Banknote className="h-4 w-4 me-1" />
          تسجيل دفعة
        </GuardedButton>
      )}
      {invoice && invoice.status !== "draft" && invoice.status !== "cancelled" && remaining > 0 && (
        <GuardedButton perm="finance:create" variant="outline" size="sm" onClick={() => setShowCreditMemo(true)}>
          <FileText className="h-4 w-4 me-1" />
          إصدار إشعار دائن
        </GuardedButton>
      )}
      {invoice && invoice.status !== "draft" && invoice.status !== "cancelled" && (
        <GuardedButton perm="finance:create" variant="outline" size="sm" onClick={() => setShowDebitMemo(true)}>
          <FilePlus className="h-4 w-4 me-1" />
          إصدار إشعار مدين
        </GuardedButton>
      )}
      {/* ZATCA-compliant edit. Per Saudi tax authority rules, an issued
          invoice can't be edited in place — the system orchestrates a
          credit memo + new invoice atomically. Only shown on issued
          (non-draft, non-cancelled, non-amended) invoices. */}
      {invoice && invoice.status !== "draft" && invoice.status !== "cancelled" && invoice.status !== "amended" && !invoice.amendedToInvoiceId && (
        <GuardedButton perm="finance:create" variant="outline" size="sm" onClick={() => setShowAmend(true)}>
          <FilePlus className="h-4 w-4 me-1" />
          تعديل ZATCA
        </GuardedButton>
      )}
      {/* #1715 correctness review (H1) — removed the dead «اعتماد سريع» button:
          it was gated on status === "pending" (a status the invoice machine
          never sets, so it never rendered) AND it called PATCH /approve, which
          approved WITHOUT posting the GL. Approval goes through the dialog →
          POST /invoices/:id/approve (GL-posting). */}
      {invoice?.status === "approved" && (
        <GuardedButton
          perm="finance:approve"
          variant="outline"
          size="sm"
          onClick={() => postMut.mutate({})}
          disabled={postMut.isPending}
          rateLimitAware
          className="gap-1"
        >
          <CheckCircle className="h-4 w-4" />
          ترحيل
        </GuardedButton>
      )}
      {invoice && (
        // PrintButton dropdown now offers a "تنزيل" item that calls the
        // engine in download mode — the legacy ExportButton calling
        // /export/pdf/invoice/:id (which itself proxies to renderPrint)
        // was redundant UX and produced a duplicate print_jobs row when
        // users hit both buttons.
        <PrintButton
          entityType="invoice"
          entityId={invoice.id ?? id}
          formats={["a4", "thermal_80", "excel"]}
          label="طباعة"
        />
      )}
    </div>
  );

  // --- Overview content (main tab) ---
  const overview = invoice ? (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <LineAllocationStatusBanner
        lines={(invoice as any).lines}
        documentType="invoice"
      />

      {/* ZATCA amendment chain banner — surfaces both directions of the
          link so the operator knows whether they're looking at an
          original that was later replaced or the replacement itself. */}
      {(invoice.amendedToInvoiceId || invoice.amendedFromInvoiceId) && (
        <Card className="border-status-warning-surface bg-status-warning-surface/40">
          <CardContent className="p-3 text-sm">
            {invoice.amendedToInvoiceId && (
              <div className="flex items-center gap-2 text-status-warning-foreground">
                <FilePlus className="h-4 w-4" />
                <span>
                  تم تعديل هذه الفاتورة وفقاً لأنظمة ZATCA — استُبدلت بالفاتورة الجديدة{" "}
                  <Link
                    href={`/finance/invoices/${invoice.amendedToInvoiceId}`}
                    className="font-semibold underline"
                  >
                    #{invoice.amendedToInvoiceId}
                  </Link>
                  {invoice.amendmentReason ? ` — السبب: ${invoice.amendmentReason}` : ""}
                </span>
              </div>
            )}
            {invoice.amendedFromInvoiceId && (
              <div className="flex items-center gap-2 text-status-info-foreground">
                <FilePlus className="h-4 w-4" />
                <span>
                  هذه الفاتورة صادرة كتعديل ZATCA للفاتورة السابقة{" "}
                  <Link
                    href={`/finance/invoices/${invoice.amendedFromInvoiceId}`}
                    className="font-semibold underline"
                  >
                    #{invoice.amendedFromInvoiceId}
                  </Link>
                  {" "}— صدر إشعار دائن للأصلية تلقائياً.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Visible payment lifecycle strip */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            دورة الدفع
          </p>
          <ProcessStages steps={lifecycleSteps} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><DollarSign className="h-4 w-4" /><span className="text-sm">ملخص مالي</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>المبلغ قبل الضريبة</span><span className="font-medium">{formatCurrency(Number(invoice.subtotal || 0))}</span></div>
            <div className="flex justify-between"><span>ضريبة ({invoice.vatRate || 15}%)</span><span className="font-medium">{formatCurrency(Number(invoice.vatAmount || 0))}</span></div>
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>الإجمالي</span><span className="text-primary">{formatCurrency(Number(invoice.total))}</span></div>
            <div className="flex justify-between text-status-success-foreground"><span>المدفوع</span><span>{formatCurrency(Number(invoice.paidAmount || 0))}</span></div>
            <div className="flex justify-between text-status-error-foreground font-bold"><span>المتبقي</span><span>{formatCurrency(remaining)}</span></div>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-status-success-surface0 rounded-full" style={{ width: `${Math.min(100, (Number(invoice.paidAmount || 0) / Number(invoice.total)) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-start">{Math.round((Number(invoice.paidAmount || 0) / Number(invoice.total)) * 100)}% مدفوع</p>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><User className="h-4 w-4" /><span className="text-sm">العميل</span></div>
          {(invoice as any).clientId ? (
            <Link href={`/finance/customer-360-sheet?clientId=${(invoice as any).clientId}`}>
              <p className="font-bold text-lg hover:underline cursor-pointer">{invoice.clientName || "-"}</p>
            </Link>
          ) : (
            <p className="font-bold text-lg">{invoice.clientName || "-"}</p>
          )}
          {invoice.clientPhone && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{invoice.clientPhone}</p>}
          {invoice.clientEmail && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{invoice.clientEmail}</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground"><Calendar className="h-4 w-4" /><span className="text-sm">التواريخ</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>تاريخ الإنشاء</span><span>{invoice.createdAt ? formatDateAr(invoice.createdAt) : "-"}</span></div>
            <div className="flex justify-between"><span>تاريخ الاستحقاق</span><span className="font-medium">{invoice.dueDate ? formatDateAr(invoice.dueDate) : "-"}</span></div>
            {invoice.paidAt && <div className="flex justify-between text-status-success-foreground"><span>تاريخ السداد</span><span>{formatDateAr(invoice.paidAt)}</span></div>}
          </div>
        </CardContent></Card>
      </div>

      {invoice.isTaxLinked && (() => {
        const zs = invoice.zatcaStatus;
        const isFailed = zs === "rejected" || zs === "error";
        const canRetry = !zs || isFailed;
        return (
          <Card className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100">
                    <Zap className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">
                        ربط هيئة الزكاة والضريبة والجمارك
                      </h3>
                      <PageStatusBadge status={zs || "pending"} domain="zatca" />
                    </div>
                    {invoice.zatcaUuid && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        المعرف الفريد: {invoice.zatcaUuid}
                      </p>
                    )}
                    {invoice.zatcaHash && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        البصمة: {invoice.zatcaHash.substring(0, 24)}...
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {invoice.zatcaQrCode && (
                    <img
                      src={invoice.zatcaQrCode}
                      alt="رمز الاستجابة السريعة لهيئة الزكاة"
                      className="w-16 h-16 border rounded"
                    />
                  )}
                  {canRetry && (
                    <GuardedButton
                      perm="finance:approve"
                      size="sm"
                      onClick={handleZatcaSubmit}
                      disabled={zatcaMut.isPending}
                      rateLimitAware
                      className="gap-1"
                    >
                      <Send className="h-4 w-4" />
                      {zatcaMut.isPending
                        ? "جاري الإرسال..."
                        : isFailed
                          ? "إعادة الإرسال"
                          : "إرسال للهيئة"}
                    </GuardedButton>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {showPayment && (
        <Card>
          <CardHeader><CardTitle>تسجيل دفعة</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleRecordPayment} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">المبلغ</label>
                <Input name="amount" type="number" step="0.01" max={remaining} required dir="ltr" className="text-start mt-1" />
                <p className="text-xs text-muted-foreground mt-1">المتبقي: {formatCurrency(remaining)}</p>
              </div>
              <div className="w-48">
                <label className="text-sm font-medium">طريقة الدفع</label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">حوالة بنكية</SelectItem>
                    <SelectItem value="cash">نقداً</SelectItem>
                    <SelectItem value="card">بطاقة</SelectItem>
                    <SelectItem value="cheque">شيك</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <GuardedButton perm="finance:create" type="submit" disabled={paymentMut.isPending} rateLimitAware>
                {paymentMut.isPending ? "جاري التسجيل..." : "تسجيل"}
              </GuardedButton>
              <Button type="button" variant="outline" onClick={() => setShowPayment(false)}>
                إلغاء
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>بنود الفاتورة</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "_index", header: "#", render: (_r, i) => <span className="text-muted-foreground">{i + 1}</span> },
              { key: "description", header: "الوصف", render: (r) => <span className="font-medium">{r.description || "-"}</span> },
              { key: "quantity", header: "الكمية", sortable: true },
              { key: "unitPrice", header: "سعر الوحدة", sortable: true, render: (r) => formatCurrency(Number(r.unitPrice)) },
              { key: "lineTotal", header: "الإجمالي", sortable: true, render: (r) => formatCurrency(Number(r.lineTotal)) },
              { key: "vatAmount", header: "الضريبة", sortable: true, render: (r) => <span className="text-muted-foreground">{formatCurrency(Number(r.vatAmount || 0))}</span> },
              { key: "lineGross", header: "الصافي", sortable: true, render: (r) => <span className="font-bold">{formatCurrency(Number(r.lineGross || r.lineTotal))}</span> },
              {
                key: "account",
                header: "الحساب",
                // invoice_lines already stores accountCode / accountId per line
                // (set by the allocation-rules engine on post). Surfacing it
                // here tells the accountant exactly which line booked to which
                // revenue account — and flags any still-unmapped line.
                render: (r) =>
                  r.accountCode || r.accountId ? (
                    <span className="font-mono text-xs text-status-info-foreground">{r.accountCode || `#${r.accountId}`}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-status-warning-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-status-warning-foreground" />
                      غير مُوجَّه
                    </span>
                  ),
              },
              {
                key: "costCenter",
                header: "مركز التكلفة",
                render: (r) =>
                  r.costCenterId ? (
                    <span className="font-mono text-xs text-muted-foreground">#{r.costCenterId}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  ),
              },
            ] satisfies DataTableColumn<any>[]}
            data={lines}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد بنود"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>سجل الدفعات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-sm text-status-info-foreground">{r.ref}</span> },
              { key: "description", header: "الوصف", render: (r) => r.description || "-" },
              { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-bold text-status-success-foreground">{formatCurrency(Number(r.amount))}</span> },
              { key: "date", header: "التاريخ", render: (r) => <span className="text-muted-foreground text-sm">{r.date ? formatDateAr(r.date) : "-"}</span> },
            ] satisfies DataTableColumn<any>[]}
            data={payments}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد دفعات"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            القيود المحاسبية ({journalEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-sm text-purple-600">{r.ref}</span> },
              { key: "description", header: "الوصف", render: (r) => r.description || "-" },
              { key: "date", header: "التاريخ", render: (r) => <span className="text-muted-foreground text-sm">{r.date ? formatDateAr(r.date) : "-"}</span> },
            ] satisfies DataTableColumn<any>[]}
            data={journalEntries}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد قيود محاسبية"
          />
        </CardContent>
      </Card>

      {((memos?.creditMemos?.length ?? 0) > 0 || (memos?.debitMemos?.length ?? 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              الإشعارات (دائنة + مدينة) — {(memos?.creditMemos?.length ?? 0) + (memos?.debitMemos?.length ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(memos?.creditMemos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-700 mb-2">
                  إشعارات دائنة — {memos!.creditMemos.length}
                </p>
                <DataTable
                  columns={[
                    { key: "id", header: "#", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                    { key: "memoDate", header: "التاريخ", render: (r) => r.memoDate ? formatDateAr(r.memoDate) : "-" },
                    { key: "amount", header: "الإجمالي", render: (r) => <span className="font-bold text-emerald-700">{formatCurrency(Number(r.amount))}</span> },
                    { key: "netAmount", header: "الصافي", render: (r) => <span className="font-mono">{formatCurrency(Number(r.netAmount))}</span> },
                    { key: "vatAmount", header: "الضريبة", render: (r) => <span className="font-mono text-muted-foreground">{formatCurrency(Number(r.vatAmount))}</span> },
                    { key: "reason", header: "السبب", render: (r) => <span className="text-xs">{r.reason || "—"}</span> },
                  ] satisfies DataTableColumn<any>[]}
                  data={memos!.creditMemos}
                  pageSize={0} noToolbar searchPlaceholder={null} emptyMessage="—"
                />
              </div>
            )}
            {(memos?.debitMemos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-700 mb-2">
                  إشعارات مدينة — {memos!.debitMemos.length}
                </p>
                <DataTable
                  columns={[
                    { key: "id", header: "#", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                    { key: "memoDate", header: "التاريخ", render: (r) => r.memoDate ? formatDateAr(r.memoDate) : "-" },
                    { key: "amount", header: "الإجمالي", render: (r) => <span className="font-bold text-orange-700">{formatCurrency(Number(r.amount))}</span> },
                    { key: "netAmount", header: "الصافي", render: (r) => <span className="font-mono">{formatCurrency(Number(r.netAmount))}</span> },
                    { key: "vatAmount", header: "الضريبة", render: (r) => <span className="font-mono text-muted-foreground">{formatCurrency(Number(r.vatAmount))}</span> },
                    { key: "reason", header: "السبب", render: (r) => <span className="text-xs">{r.reason || "—"}</span> },
                  ] satisfies DataTableColumn<any>[]}
                  data={memos!.debitMemos}
                  pageSize={0} noToolbar searchPlaceholder={null} emptyMessage="—"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {invoice.status === "draft" && (
        <>
          <CogsPreviewCard invoiceId={Number(id)} />
          <Card>
            <CardHeader><CardTitle>إجراءات الاعتماد</CardTitle></CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="invoice"
                entityId={Number(id)}
                approveEndpoint={`/finance/invoices/${id}/approve`}
                rejectEndpoint={`/finance/invoices/${id}/reject`}
                returnEndpoint={`/finance/invoices/${id}/return`}
                approveMethod="POST"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={() => ({})}
                rejectBody={(r) => ({ notes: r })}
                returnBody={(r) => ({ notes: r })}
                invalidateKeys={[["invoice-detail", id || ""], ["invoices"]]}
              />
            </CardContent>
          </Card>
        </>
      )}

      {invoice.status === "approved" && (
        <Card className="border-status-info-surface">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>الترحيل المحاسبي</span>
              <GuardedButton
                perm="finance:approve"
                onClick={() => setConfirmPost(true)}
                disabled={postMut.isPending}
                rateLimitAware
              >
                ترحيل
              </GuardedButton>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              الفاتورة معتمدة. اضغط <strong>ترحيل</strong> لإنشاء قيد المحاسبة وقفل الفاتورة عن أي تعديل.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>سجل الإجراءات</CardTitle></CardHeader>
        <CardContent>
          <ActionHistory entityType="invoice" entityId={Number(id)} defaultOpen />
        </CardContent>
      </Card>

      {invoice.description && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{invoice.description}</p></CardContent>
        </Card>
      )}

      {id && <EntityObligations entityType="invoice" entityId={id} hideWhenEmpty />}

    </div>
  ) : null;

  return (
    <>
      <DetailPageLayout
        title={invoice?.ref ? `فاتورة ${invoice.ref}` : "فاتورة"}
        subtitle={invoice?.clientName || undefined}
        backPath="/finance/invoices"
        backLabel="العودة للفواتير"
        status={statusToDetailStatus(invoice?.status)}
        refNumber={invoice?.ref}
        createdAt={invoice?.createdAt}
        updatedAt={invoice?.updatedAt}
        entityType="invoice"
        entityId={id || ""}
        isLoading={isLoading}
        error={isError && !invoice ? "تعذر تحميل بيانات الفاتورة" : undefined}
        onRetry={refetch}
        actions={actions}
        overview={overview}
        extraTabs={registryExtraTabs}
        hideTabs={registryHideTabs}
      />
      {invoice && (
        <>
          <CreditMemoDialog
            invoiceId={Number(id)}
            invoiceRef={invoice.ref}
            openBalance={remaining}
            open={showCreditMemo}
            onOpenChange={setShowCreditMemo}
            onIssued={() => { refetch(); refetchMemos(); }}
          />
          <DebitMemoDialog
            invoiceId={Number(id)}
            invoiceRef={invoice.ref}
            open={showDebitMemo}
            onOpenChange={setShowDebitMemo}
            onIssued={() => { refetch(); refetchMemos(); }}
          />
          <InvoiceAmendDialog
            invoiceId={Number(id)}
            invoiceRef={invoice.ref}
            invoiceTotal={Number(invoice.total ?? 0)}
            open={showAmend}
            onOpenChange={setShowAmend}
          />
        </>
      )}
      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={confirmPost}
        onOpenChange={(o) => { if (!o) setConfirmPost(false); }}
        variant="destructive"
        title="تأكيد ترحيل الفاتورة"
        description="سيتم ترحيل الفاتورة وإنشاء قيد المحاسبة الذي يُرحَّل إلى دفتر الأستاذ العام. هذا الإجراء غير قابل للتراجع. متابعة؟"
        confirmLabel="تأكيد الترحيل"
        pending={postMut.isPending}
        onConfirm={() => { setConfirmPost(false); postMut.mutate({}); }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CogsPreviewCard — surfaces the COGS plan + stock-shortage blockers
// from POST /invoices/:id/preview-posting (#1023) before the operator
// clicks "اعتماد". A red blocker banner appears when the planner
// reports insufficient_stock; warnings for product_not_tracked /
// no_active_lots / no_*_account pin to the offending line.
// ─────────────────────────────────────────────────────────────────────────────
interface PreviewLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

interface PreviewResponse {
  invoiceId: number;
  invoiceRef: string;
  canApprove: boolean;
  blockers: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string; lineIds?: number[] }>;
  resolverWarnings: Array<{ lineId: number; code: string; message: string }>;
  cogsWarnings: Array<{ lineId: number; productId: number | null; reason: string; detail?: string }>;
  cogsTotal: number;
  journalLines: PreviewLine[];
  totals: { debit: number; credit: number; balanced: boolean };
}

const COGS_REASON_LABEL: Record<string, string> = {
  insufficient_stock:    "مخزون غير كافٍ",
  product_not_found:     "المنتج غير موجود",
  product_not_tracked:   "المنتج غير مرتبط بمخزون",
  no_active_lots:        "لا توجد تشغيلات نشطة",
  no_cogs_account:       "حساب COGS غير مهيأ",
  no_inventory_account:  "حساب المخزون غير مهيأ",
};

function CogsPreviewCard({ invoiceId }: { invoiceId: number }) {
  // preview-posting is a POST that takes no body — same shape #1023 ships.
  const previewMut = useApiMutation<PreviewResponse, any>(
    `/finance/invoices/${invoiceId}/preview-posting`,
    "POST",
    [],
  );
  const [data, setData] = useState<PreviewResponse | null>(null);

  const run = async () => {
    try {
      const res = await previewMut.mutateAsync({});
      setData(res as PreviewResponse);
    } catch (_e) {
      // Errors surface via the global toast; nothing extra needed.
    }
  };

  // Auto-run once on mount so the operator sees the status before scrolling.
  // Must run in an effect — calling run() (which triggers a mutation +
  // setState) during render is a hooks/render-phase anti-pattern.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (previewMut.isPending && !data) {
    return (
      <Card>
        <CardHeader><CardTitle>معاينة الاعتماد</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">جاري التحقق من المخزون والحسابات...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader><CardTitle>معاينة الاعتماد</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={run} variant="outline" size="sm" rateLimitAware>تحديث المعاينة</Button>
        </CardContent>
      </Card>
    );
  }

  const insufficient = data.cogsWarnings?.filter((w) => w.reason === "insufficient_stock") ?? [];
  const otherCogsWarnings = (data.cogsWarnings ?? []).filter((w) => w.reason !== "insufficient_stock");

  return (
    <Card className={data.canApprove
      ? "border-emerald-300 bg-emerald-50/40"
      : "border-destructive/40 bg-destructive/5"}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>معاينة الاعتماد</span>
          <span className={`text-xs font-semibold ${data.canApprove ? "text-emerald-700" : "text-destructive"}`}>
            {data.canApprove ? "✓ جاهز للاعتماد" : "⚠ توجد عوائق"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Blockers */}
        {data.blockers.length > 0 && (
          <div className="border border-destructive/30 rounded-md p-3 bg-destructive/5">
            <p className="font-semibold text-destructive mb-2">عوائق الاعتماد ({data.blockers.length})</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              {data.blockers.map((b, i) => (
                <li key={i} className="text-destructive">
                  <span className="font-mono text-xs me-1">[{b.field}]</span>
                  {b.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* COGS warnings (non-fatal) */}
        {otherCogsWarnings.length > 0 && (
          <div className="border border-status-warning-surface rounded-md p-3 bg-status-warning-surface/40">
            <p className="font-semibold text-status-warning-foreground mb-2">
              تنبيهات على COGS ({otherCogsWarnings.length}) — الفاتورة ستُعتمد لكن COGS لن يُسجَّل لهذه البنود
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              {otherCogsWarnings.map((w, i) => (
                <li key={i} className="text-status-warning-foreground">
                  <span className="font-mono text-xs me-1">سطر #{w.lineId}</span>
                  {COGS_REASON_LABEL[w.reason] ?? w.reason}
                  {w.detail && <span className="text-muted-foreground"> — {w.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insufficient stock — already in blockers above; this is just emphasis */}
        {insufficient.length > 0 && (
          <p className="text-xs text-destructive">
            ⛔ المخزون غير كافٍ على {insufficient.length} بند(ود). عدّل الكميات أو استلم بضاعة قبل الاعتماد.
          </p>
        )}

        {/* Document-level warnings */}
        {data.warnings.length > 0 && (
          <div className="border border-status-warning-surface rounded-md p-3 bg-status-warning-surface/40">
            <p className="font-semibold text-status-warning-foreground mb-2">تنبيهات عامة ({data.warnings.length})</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              {data.warnings.map((w, i) => (
                <li key={i} className="text-status-warning-foreground">{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Posting summary */}
        <div className="bg-muted/30 p-3 rounded-md flex flex-wrap items-center gap-4 text-xs">
          <span>عدد القيود: <span className="font-semibold">{data.journalLines.length}</span></span>
          <span>إجمالي مدين: <span className="font-semibold text-status-info-foreground">{formatCurrency(data.totals.debit)}</span></span>
          <span>إجمالي دائن: <span className="font-semibold text-status-info-foreground">{formatCurrency(data.totals.credit)}</span></span>
          <span>متوازن: <span className={`font-semibold ${data.totals.balanced ? "text-emerald-700" : "text-destructive"}`}>{data.totals.balanced ? "✓" : "✗"}</span></span>
          {data.cogsTotal > 0 && (
            <span>إجمالي COGS: <span className="font-semibold text-orange-700">{formatCurrency(data.cogsTotal)}</span></span>
          )}
        </div>

        <div>
          <Button onClick={run} variant="outline" size="sm" rateLimitAware
            disabled={previewMut.isPending}>
            {previewMut.isPending ? "..." : "تحديث المعاينة"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
