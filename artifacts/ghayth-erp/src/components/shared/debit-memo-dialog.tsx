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
import { todayLocal } from "@/lib/formatters";
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
  chargeAmount: number;
  netAmount: number;
  vatAmount: number;
  journalLines: MemoJournalLine[];
  totals: MemoTotals;
}

interface Props {
  invoiceId: number;
  invoiceRef: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued?: () => void;
}

export function DebitMemoDialog({
  invoiceId, invoiceRef, open, onOpenChange, onIssued,
}: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("");
  const [vatIncluded, setVatIncluded] = useState(true);
  const [memoDate, setMemoDate] = useState<string>(todayLocal());
  const [reason, setReason] = useState<string>("");

  const { preview, previewing, previewError, setPreview } = useMemoPreview<PreviewResponse>({
    open, endpoint: `/finance/invoices/${invoiceId}/debit-memo/preview`,
    amount, vatIncluded, memoDate,
  });

  const issueMut = useApiMutation(
    `/finance/invoices/${invoiceId}/debit-memo`, "POST",
    [["invoice-detail", String(invoiceId)], ["invoices"]],
  );

  const handleIssue = async () => {
    if (!preview?.canIssue || !reason.trim()) return;
    try {
      await issueMut.mutateAsync({
        amount: Number(amount),
        vatIncluded,
        memoDate,
        reason,
      });
      toast({ title: "تم إصدار الإشعار المدين بنجاح" });
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

  const canSubmit = preview?.canIssue && !issueMut.isPending && Number(amount) > 0 && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>إصدار إشعار مدين — فاتورة {invoiceRef}</DialogTitle>
          <DialogDescription>
            يُضيف مبلغاً إضافياً على فاتورة العميل (رسوم تأخير، خدمات إضافية، تصحيح بالزيادة).
            معاينة الحركة المحاسبية تظهر تلقائياً قبل الإصدار.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="dm-amount">المبلغ</Label>
            <Input
              id="dm-amount" type="number" min={0} step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" dir="ltr"
            />
          </div>
          <div>
            <Label htmlFor="dm-date">تاريخ الإشعار</Label>
            <Input
              id="dm-date" type="date" value={memoDate}
              onChange={(e) => setMemoDate(e.target.value)} dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="dm-vat">نمط المبلغ</Label>
            <div className="flex items-center gap-2 h-10">
              <Switch id="dm-vat" checked={vatIncluded} onCheckedChange={setVatIncluded} />
              <span className="text-sm">{vatIncluded ? "شامل الضريبة" : "غير شامل"}</span>
            </div>
          </div>
        </div>

        <div className="mt-2">
          <Label htmlFor="dm-reason">سبب الإشعار (مطلوب)</Label>
          <Textarea
            id="dm-reason" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: رسوم تأخير سداد / خدمة إضافية لم تكن في الفاتورة الأصلية"
            rows={2}
          />
        </div>

        <MemoPreviewState previewing={previewing} previewError={previewError} />

        {preview && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <MemoCanIssueBanner canIssue={preview.canIssue} />

            <MemoBlockersList blockers={preview.blockers} />

            <MemoAmountsGrid
              netAmount={preview.netAmount}
              vatAmount={preview.vatAmount}
              total={preview.chargeAmount}
            />

            <MemoJournalPreview journalLines={preview.journalLines} totals={preview.totals} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleIssue} disabled={!canSubmit} rateLimitAware>
            {issueMut.isPending ? "جاري الإصدار..." : "إصدار الإشعار المدين"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
