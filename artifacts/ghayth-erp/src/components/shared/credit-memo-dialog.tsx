import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { AlertTriangle } from "lucide-react";
import {
  useMemoPreview, MemoPreviewState, MemoCanIssueBanner,
  MemoBlockersList, MemoAmountsGrid, MemoJournalPreview,
  type MemoJournalLine, type MemoTotals, type MemoBlocker,
} from "@/components/shared/memo-dialog-kit";

interface PreviewResponse {
  invoiceId: number;
  invoiceRef: string;
  canIssue: boolean;
  blockers: MemoBlocker[];
  warnings: MemoBlocker[];
  memoDate: string;
  creditAmount: number;
  netAmount: number;
  vatAmount: number;
  reversalRatio: number;
  cogsTotal: number;
  cogsLineSnapshots: Array<{
    invoiceLineId: number;
    newReversedAmount: number;
    cogsReversed: number;
    allocations: any[];
  }>;
  cogsReversalWarnings: MemoBlocker[];
  journalLines: MemoJournalLine[];
  totals: MemoTotals;
}

interface Props {
  invoiceId: number;
  invoiceRef: string;
  openBalance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued?: () => void;
}

export function CreditMemoDialog({
  invoiceId, invoiceRef, openBalance, open, onOpenChange, onIssued,
}: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("");
  const [vatIncluded, setVatIncluded] = useState(true);
  const [memoDate, setMemoDate] = useState<string>(todayLocal());
  const [reason, setReason] = useState<string>("");

  const { preview, previewing, previewError, setPreview } = useMemoPreview<PreviewResponse>({
    open, endpoint: `/finance/invoices/${invoiceId}/credit-memo/preview`,
    amount, vatIncluded, memoDate,
  });

  const issueMut = useApiMutation(
    `/finance/invoices/${invoiceId}/credit-memo`, "POST",
    [["invoice-detail", String(invoiceId)], ["invoices"]],
  );

  const handleIssue = async () => {
    if (!preview?.canIssue) return;
    try {
      await issueMut.mutateAsync({
        amount: Number(amount),
        vatIncluded,
        memoDate,
        reason: reason || undefined,
      });
      toast({ title: "تم إصدار الإشعار الدائن بنجاح" });
      onOpenChange(false);
      setAmount(""); setReason(""); setPreview(null);
      onIssued?.();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "حدث خطأ",
        description: err?.fix ?? err?.message ?? "تعذّر إصدار الإشعار",
      });
    }
  };

  const canSubmit = preview?.canIssue && !issueMut.isPending && Number(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>إصدار إشعار دائن — فاتورة {invoiceRef}</DialogTitle>
          <DialogDescription>
            الرصيد المفتوح: <span className="font-bold">{formatCurrency(openBalance)}</span>
            {" — "}
            معاينة الحركة المحاسبية + عكس تكلفة البضاعة (COGS) تظهر تلقائياً قبل الإصدار.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="cm-amount">المبلغ</Label>
            <Input
              id="cm-amount" type="number" min={0} max={openBalance} step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" dir="ltr"
            />
          </div>
          <div>
            <Label htmlFor="cm-date">تاريخ الإشعار</Label>
            <Input
              id="cm-date" type="date" value={memoDate}
              onChange={(e) => setMemoDate(e.target.value)} dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cm-vat">نمط المبلغ</Label>
            <div className="flex items-center gap-2 h-10">
              <Switch id="cm-vat" checked={vatIncluded} onCheckedChange={setVatIncluded} />
              <span className="text-sm">{vatIncluded ? "شامل الضريبة" : "غير شامل"}</span>
            </div>
          </div>
        </div>

        <div className="mt-2">
          <Label htmlFor="cm-reason">سبب الإشعار (يظهر على الـ JE)</Label>
          <Textarea
            id="cm-reason" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: مرتجع كمية / خصم تجاري متفق عليه / تصحيح فاتورة"
            rows={2}
          />
        </div>

        <MemoPreviewState previewing={previewing} previewError={previewError} />

        {preview && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <MemoCanIssueBanner canIssue={preview.canIssue}>
              <p className="text-xs text-muted-foreground mt-0.5">
                نسبة العكس من إجمالي الفاتورة: <span className="font-mono">{(preview.reversalRatio * 100).toFixed(2)}%</span>
              </p>
            </MemoCanIssueBanner>

            <MemoBlockersList blockers={preview.blockers} />

            {(preview.warnings.length > 0 || preview.cogsReversalWarnings.length > 0) && (
              <div className="border border-status-warning-surface rounded p-3 bg-status-warning-surface/40">
                <p className="text-xs font-semibold text-status-warning-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  تنبيهات (يجوز الإصدار مع المراجعة):
                </p>
                <ul className="text-xs space-y-1">
                  {[...preview.warnings, ...preview.cogsReversalWarnings].map((w, i) => (
                    <li key={i} className="text-status-warning-foreground">• {w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <MemoAmountsGrid
              netAmount={preview.netAmount}
              vatAmount={preview.vatAmount}
              total={preview.creditAmount}
            />

            {preview.cogsTotal > 0 && (
              <div className="p-3 rounded border border-purple-200 bg-purple-50/40">
                <p className="text-xs font-semibold mb-1 text-purple-800">
                  عكس تكلفة البضاعة (COGS) — استعادة مخزون
                </p>
                <p className="text-xs text-muted-foreground">
                  إجمالي COGS المعكوس: <span className="font-mono font-bold text-purple-700">{formatCurrency(preview.cogsTotal)}</span>
                  {" — "}
                  عدد البنود المتأثرة: <span className="font-mono">{preview.cogsLineSnapshots.length}</span>
                </p>
              </div>
            )}

            <MemoJournalPreview journalLines={preview.journalLines} totals={preview.totals} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleIssue} disabled={!canSubmit} rateLimitAware>
            {issueMut.isPending ? "جاري الإصدار..." : "إصدار الإشعار الدائن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
