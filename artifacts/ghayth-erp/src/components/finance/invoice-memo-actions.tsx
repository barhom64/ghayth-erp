import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import {
  FormShell,
  FormTextField,
  FormDateField,
  FormTextareaField,
  FormGrid,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStateWrapper } from "@/components/shared/page-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileMinus, FilePlus, History, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFormContext } from "react-hook-form";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

/**
 * Invoice — credit/debit memos + send-to-customer actions.
 *
 * Phase D / Finance gap. Closes 4 unused-backend endpoints on
 * the invoice detail page:
 *
 *   POST /finance/invoices/:id/credit-memo
 *     → إشعار دائن. Reduces the customer's AR balance by the
 *       net + reverses output VAT. Common case: returned goods,
 *       price adjustment after a complaint. The backend
 *       enforces "amount ≤ open balance" so partial credits are
 *       legal but you can't credit beyond what's outstanding.
 *
 *   POST /finance/invoices/:id/debit-memo
 *     → إشعار مدين. Inverse — adds to the customer's AR and
 *       output VAT. Common case: late fees, undercharge fix,
 *       additional services billed against the same invoice.
 *
 *   GET  /finance/invoices/:id/memos
 *     → "السجل" — pre-existing memo history. Shows the running
 *       credit/debit ledger keyed to this invoice so ops can
 *       see what's already been issued before firing another
 *       adjustment.
 *
 *   POST /finance/invoices/:id/send
 *     → "إرسال للعميل" — fires the email/WhatsApp delivery
 *       notification + flips status draft → sent via the shared
 *       lifecycle engine. Useful when the create-flow chose
 *       NOT to auto-send (e.g. draft → review → manually send).
 */

interface InvoiceSnapshot {
  id: number;
  ref: string;
  status: string;
  total: number | string;
  paidAmount: number | string;
  vatRate?: number | string | null;
}

interface MemoRow {
  id: number;
  type: "credit" | "debit";
  ref: string;
  amount: number | string;
  netAmount: number | string;
  vatAmount: number | string;
  reason: string;
  memoDate: string;
  createdAt: string;
  createdByName?: string | null;
}

const memoSchema = z.object({
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
  reason: z.string().trim().min(1, "السبب مطلوب"),
  vatIncluded: z.boolean(),
  memoDate: z.string().min(1, "التاريخ مطلوب"),
});
type MemoForm = z.infer<typeof memoSchema>;

const todayISO = () => new Date().toISOString().slice(0, 10);

