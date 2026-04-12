import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PrintPreviewModal, PrintActions, PrintDocument, directPrint } from "@/components/print-layout";
import { extractBranchFromResponse } from "@/lib/branch-utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Printer, Banknote, FileText, DollarSign, Calendar, User, Phone, Mail, BookOpen, Copy, Zap, CheckCircle, Clock, XCircle, Send } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { getCurrencySymbol, formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";

export default function InvoiceDetailPage() {
  const [, params] = useRoute("/finance/invoices/:id");
  const id = params?.id;
  const { data: invoice, isLoading } = useApiQuery<any>(["invoice-detail", id || ""], `/finance/invoices/${id}`, !!id);
  const [showPayment, setShowPayment] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [zatcaSubmitting, setZatcaSubmitting] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!invoice) return (
    <div className="text-center py-12">
      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">الفاتورة غير موجودة</p>
      <Link href="/finance/invoices"><Button variant="outline" className="mt-4">العودة للفواتير</Button></Link>
    </div>
  );

  const lines = invoice.lines || [];
  const payments = invoice.payments || [];
  const journalEntries = invoice.journalEntries || [];
  const remaining = Number(invoice.total) - Number(invoice.paidAmount || 0);
  const branch = extractBranchFromResponse(invoice);
  const docDate = invoice.createdAt ? formatDateAr(invoice.createdAt) : "";

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = parseFloat(fd.get("amount") as string);
    const method = fd.get("method") as string;
    if (!amount || !method) return;

    try {
      await apiFetch(`/finance/invoices/${id}/payment`, {
        method: "POST",
        body: JSON.stringify({ amount, method }),
      });
      toast({ title: "تم تسجيل الدفعة" });
      setShowPayment(false);
      qc.invalidateQueries({ queryKey: ["invoice-detail", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  const handleZatcaSubmit = async () => {
    setZatcaSubmitting(true);
    try {
      const result = await apiFetch<any>(`/finance/zatca/invoice/${id}/submit`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "تم الإرسال", description: result.message });
      qc.invalidateQueries({ queryKey: ["invoice-detail", id] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ في الإرسال لهيئة الزكاة", description: e.message || "فشل إرسال الفاتورة للهيئة" });
    } finally {
      setZatcaSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance/invoices">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">فاتورة {invoice.ref}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="flex gap-2">
          <Link href={`/finance/invoices/create?copyFrom=${id}`}>
            <Button variant="outline" size="sm" className="gap-1">
              <Copy className="h-4 w-4" />نسخ
            </Button>
          </Link>
          {remaining > 0 && (
            <Button variant="outline" onClick={() => setShowPayment(!showPayment)}>
              <Banknote className="h-4 w-4 me-1" />تسجيل دفعة
            </Button>
          )}
          <ExportButton endpoint={`/export/pdf/invoice/${id}`} filename={`invoice-${id}.pdf`} type="pdf" label="ملف طباعي" />
          <PrintActions
            onPreview={() => setShowPreview(true)}
            onPrint={() => directPrint(printContainerRef.current, `فاتورة ${invoice.ref}`)}
          />
        </div>
      </div>

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
        const isSuccess = zs === "accepted";
        const isFailed = zs === "rejected" || zs === "error";
        const isSubmitted = zs === "submitted";
        const canRetry = !zs || isFailed;
        const borderColor = isSuccess ? "border-green-200 bg-green-50/30" : isFailed ? "border-red-200 bg-red-50/30" : isSubmitted ? "border-blue-200 bg-blue-50/30" : "border-yellow-200 bg-yellow-50/30";
        const iconBg = isSuccess ? "bg-green-100" : isFailed ? "bg-red-100" : isSubmitted ? "bg-blue-100" : "bg-yellow-100";
        const iconColor = isSuccess ? "text-green-600" : isFailed ? "text-red-600" : isSubmitted ? "text-blue-600" : "text-yellow-600";
        const badgeCls = isSuccess ? "bg-green-100 text-green-700" : isFailed ? "bg-red-100 text-red-700" : isSubmitted ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700";
        const badgeText = zs === "accepted" ? "مقبولة" : zs === "rejected" ? "مرفوضة" : zs === "error" ? "خطأ" : zs === "submitted" ? "مرسلة" : "معلّقة — لم تُرسل بعد";
        return (
        <Card className={`border ${borderColor}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${iconBg}`}>
                  <Zap className={`h-5 w-5 ${iconColor}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">ربط هيئة الزكاة والضريبة والجمارك</h3>
                    <Badge className={`text-xs ${badgeCls}`}>{badgeText}</Badge>
                  </div>
                  {invoice.zatcaUuid && <p className="text-xs text-gray-500 mt-1 font-mono">المعرف الفريد: {invoice.zatcaUuid}</p>}
                  {invoice.zatcaHash && <p className="text-xs text-gray-400 mt-0.5 font-mono">البصمة: {invoice.zatcaHash.substring(0, 24)}...</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {invoice.zatcaQrCode && (
                  <img src={invoice.zatcaQrCode} alt="رمز الاستجابة السريعة لهيئة الزكاة" className="w-16 h-16 border rounded" />
                )}
                {canRetry && (
                  <Button size="sm" onClick={handleZatcaSubmit} disabled={zatcaSubmitting} className="gap-1">
                    <Send className="h-4 w-4" />
                    {zatcaSubmitting ? "جاري الإرسال..." : isFailed ? "إعادة الإرسال" : "إرسال للهيئة"}
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
                <select name="method" className="w-full border rounded-md p-2 mt-1" defaultValue="bank_transfer">
                  <option value="bank_transfer">حوالة بنكية</option>
                  <option value="cash">نقداً</option>
                  <option value="card">بطاقة</option>
                  <option value="cheque">شيك</option>
                </select>
              </div>
              <Button type="submit">تسجيل</Button>
              <Button type="button" variant="outline" onClick={() => setShowPayment(false)}>إلغاء</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {lines.length > 0 && (
        <Card>
          <CardHeader><CardTitle>بنود الفاتورة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">#</th>
                <th className="p-3 text-start">الوصف</th>
                <th className="p-3 text-start">الكمية</th>
                <th className="p-3 text-start">سعر الوحدة</th>
                <th className="p-3 text-start">الإجمالي</th>
                <th className="p-3 text-start">الضريبة</th>
                <th className="p-3 text-start">الصافي</th>
              </tr></thead>
              <tbody>
                {lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="p-3 text-gray-400">{i + 1}</td>
                    <td className="p-3 font-medium">{l.description || "-"}</td>
                    <td className="p-3">{l.quantity}</td>
                    <td className="p-3">{formatCurrency(Number(l.unitPrice))}</td>
                    <td className="p-3">{formatCurrency(Number(l.lineTotal))}</td>
                    <td className="p-3 text-gray-500">{formatCurrency(Number(l.vatAmount || 0))}</td>
                    <td className="p-3 font-bold">{formatCurrency(Number(l.lineGross || l.lineTotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>سجل الدفعات</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">المرجع</th>
                <th className="p-3 text-start">الوصف</th>
                <th className="p-3 text-start">المبلغ</th>
                <th className="p-3 text-start">التاريخ</th>
              </tr></thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-sm text-blue-600">{p.ref}</td>
                    <td className="p-3">{p.description || "-"}</td>
                    <td className="p-3 font-bold text-green-600">{formatCurrency(Number(p.amount))}</td>
                    <td className="p-3 text-gray-500 text-sm">{p.date ? formatDateAr(p.date) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {journalEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              القيود المحاسبية ({journalEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">المرجع</th>
                <th className="p-3 text-start">الوصف</th>
                <th className="p-3 text-start">التاريخ</th>
              </tr></thead>
              <tbody>
                {journalEntries.map((je: any) => (
                  <tr key={je.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-sm text-purple-600">{je.ref}</td>
                    <td className="p-3">{je.description || "-"}</td>
                    <td className="p-3 text-gray-500 text-sm">{je.date ? formatDateAr(je.date) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {invoice.status === "pending" && (
        <Card>
          <CardHeader><CardTitle>إجراءات الاعتماد</CardTitle></CardHeader>
          <CardContent>
            <ApprovalActions
              entityType="invoice"
              entityId={Number(id)}
              approveEndpoint={`/finance/invoices/${id}/approve`}
              rejectEndpoint={`/finance/invoices/${id}/approve`}
              returnEndpoint={`/finance/invoices/${id}/approve`}
              approveMethod="PATCH"
              rejectMethod="PATCH"
              returnMethod="PATCH"
              approveBody={() => ({ approved: true })}
              rejectBody={(r) => ({ approved: false, notes: r })}
              returnBody={(r) => ({ approved: "returned", notes: r })}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>{id && <EntityDocuments entityType="invoice" entityId={id} />}</div>
        <Card>
          <CardHeader><CardTitle className="text-lg">السجل الزمني</CardTitle></CardHeader>
          <CardContent>
            {id && <EntityTimeline entityType="invoices" entityId={id} maxItems={20} />}
          </CardContent>
        </Card>
      </div>

      {id && (
        <Card>
          <CardHeader><CardTitle className="text-lg">سجل الأحداث</CardTitle></CardHeader>
          <CardContent>
            <EntityTimeline entityType="invoice" entityId={id} />
          </CardContent>
        </Card>
      )}

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
                  <td>{Number(l.unitPrice).toLocaleString()} ﷼</td>
                  <td>{Number(l.lineTotal).toLocaleString()} ﷼</td>
                  <td>{Number(l.vatAmount || 0).toLocaleString()} ﷼</td>
                  <td style={{ fontWeight: "bold" }}>{Number(l.lineGross || l.lineTotal).toLocaleString()} ﷼</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
          <tbody>
            <tr>
              <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ قبل الضريبة:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{Number(invoice.subtotal || 0).toLocaleString()} ﷼</td>
            </tr>
            <tr>
              <td className="label" style={{ color: "#555", border: "none", padding: "4px 8px" }}>ضريبة ({invoice.vatRate || 15}%):</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{Number(invoice.vatAmount || 0).toLocaleString()} ﷼</td>
            </tr>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td className="label" style={{ color: "#111", border: "none", padding: "4px 8px", fontWeight: "bold" }}>الإجمالي:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px", fontSize: "14pt" }}>{Number(invoice.total).toLocaleString()} ﷼</td>
            </tr>
            <tr>
              <td className="label" style={{ color: "#16a34a", border: "none", padding: "4px 8px" }}>المدفوع:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#16a34a" }}>{Number(invoice.paidAmount || 0).toLocaleString()} ﷼</td>
            </tr>
            <tr>
              <td className="label" style={{ color: "#dc2626", border: "none", padding: "4px 8px" }}>المتبقي:</td>
              <td className="value" style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#dc2626" }}>{remaining.toLocaleString()} ﷼</td>
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
                  <tr key={i}><td>{i + 1}</td><td>{l.description || "-"}</td><td>{l.quantity}</td><td>{Number(l.unitPrice).toLocaleString()} ﷼</td><td>{Number(l.lineTotal).toLocaleString()} ﷼</td><td>{Number(l.vatAmount || 0).toLocaleString()} ﷼</td><td style={{ fontWeight: "bold" }}>{Number(l.lineGross || l.lineTotal).toLocaleString()} ﷼</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="summary-table" style={{ width: "auto", marginRight: "auto", marginTop: "16px" }}>
            <tbody>
              <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>المبلغ قبل الضريبة:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{Number(invoice.subtotal || 0).toLocaleString()} ﷼</td></tr>
              <tr><td style={{ color: "#555", border: "none", padding: "4px 8px" }}>ضريبة ({invoice.vatRate || 15}%):</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px" }}>{Number(invoice.vatAmount || 0).toLocaleString()} ﷼</td></tr>
              <tr style={{ borderTop: "2px solid #333" }}><td style={{ color: "#111", border: "none", padding: "4px 8px", fontWeight: "bold" }}>الإجمالي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", fontSize: "14pt" }}>{Number(invoice.total).toLocaleString()} ﷼</td></tr>
              <tr><td style={{ color: "#16a34a", border: "none", padding: "4px 8px" }}>المدفوع:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#16a34a" }}>{Number(invoice.paidAmount || 0).toLocaleString()} ﷼</td></tr>
              <tr><td style={{ color: "#dc2626", border: "none", padding: "4px 8px" }}>المتبقي:</td><td style={{ fontWeight: "bold", border: "none", padding: "4px 8px", color: "#dc2626" }}>{remaining.toLocaleString()} ﷼</td></tr>
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
  );
}
