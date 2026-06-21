import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApiMutation, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface PreviewResponse {
  invoiceId: number;
  invoiceRef: string;
  canIssue: boolean;
  blockers: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  memoDate: string;
  chargeAmount: number;
  netAmount: number;
  vatAmount: number;
  journalLines: Array<{ accountCode: string; debit: number; credit: number; description: string }>;
  totals: { debit: number; credit: number; balanced: boolean };
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
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const issueMut = useApiMutation(
    `/finance/invoices/${invoiceId}/debit-memo`, "POST",
    [["invoice-detail", String(invoiceId)], ["invoices"]],
  );

  useEffect(() => {
    if (!open) return;
    const n = Number(amount);
    if (!n || n <= 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError(null);
      try {
        const res = await apiFetch<PreviewResponse>(
          `/finance/invoices/${invoiceId}/debit-memo/preview`,
          { method: "POST", body: JSON.stringify({ amount: n, vatIncluded, memoDate }) },
        );
        if (cancelled) return;
        setPreview(res);
      } catch (err: any) {
        if (cancelled) return;
        setPreviewError(err?.message ?? "تعذّر حساب المعاينة");
        setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [amount, vatIncluded, memoDate, open, invoiceId]);

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

        {previewing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <Loader2 className="h-4 w-4 animate-spin" /> جاري حساب المعاينة...
          </div>
        )}

        {previewError && (
          <div className="mt-3 p-3 border border-destructive/40 bg-destructive/5 rounded text-sm text-destructive">
            {previewError}
          </div>
        )}

        {preview && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className={`p-3 rounded border flex items-start gap-2 ${
              preview.canIssue
                ? "bg-emerald-50/40 border-emerald-300"
                : "bg-destructive/5 border-destructive/40"
            }`}>
              {preview.canIssue
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                : <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
              <p className={`text-sm font-bold ${preview.canIssue ? "text-emerald-700" : "text-destructive"}`}>
                {preview.canIssue ? "جاهز للإصدار" : "لا يمكن الإصدار — راجع المشاكل أدناه"}
              </p>
            </div>

            {preview.blockers.length > 0 && (
              <div className="border border-destructive/40 rounded p-3 bg-destructive/5">
                <p className="text-xs font-semibold text-destructive mb-1">
                  مشاكل تمنع الإصدار:
                </p>
                <ul className="text-xs space-y-1">
                  {preview.blockers.map((b, i) => (
                    <li key={i} className="text-destructive">• {b.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-muted">
                <p className="text-muted-foreground">صافي</p>
                <p className="font-mono font-bold">{formatCurrency(preview.netAmount)}</p>
              </div>
              <div className="p-2 rounded bg-status-info-surface text-status-info-foreground">
                <p className="opacity-70">ضريبة</p>
                <p className="font-mono font-bold">{formatCurrency(preview.vatAmount)}</p>
              </div>
              <div className="p-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                <p className="opacity-70">إجمالي الإشعار</p>
                <p className="font-mono font-bold">{formatCurrency(preview.chargeAmount)}</p>
              </div>
            </div>

            <div className="border rounded">
              <p className="text-xs font-semibold p-2 border-b bg-muted">
                القيد المحاسبي المُولّد ({preview.journalLines.length} سطر)
                <Badge className="ms-2" variant={preview.totals.balanced ? "default" : "destructive"}>
                  {preview.totals.balanced ? "متوازن" : "غير متوازن"}
                </Badge>
              </p>
              <div className="text-xs">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-muted-foreground bg-muted/50">
                    <tr>
                      <th className="text-start p-2 font-medium">الحساب</th>
                      <th className="text-start p-2 font-medium">البيان</th>
                      <th className="text-end p-2 font-medium">مدين</th>
                      <th className="text-end p-2 font-medium">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.journalLines.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">{l.accountCode}</td>
                        <td className="p-2 text-muted-foreground">{l.description}</td>
                        <td className="p-2 text-end font-mono">{l.debit > 0 ? formatCurrency(l.debit) : "—"}</td>
                        <td className="p-2 text-end font-mono">{l.credit > 0 ? formatCurrency(l.credit) : "—"}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-bold">
                      <td className="p-2" colSpan={2}>الإجمالي</td>
                      <td className="p-2 text-end font-mono">{formatCurrency(preview.totals.debit)}</td>
                      <td className="p-2 text-end font-mono">{formatCurrency(preview.totals.credit)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            </div>
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
