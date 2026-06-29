import { useState, useRef, useEffect } from "react";
import { PAYMENT_METHOD_OPTIONS as PAYMENT_METHODS, VOUCHER_OPERATIONS, type TaxCodeOption } from "@/lib/finance-type-maps";
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
import { useAppContext } from "@/contexts/app-context";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { amountTaxSplit } from "@/lib/tax-math";
import { allowedUsagesForPaymentMethod, isMoneyAccount } from "@/lib/finance-account-usage";
import { EMPTY_ALLOCATION_TARGET, buildOperationalEffectsPayload, type AllocationTargetValue } from "@/components/shared/allocation-target-select";
import { FinanceOperationContextPanel } from "@/components/shared/finance-operation-context-panel";
import { ActiveContextNotice, useActiveFinanceContext } from "@/components/shared/active-context-gate";
import { deriveRelatedEntity, voucherCounterAccountHint, VOUCHER_COUNTER_ACCOUNT_TYPES } from "@/lib/finance/scenario-model";
import { buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { AlertCircle, Paperclip, Lock, ChevronDown } from "lucide-react";
import { usePermission } from "@/components/shared/permission-gate";
import { type Attachment } from "@/components/shared/file-drop-zone";
import { FinancialAttachmentViewer } from "@/components/shared/financial-attachment-viewer";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { AccountSelect, BranchSelect, DepartmentSelect, CostCenterSelect } from "@/components/shared/entity-selects";
import { Switch } from "@/components/ui/switch";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";


const voucherTaxSplit = amountTaxSplit;

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



const HIGH_VALUE_THRESHOLD = 5000;

function generateDescription(params: { type: string; operationType: string; payee?: string; amount?: number }): string {
  const { type, operationType, payee, amount } = params;
  const payeeLabel = payee ? ` / ${payee}` : "";
  const amountLabel = amount ? ` / ${formatCurrency(Number(amount))}` : "";
  // #1715 (module review) — derive the base label from the shared
  // VOUCHER_OPERATIONS map instead of a local opMap copy; append the suffix here.
  const base = VOUCHER_OPERATIONS[operationType];
  return base
    ? `${base}${payeeLabel}${amountLabel}`
    : (type === "receipt" ? `سند قبض${payeeLabel}` : `سند صرف${payeeLabel}`);
}

export default function VouchersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/vouchers", "POST", [["vouchers"], ["vouchers-list"]]);
  // Dedicated dry-run mutation (no cache invalidation — it never commits).
  const previewMut = useApiMutation<{ lines: Array<{ accountCode: string; debit: number; credit: number }>; totals?: { totalDebit: number; totalCredit: number } }, any>("/finance/vouchers", "POST", []);
  const [preview, setPreview] = useState<{ lines: Array<{ accountCode: string; debit: number; credit: number }>; totals?: { totalDebit: number; totalCredit: number } } | null>(null);
  // العقيدة «مساعد لا عائق»: الحساب المقابل مطويّ للقراءة ويُشتق من اتجاه السند —
  // التجاوز اليدوي خلف زر «تعديل» لذوي صلاحية الاعتماد المالي فقط.
  const canManualOverride = usePermission("finance:approve");
  const [manualCounterOpen, setManualCounterOpen] = useState(false);
  const { data: taxCodesData } = useApiQuery<{ data: TaxCodeOption[] }>(
    ["tax-codes", "active"],
    "/finance/tax-codes?active=true",
  );
  const activeTaxCodes = (taxCodesData?.data ?? []).filter((t) => t.isActive !== false);
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
    taxCodeId: "",
    taxInclusive: false,
    attachmentUrl: "",
    attachmentType: "receipt",
    branchId: "",
    departmentId: "",
    costCenter: "",
    autoDescription: true,
    beneficiaryType: "",
  };
  // #2230 — single-branch users shouldn't re-pick a branch; default it from
  // the active scope (mirrors purchase-orders-create). Multi-branch users
  // still pick it, and the backend stays the guard.
  const { selectedBranchId } = useAppContext();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_vouchers_create", {
    ...INITIAL_FORM,
    branchId: selectedBranchId ? String(selectedBranchId) : "",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // #1715 PR-4: master «ربط السند بـ» field shared with expenses.
  const [allocTarget, setAllocTarget] = useState<AllocationTargetValue>(EMPTY_ALLOCATION_TARGET);
  // #1945 — the linked party is derived from the scenario panel (single source);
  // the legacy duplicate «نوع الجهة» picker was removed.
  const derivedRelated = deriveRelatedEntity(allocTarget.target, allocTarget.allocation);
  const derivedRelatedName = (() => {
    const { type, id } = derivedRelated;
    if (!id) return "";
    if (type === "employee") { const e = (employeesData?.data || []).find((x: any) => String(x.id) === id); return e ? `${e.name} - ${e.jobTitle || ""}` : ""; }
    if (type === "supplier") { const s = (suppliersData?.data || []).find((x: any) => String(x.id) === id); return s ? s.name : ""; }
    if (type === "customer") { const c = (clientsData?.data || []).find((x: any) => String(x.id) === id); return c ? c.name : ""; }
    if (type === "contract") { const c = (contractsData?.data || []).find((x: any) => String(x.id) === id); return c ? `${c.tenantName} - عقد #${c.id}` : ""; }
    if (type === "property") { const u = (unitsData?.data || []).find((x: any) => String(x.id) === id); return u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : ""; }
    return "";
  })();
  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const activeCtx = useActiveFinanceContext();

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
        payee: form.payee || derivedRelatedName,
        amount: Number(form.amount) || undefined,
      });
      setForm(prev => ({ ...prev, description: desc }));
    }
  }, [form.autoDescription, form.operationType, form.payee, derivedRelatedName, form.amount, form.type]);


  const selectedTaxCode = form.taxCodeId
    ? activeTaxCodes.find((t) => String(t.id) === String(form.taxCodeId))
    : null;
  const effectiveRate = selectedTaxCode ? Number(selectedTaxCode.rate) : Number(form.vatRate) || 0;
  const taxSplit = voucherTaxSplit(Number(form.amount) || 0, effectiveRate, form.taxInclusive);
  const vatAmount = taxSplit.vat;
  const totalWithVat = taxSplit.gross;

  const requiresAttachment = (form.type === "payment" && Number(form.amount) >= HIGH_VALUE_THRESHOLD)
    || ["vendor_invoice", "legal_fee", "purchase", "custody"].includes(form.operationType);

  const setField = (field: string, val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  // #2237 — financial attachment workspace: feed the side viewer from the
  // current attachment (uploaded file or pasted link); upload/replace/remove go
  // through the SAME state the form uses (attachmentUrl/attachments). The viewer
  // is display-only — it never touches the journal.
  const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
    receipt: "وصل استلام", invoice: "فاتورة", transfer: "إشعار تحويل",
    check: "شيك", contract: "عقد", approval: "موافقة", other: "أخرى",
  };
  const viewerAttachments = form.attachmentUrl
    ? [{
        url: form.attachmentUrl,
        name: attachments[0]?.name,
        type: attachments[0]?.type ?? null,
        documentType: ATTACHMENT_TYPE_LABELS[form.attachmentType] ?? form.attachmentType,
        serialNo: null,
        status: "linked",
      }]
    : [];
  const applyAttachmentFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachments([{ name: file.name, size: file.size, type: file.type, dataUrl }]);
      setForm((prev) => ({ ...prev, attachmentUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };
  const clearAttachment = () => {
    setAttachments([]);
    setForm((prev) => (prev.attachmentUrl.startsWith("data:") ? { ...prev, attachmentUrl: "" } : prev));
  };

  const handleTaxCodeChange = (val: string) => {
    if (val === "_none") {
      setForm(prev => ({ ...prev, taxCodeId: "", vatRate: "" }));
      return;
    }
    const tc = activeTaxCodes.find((t) => String(t.id) === val);
    if (!tc) return;
    setForm(prev => ({
      ...prev,
      taxCodeId: val,
      vatRate: String(Number(tc.rate) || 0),
      taxInclusive: tc.isInclusiveDefault ?? prev.taxInclusive,
    }));
  };

  // Single source of truth for the request payload — shared by the real
  // submit and the dry-run preview so the previewed JE is exactly what posts.
  const buildVoucherPayload = (extra?: Record<string, unknown>) => ({
    type: form.type,
    operationType: form.operationType,
    // #1715 review — post the NET amount (backend adds VAT on top). With «شامل
    // الضريبة» on, form.amount is gross, so sending it raw posted gross+VAT — and
    // the dry-run «معاينة القيد» (same handler) showed it too. taxSplit.net ==
    // form.amount when NOT inclusive, so only the inclusive case changes.
    amount: Number(taxSplit.net),
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
    taxCodeId: form.taxCodeId ? Number(form.taxCodeId) : undefined,
    taxInclusive: form.taxCodeId ? form.taxInclusive : undefined,
    attachmentUrl: form.attachmentUrl || undefined,
    attachmentType: form.attachmentType || undefined,
    branchId: form.branchId ? Number(form.branchId) : undefined,
    departmentId: form.departmentId ? Number(form.departmentId) : undefined,
    costCenter: form.costCenter || undefined,
    relatedEntityType: derivedRelated.type || undefined,
    relatedEntityId: derivedRelated.id ? Number(derivedRelated.id) : undefined,
    relatedEntityName: derivedRelatedName || undefined,
    autoDescription: form.autoDescription,
    beneficiaryType: form.beneficiaryType || undefined,
    lineAllocation: allocTarget.target !== "none"
      ? buildAllocationPayload(allocTarget.allocation)
      : undefined,
    // #1715 — maintenance / fuel / asset effects via the shared helper (same
    // mapping as the expense form — single source of truth).
    ...buildOperationalEffectsPayload(allocTarget),
    ...extra,
  });

  // التوجيه التلقائي للحساب المقابل الفارغ (صرف→5399، قبض→4930) يصحّ فقط عندما
  // يقبل نوع العملية حساب مصروف/إيراد. أنواع تتطلّب أصلًا/التزامًا (invoice_payment،
  // deposit، advance، custody…) لا يصحّ توجيهها — لها يبقى الحساب مطلوبًا ويظهر
  // المنتقي للجميع. (نفس منطق الخادم — Codex P2 #2920.)
  const counterAutoRoutable = (() => {
    const allowed = VOUCHER_COUNTER_ACCOUNT_TYPES[form.operationType];
    return !allowed || allowed.includes(form.type === "receipt" ? "revenue" : "expense");
  })();

  const validateVoucher = () => validate({
    type: form.type ? null : "يرجى اختيار نوع السند",
    amount: !form.amount ? "المبلغ مطلوب" : Number(form.amount) <= 0 ? "المبلغ يجب أن يكون أكبر من صفر" : null,
    // العقيدة «النظام مساعد لا عائق»: الحساب المقابل اختياري عندما يصحّ التوجيه
    // التلقائي (صرف→5399، قبض→4930). أنواع تتطلّب أصلًا/التزامًا يبقى الحساب
    // مطلوبًا لها (الخادم يرفضها بـ422 وإلا). تبقى الخزنة مطلوبة دائمًا.
    accountCode: counterAutoRoutable || form.accountCode ? null : "حدّد الحساب المقابل — هذا النوع من السندات يتطلّب حسابًا محدّدًا",
    sourceAccountCode: form.sourceAccountCode ? null : "حدد الخزنة / البنك (مصدر أو وجهة المال)",
    // الفرع اختياري في الخلفية ويُعبّأ من سياق الدخول — لا يُفرض.
  });

  // #1715 §11 — «معاينة القيد قبل الحفظ». Calls the SAME endpoint with
  // dryRun:true; the backend runs the full posting logic (VAT, WHT, dims)
  // and returns the JE without committing, so the preview can never diverge
  // from what actually posts.
  const handlePreview = async () => {
    const firstError = validateVoucher();
    if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
    try {
      const res = await previewMut.mutateAsync(buildVoucherPayload({ dryRun: true }));
      setPreview(res);
    } catch (err: any) {
      setPreview(null);
      toast({ variant: "destructive", title: "تعذّرت المعاينة", description: err?.fix ?? err?.message ?? "" });
    }
  };

  const handleSubmit = async () => {
    const firstError = validateVoucher();
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (requiresAttachment && !form.attachmentUrl) {
      toast({ variant: "destructive", title: "المرفق إلزامي", description: "يجب إرفاق مستند داعم لهذه العملية" });
      return;
    }
    try {
      await createMut.mutateAsync(buildVoucherPayload());
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
      <div data-form className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 lg:items-start">
        {/* #2237 — financial attachment workspace: the document sits beside the
            form (left in RTL, sticky) during entry instead of a bottom upload
            field. Same reusable viewer used in expenses/vendor-invoice. */}
        <aside className="mb-4 lg:mb-0 lg:order-2 lg:sticky lg:top-4">
          <FinancialAttachmentViewer
            mode="create"
            attachments={viewerAttachments}
            documentType={ATTACHMENT_TYPE_LABELS[form.attachmentType] ?? form.attachmentType}
            canReplace={canManualOverride}
            canDownload
            onUpload={applyAttachmentFile}
            onReplace={applyAttachmentFile}
            onRemove={clearAttachment}
          />
        </aside>
        <div className="min-w-0 lg:order-1">
      <ActiveContextNotice ctx={activeCtx} />
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <AutoField label="رقم السند" value={autoNumberRef.current} />
        <FormFieldWrapper label="تاريخ السند" required>
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

      {/* #1715 (owner: «وحّد النماذج ورتّبها») — السيناريو التشغيلي يأتي مباشرة
          بعد معلومات العملية، قبل المبالغ والحسابات، تماماً كنموذج المصروف. */}
      <FinanceOperationContextPanel
        value={allocTarget}
        onChange={setAllocTarget}
        title="ربط السند بـ (السيناريو التشغيلي)"
        description="اختر ما يُربط به السند، وستظهر الحقول المناسبة فقط. الربط يُنتج الأبعاد المحاسبية ومركز التكلفة تلقائياً."
      />

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">المبالغ والضريبة</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberField label="المبلغ (ريال)" required value={form.amount} onChange={(v) => setField("amount", v)} placeholder="0.00" step={0.01} min={0} error={fieldErrors.amount} />
          <FormFieldWrapper label="رمز الضريبة">
            <Select value={form.taxCodeId || "_none"} onValueChange={handleTaxCodeChange}>
              <SelectTrigger><SelectValue placeholder="— بدون ضريبة —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— بدون ضريبة —</SelectItem>
                {activeTaxCodes.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.code} — {t.name} ({Number(t.rate)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="نمط المبلغ">
            <div className="flex items-center gap-2 h-10">
              <Switch
                id="taxInclusive"
                checked={form.taxInclusive}
                onCheckedChange={(v) => setField("taxInclusive", v)}
                disabled={!form.taxCodeId || effectiveRate === 0}
              />
              <Label htmlFor="taxInclusive" className="text-sm">
                {form.taxInclusive ? "شامل الضريبة" : "غير شامل الضريبة"}
              </Label>
            </div>
          </FormFieldWrapper>
        </div>
        {effectiveRate > 0 && Number(form.amount) > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-muted">
              صافي: <span className="font-mono">{formatCurrency(taxSplit.net)}</span>
            </span>
            <span className="px-2 py-1 rounded bg-status-info-surface text-status-info-foreground">
              ضريبة {effectiveRate}%: <span className="font-mono">{formatCurrency(taxSplit.vat)}</span>
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              الإجمالي: <span className="font-mono">{formatCurrency(taxSplit.gross)}</span>
            </span>
            {selectedTaxCode && (
              <span className="text-muted-foreground">
                — {selectedTaxCode.code} ({selectedTaxCode.taxType})
              </span>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">الحسابات</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {counterAutoRoutable ? (
            <FormFieldWrapper label="الحساب المقابل (توجيه تلقائي حسب اتجاه السند)">
              {/* العقيدة: مطويّ ومُشتق — صرف→5399 «مصروفات عمومية أخرى»،
                  قبض→4930 «إيرادات متنوعة» (يحلّه الخادم). زر «تعديل» لذوي صلاحية
                  الاعتماد فقط للتجاوز اليدوي النادر. */}
              <div className="rounded-md border bg-muted/40 p-2 text-sm flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="block">
                    {form.accountCode
                      ? `الحساب المقابل: ${form.accountCode}`
                      : (form.type === "receipt"
                          ? "يُشتق تلقائيًا: إيرادات متنوعة (4930)"
                          : "يُشتق تلقائيًا: مصروفات عمومية أخرى (5399)")}
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    {voucherCounterAccountHint(form.operationType, form.type === "receipt" ? "receipt" : "payment")}
                  </span>
                </div>
                {canManualOverride && (
                  <button type="button" onClick={() => setManualCounterOpen((v) => !v)}
                    className="text-xs text-status-info-foreground hover:underline shrink-0 flex items-center gap-1">
                    {manualCounterOpen ? "إخفاء" : "تعديل"}
                    <ChevronDown className={`h-3 w-3 transition-transform ${manualCounterOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
              {canManualOverride && manualCounterOpen && (
                <div className="mt-2">
                  <AccountSelect
                    value={form.accountCode}
                    onChange={(v) => setField("accountCode", v)}
                    label=""
                    error={fieldErrors.accountCode}
                    placeholder="تجاوز يدوي — اتركه فارغًا للتوجيه التلقائي…"
                  />
                </div>
              )}
            </FormFieldWrapper>
          ) : (
            /* أنواع تتطلّب نوع حساب محدّدًا (أصل/التزام مثل invoice_payment/
               deposit/advance/custody) — لا يصحّ التوجيه التلقائي، فالمنتقي
               يظهر مطلوبًا للجميع. */
            <div>
              <AccountSelect
                value={form.accountCode}
                onChange={(v) => setField("accountCode", v)}
                label="الحساب المقابل"
                required
                error={fieldErrors.accountCode}
                placeholder="اختر الحساب..."
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {voucherCounterAccountHint(form.operationType, form.type === "receipt" ? "receipt" : "payment")}
              </p>
            </div>
          )}
          <AccountSelect
            value={form.sourceAccountCode}
            onChange={(v) => setField("sourceAccountCode", v)}
            label="الخزنة / البنك"
            placeholder="اختر الخزنة أو البنك..."
            // #1715: narrow by accountUsage matching the chosen method
            // (نقدي→صندوق، تحويل→بنك، شيك→بنك/شيكات). Unclassified accounts
            // fall back to the legacy 11xx/12xx money heuristic. Backend
            // enforces the same rule.
            filter={(a: any) => {
              const allowed = allowedUsagesForPaymentMethod(form.method);
              if (!allowed) return isMoneyAccount(a);
              return a.accountUsage
                ? allowed.includes(a.accountUsage)
                : isMoneyAccount(a);
            }}
          />
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground">الطرف الآخر والمرجع</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField label={form.type === "receipt" ? "اسم الدافع" : "اسم المستفيد"} value={form.payee} onChange={(v) => setField("payee", v)} placeholder="الاسم" />
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
            autoSelectOwnBranch
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
        {/* #1945 — the linked party is whatever «ربط السند بـ» chose; we only
            show its live context card, driven by the single scenario source. */}
        {derivedRelated.id && (
          <div>
            {derivedRelated.type === "employee" && <EmployeeContextCard employeeId={derivedRelated.id} />}
            {derivedRelated.type === "supplier" && <SupplierContextCard supplierId={derivedRelated.id} />}
            {derivedRelated.type === "customer" && <ClientContextCard clientId={derivedRelated.id} section="invoice" />}
            {derivedRelated.type === "property" && <PropertyUnitContextCard unitId={derivedRelated.id} section="payment" />}
          </div>
        )}
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
        {/* #2237 — رفع/استبدال المستند يتم من لوحة «مستند السجل المالي» الجانبية
            التي تعرضه أثناء الإدخال؛ فأُزيل مربّع الرفع المكرّر الذي كان هنا (كان
            يكتب نفس الحالة attachmentUrl/attachments)، وبقي تصنيف النوع والرابط
            البديل والتحذير الإلزامي. رفع المستند يُحقّق شرط «المرفق إلزامي» مباشرةً. */}
        <p className="text-xs text-muted-foreground">
          ارفع المستند الداعم (إشعار تحويل / وصل استلام / فاتورة) من لوحة «مستند السجل المالي» الجانبية. الحقول أدناه لتصنيف نوع المستند، أو للصق رابطه إن كان مرفوعًا على نظام آخر.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="أو الصق رابط المستند (اختياري)"
            value={form.attachmentUrl.startsWith("data:") ? "" : form.attachmentUrl}
            onChange={(v) => setField("attachmentUrl", v)} placeholder="https://... (إن كان مرفوعًا على نظام آخر)" />
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

      {/* #1715 §11 — backend dry-run preview of the exact JE that will post. */}
      {preview && preview.lines?.length > 0 && (
        <div className="mt-4 border rounded-lg p-3 bg-muted/30">
          <p className="text-xs font-semibold mb-2">معاينة القيد المُولّد (قبل الحفظ)</p>
          <DataTable<{ accountCode: string; debit: number; credit: number }>
            noToolbar
            pageSize={0}
            className="text-xs font-mono"
            data={preview.lines}
            rowKey={(_jl, i) => i}
            columns={[
              { key: "accountCode", header: "الحساب", render: (jl) => jl.accountCode },
              {
                key: "debit", header: "مدين", align: "end",
                render: (jl) => <span className="text-orange-700">{jl.debit ? formatCurrency(jl.debit) : ""}</span>,
              },
              {
                key: "credit", header: "دائن", align: "end",
                render: (jl) => <span className="text-emerald-700">{jl.credit ? formatCurrency(jl.credit) : ""}</span>,
              },
            ] satisfies DataTableColumn<{ accountCode: string; debit: number; credit: number }>[]}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => setLocation("/finance/vouchers")}>إلغاء</Button>
        <Button variant="outline" onClick={handlePreview} disabled={!form.amount || previewMut.isPending} rateLimitAware>
          {previewMut.isPending ? "جاري المعاينة..." : "معاينة القيد"}
        </Button>
        <Button onClick={handleSubmit} disabled={!form.amount || createMut.isPending || !activeCtx.ready} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : `حفظ سند ${form.type === "receipt" ? "القبض" : "الصرف"}`}
        </Button>
      </div>
        </div>
      </div>
    </CreatePageLayout>
  );
}
