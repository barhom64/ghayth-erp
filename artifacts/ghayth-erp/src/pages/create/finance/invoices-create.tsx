import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormSwitchField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAppContext } from "@/contexts/app-context";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { NumberField } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";
import { ClientSelect, BranchSelect, CostCenterSelect } from "@/components/shared/entity-selects";

const INVOICE_TYPE_CODES = [
  { value: "388", label: "فاتورة ضريبية (388)" },
  { value: "381", label: "إشعار دائن (381)" },
  { value: "383", label: "إشعار مدين (383)" },
];

const TAX_CATEGORY_CODES = [
  { value: "S", label: "خاضع للضريبة (S)" },
  { value: "Z", label: "نسبة صفرية (Z)" },
  { value: "E", label: "معفى (E)" },
  { value: "O", label: "خارج نطاق الضريبة (O)" },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "0", label: "فوري (عند الاستلام)" },
  { value: "7", label: "7 أيام" },
  { value: "15", label: "15 يوم" },
  { value: "30", label: "30 يوم" },
  { value: "45", label: "45 يوم" },
  { value: "60", label: "60 يوم" },
  { value: "90", label: "90 يوم" },
];

const schema = z.object({
  clientId: z.string().min(1, "يرجى اختيار العميل"),
  description: z.string().optional(),
  date: z.string(),
  dueDate: z.string().optional(),
  vatRate: z.string(),
  branchId: z.string().min(1, "الفرع مطلوب"),
  companyId: z.string().optional(),
  costCenter: z.string().optional(),
  paymentTermsDays: z.string().optional(),
  notes: z.string().optional(),
  isTaxLinked: z.boolean(),
  invoiceTypeCode: z.string(),
  taxCategoryCode: z.string(),
  exemptionReason: z.string().optional(),
});

function ClientCard() {
  const { watch } = useFormContext();
  const clientId = watch("clientId") as string;
  if (!clientId) return null;
  return (
    <div className="mt-3">
      <ClientContextCard clientId={clientId} section="invoice" />
    </div>
  );
}

function TaxLinkedBlock() {
  const { watch } = useFormContext();
  const isTaxLinked = watch("isTaxLinked") as boolean;
  const taxCategoryCode = watch("taxCategoryCode") as string;
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
          <span className="text-status-success-foreground">🏛</span>
          ربط مع هيئة الزكاة والضريبة والجمارك
        </h3>
        <FormSwitchField name="isTaxLinked" label={isTaxLinked ? "مفعّل" : "غير مفعّل"} />
      </div>
      {isTaxLinked && (
        <FormGrid cols={3}>
          <FormSelectField name="invoiceTypeCode" label="نوع الفاتورة الضريبية" options={INVOICE_TYPE_CODES} />
          <FormSelectField name="taxCategoryCode" label="فئة الضريبة" options={TAX_CATEGORY_CODES} />
          {(taxCategoryCode === "E" || taxCategoryCode === "Z") && (
            <FormTextField name="exemptionReason" label="سبب الإعفاء / النسبة الصفرية" placeholder="أدخل سبب الإعفاء..." />
          )}
        </FormGrid>
      )}
    </div>
  );
}

function InvoiceTotals({ lines }: { lines: any[] }) {
  const { watch } = useFormContext();
  const vatRate = watch("vatRate") as string;
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + roundMoney(Number(l.quantity || 0) * Number(l.unitPrice || 0)), 0));
  const vatAmount = roundMoney(subtotal * (Number(vatRate) / 100));
  const total = roundMoney(subtotal + vatAmount);
  return (
    <div className="bg-muted/50 p-4 rounded-md text-sm space-y-1">
      <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{formatCurrency(subtotal)}</span></div>
      <div className="flex justify-between"><span>الضريبة ({vatRate}%):</span><span>{formatCurrency(vatAmount)}</span></div>
      <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{formatCurrency(total)}</span></div>
    </div>
  );
}

function ImpactPreview({ lines }: { lines: any[] }) {
  const { watch } = useFormContext();
  const clientId = watch("clientId") as string;
  const vatRate = watch("vatRate") as string;
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  if (!clientId || subtotal <= 0) return null;
  return (
    <ImpactPreviewButton
      endpoint="/finance/invoices/impact-preview"
      payload={{
        clientId: Number(clientId),
        taxRate: Number(vatRate),
        lines: lines.map((l) => ({
          quantity: Number(l.quantity || 0),
          unitPrice: Number(l.unitPrice || 0),
        })),
      }}
      label="معاينة أثر الفاتورة"
    />
  );
}

