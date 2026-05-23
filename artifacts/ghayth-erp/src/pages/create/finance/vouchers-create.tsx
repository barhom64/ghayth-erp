import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout, AutoField, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { AlertCircle, Paperclip } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
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

  const INITIAL_FORM = {
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
  };
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_vouchers_create", INITIAL_FORM);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const operationTypes = form.type === "receipt" ? OPERATION_TYPES_RECEIPT : OPERATION_TYPES_PAYMENT;

  useEffect(() => {
    setForm(prev => ({
      ...prev,
      operationType: prev.type === "receipt" ? "receipt" : "payment",
    }));
  }, [form.type]);

  useEffect(() => {
    if (form.autoDescription) {
      const desc = generateDescription({
        type: form.type,
        operationType: form.operationType,
        payee: form.payee || form.relatedEntityName,
        amount: Number(form.amount) || undefined,
      });
      setForm(prev => ({ ...prev, description: desc }));
    }
  }, [form.autoDescription, form.operationType, form.payee, form.relatedEntityName, form.amount, form.type]);


  const vatAmount = form.vatRate ? Math.round(Number(form.amount) * (Number(form.vatRate) / 100) * 100) / 100 : 0;
  const totalWithVat = Number(form.amount) + vatAmount;

  const requiresAttachment = (form.type === "payment" && Number(form.amount) >= HIGH_VALUE_THRESHOLD)
    || ["vendor_invoice", "legal_fee", "purchase", "custody"].includes(form.operationType);

  const setField = (field: string, val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async () => {
    const firstError = validate({
      type: form.type ? null : "يرجى اختيار نوع السند",
      amount: !form.amount ? "المبلغ مطلوب" : Number(form.amount) <= 0 ? "المبلغ يجب أن يكون أكبر من صفر" : null,
      accountCode: form.accountCode ? null : "الحساب المحاسبي مطلوب",
      sourceAccountCode: !form.sourceAccountCode && !form.accountCode ? "يجب تحديد حساب مدين وحساب دائن" : null,
      branchId: form.branchId ? null : "الفرع مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (requiresAttachment && !form.attachmentUrl) {
      toast({ variant: "destructive", title: "المرفق إلزامي", description: "يجب إرفاق مستند داعم لهذه العملية" });
      return;
    }
    try {
      await createMut.mutateAsync({
        type: form.type,
        operationType: form.operationType,
        amount: Number(form.amount),
        date: form.date || undefined,
        description: form.description || undefined,
        accountCode: form.accountCode || undefined,
        sourceAccountCode: form.sourceAccountCode || undefined,
        method: form.method,
        payee: form.payee || undefined,
        reference: form.reference || undefined,
        contractId: form.contractId ? Number(form.contractId) : undefined,
        invoiceId: form.invoiceId ? Number(form.invoiceId) : undefined,
        vatRate: form.vatRate ? Number(form.vatRate) : undefined,
        attachmentUrl: form.attachmentUrl || undefined,
        attachmentType: form.attachmentType || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        costCenter: form.costCenter || undefined,
        relatedEntityType: form.relatedEntityType || undefined,
        relatedEntityId: form.relatedEntityId ? Number(form.relatedEntityId) : undefined,
        relatedEntityName: form.relatedEntityName || undefined,
        autoDescription: form.autoDescription,
        beneficiaryType: form.beneficiaryType || undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء السند بنجاح" });
      setLocation("/finance/vouchers");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: err?.fix ?? err?.message ?? "حدث خطأ أثناء إنشاء السند" });
    }
  };

  return (
    <CreatePageLayout title="سند جديد" backPath="/finance/vouchers">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <AutoField label="رقم السند" value={autoNumberRef.current} />
        <FormFieldWrapper label="التاريخ" required>
          <DatePicker value={form.date} onChange={(v) => setField("date", v)} />
        </FormFieldWrapper>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">نوع السند</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormFieldWrapper label="النوع الرئيسي" required error={fieldErrors.type}>
            <Select value={form.type} onValueChange={(v) => setField("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">سند قبض</SelectItem>
                <SelectItem value="payment">سند صرف</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="نوع العملية">
            <Select value={form.operationType} onValueChange={(v) => setField("operationType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {operationTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="طريقة الدفع / القبض">
            <Select value={form.method} onValueChange={(v) => setField("method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">المبالغ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberField label="المبلغ (ريال)" required value={form.amount} onChange={(v) => setField("amount", v)} placeholder="0.00" step={0.01} min={0} error={fieldErrors.amount} />
          <FormFieldWrapper label="ضريبة القيمة المضافة (%)">
            <Select value={form.vatRate || "_none"} onValueChange={(v) => setField("vatRate", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون ضريبة</SelectItem>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="15">15%</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الإجمالي">
            <div className="p-2 bg-muted rounded-md text-sm font-medium">
              {vatAmount > 0
                ? `${formatCurrency(totalWithVat)} (ضريبة: ${formatCurrency(vatAmount)})`
                : formatCurrency(Number(form.amount || 0))}
            </div>
          </FormFieldWrapper>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">الحسابات</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AccountSelect
            value={form.accountCode}
            onChange={(v) => setField("accountCode", v)}
            label="الحساب المقابل"
            required
            error={fieldErrors.accountCode}
            placeholder="اختر الحساب..."
          />
          <AccountSelect
            value={form.sourceAccountCode}
            onChange={(v) => setField("sourceAccountCode", v)}
            label="الخزنة / البنك"
            placeholder="اختر الخزنة أو البنك..."
            filter={(a: any) => a.code?.startsWith("11") || a.code?.startsWith("12")}
          />
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">الطرف الآخر والمرجع</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField label={form.type === "receipt" ? "اسم الدافع" : "اسم المستفيد"} value={form.payee} onChange={(v) => setField("payee", v)} placeholder="الاسم" />
          <FormFieldWrapper label="نوع الجهة">
            <Select value={form.relatedEntityType || "_none"} onValueChange={(v) => setField("relatedEntityType", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون ربط</SelectItem>
                <SelectItem value="employee">موظف</SelectItem>
                <SelectItem value="supplier">مورد</SelectItem>
                <SelectItem value="customer">عميل</SelectItem>
                <SelectItem value="contract">عقد</SelectItem>
                <SelectItem value="property">عقار</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          {form.relatedEntityType === "employee" && (
            <EmployeeSelect
              value={form.relatedEntityId}
              onChange={(val) => {
                const emp = (employeesData?.data || []).find((e: any) => String(e.id) === val);
                const label = emp ? `${emp.name} - ${emp.jobTitle || ""}` : "";
                setForm(prev => ({ ...prev, relatedEntityId: val, relatedEntityName: label }));
              }}
              label="الجهة المرتبطة"
              allowCreate={false}
            />
          )}
          {form.relatedEntityType === "supplier" && (
            <SupplierSelect
              value={form.relatedEntityId}
              onChange={(val) => {
                const s = (suppliersData?.data || []).find((s: any) => String(s.id) === val);
                const label = s ? s.name : "";
                setForm(prev => ({ ...prev, relatedEntityId: val, relatedEntityName: label }));
              }}
              label="الجهة المرتبطة"
              allowCreate={false}
            />
          )}
          {form.relatedEntityType === "customer" && (
            <ClientSelect
              value={form.relatedEntityId}
              onChange={(val) => {
                const c = (clientsData?.data || []).find((c: any) => String(c.id) === val);
                const label = c ? c.name : "";
                setForm(prev => ({ ...prev, relatedEntityId: val, relatedEntityName: label }));
              }}
              label="الجهة المرتبطة"
              allowCreate={false}
            />
          )}
          {form.relatedEntityType === "contract" && (
            <FormFieldWrapper label="الجهة المرتبطة">
              <Select value={form.relatedEntityId || "_none"} onValueChange={(v) => {
                const val = v === "_none" ? "" : v;
                const c = val ? (contractsData?.data || []).find((c: any) => String(c.id) === val) : null;
                const label = c ? `${c.tenantName} - عقد #${c.id}` : "";
                setForm(prev => ({ ...prev, relatedEntityId: val, relatedEntityName: label }));
              }}>
                <SelectTrigger><SelectValue placeholder="— اختر —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— اختر —</SelectItem>
                  {(contractsData?.data || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.tenantName} - عقد #{c.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          )}
          {form.relatedEntityType === "property" && (
            <FormFieldWrapper label="الجهة المرتبطة">
              <Select value={form.relatedEntityId || "_none"} onValueChange={(v) => {
                const val = v === "_none" ? "" : v;
                const u = val ? (unitsData?.data || []).find((u: any) => String(u.id) === val) : null;
                const label = u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : "";
                setForm(prev => ({ ...prev, relatedEntityId: val, relatedEntityName: label }));
              }}>
                <SelectTrigger><SelectValue placeholder="— اختر —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— اختر —</SelectItem>
                  {(unitsData?.data || []).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber || u.name} - {u.type || "وحدة"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          )}
          {form.relatedEntityType && form.relatedEntityId && (
            <div className="md:col-span-3">
              {form.relatedEntityType === "employee" && <EmployeeContextCard employeeId={form.relatedEntityId} />}
              {form.relatedEntityType === "supplier" && <SupplierContextCard supplierId={form.relatedEntityId} />}
              {form.relatedEntityType === "customer" && <ClientContextCard clientId={form.relatedEntityId} section="invoice" />}
              {form.relatedEntityType === "property" && <PropertyUnitContextCard unitId={form.relatedEntityId} section="payment" />}
            </div>
          )}
          <TextField label="رقم المرجع" value={form.reference} onChange={(v) => setField("reference", v)} placeholder="رقم الفاتورة / العقد / الشيك" />
          {form.operationType === "invoice_payment" && (
            <NumberField label="رقم الفاتورة" value={form.invoiceId} onChange={(v) => setField("invoiceId", v)} placeholder="رقم الفاتورة" />
          )}
          {form.operationType === "rent" && (
            <NumberField label="رقم العقد" value={form.contractId} onChange={(v) => setField("contractId", v)} placeholder="رقم العقد" />
          )}
          <BranchSelect
            value={form.branchId}
            onChange={(v) => setField("branchId", v)}
            label="الفرع"
            required
            error={fieldErrors.branchId}
          />
          <DepartmentSelect
            value={form.departmentId}
            onChange={(v) => setField("departmentId", v)}
            label="القسم / الإدارة"
          />
          <CostCenterSelect
            value={form.costCenter}
            onChange={(v) => setField("costCenter", v)}
            label="مركز التكلفة"
          />
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground">البيان</h3>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={form.autoDescription}
              onCheckedChange={(v) => setField("autoDescription", v === true)} />
            بيان تلقائي
          </label>
        </div>
        <Input value={form.description} onChange={(e) => setField("description", e.target.value)}
          placeholder={form.autoDescription ? "سيتم توليده تلقائياً..." : "أدخل بيان السند"}
          disabled={form.autoDescription} />
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          <h3 className="font-semibold text-sm text-muted-foreground">المرفقات</h3>
          {requiresAttachment && <span className="text-xs text-status-error font-medium">(إلزامي)</span>}
        </div>
        {requiresAttachment && !form.attachmentUrl && (
          <div className="flex items-start gap-2 p-3 bg-status-error-surface border border-status-error-surface rounded-md">
            <AlertCircle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
            <p className="text-sm text-status-error-foreground">
              {Number(form.amount) >= HIGH_VALUE_THRESHOLD && form.type === "payment"
                ? `سندات الصرف بمبلغ ${formatCurrency(HIGH_VALUE_THRESHOLD)} أو أكثر تستوجب إرفاق إشعار التحويل أو وصل الاستلام.`
                : "هذا النوع من السندات يستوجب إرفاق مستند داعم."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="رابط المرفق" value={form.attachmentUrl} onChange={(v) => setField("attachmentUrl", v)} placeholder="https://... أو مسار الملف" />
          <FormFieldWrapper label="نوع المرفق">
            <Select value={form.attachmentType} onValueChange={(v) => setField("attachmentType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">وصل استلام</SelectItem>
                <SelectItem value="invoice">فاتورة</SelectItem>
                <SelectItem value="transfer">إشعار تحويل</SelectItem>
                <SelectItem value="check">شيك</SelectItem>
                <SelectItem value="contract">عقد</SelectItem>
                <SelectItem value="approval">موافقة</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
      </div>

      
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => setLocation("/finance/vouchers")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.amount || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : `حفظ سند ${form.type === "receipt" ? "القبض" : "الصرف"}`}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
