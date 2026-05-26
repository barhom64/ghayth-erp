import { useState, useEffect } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiMutation, apiFetch } from "@/lib/api";
import {
  FormShell,
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Send, FileText, Settings2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * ZATCA — invoice/expense action cluster.
 *
 * Phase D / Finance gap. Closes 4 unused-backend endpoints by
 * exposing them as a single component slotted into the
 * invoice-detail and expense-detail pages:
 *
 *   GET   /finance/zatca/invoice/:id/xml
 *     → "عرض XML" — opens the ZATCA-compliant UBL 2.1 XML for
 *       the invoice in a modal. Useful for ops who need to copy
 *       the XML into a third-party validator before submission,
 *       or for auditors checking what was actually sent to
 *       Fatoora.
 *
 *   POST  /finance/zatca/invoice/:id/submit
 *     → "إرسال للهيئة" — already wired on invoice-detail. The
 *       button here is for parity with expenses; for invoices
 *       we keep the existing card and let this component handle
 *       only the new actions.
 *
 *   POST  /finance/zatca/expense/:id/submit
 *     → "إرسال المصروف للهيئة" — submits an expense (treated as
 *       a B2B "buyer" record for tax purposes) to Fatoora. The
 *       same simulated-sandbox / live-mode logic as the invoice
 *       flow.
 *
 *   PATCH /finance/zatca/{invoice|expense}/:id
 *     → "إعدادات ZATCA" — dialog to toggle isTaxLinked and set
 *       invoiceTypeCode (388 standard / 381 credit memo / 383
 *       debit memo), taxCategoryCode (S standard / Z zero-rated
 *       / E exempt), and exemptionReason (free text for E).
 *       This has to happen BEFORE submission — the submit
 *       endpoint refuses to send anything not flagged
 *       isTaxLinked=true.
 *
 * Entity-type parameter ("invoice" | "expense") switches the
 * URL prefix; both share the same patch payload shape so the
 * settings dialog component is generic.
 */

interface ZatcaSubject {
  id: number;
  ref?: string | null;
  isTaxLinked?: boolean;
  invoiceTypeCode?: string | null;
  taxCategoryCode?: string | null;
  exemptionReason?: string | null;
  zatcaStatus?: string | null;
}

const INVOICE_TYPE_OPTIONS = [
  { value: "388", label: "388 — فاتورة قياسية" },
  { value: "381", label: "381 — إشعار دائن" },
  { value: "383", label: "383 — إشعار مدين" },
];

const TAX_CATEGORY_OPTIONS = [
  { value: "S", label: "S — قياسية (15%)" },
  { value: "Z", label: "Z — نسبة صفرية" },
  { value: "E", label: "E — معفاة من الضريبة" },
  { value: "O", label: "O — خارج نطاق الضريبة" },
];

const patchSchema = z.object({
  isTaxLinked: z.boolean(),
  invoiceTypeCode: z.enum(["388", "381", "383"]),
  taxCategoryCode: z.enum(["S", "Z", "E", "O"]),
  exemptionReason: z.string().optional(),
});
type PatchForm = z.infer<typeof patchSchema>;

export function ZatcaActions({
  entityType,
  subject,
  onRefresh,
  invalidateKeys,
}: {
  entityType: "invoice" | "expense";
  subject: ZatcaSubject;
  onRefresh: () => void;
  invalidateKeys: ReadonlyArray<readonly string[]>;
}) {
  const [showXml, setShowXml] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <Card className="border">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          هيئة الزكاة والضريبة (ZATCA / Fatoora)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowSettings(true)}
          className="gap-1.5"
        >
          <Settings2 className="h-4 w-4" />
          إعدادات الفاتورة الضريبية
        </Button>
        {entityType === "invoice" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowXml(true)}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" />
            عرض XML
          </Button>
        )}
        {entityType === "expense" && (
          <SubmitExpenseButton
            subject={subject}
            invalidateKeys={invalidateKeys}
            onSubmitted={onRefresh}
          />
        )}
        <ZatcaStatusChip status={subject.zatcaStatus} isTaxLinked={subject.isTaxLinked} />
      </CardContent>

      {showSettings && (
        <ZatcaSettingsDialog
          entityType={entityType}
          subject={subject}
          invalidateKeys={invalidateKeys}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            onRefresh();
          }}
        />
      )}
      {showXml && entityType === "invoice" && (
        <XmlPreviewDialog invoiceId={subject.id} onClose={() => setShowXml(false)} />
      )}
    </Card>
  );
}

function ZatcaStatusChip({
  status,
  isTaxLinked,
}: {
  status?: string | null;
  isTaxLinked?: boolean;
}) {
  if (!isTaxLinked) {
    return (
      <span className="text-xs px-2 py-1 rounded bg-surface-subtle text-muted-foreground">
        غير مربوطة بالهيئة
      </span>
    );
  }
  if (!status) {
    return (
      <span className="text-xs px-2 py-1 rounded bg-status-info-surface text-status-info-foreground">
        جاهزة للإرسال
      </span>
    );
  }
  const variantClass =
    status === "accepted"
      ? "bg-status-success-surface text-status-success-foreground"
      : status === "rejected" || status === "error"
        ? "bg-status-error-surface text-status-error-foreground"
        : "bg-status-warning-surface text-status-warning-foreground";
  return (
    <span className={`text-xs px-2 py-1 rounded ${variantClass}`}>
      الحالة: {status}
    </span>
  );
}