export default function InvoicesCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const copyFromId = new URLSearchParams(searchStr).get("copyFrom");
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/finance/invoices", "POST", [["invoices"]]);
  const { data: copySource } = useApiQuery<any>(["invoice-copy", copyFromId || ""], `/finance/invoices/${copyFromId}`, !!copyFromId);

  const copyDefaults = (() => {
    const params = new URLSearchParams(window.location.search);
    const copy = params.get("copy");
    if (copy) { try { return JSON.parse(copy); } catch { /* ignore */ } }
    return null;
  })();

  const [lines, setLines] = useState([{ description: "", quantity: "1", unitPrice: "" }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [copied, setCopied] = useState(false);
  const autoNumberRef = useRef(`INV-${Date.now().toString(36).toUpperCase()}`);

  useEffect(() => {
    if (copySource && !copied) {
      setCopied(true);
      if (copySource.lines?.length) {
        setLines(copySource.lines.map((l: any) => ({
          description: l.description || "",
          quantity: String(l.quantity || 1),
          unitPrice: String(l.unitPrice || ""),
        })));
      }
    }
  }, [copySource, copied]);

  const addLine = () => setLines([...lines, { description: "", quantity: "1", unitPrice: "" }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: string) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = value;
    setLines(updated);
  };

  return (
    <CreatePageLayout title="فاتورة جديدة" backPath="/finance/invoices">
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="رقم الفاتورة" value={autoNumberRef.current} />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          clientId: copyDefaults?.clientId ? String(copyDefaults.clientId) : (copySource?.clientId ? String(copySource.clientId) : ""),
          description: copyDefaults?.description || copySource?.description || "",
          date: todayLocal(),
          dueDate: "",
          vatRate: copyDefaults?.vatRate ? String(copyDefaults.vatRate) : String(copySource?.vatRate ?? "15"),
          branchId: selectedBranchId ? String(selectedBranchId) : (copySource?.branchId ? String(copySource.branchId) : ""),
          companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : (copySource?.companyId ? String(copySource.companyId) : ""),
          costCenter: "",
          paymentTermsDays: "",
          notes: copyDefaults?.notes || copySource?.notes || "",
          isTaxLinked: false,
          invoiceTypeCode: "388",
          taxCategoryCode: "S",
          exemptionReason: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/invoices")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values, { setFieldError }) => {
          if (!values.dueDate && !values.paymentTermsDays) {
            setFieldError("dueDate", "حدد شروط الدفع أو تاريخ الاستحقاق");
            return;
          }
          if (lines.length === 0 || !lines[0].unitPrice) {
            toast({ variant: "destructive", title: "يرجى إضافة بند واحد على الأقل بسعر" });
            return;
          }
          const subtotal = roundMoney(lines.reduce((sum, l) => sum + roundMoney(Number(l.quantity || 0) * Number(l.unitPrice || 0)), 0));
          const vatAmount = roundMoney(subtotal * (Number(values.vatRate) / 100));
          const total = roundMoney(subtotal + vatAmount);
          if (total <= 0) {
            toast({ variant: "destructive", title: "إجمالي الفاتورة يجب أن يكون أكبر من صفر" });
            return;
          }
          await createMut.mutateAsync({
            clientId: Number(values.clientId),
            description: values.description || undefined,
            date: values.date || undefined,
            dueDate: values.dueDate || undefined,
            vatRate: Number(values.vatRate),
            subtotal,
            total,
            branchId: values.branchId ? Number(values.branchId) : undefined,
            companyId: values.companyId ? Number(values.companyId) : undefined,
            costCenter: values.costCenter || undefined,
            paymentTermsDays: values.paymentTermsDays ? Number(values.paymentTermsDays) : undefined,
            notes: values.notes || undefined,
            isTaxLinked: values.isTaxLinked,
            invoiceTypeCode: values.isTaxLinked ? values.invoiceTypeCode : undefined,
            taxCategoryCode: values.isTaxLinked ? values.taxCategoryCode : undefined,
            exemptionReason: values.isTaxLinked && values.exemptionReason ? values.exemptionReason : undefined,
            lines: lines.map((l) => ({
              description: l.description,
              quantity: Number(l.quantity),
              unitPrice: Number(l.unitPrice),
              total: Number(l.quantity) * Number(l.unitPrice),
            })),
          });
          toast({ title: "تم إنشاء الفاتورة بنجاح" });
          setLocation("/finance/invoices");
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="date" label="التاريخ" required />
        </FormGrid>

        <FormGrid cols={3}>
          <div>
            <FormEntitySelect name="clientId" select={ClientSelect} label="العميل" required />
            <ClientCard />
          </div>
          <FormEntitySelect name="branchId" select={BranchSelect} label="الفرع" required />
          <FormNumberField name="vatRate" label="نسبة الضريبة %" min="0" max="100" step="0.01" />
          <FormSelectField name="paymentTermsDays" label="شروط الدفع" required options={PAYMENT_TERMS_OPTIONS} placeholder="اختر شروط الدفع" />
          <FormDateField name="dueDate" label="تاريخ الاستحقاق" />
          <FormEntitySelect name="costCenter" select={CostCenterSelect} label="مركز التكلفة" />
          <FormTextField name="description" label="الوصف" className="md:col-span-3" />
          <FormTextField name="notes" label="ملاحظات إضافية" placeholder="ملاحظات أو تعليمات للعميل" className="md:col-span-3" />
        </FormGrid>

        <div>
          <Label className="text-base font-semibold">البنود</Label>
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 mt-2 items-end">
              <div><Label className="text-xs">الوصف</Label><Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} /></div>
              <NumberField label="الكمية" value={line.quantity} onChange={(v) => updateLine(idx, "quantity", v)} placeholder="1" />
              <NumberField label="سعر الوحدة" value={line.unitPrice} onChange={(v) => updateLine(idx, "unitPrice", v)} placeholder="0.00" />
              <Button type="button" variant="destructive" size="sm" onClick={() => removeLine(idx)} disabled={lines.length <= 1}>حذف</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addLine}>+ إضافة بند</Button>
        </div>

        <InvoiceTotals lines={lines} />
        <ImpactPreview lines={lines} />

        <FileDropZone files={attachments} onFilesChange={setAttachments} />

        <TaxLinkedBlock />
      </FormShell>
    </CreatePageLayout>
  );
}
