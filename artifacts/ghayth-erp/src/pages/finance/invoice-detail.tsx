import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintPreviewModal, PrintActions, PrintDocument, directPrint } from "@/components/print-layout";
import { extractBranchFromResponse } from "@/lib/branch-utils";
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
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ExportButton } from "@/components/shared/export-buttons";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { DetailPageLayout, type DetailStatus } from "@/components/shared/detail-page-layout";
import { PageStatusBadge } from "@/components/page-status-badge";

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
  const [showPayment, setShowPayment] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const printContainerRef = useRef<HTMLDivElement>(null);

  // R.4 iter 4 — both mutations now flow through useApiMutation so
  // typed errors (VALIDATION_ERROR with field, CONFLICT with meta,
  // FORBIDDEN with requiredRoles) surface through R.1.2's toast
  // pipeline automatically. The old handlers swallowed the server's
  // structured detail into a generic "حدث خطأ" toast.
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
      onSuccess: () => setShowPayment(false),
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

  // Loading / error states are now handled by DetailPageLayout.

  const lines = invoice?.lines || [];
  const payments = invoice?.payments || [];
  const journalEntries = invoice?.journalEntries || [];
  const remaining = invoice
    ? Number(invoice.total) - Number(invoice.paidAmount || 0)
    : 0;
  const branch = invoice ? extractBranchFromResponse(invoice) ?? undefined : undefined;
  const docDate = invoice?.createdAt ? formatDateAr(invoice.createdAt) : "";
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

  // --- Action buttons for the header ---
  const actions = (
    <div className="flex items-center gap-2">
      <Link href={`/finance/invoices/create?copyFrom=${id}`}>
        <Button variant="outline" size="sm" className="gap-1">
          <Copy className="h-4 w-4" />
          نسخ
        </Button>
      </Link>
      {invoice && remaining > 0 && (
        <Button variant="outline" size="sm" onClick={() => setShowPayment(!showPayment)}>
          <Banknote className="h-4 w-4 me-1" />
          تسجيل دفعة
        </Button>
      )}
      {invoice && (
        <>
          <ExportButton
            endpoint={`/export/pdf/invoice/${id}`}
            filename={`invoice-${id}.pdf`}
            type="pdf"
            label="ملف طباعي"
          />
          <PrintActions
            onPreview={() => setShowPreview(true)}
            onPrint={() =>
              directPrint(printContainerRef.current, `فاتورة ${invoice.ref}`)
            }
          />
        </>
      )}
    </div>
  );

  // --- Overview content (main tab) ---
  const overview = invoice ? (
    <div className="space-y-4">
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
          <div className="flex items-center gap-2 mb-3 text-gray-500"><DollarSign className="h-4 w-4" /><span className="text-sm">ملخص مالي</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>المبلغ قبل الضريبة</span><span className="font-medium">{formatCurrency(Number(invoice.subtotal || 0))}</span></div>
            <div className="flex justify-between"><span>ضريبة ({invoice.vatRate || 15}%)</span><span className="font-medium">{formatCurrency(Number(invoice.vatAmount || 0))}</span></div>
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>الإجمالي</span><span className="text-primary">{formatCurrency(Number(invoice.total))}</span></div>
            <div className="flex justify-between text-green-600"><span>المدفوع</span><span>{formatCurrency(Number(invoice.paidAmount || 0))}</span></div>
            <div className="flex justify-between text-red-600 font-bold"><span>المتبقي</span><span>{formatCurrency(remaining)}</span></div>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, (Number(invoice.paidAmount || 0) / Number(invoice.total)) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1 text-start">{Math.round((Number(invoice.paidAmount || 0) / Number(invoice.total)) * 100)}% مدفوع</p>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><User className="h-4 w-4" /><span className="text-sm">العميل</span></div>
          <p className="font-bold text-lg">{invoice.clientName || "-"}</p>
          {invoice.clientPhone && <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{invoice.clientPhone}</p>}
          {invoice.clientEmail && <p className="text-sm text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" />{invoice.clientEmail}</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Calendar className="h-4 w-4" /><span className="text-sm">التواريخ</span></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>تاريخ الإنشاء</span><span>{invoice.createdAt ? formatDateAr(invoice.createdAt) : "-"}</span></div>
            <div className="flex justify-between"><span>تاريخ الاستحقاق</span><span className="font-medium">{invoice.dueDate ? formatDateAr(invoice.dueDate) : "-"}</span></div>
            {invoice.paidAt && <div className="flex justify-between text-green-600"><span>تاريخ السداد</span><span>{formatDateAr(invoice.paidAt)}</span></div>}
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
                    <Button
                      size="sm"
                      onClick={handleZatcaSubmit}
                      disabled={zatcaMut.isPending}
                      className="gap-1"
                    >
                      <Send className="h-4 w-4" />
                      {zatcaMut.isPending
                        ? "جاري الإرسال..."
                        : isFailed
                          ? "إعادة الإرسال"
                          : "إرسال للهيئة"}
                    </Button>
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
                <p className="text-xs text-gray-400 mt-1">المتبقي: {formatCurrency(remaining)}</p>
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
              <Button type="submit" disabled={paymentMut.isPending}>
                {paymentMut.isPending ? "جاري التسجيل..." : "تسجيل"}
              </Button>
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
          <DataTable<any>
            columns={[
              { key: "_index", header: "#", render: (_r, i) => <span className="text-gray-400">{i + 1}</span> },
              { key: "description", header: "الوصف", render: (r) => <span className="font-medium">{r.description || "-"}</span> },
              { key: "quantity", header: "الكمية", sortable: true },
              { key: "unitPrice", header: "سعر الوحدة", sortable: true, render: (r) => formatCurrency(Number(r.unitPrice)) },
              { key: "lineTotal", header: "الإجمالي", sortable: true, render: (r) => formatCurrency(Number(r.lineTotal)) },
              { key: "vatAmount", header: "الضريبة", sortable: true, render: (r) => <span className="text-gray-500">{formatCurrency(Number(r.vatAmount || 0))}</span> },
              { key: "lineGross", header: "الصافي", sortable: true, render: (r) => <span className="font-bold">{formatCurrency(Number(r.lineGross || r.lineTotal))}</span> },
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
          <DataTable<any>
            columns={[
              { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-sm text-blue-600">{r.ref}</span> },
              { key: "description", header: "الوصف", render: (r) => r.description || "-" },
              { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-bold text-green-600">{formatCurrency(Number(r.amount))}</span> },
              { key: "date", header: "التاريخ", render: (r) => <span className="text-gray-500 text-sm">{r.date ? formatDateAr(r.date) : "-"}</span> },
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
          <DataTable<any>
            columns={[
              { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-sm text-purple-600">{r.ref}</span> },
              { key: "description", header: "الوصف", render: (r) => r.description || "-" },
              { key: "date", header: "التاريخ", render: (r) => <span className="text-gray-500 text-sm">{r.date ? formatDateAr(r.date) : "-"}</span> },
            ] satisfies DataTableColumn<any>[]}
            data={journalEntries}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد قيود محاسبية"
          />
        </CardContent>
      </Card>

      {invoice.status === "pending" && (
        <Card>
          <CardHeader><CardTitle>إجراءات الاعتماد</CardTitle></CardHeader>
          <CardContent>
            <ApprovalActions
              entityType="invoice"
              entityId={Number(id)}
              approveEndpoint={`/finance/invoices/${id}/approve`}
              rejectEndpoint={`/finance/invoices/${id}/reject`}
              returnEndpoint={`/finance/invoices/${id}/return`}
              approveMethod="PATCH"
              rejectMethod="PATCH"
              returnMethod="PATCH"
              approveBody={() => ({})}
              rejectBody={(r) => ({ notes: r })}
              returnBody={(r) => ({ notes: r })}
              invalidateKeys={[["invoice-detail", id || ""], ["invoices"]]}
            />
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
          <CardContent><p className="text-gray-600">{invoice.description}</p></CardContent>
        </Card>
      )}

      {id && <EntityObligations entityType="invoice" entityId={id} hideWhenEmpty />}

      {/* Print preview modal + hidden print container (kept inside overview
          so they mount when invoice data is available) */}
      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        branch={branch}
        documentTitle="فاتورة"
        documentRef={invoice.ref}
        documentDate={docDate}
      >
        <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>العميل:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{invoice.clientName || "-"}</span>
          </div>
          {invoice.clientPhone && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>الهاتف:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{invoice.clientPhone}</span>
          </div>}
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>تاريخ الاستحقاق:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{invoice.dueDate ? formatDateAr(invoice.dueDate) : "-"}</span>
          </div>
          <div className="info-item" style={{ display: "flex", gap: "4px" }}>
            <span className="info-label" style={{ color: "#555" }}>الحالة:</span>
            <span className="info-value" style={{ fontWeight: 600 }}>{invoice.status || "-"}</span>
          </div>
        </div>

        {lines.length > 0 && (
          <table>
            <thead><tr>
              <th>#</th>
              <th>الوصف</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الإجمالي</th>
              <th>الضريبة</th>
              <th>الصافي</th>
            </tr></thead>
            <tbody>
              {lines.map((l: any, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{l.description || "-"}</td>
                  <td>{l.quantity}</td>
                  <td>{formatCurrency(Number(l.unitPrice))}</td>
                  <td>{formatCurrency(Number(l.lineTotal))}</td>
                  <td>{formatCurrency(Number(l.vatAmount || 0))}</td>
                  <td style={{ fontWeight: "bold" }}>{formatCurrency(Number(l.lineGross || l.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
          <tbody>
            <tr>
              <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ قبل الضريبة:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(invoice.subtotal || 0))}</td>
            </tr>
            <tr>
              <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>ضريبة ({invoice.vatRate || 15}%):</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(invoice.vatAmount || 0))}</td>
            </tr>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td className="label" style={{ color: "#111", border: "none", padding: "4px 8px", fontWeight: "bold" }}>الإجمالي:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px", fontSize: "14pt" }}>{formatCurrency(Number(invoice.total))}</td>
            </tr>
            <tr>
              <td className="label" style={{ color: "#16a34a", border: "none", padding: "4px 8px" }}>المدفوع:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#16a34a" }}>{formatCurrency(Number(invoice.paidAmount || 0))}</td>
            </tr>
            <tr>
              <td className="label" style={{ color: "#dc2626", border: "none", padding: "4px 8px" }}>المتبقي:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#dc2626" }}>{formatCurrency(remaining)}</td>
            </tr>
          </tbody>
        </table>
        {invoice.zatcaQrCode && (
          <div style={{ marginTop: "24px", display: "flex", alignItems: "flex-start", gap: "12px", borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
            <div>
              <p style={{ fontSize: "8pt", color: "#555", marginBottom: "4px" }}>رمز الاستجابة السريعة — هيئة الزكاة والضريبة والجمارك</p>
              <img
                src={invoice.zatcaQrCode}
                alt="رمز الاستجابة السريعة لهيئة الزكاة"
                style={{ width: "80px", height: "80px", border: "1px solid #ccc" }}
              />
            </div>
            <div style={{ fontSize: "7pt", color: "#777", marginTop: "20px" }}>
              {invoice.zatcaUuid && <p>المعرف الفريد: {invoice.zatcaUuid}</p>}
              {invoice.zatcaStatus && <p>حالة الربط مع هيئة الزكاة: {invoice.zatcaStatus}</p>}
            </div>
          </div>
        )}
      </PrintPreviewModal>

      <div ref={printContainerRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <PrintDocument branch={branch} documentTitle="فاتورة" documentRef={invoice.ref} documentDate={docDate}>
          <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>العميل:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{invoice.clientName || "-"}</span>
            </div>
            {invoice.clientPhone && <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>الهاتف:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{invoice.clientPhone}</span>
            </div>}
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>تاريخ الاستحقاق:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{invoice.dueDate ? formatDateAr(invoice.dueDate) : "-"}</span>
            </div>
            <div className="info-item" style={{ display: "flex", gap: "4px" }}>
              <span className="info-label" style={{ color: "#555" }}>الحالة:</span>
              <span className="info-value" style={{ fontWeight: 600 }}>{invoice.status || "-"}</span>
            </div>
          </div>
          {lines.length > 0 && (
            <table>
              <thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الضريبة</th><th>الصافي</th></tr></thead>
              <tbody>
                {lines.map((l: any, i: number) => (
                  <tr key={i}><td>{i + 1}</td><td>{l.description || "-"}</td><td>{l.quantity}</td><td>{formatCurrency(Number(l.unitPrice))}</td><td>{formatCurrency(Number(l.lineTotal))}</td><td>{formatCurrency(Number(l.vatAmount || 0))}</td><td style={{ fontWeight: "bold" }}>{formatCurrency(Number(l.lineGross || l.lineTotal))}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
            <tbody>
              <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ قبل الضريبة:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(invoice.subtotal || 0))}</td></tr>
              <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>ضريبة ({invoice.vatRate || 15}%):</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{formatCurrency(Number(invoice.vatAmount || 0))}</td></tr>
              <tr style={{ borderTop: "2px solid #333" }}><td style={{ color: "#111", border: "none", padding: "4px 8px", fontWeight: "bold" }}>الإجمالي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", fontSize: "14pt" }}>{formatCurrency(Number(invoice.total))}</td></tr>
              <tr><td style={{ color: "#16a34a", border: "none", padding: "4px 8px" }}>المدفوع:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#16a34a" }}>{formatCurrency(Number(invoice.paidAmount || 0))}</td></tr>
              <tr><td style={{ color: "#dc2626", border: "none", padding: "4px 8px" }}>المتبقي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#dc2626" }}>{formatCurrency(remaining)}</td></tr>
            </tbody>
          </table>
          {invoice.zatcaQrCode && (
            <div style={{ marginTop: "24px", display: "flex", alignItems: "flex-start", gap: "12px", borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
              <div>
                <p style={{ fontSize: "8pt", color: "#555", marginBottom: "4px" }}>رمز الاستجابة السريعة — هيئة الزكاة والضريبة والجمارك</p>
                <img
                  src={invoice.zatcaQrCode}
                  alt="رمز الاستجابة السريعة لهيئة الزكاة"
                  style={{ width: "80px", height: "80px", border: "1px solid #ccc" }}
                />
              </div>
              <div style={{ fontSize: "7pt", color: "#777", marginTop: "20px" }}>
                {invoice.zatcaUuid && <p>المعرّف الفريد: {invoice.zatcaUuid}</p>}
                {invoice.zatcaStatus && <p>حالة الهيئة: {invoice.zatcaStatus}</p>}
              </div>
            </div>
          )}
        </PrintDocument>
      </div>
    </div>
  ) : null;

  return (
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
    />
  );
}
