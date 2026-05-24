import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  FormCheckboxField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { AlertCircle, Paperclip } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { AccountSelect, BranchSelect, DepartmentSelect, CostCenterSelect, EmployeeSelect, ClientSelect, SupplierSelect } from "@/components/shared/entity-selects";

const OPERATION_TYPES_RECEIPT = [
  { value: "receipt", label: "قبض إيراد عام" },
  { value: "rent", label: "تحصيل إيجار" },
  { value: "invoice_payment", label: "سداد فاتورة عميل" },
  { value: "deposit", label: "إيداع ضمان" },
  { value: "refund", label: "استرداد مبلغ" },
];

const OPERATION_TYPES_PAYMENT = [
  { value: "payment", label: "صرف مبلغ عام" },
  { value: "vendor_invoice", label: "سداد فاتورة مورد" },
  { value: "salary", label: "صرف راتب" },
  { value: "advance", label: "صرف سلفة موظف" },
  { value: "legal_fee", label: "أتعاب قانونية" },
  { value: "purchase", label: "مشتريات" },
  { value: "custody", label: "صرف عهدة" },
  { value: "insurance", label: "سداد تأمين" },
  { value: "maintenance", label: "دفع صيانة" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "نقدي" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "check", label: "شيك" },
  { value: "credit_card", label: "بطاقة ائتمان" },
];

const VAT_OPTIONS = [
  { value: "5", label: "5%" },
  { value: "15", label: "15%" },
];

const RELATED_ENTITY_TYPE_OPTIONS = [
  { value: "employee", label: "موظف" },
  { value: "supplier", label: "مورد" },
  { value: "customer", label: "عميل" },
  { value: "contract", label: "عقد" },
  { value: "property", label: "عقار" },
];

const ATTACHMENT_TYPE_OPTIONS = [
  { value: "receipt", label: "وصل استلام" },
  { value: "invoice", label: "فاتورة" },
  { value: "transfer", label: "إشعار تحويل" },
  { value: "check", label: "شيك" },
  { value: "contract", label: "عقد" },
  { value: "approval", label: "موافقة" },
  { value: "other", label: "أخرى" },
];

const HIGH_VALUE_THRESHOLD = 5000;

function generateDescription(params: { type: string; operationType: string; payee?: string; amount?: number }): string {
  const { type, operationType, payee, amount } = params;
  const payeeLabel = payee ? ` / ${payee}` : "";
  const amountLabel = amount ? ` / ${formatCurrency(Number(amount))}` : "";
  const opMap: Record<string, string> = {
    rent: `تحصيل إيجار${payeeLabel}${amountLabel}`,
    invoice_payment: `سداد فاتورة عميل${payeeLabel}${amountLabel}`,
    deposit: `إيداع ضمان${payeeLabel}${amountLabel}`,
    refund: `استرداد مبلغ${payeeLabel}${amountLabel}`,
    receipt: `سند قبض${payeeLabel}${amountLabel}`,
    vendor_invoice: `سداد فاتورة مورد${payeeLabel}${amountLabel}`,
    salary: `صرف راتب${payeeLabel}`,
    advance: `صرف سلفة موظف${payeeLabel}${amountLabel}`,
    legal_fee: `أتعاب قانونية${payeeLabel}${amountLabel}`,
    purchase: `مشتريات${payeeLabel}${amountLabel}`,
    custody: `صرف عهدة${payeeLabel}${amountLabel}`,
    insurance: `سداد تأمين${payeeLabel}${amountLabel}`,
    maintenance: `دفع صيانة${payeeLabel}${amountLabel}`,
    payment: `سند صرف${payeeLabel}${amountLabel}`,
  };
  return opMap[operationType] || (type === "receipt" ? `سند قبض${payeeLabel}` : `سند صرف${payeeLabel}`);
}