export function InvoiceMemoActions({
  invoice,
  onRefresh,
}: {
  invoice: InvoiceSnapshot;
  onRefresh: () => void;
}) {
  const [showCreditMemo, setShowCreditMemo] = useState(false);
  const [showDebitMemo, setShowDebitMemo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const canSend = ["draft", "pending"].includes(invoice.status);
  const canMemo = !["cancelled", "draft"].includes(invoice.status);

  const handleSend = async () => {
    setSending(true);
    try {
      await apiFetch(`/finance/invoices/${invoice.id}/send`, { method: "POST" });
      toast({ title: "تم إرسال الفاتورة للعميل" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "فشل الإرسال", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FilePlus className="h-4 w-4" />
          إشعارات وتسليم
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {canSend && (
          <GuardedButton
            perm="finance:create"
            size="sm"
            onClick={handleSend}
            disabled={sending}
            className="gap-1.5"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            إرسال للعميل
          </GuardedButton>
        )}
        {canMemo && (
          <>
            <GuardedButton
              perm="finance:create"
              size="sm"
              variant="outline"
              onClick={() => setShowCreditMemo(true)}
              className="gap-1.5"
            >
              <FileMinus className="h-4 w-4" />
              إشعار دائن
            </GuardedButton>
            <GuardedButton
              perm="finance:create"
              size="sm"
              variant="outline"
              onClick={() => setShowDebitMemo(true)}
              className="gap-1.5"
            >
              <FilePlus className="h-4 w-4" />
              إشعار مدين
            </GuardedButton>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowHistory(true)}
          className="gap-1.5"
        >
          <History className="h-4 w-4" />
          سجل الإشعارات
        </Button>
      </CardContent>

      {showCreditMemo && (
        <MemoDialog
          invoice={invoice}
          type="credit"
          onClose={() => setShowCreditMemo(false)}
          onSaved={() => {
            setShowCreditMemo(false);
            onRefresh();
          }}
        />
      )}
      {showDebitMemo && (
        <MemoDialog
          invoice={invoice}
          type="debit"
          onClose={() => setShowDebitMemo(false)}
          onSaved={() => {
            setShowDebitMemo(false);
            onRefresh();
          }}
        />
      )}
      {showHistory && (
        <MemoHistoryDialog invoice={invoice} onClose={() => setShowHistory(false)} />
      )}
    </Card>
  );
}

function MemoDialog({
  invoice,
  type,
  onClose,
  onSaved,
}: {
  invoice: InvoiceSnapshot;
  type: "credit" | "debit";
  onClose: () => void;
  onSaved: () => void;
}) {
  const remaining = Number(invoice.total) - Number(invoice.paidAmount);
  const isCredit = type === "credit";
  // Two separate mutations so the audit can see each URL literally.
  const creditMut = useApiMutation<unknown, MemoForm>(
    `/finance/invoices/${invoice.id}/credit-memo`,
    "POST",
    [["invoice-detail", String(invoice.id)], ["invoice-memos", String(invoice.id)]],
    { successMessage: "تم إصدار الإشعار الدائن" },
  );
  const debitMut = useApiMutation<unknown, MemoForm>(
    `/finance/invoices/${invoice.id}/debit-memo`,
    "POST",
    [["invoice-detail", String(invoice.id)], ["invoice-memos", String(invoice.id)]],
    { successMessage: "تم إصدار الإشعار المدين" },
  );
  const mut = isCredit ? creditMut : debitMut;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCredit ? (
              <FileMinus className="h-4 w-4" />
            ) : (
              <FilePlus className="h-4 w-4" />
            )}
            {isCredit ? "إشعار دائن" : "إشعار مدين"} — {invoice.ref}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-surface-subtle p-3 text-sm space-y-1 mb-3">
          <div className="flex justify-between">
            <span>إجمالي الفاتورة:</span>
            <span className="font-semibold">{formatCurrency(Number(invoice.total))}</span>
          </div>
          <div className="flex justify-between">
            <span>المتبقي المفتوح:</span>
            <span className="font-semibold text-status-info-foreground">
              {formatCurrency(remaining)}
            </span>
          </div>
          {invoice.vatRate != null && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>نسبة الضريبة:</span>
              <span>{Number(invoice.vatRate)}%</span>
            </div>
          )}
        </div>
        <FormShell
          schema={memoSchema}
          defaultValues={{
            amount: 0,
            reason: "",
            vatIncluded: true,
            memoDate: todayISO(),
          }}
          submitLabel={isCredit ? "إصدار الإشعار الدائن" : "إصدار الإشعار المدين"}
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onSaved();
          }}
        >
          <FormGrid cols={2}>
            <FormTextField name="amount" label="المبلغ" type="number" required />
            <FormDateField name="memoDate" label="تاريخ الإشعار" required />
          </FormGrid>
          <VatIncludedSwitch />
          <FormTextareaField name="reason" label="السبب" rows={3} required />
          <p className="text-xs text-muted-foreground">
            {isCredit
              ? "سيتم إنشاء قيد محاسبي (مدين 4100 مرتجعات / مدين 2300 ض.ق.م / دائن 1200 ذمم) ويُخفَّض الرصيد المفتوح للفاتورة."
              : "سيتم إنشاء قيد محاسبي (مدين 1200 ذمم / دائن 4000 إيرادات / دائن 2300 ض.ق.م) ويُزاد الرصيد المفتوح للفاتورة."}
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function VatIncludedSwitch() {
  const { watch, setValue } = useFormContext<MemoForm>();
  const value = watch("vatIncluded");
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <Label className="text-sm font-medium">المبلغ شامل الضريبة</Label>
        <p className="text-xs text-muted-foreground">
          عند التفعيل يُحتسب الصافي + الضريبة من المبلغ المُدخل، وإلا يُضاف على القيمة الصافية
        </p>
      </div>
      <Switch
        checked={value}
        onCheckedChange={(v) => setValue("vatIncluded", v, { shouldDirty: true })}
      />
    </div>
  );
}

function MemoHistoryDialog({
  invoice,
  onClose,
}: {
  invoice: InvoiceSnapshot;
  onClose: () => void;
}) {
  const { data, isLoading, error, refetch } = useApiQuery<{
    data: MemoRow[];
    summary?: { totalCredit?: number; totalDebit?: number; netAdjustment?: number };
  }>(
    ["invoice-memos", String(invoice.id)],
    `/finance/invoices/${invoice.id}/memos`,
  );

  const rows = data?.data ?? [];

  const columns: DataTableColumn<MemoRow>[] = [
    {
      key: "memoDate",
      header: "التاريخ",
      render: (r) => (r.memoDate ? formatDateAr(r.memoDate) : "—"),
    },
    {
      key: "type",
      header: "النوع",
      render: (r) => (
        <Badge variant={r.type === "credit" ? "destructive" : "default"}>
          {r.type === "credit" ? "دائن" : "مدين"}
        </Badge>
      ),
    },
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      ltr: true,
    },
    {
      key: "netAmount",
      header: "الصافي",
      render: (r) => formatCurrency(Number(r.netAmount)),
    },
    {
      key: "vatAmount",
      header: "الضريبة",
      render: (r) => formatCurrency(Number(r.vatAmount)),
    },
    {
      key: "amount",
      header: "الإجمالي",
      render: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span>,
    },
    { key: "reason", header: "السبب" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            سجل الإشعارات — {invoice.ref}
          </DialogTitle>
        </DialogHeader>
        <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
          {data?.summary && (
            <div className="grid grid-cols-3 gap-2 text-sm mb-3">
              <div className="rounded bg-status-error-surface text-status-error-foreground p-2">
                <div className="text-xs">مجموع الدائن</div>
                <div className="font-semibold">
                  {formatCurrency(data.summary.totalCredit ?? 0)}
                </div>
              </div>
              <div className="rounded bg-status-success-surface text-status-success-foreground p-2">
                <div className="text-xs">مجموع المدين</div>
                <div className="font-semibold">
                  {formatCurrency(data.summary.totalDebit ?? 0)}
                </div>
              </div>
              <div className="rounded bg-surface-subtle p-2">
                <div className="text-xs">صافي التعديل</div>
                <div className="font-semibold">
                  {formatCurrency(data.summary.netAdjustment ?? 0)}
                </div>
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(r) => r.id}
              emptyMessage="لا توجد إشعارات سابقة لهذه الفاتورة"
            />
          </div>
        </PageStateWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