function ZatcaSettingsDialog({
  entityType,
  subject,
  invalidateKeys,
  onClose,
  onSaved,
}: {
  entityType: "invoice" | "expense";
  subject: ZatcaSubject;
  invalidateKeys: ReadonlyArray<readonly string[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Two separate mutations — one per backend endpoint — so the
  // wiring audit can see each URL as a literal segment.
  // The component picks the right one based on entityType.
  const invoiceMut = useApiMutation<unknown, PatchForm>(
    `/finance/zatca/invoice/${subject.id}`,
    "PATCH",
    invalidateKeys.map((k) => Array.from(k)),
    { successMessage: "تم حفظ إعدادات الفاتورة الضريبية" },
  );
  const expenseMut = useApiMutation<unknown, PatchForm>(
    `/finance/zatca/expense/${subject.id}`,
    "PATCH",
    invalidateKeys.map((k) => Array.from(k)),
    { successMessage: "تم حفظ إعدادات المصروف الضريبية" },
  );
  const mut = entityType === "invoice" ? invoiceMut : expenseMut;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            إعدادات ZATCA — {entityType === "invoice" ? "فاتورة" : "مصروف"} {subject.ref ?? `#${subject.id}`}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={patchSchema}
          defaultValues={{
            isTaxLinked: subject.isTaxLinked ?? false,
            invoiceTypeCode:
              (subject.invoiceTypeCode as PatchForm["invoiceTypeCode"]) ?? "388",
            taxCategoryCode:
              (subject.taxCategoryCode as PatchForm["taxCategoryCode"]) ?? "S",
            exemptionReason: subject.exemptionReason ?? "",
          }}
          submitLabel="حفظ الإعدادات"
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
          <TaxLinkedSwitch />
          <FormGrid cols={2}>
            <FormSelectField
              name="invoiceTypeCode"
              label="نوع الفاتورة"
              required
              options={INVOICE_TYPE_OPTIONS}
            />
            <FormSelectField
              name="taxCategoryCode"
              label="فئة الضريبة"
              required
              options={TAX_CATEGORY_OPTIONS}
            />
          </FormGrid>
          <FormTextareaField
            name="exemptionReason"
            label="سبب الإعفاء (مطلوب إذا كانت الفئة E)"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            يجب تفعيل "الربط مع هيئة الزكاة" قبل الإرسال — الفواتير غير المربوطة لن يقبلها
            الخادم. الفواتير القياسية تستخدم 388 / فئة S، وإذا تم تعديل الإصدار لاحقاً سيُنشأ
            UUID + بصمة جديدة عند الإرسال التالي.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function TaxLinkedSwitch() {
  // Plain react-hook-form integration via shadcn Switch — there's no
  // dedicated FormSwitchField in the ui-core kit yet. The Controller
  // pattern would be cleaner but we only have one field here so a
  // local watch/setValue is enough.
  const { watch, setValue } = useFormContext<PatchForm>();
  const value = watch("isTaxLinked");
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <Label className="text-sm font-medium">ربط مع هيئة الزكاة</Label>
        <p className="text-xs text-muted-foreground">
          تُحال الفاتورة إلى Fatoora عند الإرسال
        </p>
      </div>
      <Switch
        checked={value}
        onCheckedChange={(v) => setValue("isTaxLinked", v, { shouldDirty: true })}
      />
    </div>
  );
}

function XmlPreviewDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: number;
  onClose: () => void;
}) {
  const [xml, setXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useToast();

  // useApiQuery defaults to JSON parsing; the XML endpoint returns
  // application/xml, so we call apiFetch with responseType:"text" to
  // keep the same auth + 401-refresh + 429-handling as every other
  // API call on the page.
  useEffect(() => {
    (async () => {
      try {
        const text = await apiFetch<string>(`/finance/zatca/invoice/${invoiceId}/xml`, {
          responseType: "text",
        });
        setXml(text);
      } catch (e: any) {
        setErr(e.message || "خطأ في تحميل XML");
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId]);

  const handleCopy = async () => {
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml);
      toast({ title: "تم النسخ" });
    } catch {
      toast({ title: "فشل النسخ", variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            ZATCA UBL XML
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            جاري إنشاء XML...
          </div>
        ) : err ? (
          <p className="text-sm text-status-error-foreground">{err}</p>
        ) : (
          <>
            <div className="flex justify-end gap-2 mb-2">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                نسخ XML
              </Button>
            </div>
            <pre
              dir="ltr"
              className="flex-1 overflow-auto rounded-md bg-surface-subtle p-3 text-xs font-mono whitespace-pre-wrap"
            >
              {xml}
            </pre>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubmitExpenseButton({
  subject,
  invalidateKeys,
  onSubmitted,
}: {
  subject: ZatcaSubject;
  invalidateKeys: ReadonlyArray<readonly string[]>;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const mut = useApiMutation<{ status?: string }, Record<string, never>>(
    `/finance/zatca/expense/${subject.id}/submit`,
    "POST",
    invalidateKeys.map((k) => Array.from(k)),
    { successMessage: "تم إرسال المصروف للهيئة", onSuccess: () => onSubmitted() },
  );

  const handleSubmit = () => {
    if (!subject.isTaxLinked) {
      toast({
        title: "غير مربوط بالهيئة",
        description: 'فعّل "الربط مع هيئة الزكاة" من إعدادات الفاتورة أولاً',
        variant: "destructive",
      });
      return;
    }
    mut.mutate({});
  };

  return (
    <GuardedButton
      perm="finance:approve"
      size="sm"
      onClick={handleSubmit}
      disabled={mut.isPending}
      rateLimitAware
      className="gap-1.5"
    >
      {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      إرسال للهيئة
    </GuardedButton>
  );
}