const schema = z.object({
  type: z.enum(["receipt", "payment"]),
  operationType: z.string(),
  description: z.string().optional(),
  date: z.string(),
  amount: z.string().refine((v) => Number(v) > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  accountCode: z.string().min(1, "الحساب المحاسبي مطلوب"),
  sourceAccountCode: z.string().optional(),
  method: z.string(),
  payee: z.string().optional(),
  reference: z.string().optional(),
  contractId: z.string().optional(),
  invoiceId: z.string().optional(),
  vatRate: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string(),
  branchId: z.string().min(1, "الفرع مطلوب"),
  departmentId: z.string().optional(),
  costCenter: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  relatedEntityName: z.string().optional(),
  autoDescription: z.boolean(),
  beneficiaryType: z.string().optional(),
});

function OperationTypeSelect() {
  const { watch } = useFormContext();
  const type = watch("type") as string;
  const options = type === "receipt" ? OPERATION_TYPES_RECEIPT : OPERATION_TYPES_PAYMENT;
  return <FormSelectField name="operationType" label="نوع العملية" options={options} />;
}

function SyncOperationType() {
  const { watch, setValue } = useFormContext();
  const type = watch("type") as string;
  useEffect(() => {
    setValue("operationType", type === "receipt" ? "receipt" : "payment");
  }, [type, setValue]);
  return null;
}

function AutoDescription() {
  const { watch, setValue } = useFormContext();
  const autoDescription = watch("autoDescription") as boolean;
  const type = watch("type") as string;
  const operationType = watch("operationType") as string;
  const payee = watch("payee") as string;
  const relatedEntityName = watch("relatedEntityName") as string;
  const amount = watch("amount") as string;

  useEffect(() => {
    if (autoDescription) {
      const desc = generateDescription({
        type,
        operationType,
        payee: payee || relatedEntityName,
        amount: Number(amount) || undefined,
      });
      setValue("description", desc);
    }
  }, [autoDescription, type, operationType, payee, relatedEntityName, amount, setValue]);
  return null;
}

function TotalsDisplay() {
  const { watch } = useFormContext();
  const amount = watch("amount") as string;
  const vatRate = watch("vatRate") as string;
  const vatAmount = vatRate ? Math.round(Number(amount) * (Number(vatRate) / 100) * 100) / 100 : 0;
  const totalWithVat = Number(amount) + vatAmount;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">الإجمالي</label>
      <div className="p-2 bg-muted rounded-md text-sm font-medium">
        {vatAmount > 0
          ? `${formatCurrency(totalWithVat)} (ضريبة: ${formatCurrency(vatAmount)})`
          : formatCurrency(Number(amount || 0))}
      </div>
    </div>
  );
}

