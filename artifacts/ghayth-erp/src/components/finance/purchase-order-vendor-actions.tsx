import { useState } from "react";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import {
  FormShell,
  FormTextField,
  FormDateField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, FileText, CalendarClock } from "lucide-react";

/**
 * Purchase Order — post-approval vendor-side actions.
 *
 * Phase D / Finance gap. Closes 3 unused-backend endpoints in
 * the PO lifecycle that had no UI lever:
 *
 *   PATCH /finance/purchase-orders/:id/vendor-confirm
 *     → Vendor has accepted the PO and committed to a delivery
 *       date. Transitions pending|sent → confirmed. Available
 *       once the PO is sent to the vendor; the operator captures
 *       the vendor's committed delivery date and any caveats.
 *
 *   POST /finance/purchase-orders/:id/match-invoice
 *     → After goods receipt, match the supplier's invoice
 *       against the PO + GR. Runs a 3-way match (PR/PO/GR vs.
 *       invoice) on the server with a 5% tolerance band — if
 *       any leg drifts past 5% the response is "invoice_mismatch"
 *       and a notification fires to the assigned approver.
 *
 *   POST /finance/purchase-orders/:id/schedule-payment
 *     → After invoice match, schedule the payment date + amount.
 *       Posts a draft AP journal (DR 2100 AP / CR 1100 cash) with
 *       sourceKey-based idempotency, so the cashier can see the
 *       scheduled payment in the bank-reconciliation workflow.
 *
 * Each action is gated by the PO's current status so the
 * operator can't fire a step out of order. Same lifecycle gates
 * the server enforces in applyTransition — we mirror them here
 * so disabled buttons show up greyed-out rather than producing
 * server-side rejection toasts.
 */

interface POSnapshot {
  id: number;
  ref: string;
  status: string;
  totalAmount: number | string;
  supplierName: string | null;
}

const vendorConfirmSchema = z.object({
  confirmedDelivery: z.string().min(1, "التاريخ المؤكد مطلوب"),
  notes: z.string().optional(),
});
type VendorConfirmForm = z.infer<typeof vendorConfirmSchema>;

const matchInvoiceSchema = z.object({
  supplierInvoiceRef: z.string().trim().min(1, "رقم فاتورة المورد مطلوب"),
  invoicedAmount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
  invoicedDate: z.string().optional(),
});
type MatchInvoiceForm = z.infer<typeof matchInvoiceSchema>;

const schedulePaymentSchema = z.object({
  paymentDate: z.string().min(1, "تاريخ الدفع مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
  method: z.enum(["bank_transfer", "cash", "cheque", "card"]),
  notes: z.string().optional(),
});
type SchedulePaymentForm = z.infer<typeof schedulePaymentSchema>;

const METHOD_OPTIONS = [
  { value: "bank_transfer", label: "حوالة بنكية" },
  { value: "cash", label: "نقدي" },
  { value: "cheque", label: "شيك" },
  { value: "card", label: "بطاقة" },
];

export function PurchaseOrderVendorActions({ po }: { po: POSnapshot }) {
  const [activeAction, setActiveAction] = useState<
    "vendor-confirm" | "match-invoice" | "schedule-payment" | null
  >(null);

  const canVendorConfirm = po.status === "pending" || po.status === "sent";
  const canMatchInvoice = po.status === "received" || po.status === "partially_received";
  const canSchedulePayment =
    po.status === "invoice_matched" || po.status === "invoiced";

  if (!canVendorConfirm && !canMatchInvoice && !canSchedulePayment) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            مراحل ما بعد الإنشاء
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canVendorConfirm && (
            <GuardedButton
              perm="finance.purchase:update"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setActiveAction("vendor-confirm")}
            >
              <ShieldCheck className="h-4 w-4" />
              تأكيد المورد للأمر
            </GuardedButton>
          )}
          {canMatchInvoice && (
            <GuardedButton
              perm="finance.purchase:create"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setActiveAction("match-invoice")}
            >
              <FileText className="h-4 w-4" />
              مطابقة فاتورة المورد
            </GuardedButton>
          )}
          {canSchedulePayment && (
            <GuardedButton
              perm="finance.purchase:create"
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveAction("schedule-payment")}
            >
              <CalendarClock className="h-4 w-4" />
              جدولة الدفعة
            </GuardedButton>
          )}
        </CardContent>
      </Card>

      {activeAction === "vendor-confirm" && (
        <VendorConfirmDialog po={po} onClose={() => setActiveAction(null)} />
      )}
      {activeAction === "match-invoice" && (
        <MatchInvoiceDialog po={po} onClose={() => setActiveAction(null)} />
      )}
      {activeAction === "schedule-payment" && (
        <SchedulePaymentDialog po={po} onClose={() => setActiveAction(null)} />
      )}
    </>
  );
}

