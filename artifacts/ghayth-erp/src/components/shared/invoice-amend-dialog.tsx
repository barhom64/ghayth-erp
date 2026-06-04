import { useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, FileCheck2, Loader2 } from "lucide-react";

// ZATCA invoice amendment dialog. Wraps POST /finance/invoices/:id/amend
// which atomically:
//   1. Issues a credit memo for the original invoice (full reversal,
//      including COGS/inventory if the lines carried products).
//   2. Issues a NEW invoice with a fresh sequential number copied from
//      the original (with the operator's reason in the description).
//   3. Links amendedFromInvoiceId ↔ amendedToInvoiceId on both rows.
//
// On success the operator is navigated to the new invoice so they can
// adjust the lines / amounts in the draft before approving it. The
// original invoice transitions to status='amended' and shows the
// credit memo on its history tab.

interface InvoiceAmendDialogProps {
  invoiceId: number;
  invoiceRef: string;
  invoiceTotal: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceAmendDialog({
  invoiceId, invoiceRef, invoiceTotal, open, onOpenChange,
}: InvoiceAmendDialogProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amendMut = useApiMutation<{
    newInvoiceId: number;
    newInvoiceRef: string;
    creditMemoRef: string;
  }, { reason: string }>(
    `/finance/invoices/${invoiceId}/amend`,
    "POST",
    [["invoices"], ["credit-memos"]],
  );

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({ variant: "destructive", title: "سبب التعديل مطلوب" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await amendMut.mutateAsync({ reason: reason.trim() });
      toast({
        title: "تم التعديل بنجاح",
        description: `إشعار دائن ${result.creditMemoRef} + فاتورة جديدة ${result.newInvoiceRef}`,
      });
      onOpenChange(false);
      // Navigate the operator to the NEW invoice so they can edit the
      // draft lines + approve it. The original stays accessible from
      // its detail page (status='amended', shows credit memo link).
      setLocation(`/finance/invoices/${result.newInvoiceId}`);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر تعديل الفاتورة",
        description: err?.fix ?? err?.message ?? "خطأ غير معروف",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-status-info-foreground" />
            تعديل فاتورة ZATCA
          </DialogTitle>
          <DialogDescription>
            وفقاً لأنظمة هيئة الزكاة والضرائب، لا يمكن تعديل فاتورة مُصدَرة مباشرةً.
            سيقوم النظام تلقائياً بالعمليتين التاليتين كحزمة واحدة:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-status-warning-surface border border-status-warning-surface px-3 py-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-status-warning-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-status-warning-foreground">
                  الإجراء التلقائي:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-status-warning-foreground/90">
                  <li>إصدار إشعار دائن للفاتورة الأصلية <Badge variant="outline" className="ms-1 font-mono">{invoiceRef}</Badge> بكامل المبلغ (يعكس الذمم + الضريبة + المخزون إن وُجد).</li>
                  <li>إصدار فاتورة جديدة برقم متسلسل جديد، نُسخت من البنود الحالية ويمكنك تعديلها قبل اعتمادها.</li>
                  <li>ربط الفاتورتين تلقائياً في سجل التدقيق وتقارير ZATCA.</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amend-reason">سبب التعديل <span className="text-destructive">*</span></Label>
            <Textarea
              id="amend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تصحيح كمية البند الثاني / إضافة خصم / تعديل عنوان العميل"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              يظهر السبب على إشعار الدائن وفي ملف ZATCA. مطلوب.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason.trim()} rateLimitAware>
            {submitting ? (
              <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جاري التنفيذ…</>
            ) : (
              "إصدار التعديل"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