function RelatedEntityPicker({
  employeesData, suppliersData, clientsData, contractsData, unitsData,
}: {
  employeesData: any;
  suppliersData: any;
  clientsData: any;
  contractsData: any;
  unitsData: any;
}) {
  const { watch, setValue } = useFormContext();
  const relatedEntityType = watch("relatedEntityType") as string;
  const relatedEntityId = watch("relatedEntityId") as string;

  const updateBoth = (val: string, label: string) => {
    setValue("relatedEntityId", val);
    setValue("relatedEntityName", label);
  };

  if (relatedEntityType === "employee") {
    return (
      <EmployeeSelect
        value={relatedEntityId}
        onChange={(val) => {
          const emp = (employeesData?.data || []).find((e: any) => String(e.id) === val);
          updateBoth(val, emp ? `${emp.name} - ${emp.jobTitle || ""}` : "");
        }}
        label="الجهة المرتبطة"
        allowCreate={false}
      />
    );
  }
  if (relatedEntityType === "supplier") {
    return (
      <SupplierSelect
        value={relatedEntityId}
        onChange={(val) => {
          const s = (suppliersData?.data || []).find((s: any) => String(s.id) === val);
          updateBoth(val, s ? s.name : "");
        }}
        label="الجهة المرتبطة"
        allowCreate={false}
      />
    );
  }
  if (relatedEntityType === "customer") {
    return (
      <ClientSelect
        value={relatedEntityId}
        onChange={(val) => {
          const c = (clientsData?.data || []).find((c: any) => String(c.id) === val);
          updateBoth(val, c ? c.name : "");
        }}
        label="الجهة المرتبطة"
        allowCreate={false}
      />
    );
  }
  if (relatedEntityType === "contract") {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">الجهة المرتبطة</label>
        <Select value={relatedEntityId || "_none"} onValueChange={(v) => {
          const val = v === "_none" ? "" : v;
          const c = val ? (contractsData?.data || []).find((c: any) => String(c.id) === val) : null;
          updateBoth(val, c ? `${c.tenantName} - عقد #${c.id}` : "");
        }}>
          <SelectTrigger><SelectValue placeholder="— اختر —" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— اختر —</SelectItem>
            {(contractsData?.data || []).map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.tenantName} - عقد #{c.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (relatedEntityType === "property") {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">الجهة المرتبطة</label>
        <Select value={relatedEntityId || "_none"} onValueChange={(v) => {
          const val = v === "_none" ? "" : v;
          const u = val ? (unitsData?.data || []).find((u: any) => String(u.id) === val) : null;
          updateBoth(val, u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : "");
        }}>
          <SelectTrigger><SelectValue placeholder="— اختر —" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— اختر —</SelectItem>
            {(unitsData?.data || []).map((u: any) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber || u.name} - {u.type || "وحدة"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return null;
}

function RelatedEntityContext() {
  const { watch } = useFormContext();
  const relatedEntityType = watch("relatedEntityType") as string;
  const relatedEntityId = watch("relatedEntityId") as string;
  if (!relatedEntityType || !relatedEntityId) return null;
  return (
    <div className="md:col-span-3">
      {relatedEntityType === "employee" && <EmployeeContextCard employeeId={relatedEntityId} />}
      {relatedEntityType === "supplier" && <SupplierContextCard supplierId={relatedEntityId} />}
      {relatedEntityType === "customer" && <ClientContextCard clientId={relatedEntityId} section="invoice" />}
      {relatedEntityType === "property" && <PropertyUnitContextCard unitId={relatedEntityId} section="payment" />}
    </div>
  );
}

function AttachmentWarning() {
  const { watch } = useFormContext();
  const type = watch("type") as string;
  const operationType = watch("operationType") as string;
  const amount = Number(watch("amount") || 0);
  const attachmentUrl = watch("attachmentUrl") as string;
  const requiresAttachment = (type === "payment" && amount >= HIGH_VALUE_THRESHOLD)
    || ["vendor_invoice", "legal_fee", "purchase", "custody"].includes(operationType);
  if (!requiresAttachment || attachmentUrl) return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-status-error-surface border border-status-error-surface rounded-md">
      <AlertCircle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
      <p className="text-sm text-status-error-foreground">
        {amount >= HIGH_VALUE_THRESHOLD && type === "payment"
          ? `سندات الصرف بمبلغ ${formatCurrency(HIGH_VALUE_THRESHOLD)} أو أكثر تستوجب إرفاق إشعار التحويل أو وصل الاستلام.`
          : "هذا النوع من السندات يستوجب إرفاق مستند داعم."}
      </p>
    </div>
  );
}

function SubmitLabel() {
  const { watch } = useFormContext();
  const type = watch("type") as string;
  return <span>{type === "receipt" ? "القبض" : "الصرف"}</span>;
}

export default function VouchersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/vouchers", "POST", [["vouchers"], ["vouchers-list"]]);
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: suppliersData } = useApiQuery<{ data: any[] }>(["suppliers-list"], "/warehouse/suppliers");
  const { data: clientsData } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: contractsData } = useApiQuery<{ data: any[] }>(["contracts-list"], "/properties/contracts");
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["units-list"], "/properties/units");
  const autoNumberRef = useRef(`VCH-${Date.now().toString(36).toUpperCase()}`);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="سند جديد" backPath="/finance/vouchers">
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <AutoField label="رقم السند" value={autoNumberRef.current} />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          type: "receipt",
          operationType: "receipt",
          description: "",
          date: todayLocal(),
          amount: "",
          accountCode: "",
          sourceAccountCode: "",
          method: "cash",
          payee: "",
          reference: "",
          contractId: "",
          invoiceId: "",
          vatRate: "",
          attachmentUrl: "",
          attachmentType: "receipt",
          branchId: "",
          departmentId: "",
          costCenter: "",
          relatedEntityType: "",
          relatedEntityId: "",
          relatedEntityName: "",
          autoDescription: true,
          beneficiaryType: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ السند"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/vouchers")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const requiresAttachment = (values.type === "payment" && Number(values.amount) >= HIGH_VALUE_THRESHOLD)
            || ["vendor_invoice", "legal_fee", "purchase", "custody"].includes(values.operationType);
          if (requiresAttachment && !values.attachmentUrl) {
            toast({ variant: "destructive", title: "المرفق إلزامي", description: "يجب إرفاق مستند داعم لهذه العملية" });
            return;
          }
          await createMut.mutateAsync({
            type: values.type,
            operationType: values.operationType,
            amount: Number(values.amount),
            date: values.date || undefined,
            description: values.description || undefined,
            accountCode: values.accountCode || undefined,
            sourceAccountCode: values.sourceAccountCode || undefined,
            method: values.method,
            payee: values.payee || undefined,
            reference: values.reference || undefined,
            contractId: values.contractId ? Number(values.contractId) : undefined,
            invoiceId: values.invoiceId ? Number(values.invoiceId) : undefined,
            vatRate: values.vatRate ? Number(values.vatRate) : undefined,
            attachmentUrl: values.attachmentUrl || undefined,
            attachmentType: values.attachmentType || undefined,
            branchId: values.branchId ? Number(values.branchId) : undefined,
            departmentId: values.departmentId ? Number(values.departmentId) : undefined,
            costCenter: values.costCenter || undefined,
            relatedEntityType: values.relatedEntityType || undefined,
            relatedEntityId: values.relatedEntityId ? Number(values.relatedEntityId) : undefined,
            relatedEntityName: values.relatedEntityName || undefined,
            autoDescription: values.autoDescription,
            beneficiaryType: values.beneficiaryType || undefined,
          });
          toast({ title: "تم إنشاء السند بنجاح" });
          setLocation("/finance/vouchers");
        }}
      >
        <SyncOperationType />
        <AutoDescription />

        <FormGrid cols={2}>
          <FormDateField name="date" label="التاريخ" required />
        </FormGrid>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">نوع السند</h3>
          <FormGrid cols={3}>
            <FormSelectField
              name="type"
              label="النوع الرئيسي"
              required
              options={[
                { value: "receipt", label: "سند قبض" },
                { value: "payment", label: "سند صرف" },
              ]}
            />
            <OperationTypeSelect />
            <FormSelectField name="method" label="طريقة الدفع / القبض" options={PAYMENT_METHODS} />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">المبالغ</h3>
          <FormGrid cols={3}>
            <FormNumberField name="amount" label="المبلغ (ريال)" required placeholder="0.00" step="0.01" min="0" />
            <FormSelectField name="vatRate" label="ضريبة القيمة المضافة (%)" options={VAT_OPTIONS} placeholder="بدون ضريبة" />
            <TotalsDisplay />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحسابات</h3>
          <FormGrid cols={2}>
            <FormEntitySelect name="accountCode" select={AccountSelect} label="الحساب المقابل" required placeholder="اختر الحساب..." />
            <FormEntitySelect name="sourceAccountCode" select={AccountSelect} label="الخزنة / البنك" placeholder="اختر الخزنة أو البنك..." />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الطرف الآخر والمرجع</h3>
          <FormGrid cols={3}>
            <FormTextField name="payee" label="اسم الدافع / المستفيد" placeholder="الاسم" />
            <FormSelectField name="relatedEntityType" label="نوع الجهة" options={RELATED_ENTITY_TYPE_OPTIONS} placeholder="بدون ربط" />
            <RelatedEntityPicker
              employeesData={employeesData}
              suppliersData={suppliersData}
              clientsData={clientsData}
              contractsData={contractsData}
              unitsData={unitsData}
            />
            <RelatedEntityContext />
            <FormTextField name="reference" label="رقم المرجع" placeholder="رقم الفاتورة / العقد / الشيك" />
            <FormEntitySelect name="branchId" select={BranchSelect} label="الفرع" required />
            <FormEntitySelect name="departmentId" select={DepartmentSelect} label="القسم / الإدارة" />
            <FormEntitySelect name="costCenter" select={CostCenterSelect} label="مركز التكلفة" />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground">البيان</h3>
            <FormCheckboxField name="autoDescription" label="بيان تلقائي" />
          </div>
          <FormTextField name="description" label="" placeholder="أدخل بيان السند" />
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-muted-foreground">المرفقات</h3>
          </div>
          <AttachmentWarning />
          <FormGrid cols={2}>
            <FormTextField name="attachmentUrl" label="رابط المرفق" placeholder="https://... أو مسار الملف" />
            <FormSelectField name="attachmentType" label="نوع المرفق" options={ATTACHMENT_TYPE_OPTIONS} />
          </FormGrid>
        </div>

        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
