import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { isMoneyAccount } from "@/lib/finance-account-usage";
import { ClientSelect, BranchSelect, AccountSelect } from "@/components/shared/entity-selects";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { NumberField, TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

/**
 * تحصيل العميل داخل «قبض» — م٣ (docs/25 §٧.٣ + §٩.٣). تختار العميل + المبلغ،
 * والنظام يجلب فواتيره المفتوحة ويطبّق FIFO (الأقدم أولًا) ويعرض الملخّص للقراءة؛
 * يمكن تعديل التخصيص يدويًا. الزائد → دفعة مقدمة. الترحيل عبر
 * POST /finance/documents/collect (محرّك postCustomerReceipt المعتمد، لا ازدواج قيد).
 */

type OpenInvoiceRow = {
  invoiceId: number;
  ref: string | null;
  outstanding: number;
  total: number;
  paidAmount: number;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
};
type Allocation = { applications: { invoiceId: number; amount: number }[]; leftover: number; appliedTotal: number };
type Preview = { openInvoices: OpenInvoiceRow[]; totalOutstanding: number; allocation: Allocation };

export default function CustomerCollectionPanel() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(todayLocal());
  const [branchId, setBranchId] = useState("");
  const [cashAccountCode, setCashAccountCode] = useState("");
  const [reference, setReference] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // تعديل يدوي للتخصيص: invoiceId → المبلغ المخصّص.
  const [manual, setManual] = useState<Record<number, number>>({});

  const previewMut = useApiMutation<Preview, any>("/finance/documents/collect/preview", "POST", []);
  const collectMut = useApiMutation<{ journalId: number }, any>("/finance/documents/collect", "POST", [["vouchers"], ["journal-manual"], ["customer-open-invoices"], ["invoices"]], {
    successMessage: "تم تسجيل التحصيل",
    onSuccess: () => navigate("/finance/vouchers"),
  });

  function validate(): string | null {
    if (!clientId) return "اختر العميل";
    if (!(Number(amount) > 0)) return "أدخل مبلغًا أكبر من صفر";
    if (!cashAccountCode) return "حدّد وجهة المال (الخزنة / البنك)";
    return null;
  }

  // التخصيص الحالي: اليدوي إن عُدِّل سطر، وإلا FIFO من المعاينة.
  function currentApplications(): { invoiceId: number; amount: number }[] | undefined {
    if (!preview) return undefined;
    if (Object.keys(manual).length === 0) return undefined; // FIFO تلقائي
    return preview.openInvoices
      .map((inv) => ({ invoiceId: inv.invoiceId, amount: roundMoney(manual[inv.invoiceId] ?? fifoAmountFor(inv.invoiceId)) }))
      .filter((a) => a.amount > 0);
  }
  function fifoAmountFor(invoiceId: number): number {
    return preview?.allocation.applications.find((a) => a.invoiceId === invoiceId)?.amount ?? 0;
  }
  function appliedAmountFor(invoiceId: number): number {
    return manual[invoiceId] ?? fifoAmountFor(invoiceId);
  }

  async function handlePreview() {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      const res = await previewMut.mutateAsync({ clientId: Number(clientId), amount: Number(amount), applications: currentApplications() });
      setPreview(res);
      setManual({});
    } catch (e: any) {
      setPreview(null);
      toast({ variant: "destructive", title: "تعذّرت المعاينة", description: e?.fix ?? e?.message ?? "" });
    }
  }

  function handleCollect() {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    collectMut.mutate({
      clientId: Number(clientId),
      amount: Number(amount),
      cashAccountCode,
      date: date || undefined,
      branchId: branchId ? Number(branchId) : undefined,
      reference: reference || undefined,
      applications: currentApplications(),
    });
  }

  const appliedTotal = preview ? roundMoney(preview.openInvoices.reduce((s, inv) => s + appliedAmountFor(inv.invoiceId), 0)) : 0;
  const leftover = roundMoney(Number(amount || 0) - appliedTotal);

  return (
    <CreatePageLayout title="تحصيل من عميل" subtitle="اختر العميل والمبلغ، والنظام يطبّق التحصيل على فواتيره المفتوحة (الأقدم أولًا) — الزائد دفعة مقدمة" backPath="/finance/vouchers">
      <div dir="rtl" className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ClientSelect value={clientId} onChange={(v) => { setClientId(String(v ?? "")); setPreview(null); }} label="العميل" required allowCreate={false} />
          {clientId && (
            <div className="md:col-span-3">
              {/* الكيان يقود التجربة: مستحقات العميل وحالته المالية أمام عينك قبل تسجيل التحصيل. */}
              <ClientContextCard clientId={clientId} section="invoice" />
            </div>
          )}
          <NumberField label="المبلغ المستلم" required min={0} value={amount || ""} onChange={(v) => { setAmount(Number(v) || 0); setPreview(null); }} placeholder="0.00" />
          <AccountSelect value={cashAccountCode} onChange={setCashAccountCode} label="وجهة المال (الخزنة / البنك)" required placeholder="اختر الخزنة أو البنك..." filter={(a: any) => isMoneyAccount(a)} />
          <FormFieldWrapper label="التاريخ"><DatePicker value={date} onChange={setDate} /></FormFieldWrapper>
          <BranchSelect value={branchId} onChange={(v) => setBranchId(String(v ?? ""))} label="الفرع" allowCreate={false} autoSelectOwnBranch />
          <TextField label="رقم المرجع (اختياري)" value={reference} onChange={setReference} placeholder="رقم الشيك / الحوالة" />
        </div>

        <div>
          <Button type="button" variant="outline" onClick={handlePreview} disabled={previewMut.isPending} rateLimitAware>
            {previewMut.isPending ? "جاري المعاينة..." : "معاينة التحصيل"}
          </Button>
        </div>

        {preview && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold">الفواتير المفتوحة ({preview.openInvoices.length})</span>
              <span className="text-muted-foreground">إجمالي المستحق: <span className="font-mono">{formatCurrency(preview.totalOutstanding)}</span></span>
            </div>

            {preview.openInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا فواتير مفتوحة لهذا العميل — كامل المبلغ سيُسجَّل دفعة مقدمة.</p>
            ) : (
              <DataTable<OpenInvoiceRow>
                noToolbar
                pageSize={0}
                className="text-xs"
                data={preview.openInvoices}
                rowKey={(inv) => inv.invoiceId}
                columns={[
                  { key: "ref", header: "الفاتورة", render: (inv) => inv.ref || `#${inv.invoiceId}` },
                  { key: "issueDate", header: "التاريخ", render: (inv) => inv.issueDate?.slice(0, 10) || "—" },
                  { key: "total", header: "الإجمالي", align: "end", render: (inv) => formatCurrency(inv.total) },
                  { key: "outstanding", header: "المتبقي", align: "end", render: (inv) => <span className="font-mono">{formatCurrency(inv.outstanding)}</span> },
                  {
                    key: "applied", header: "المخصّص", align: "end",
                    render: (inv) => (
                      <NumberField
                        label="المخصّص" hideLabel className="w-24" min={0}
                        value={appliedAmountFor(inv.invoiceId) || ""}
                        onChange={(v) => setManual((m) => ({ ...m, [inv.invoiceId]: Number(v) || 0 }))}
                      />
                    ),
                  },
                ] satisfies DataTableColumn<OpenInvoiceRow>[]}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm border-t pt-2">
              <span>المخصّص على الفواتير: <span className="font-mono font-semibold">{formatCurrency(appliedTotal)}</span></span>
              <span className={leftover > 0 ? "text-emerald-700" : leftover < 0 ? "text-destructive" : "text-muted-foreground"}>
                {leftover > 0 ? <>الزائد (دفعة مقدمة): <span className="font-mono font-semibold">{formatCurrency(leftover)}</span></> : leftover < 0 ? "التخصيص يتجاوز المبلغ المستلم" : "لا زائد"}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => navigate("/finance/vouchers")}>إلغاء</Button>
          <Button type="button" onClick={handleCollect} disabled={collectMut.isPending || leftover < 0} rateLimitAware>
            {collectMut.isPending ? "جاري التسجيل..." : "تسجيل التحصيل"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
