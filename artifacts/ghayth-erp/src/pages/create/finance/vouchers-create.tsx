import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { AlertCircle, Paperclip } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";

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
  const amountLabel = amount ? ` / ${Number(amount).toLocaleString("ar-SA")} ريال` : "";
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
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: suppliersData } = useApiQuery<{ data: any[] }>(["suppliers-list"], "/warehouse/suppliers");
  const { data: clientsData } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: contractsData } = useApiQuery<{ data: any[] }>(["contracts-list"], "/properties/contracts");
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["units-list"], "/properties/units");
  const accounts = accountsData?.data || [];
  const branches = branchesData?.data || [];
  const departments = departmentsData?.data || [];
  const sourceAccounts = accounts.filter((a: any) => a.type === "asset" || a.code?.startsWith("1"));
  const targetAccounts = accounts;
  const autoNumberRef = useRef(`VCH-${Date.now().toString(36).toUpperCase()}`);

  const INITIAL_FORM = {
    type: "receipt",
    operationType: "receipt",
    description: "",
    date: new Date().toISOString().split("T")[0],
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
    relatedEntityType: "",
    relatedEntityId: "",
    relatedEntityName: "",
    autoDescription: true,
    beneficiaryType: "",
  };
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_vouchers_create", INITIAL_FORM);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

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

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const vatAmount = form.vatRate ? Math.round(Number(form.amount) * (Number(form.vatRate) / 100) * 100) / 100 : 0;
  const totalWithVat = Number(form.amount) + vatAmount;

  const requiresAttachment = (form.type === "payment" && Number(form.amount) >= HIGH_VALUE_THRESHOLD)
    || ["vendor_invoice", "legal_fee", "purchase", "custody"].includes(form.operationType);

  const setField = (field: string, val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.type) localErrors.type = "يرجى اختيار نوع السند";
    if (!form.amount) {
      localErrors.amount = "المبلغ مطلوب";
    } else if (Number(form.amount) <= 0) {
      localErrors.amount = "المبلغ يجب أن يكون أكبر من صفر";
    }
    if (!form.accountCode) localErrors.accountCode = "الحساب المحاسبي مطلوب";
    if (!form.sourceAccountCode && !form.accountCode) localErrors.sourceAccountCode = "يجب تحديد حساب مدين وحساب دائن";
    if (!form.branchId) localErrors.branchId = "الفرع مطلوب";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
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
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: err?.message || "حدث خطأ أثناء إنشاء السند" });
    }
  };

  return (
    <CreatePageLayout title="سند جديد" backPath="/finance/vouchers">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <AutoField label="رقم السند" value={autoNumberRef.current} />
        <div>
          <Label>التاريخ <span className="text-red-500">*</span></Label>
          <div className="mt-1"><DatePicker value={form.date} onChange={(v) => setField("date", v)} /></div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">نوع السند</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>النوع الرئيسي <span className="text-red-500">*</span></Label>
            <Select value={form.type} onValueChange={(v) => setField("type", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">سند قبض</SelectItem>
                <SelectItem value="payment">سند صرف</SelectItem>
              </SelectContent>
            </Select>
            <FieldHint field="type" />
          </div>
          <div>
            <Label>نوع العملية</Label>
            <Select value={form.operationType} onValueChange={(v) => setField("operationType", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {operationTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>طريقة الدفع / القبض</Label>
            <Select value={form.method} onValueChange={(v) => setField("method", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">المبالغ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>المبلغ (ريال) <span className="text-red-500">*</span></Label>
            <Input className={`mt-1 ${errCls("amount")}`} type="number" min="0" step="0.01" value={form.amount}
              onChange={(e) => setField("amount", e.target.value)} placeholder="0.00" />
            <FieldHint field="amount" />
          </div>
          <div>
            <Label>ضريبة القيمة المضافة (%)</Label>
            <Select value={form.vatRate || "_none"} onValueChange={(v) => setField("vatRate", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون ضريبة</SelectItem>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="15">15%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الإجمالي</Label>
            <div className="mt-1 p-2 bg-muted rounded-md text-sm font-medium">
              {vatAmount > 0
                ? `${totalWithVat.toLocaleString("ar-SA")} ريال (ضريبة: ${vatAmount.toLocaleString("ar-SA")})`
                : `${Number(form.amount || 0).toLocaleString("ar-SA")} ريال`}
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">الحسابات</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الحساب المقابل <span className="text-red-500">*</span></Label>
            <Select value={form.accountCode || "_none"} onValueChange={(v) => setField("accountCode", v === "_none" ? "" : v)}>
              <SelectTrigger className={`mt-1 ${errCls("accountCode")}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{form.type === "receipt" ? "إيرادات (4000)" : "مصروفات (5000)"}</SelectItem>
                {targetAccounts.map((a: any) => (
                  <SelectItem key={a.code || a.id} value={a.code}>{a.code} - {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldHint field="accountCode" />
          </div>
          <div>
            <Label>الخزنة / البنك</Label>
            <Select value={form.sourceAccountCode || "_none"} onValueChange={(v) => setField("sourceAccountCode", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">الخزنة النقدية (1100)</SelectItem>
                {sourceAccounts.map((a: any) => (
                  <SelectItem key={a.code || a.id} value={a.code}>{a.code} - {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">الطرف الآخر والمرجع</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{form.type === "receipt" ? "اسم الدافع" : "اسم المستفيد"}</Label>
            <Input className="mt-1" value={form.payee} onChange={(e) => setField("payee", e.target.value)}
              placeholder="الاسم" />
          </div>
          <div>
            <Label>نوع الجهة</Label>
            <Select value={form.relatedEntityType || "_none"} onValueChange={(v) => setField("relatedEntityType", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون ربط</SelectItem>
                <SelectItem value="employee">موظف</SelectItem>
                <SelectItem value="supplier">مورد</SelectItem>
                <SelectItem value="customer">عميل</SelectItem>
                <SelectItem value="contract">عقد</SelectItem>
                <SelectItem value="property">عقار</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.relatedEntityType && (
            <div>
              <Label>الجهة المرتبطة</Label>
              <Select value={form.relatedEntityId || "_none"} onValueChange={(v) => {
                const val = v === "_none" ? "" : v;
                let label = "";
                if (val) {
                  if (form.relatedEntityType === "employee") {
                    const emp = (employeesData?.data || []).find((e: any) => String(e.id) === val);
                    label = emp ? `${emp.name} - ${emp.jobTitle || ""}` : "";
                  } else if (form.relatedEntityType === "supplier") {
                    const s = (suppliersData?.data || []).find((s: any) => String(s.id) === val);
                    label = s ? s.name : "";
                  } else if (form.relatedEntityType === "customer") {
                    const c = (clientsData?.data || []).find((c: any) => String(c.id) === val);
                    label = c ? c.name : "";
                  } else if (form.relatedEntityType === "contract") {
                    const c = (contractsData?.data || []).find((c: any) => String(c.id) === val);
                    label = c ? `${c.tenantName} - عقد #${c.id}` : "";
                  } else if (form.relatedEntityType === "property") {
                    const u = (unitsData?.data || []).find((u: any) => String(u.id) === val);
                    label = u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : "";
                  }
                }
                setForm(prev => ({ ...prev, relatedEntityId: val, relatedEntityName: label }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="— اختر —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— اختر —</SelectItem>
                  {form.relatedEntityType === "employee" && (employeesData?.data || []).map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || ""}</SelectItem>
                  ))}
                  {form.relatedEntityType === "supplier" && (suppliersData?.data || []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                  {form.relatedEntityType === "customer" && (clientsData?.data || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                  {form.relatedEntityType === "contract" && (contractsData?.data || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.tenantName} - عقد #{c.id}</SelectItem>
                  ))}
                  {form.relatedEntityType === "property" && (unitsData?.data || []).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber || u.name} - {u.type || "وحدة"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.relatedEntityType && form.relatedEntityId && (
            <div className="md:col-span-3">
              {form.relatedEntityType === "employee" && <EmployeeContextCard employeeId={form.relatedEntityId} />}
              {form.relatedEntityType === "supplier" && <SupplierContextCard supplierId={form.relatedEntityId} />}
              {form.relatedEntityType === "customer" && <ClientContextCard clientId={form.relatedEntityId} section="invoice" />}
              {form.relatedEntityType === "property" && <PropertyUnitContextCard unitId={form.relatedEntityId} section="payment" />}
            </div>
          )}
          <div>
            <Label>رقم المرجع</Label>
            <Input className="mt-1" value={form.reference} onChange={(e) => setField("reference", e.target.value)}
              placeholder="رقم الفاتورة / العقد / الشيك" />
          </div>
          {form.operationType === "invoice_payment" && (
            <div>
              <Label>رقم الفاتورة</Label>
              <Input className="mt-1" type="number" value={form.invoiceId}
                onChange={(e) => setField("invoiceId", e.target.value)} placeholder="رقم الفاتورة" />
            </div>
          )}
          {form.operationType === "rent" && (
            <div>
              <Label>رقم العقد</Label>
              <Input className="mt-1" type="number" value={form.contractId}
                onChange={(e) => setField("contractId", e.target.value)} placeholder="رقم العقد" />
            </div>
          )}
          <div>
            <Label>الفرع <span className="text-red-500">*</span></Label>
            <Select value={form.branchId || "_none"} onValueChange={(v) => setField("branchId", v === "_none" ? "" : v)}>
              <SelectTrigger className={`mt-1 ${errCls("branchId")}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الفرع</SelectItem>
                {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldHint field="branchId" />
          </div>
          <div>
            <Label>القسم / الإدارة</Label>
            <Select value={form.departmentId || "_none"} onValueChange={(v) => setField("departmentId", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر القسم</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          {requiresAttachment && <span className="text-xs text-red-500 font-medium">(إلزامي)</span>}
        </div>
        {requiresAttachment && !form.attachmentUrl && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">
              {Number(form.amount) >= HIGH_VALUE_THRESHOLD && form.type === "payment"
                ? `سندات الصرف بمبلغ ${HIGH_VALUE_THRESHOLD.toLocaleString()} ريال أو أكثر تستوجب إرفاق إشعار التحويل أو وصل الاستلام.`
                : "هذا النوع من السندات يستوجب إرفاق مستند داعم."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>رابط المرفق</Label>
            <Input className="mt-1" value={form.attachmentUrl} onChange={(e) => setField("attachmentUrl", e.target.value)}
              placeholder="https://... أو مسار الملف" />
          </div>
          <div>
            <Label>نوع المرفق</Label>
            <Select value={form.attachmentType} onValueChange={(v) => setField("attachmentType", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
          </div>
        </div>
      </div>

      
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => setLocation("/finance/vouchers")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.amount || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : `حفظ سند ${form.type === "receipt" ? "القبض" : "الصرف"}`}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