function VendorConfirmDialog({ po, onClose }: { po: POSnapshot; onClose: () => void }) {
  const mut = useApiMutation<unknown, VendorConfirmForm>(
    `/finance/purchase-orders/${po.id}/vendor-confirm`,
    "PATCH",
    [["po-detail", String(po.id)], ["purchase-orders"]],
    { successMessage: "تم تسجيل تأكيد المورد" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تأكيد المورد لأمر الشراء {po.ref}</DialogTitle>
        </DialogHeader>
        <FormShell
          schema={vendorConfirmSchema}
          defaultValues={{ confirmedDelivery: "", notes: "" }}
          submitLabel="تسجيل التأكيد"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onClose();
          }}
        >
          <FormDateField name="confirmedDelivery" label="تاريخ التسليم المُؤكد" required />
          <FormTextareaField name="notes" label="ملاحظات المورد (اختياري)" rows={3} />
          <p className="text-xs text-muted-foreground">
            سيتم تحديث حالة الأمر إلى "مؤكد" وتعديل تاريخ التسليم المتوقع وفق ما أكده المورد.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function MatchInvoiceDialog({ po, onClose }: { po: POSnapshot; onClose: () => void }) {
  const mut = useApiMutation<
    { isMatched: boolean; status: string; variances: any },
    MatchInvoiceForm
  >(
    `/finance/purchase-orders/${po.id}/match-invoice`,
    "POST",
    [["po-detail", String(po.id)], ["po-match", String(po.id)], ["purchase-orders"]],
    { successMessage: "تم تسجيل المطابقة" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            مطابقة فاتورة المورد — {po.ref}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-surface-subtle p-3 text-sm space-y-1 mb-3">
          <div className="flex justify-between">
            <span>إجمالي أمر الشراء:</span>
            <span className="font-semibold">{Number(po.totalAmount).toLocaleString("ar-SA")} ر.س</span>
          </div>
          <div className="flex justify-between">
            <span>المورد:</span>
            <span className="font-medium">{po.supplierName ?? "—"}</span>
          </div>
        </div>
        <FormShell
          schema={matchInvoiceSchema}
          defaultValues={{
            supplierInvoiceRef: "",
            invoicedAmount: Number(po.totalAmount),
            invoicedDate: "",
          }}
          submitLabel="مطابقة"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onClose();
          }}
        >
          <FormTextField
            name="supplierInvoiceRef"
            label="رقم فاتورة المورد"
            required
            placeholder="INV-2026-…"
          />
          <FormGrid cols={2}>
            <FormTextField name="invoicedAmount" label="المبلغ المُفوتر" type="number" required />
            <FormDateField name="invoicedDate" label="تاريخ الفاتورة" />
          </FormGrid>
          <p className="text-xs text-muted-foreground">
            ستُنفَّذ مطابقة ثلاثية تلقائياً: طلب الشراء، أمر الشراء، الاستلام الفعلي. إذا تجاوز
            الفرق 5% سيتم تعليم الأمر بحالة <span className="font-medium">invoice_mismatch</span>{" "}
            وإشعار جهة الاعتماد.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function SchedulePaymentDialog({ po, onClose }: { po: POSnapshot; onClose: () => void }) {
  const mut = useApiMutation<unknown, SchedulePaymentForm>(
    `/finance/purchase-orders/${po.id}/schedule-payment`,
    "POST",
    [["po-detail", String(po.id)], ["purchase-orders"], ["payment-run"]],
    { successMessage: "تم جدولة الدفعة" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            جدولة دفعة لأمر الشراء {po.ref}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={schedulePaymentSchema}
          defaultValues={{
            paymentDate: "",
            amount: Number(po.totalAmount),
            method: "bank_transfer",
            notes: "",
          }}
          submitLabel="جدولة"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onClose();
          }}
        >
          <FormGrid cols={2}>
            <FormDateField name="paymentDate" label="تاريخ الدفع" required />
            <FormTextField name="amount" label="المبلغ" type="number" required />
          </FormGrid>
          <FormSelectField
            name="method"
            label="طريقة الدفع"
            required
            options={METHOD_OPTIONS}
          />
          <FormTextareaField name="notes" label="ملاحظات" rows={2} />
          <p className="text-xs text-muted-foreground">
            سيتم إنشاء قيد محاسبي مسودة (مدين 2100 ذمم موردين / دائن 1100 نقدية) وستظهر الدفعة في
            دفعة الدفع التالية للمراجعة والترحيل النهائي.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
