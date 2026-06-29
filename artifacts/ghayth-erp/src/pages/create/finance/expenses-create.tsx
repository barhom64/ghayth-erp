import { useState, useEffect } from "react";
import { PAYMENT_METHOD_OPTIONS_WITH_CUSTODY as PAYMENT_METHODS, INVOICE_TYPE_CODES, TAX_CATEGORY_CODES, type TaxCodeOption } from "@/lib/finance-type-maps";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout } from "@workspace/ui-core";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { amountTaxSplit } from "@/lib/tax-math";
import { filterAccountsForPaymentMethod, isMoneyAccount } from "@/lib/finance-account-usage";
import { AlertCircle, Paperclip, Link2, Plus, Trash2, Split, Lock, ChevronDown } from "lucide-react";
import { usePermission } from "@/components/shared/permission-gate";
import { AdvancedSection } from "@/components/shared/advanced-section";
import { type Attachment } from "@/components/shared/file-drop-zone";
import { CostCenterSelect, ProjectSelect, BranchSelect, DepartmentSelect, EmployeeSelect, VehicleSelect } from "@/components/shared/entity-selects";
import { LineAllocationPanel, type LineAllocation, deriveAllocationStatus, buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { EMPTY_ALLOCATION_TARGET, buildOperationalEffectsPayload, type AllocationTargetValue } from "@/components/shared/allocation-target-select";
import { FinanceOperationContextPanel } from "@/components/shared/finance-operation-context-panel";
import { DOCUMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, POSTING_STATUS_LABELS } from "@/lib/finance/status-model";
import { deriveRelatedEntity } from "@/lib/finance/scenario-model";
import { useAppContext } from "@/contexts/app-context";
import { ActiveContextNotice, useActiveFinanceContext } from "@/components/shared/active-context-gate";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { LiveImpactPreview } from "@/components/shared/impact-preview";
import { FinancialAttachmentViewer } from "@/components/shared/financial-attachment-viewer";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";


const expenseTaxSplit = amountTaxSplit;

const TAX_TYPE_TO_CATEGORY: Record<string, string> = {
  standard: "standard",
  reverse_charge: "standard",
  zero: "zero_rated",
  exempt: "exempt",
  out_of_scope: "",
};

const OPERATION_TYPES = [
  { value: "expense", label: "مصروف عام" },
  { value: "salary", label: "راتب / أجر" },
  { value: "advance", label: "سلفة موظف" },
  { value: "fuel", label: "وقود" },
  { value: "maintenance", label: "صيانة" },
  { value: "insurance", label: "تأمين" },
  { value: "rent", label: "إيجار" },
  { value: "vendor_invoice", label: "فاتورة مورد" },
  { value: "purchase", label: "مشتريات" },
  { value: "legal_fee", label: "أتعاب قانونية" },
  { value: "custody", label: "عهدة" },
  { value: "custody_settlement", label: "تسوية عهدة" },
  { value: "advance_claim", label: "مطالبة سلفة" },
  { value: "iqama_renewal", label: "تجديد إقامة (مقيم)" },
  { value: "vehicle_registration", label: "تجديد استمارة مركبة (تم)" },
  { value: "vehicle_inspection", label: "فحص دوري مركبة (تم)" },
  { value: "work_permit_renewal", label: "تجديد رخصة عمل" },
];

const GOV_LINKED_OPERATION_TYPES = ["iqama_renewal", "vehicle_registration", "vehicle_inspection", "work_permit_renewal"];

const EXPENSE_TYPES = [
  { value: "operational", label: "تشغيلية" },
  { value: "administrative", label: "إدارية" },
  { value: "marketing", label: "تسويق" },
  { value: "hr", label: "موارد بشرية" },
  { value: "fleet", label: "أسطول" },
  { value: "property", label: "عقارات" },
  { value: "legal", label: "قانونية" },
  { value: "finance", label: "مالية" },
  { value: "other", label: "أخرى" },
];




const ATTACHMENT_REQUIRED_TYPES = ["vendor_invoice", "purchase", "custody_settlement", "advance_claim", "legal_fee"];

function generateAutoDescription(params: {
  operationType: string;
  relatedEntityName?: string;
  period?: string;
  amount?: number;
  expenseType?: string;
}): string {
  const { operationType, relatedEntityName, period, amount, expenseType } = params;
  const periodLabel = period ? ` / شهر ${period}` : "";
  const entityLabel = relatedEntityName ? ` / ${relatedEntityName}` : "";
  const amountLabel = amount ? ` / ${formatCurrency(Number(amount))}` : "";

  const typeMap: Record<string, string> = {
    salary: `صرف راتب${entityLabel}${periodLabel}`,
    advance: `صرف سلفة للموظف${entityLabel}${periodLabel}`,
    fuel: `مصروف وقود${entityLabel}${amountLabel}`,
    maintenance: `مصروف صيانة مركبة${entityLabel}${amountLabel}`,
    rent: `إيجار${entityLabel}${periodLabel}`,
    vendor_invoice: `فاتورة مورد${entityLabel}${amountLabel}`,
    legal_fee: `أتعاب قانونية${entityLabel}${amountLabel}`,
    purchase: `مشتريات${entityLabel}${amountLabel}`,
    custody: `عهدة${entityLabel}${periodLabel}`,
    insurance: `تأمين${entityLabel}${amountLabel}`,
    expense: `مصروف ${expenseType || "عام"}${entityLabel}${amountLabel}`,
    custody_settlement: `تسوية عهدة${entityLabel}${amountLabel}`,
    advance_claim: `مطالبة سلفة${entityLabel}${amountLabel}`,
  };
  return typeMap[operationType] || `عملية مالية${entityLabel}${amountLabel}`;
}


export default function ExpensesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  // Wave 0.1 — the entering user's active context must be a single branch.
  const activeCtx = useActiveFinanceContext();
  const createMut = useApiMutation("/finance/expenses", "POST", [["expenses"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { data: accountsData, isLoading: accountsLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const { data: taxCodesData } = useApiQuery<{ data: TaxCodeOption[] }>(
    ["tax-codes", "active"],
    "/finance/tax-codes?active=true",
  );
  const activeTaxCodes = (taxCodesData?.data ?? []).filter((t) => t.isActive !== false);
  const { data: govIntegrationsData } = useApiQuery<{ data: any[] }>(["gov-integrations"], "/gov-integrations");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const { data: suppliersData } = useApiQuery<{ data: any[] }>(["suppliers-list"], "/warehouse/suppliers");

  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");
  const { data: contractsData } = useApiQuery<{ data: any[] }>(["contracts-list"], "/properties/contracts");
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["units-list"], "/properties/units");
  // #1715 — cost centers (departments) for the optional multi cost-center split.
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const costCenters = departmentsData?.data || [];
  const projects = projectsData?.data || [];
  const accounts = accountsData?.data || [];
  const expenseAccounts = accounts.filter((a: any) => a.type === "expense" || a.code?.startsWith("5"));
  // #1715: money accounts (any payable/receivable source) classified by
  // accountUsage; unclassified fall back to the legacy 11xx/12xx
  // heuristic so the picker is never empty during the classification
  // window. The per-payment-method narrowing happens below, once `form`
  // is available.
  const moneyAccounts = accounts.filter((a: any) => isMoneyAccount(a));

  const expenseOptions: AutocompleteOption[] = expenseAccounts.map((a: any) => ({
    value: a.code || String(a.id),
    label: `${a.code} - ${a.name}`,
  }));

  const defaultForm = {
    accountCode: "",
    sourceAccountCode: "",
    amount: "",
    description: "",
    date: todayLocal(),
    period: todayLocal().slice(0, 7),
    operationType: "expense",
    expenseType: "operational",
    paymentMethod: "cash",
    vatRate: "",
    taxCodeId: "",
    taxInclusive: false,
    reference: "",
    costCenter: "",
    branchId: selectedBranchId ? String(selectedBranchId) : "",
    companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
    departmentId: "",
    projectId: "",
    taxCategory: "",
    attachmentUrl: "",
    attachmentType: "invoice",
    autoDescription: false,
    isTaxLinked: false,
    invoiceTypeCode: "388",
    taxCategoryCode: "S",
    exemptionReason: "",
    govSyncEnabled: false,
    govIntegrationId: "",
    govEntityType: "",
    govEntityId: "",
  };

  const { form, setForm, clearDraft, isDirty, hasDraft } = useAutoDraft("expense-create", defaultForm);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  // #1715: narrow the money-source picker to accounts whose usage matches
  // the chosen payment method (نقدي→صناديق فقط، تحويل→بنوك فقط، …). The
  // backend (financePostingPolicy) rejects any mismatch even if the UI is
  // bypassed.
  const sourceAccounts = filterAccountsForPaymentMethod(moneyAccounts, form.paymentMethod);
  const sourceOptions: AutocompleteOption[] = sourceAccounts.map((a: any) => ({
    value: a.code || String(a.id),
    label: `${a.code} - ${a.name}`,
  }));
  // اسم الحساب المشتق (للعرض المطويّ للقراءة) — يُجلب من الشجرة بالكود الذي
  // اشتقّه النظام من نوع المصروف (LiveImpactPreview → suggestedAccountCode).
  const derivedAccountName = form.accountCode
    ? accounts.find((a: any) => String(a.code) === String(form.accountCode))?.name
    : undefined;
  // مصدر الصرف (الخزنة/البنك) مطويّ تلقائيًا: عند تطابق خزنة واحدة فقط مع طريقة
  // الدفع (#2230 يختارها تلقائيًا) لا يوجد ما يُختار — تُعرض للقراءة. عند تعدّد
  // الخزائن يبقى المنتقي (اختيار تشغيلي حقيقي: أيّ خزنة). نفس عقيدة «مساعد لا عائق».
  const onlySource = sourceOptions.length === 1 ? sourceOptions[0] : null;

  // Audit item #2 — per-line allocation overrides. Default state mirrors
  // the auto-derived fields (accountCode + costCenter + relatedEntity)
  // so the panel reflects what the backend will resolve before the
  // operator opens it. Any manual edit becomes an override that the
  // submit handler ships under `lineAllocation` and the backend logs.
  const [allocation, setAllocation] = useState<LineAllocation>({});
  // #1715 PR-3: the master «ربط المصروف بـ» field. Its conditional fields
  // feed the same `allocation` dim payload the backend already consumes.
  const [allocTarget, setAllocTarget] = useState<AllocationTargetValue>(EMPTY_ALLOCATION_TARGET);
  // #1945 — the single linked-entity source: derived from the scenario panel.
  const derivedRelated = deriveRelatedEntity(allocTarget.target, allocTarget.allocation);
  const derivedRelatedName = (() => {
    const { type, id } = derivedRelated;
    if (!id) return "";
    if (type === "vehicle") { const v = (vehiclesData?.data || []).find((x: any) => String(x.id) === id); return v ? `${v.plateNumber} - ${v.make} ${v.model}` : ""; }
    if (type === "supplier") { const s = (suppliersData?.data || []).find((x: any) => String(x.id) === id); return s ? s.name : ""; }
    if (type === "employee") { const e = (employeesData?.data || []).find((x: any) => String(x.id) === id); return e ? `${e.name} - ${e.jobTitle || ""}` : ""; }
    if (type === "property") { const u = (unitsData?.data || []).find((x: any) => String(x.id) === id); return u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : ""; }
    if (type === "contract") { const c = (contractsData?.data || []).find((x: any) => String(x.id) === id); return c ? `${c.tenantName} - عقد #${c.id}` : ""; }
    return "";
  })();
  // FIN-P6-FUEL-VEHICLE-WORKSPACE (#2236) — vehicle-fuel is a CONDENSED scenario
  // that DRIVES the journal line: when fuel + vehicle + fuel-log, hide the
  // general accounting fields, derive the amount from liters × price, show a
  // read-only routing card, and hard-gate save on the dimensions the journal
  // needs (vehicleId + supplier + liters/price/odometer). The account itself is
  // resolved server-side (vehicle_fuel_expense → 5510, enforced) — never picked
  // here, so the operator can't post fuel to a fallback account.
  const isFuelScenario =
    form.operationType === "fuel" && allocTarget.target === "vehicle" && !!allocTarget.createFuelLog;
  const fuelLiters = Number(allocTarget.fuelLiters) || 0;
  const fuelPricePerLiter = Number(allocTarget.fuelCostPerLiter) || 0;
  const fuelDerivedAmount = isFuelScenario ? Number((fuelLiters * fuelPricePerLiter).toFixed(2)) : 0;
  // Hard fields required before a vehicle-fuel journal may post.
  const fuelHardMissing: string[] = [];
  if (isFuelScenario) {
    if (!allocTarget.allocation.vehicleId) fuelHardMissing.push("المركبة");
    if (!allocTarget.fuelSupplierUnregistered && !allocTarget.allocation.vendorId)
      fuelHardMissing.push("المورد (محطة الوقود)");
    if (!(fuelLiters > 0)) fuelHardMissing.push("عدد اللترات");
    if (!(fuelPricePerLiter > 0)) fuelHardMissing.push("سعر اللتر");
    if (!allocTarget.fuelOdometer) fuelHardMissing.push("قراءة العداد (الممشى)");
  }

  // #1715 (owner feedback) — the manual GL override is an ADVANCED escape
  // hatch, not a normal path: only finance approvers see it, it's collapsed by
  // default, and any override must carry a documented reason. Smart routing
  // (the operation context + impact preview) is the default for everyone else.
  const canManualOverride = usePermission("finance:approve");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // العقيدة «النظام مساعد لا عائق»: الحساب الفرعي يُشتق تلقائيًا من نوع المصروف
  // ويُعرض مطويًّا (للقراءة) — غير المحاسب لا يختار حسابًا. الاختيار اليدوي
  // مخبّأ خلف زر «تعديل» لا يظهر إلا لمن يملك صلاحية الاعتماد المالي.
  const [manualAccountOpen, setManualAccountOpen] = useState(false);
  // #1715 (owner feedback) — purchase/fleet line item: بند / كمية / وحدة /
  // سعر الوحدة. When quantity × unit price is entered the amount auto-fills.
  const [lineItem, setLineItem] = useState({ itemName: "", quantity: "", unit: "", unitPrice: "" });
  // #1715 — optional multi cost-center distribution. Each row pins a cost
  // center (department id) and a percentage; the backend splits the expense
  // DR into one balanced leg per row. Empty = single-line (legacy) behaviour.
  const [ccDist, setCcDist] = useState<{ costCenterId: string; percentage: string }[]>([]);
  const ccRows = ccDist.filter((r) => r.costCenterId && r.percentage);
  const ccPctTotal = ccRows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
  const ccBalanced = ccRows.length === 0 || Math.abs(ccPctTotal - 100) < 0.01;
  // Keep the account / project dims in sync WITHOUT clobbering the dimensions
  // the «ربط العملية بـ» panel (allocTarget) already merged in. The linked
  // entity now comes solely from the scenario panel — no legacy duplicate.
  useEffect(() => {
    setAllocation((prev) => {
      if (prev.manualOverrideReason) return prev; // operator has pinned — don't clobber
      return { ...prev, accountCode: form.accountCode || undefined, projectId: form.projectId || undefined };
    });
  }, [form.accountCode, form.projectId]);

  const attachmentRequired = ATTACHMENT_REQUIRED_TYPES.includes(form.operationType) ||
    (form.operationType === "payment" && Number(form.amount) >= 5000);

  // #2237 — financial attachment workspace: feed the side viewer from the
  // current attachment (uploaded file or pasted link) and let it upload/replace/
  // remove through the SAME state the bottom block uses (no break to existing
  // upload). The viewer is display-only — it never touches the journal.
  const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
    invoice: "فاتورة", receipt: "وصل استلام", transfer: "إشعار تحويل",
    contract: "عقد", approval: "موافقة", other: "أخرى",
  };
  const viewerAttachments = form.attachmentUrl
    ? [{
        url: form.attachmentUrl,
        name: attachments[0]?.name,
        type: attachments[0]?.type ?? null,
        documentType: ATTACHMENT_TYPE_LABELS[form.attachmentType] ?? form.attachmentType,
        // Internal serial: expense attachments are stored inline (attachmentUrl)
        // with no dedicated attachment entity, so there is no internal serial yet
        // (documented gap — needs a future financial_attachments table).
        serialNo: null,
        status: form.attachmentUrl ? "linked" : "pending",
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

  useEffect(() => {
    if (form.autoDescription) {
      const autoDesc = generateAutoDescription({
        operationType: form.operationType,
        relatedEntityName: derivedRelatedName,
        period: form.period,
        amount: Number(form.amount) || undefined,
        expenseType: form.expenseType,
      });
      setForm(prev => ({ ...prev, description: autoDesc }));
    }
  }, [form.operationType, derivedRelatedName, form.period, form.amount, form.autoDescription, form.expenseType]);

  // #2236 — vehicle fuel: the amount is liters × price (read-only). Keep the
  // form.amount in sync so the journal preview + save use the derived value.
  useEffect(() => {
    if (isFuelScenario && fuelDerivedAmount > 0 && form.amount !== String(fuelDerivedAmount)) {
      setForm((f) => ({ ...f, amount: String(fuelDerivedAmount) }));
    }
  }, [isFuelScenario, fuelDerivedAmount]);

  // #2230 — money source follows the payment method: clear a source that no
  // longer matches the chosen method (cash must not post via a bank account),
  // and auto-select when exactly ONE account matches (نقدي + صندوق واحد →
  // يُختار تلقائيًا). Multiple matches → the operator picks from the filtered
  // list. The backend (financePostingPolicy) remains the hard guard.
  useEffect(() => {
    const codes = filterAccountsForPaymentMethod(moneyAccounts, form.paymentMethod)
      .map((a: any) => a.code || String(a.id));
    setForm((prev) => {
      const stillValid = !!prev.sourceAccountCode && codes.includes(prev.sourceAccountCode);
      if (stillValid) return prev;
      // غير صالح (قديم لا يطابق الطريقة الجديدة، أو فارغ): اختر الخزنة الوحيدة
      // فورًا إن وُجدت، وإلا امسح القديم. خطوة واحدة — لا «امسح ثم عُد» (كان
      // التبديل بين طريقتين أحاديّتي المصدر يترك المصدر فارغًا، Codex P1).
      if (codes.length === 1) return { ...prev, sourceAccountCode: codes[0] };
      return prev.sourceAccountCode ? { ...prev, sourceAccountCode: "" } : prev;
    });
  }, [form.paymentMethod, moneyAccounts.length]);

  // #2238 — the journal-preview verdict gates save: a critical blocker (account
  // not found / unbalanced / required dimension missing / illegal money source)
  // disables the save button so the operator fixes the routing before posting,
  // instead of hitting the «الحساب غير موجود» error after the save round-trip.
  // Rules of Hooks: this useState MUST be declared before the early returns below.
  const [journalBlockers, setJournalBlockers] = useState<{ code: string; message: string }[]>([]);

  if (accountsLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const selectedTaxCode = form.taxCodeId
    ? activeTaxCodes.find((t) => String(t.id) === String(form.taxCodeId))
    : null;
  const effectiveRate = selectedTaxCode ? Number(selectedTaxCode.rate) : Number(form.vatRate) || 0;
  const taxSplit = expenseTaxSplit(Number(form.amount) || 0, effectiveRate, form.taxInclusive);

  const handleTaxCodeChange = (val: string) => {
    if (val === "_none") {
      setForm({ ...form, taxCodeId: "", vatRate: "" });
      return;
    }
    const tc = activeTaxCodes.find((t) => String(t.id) === val);
    if (!tc) return;
    setForm({
      ...form,
      taxCodeId: val,
      vatRate: String(Number(tc.rate) || 0),
      taxInclusive: tc.isInclusiveDefault ?? form.taxInclusive,
      taxCategory: TAX_TYPE_TO_CATEGORY[tc.taxType] ?? form.taxCategory,
      taxCategoryCode: tc.zatcaCategoryCode ?? form.taxCategoryCode,
    });
  };

  // ZATCA-style "Save & add another" — addresses the operator complaint
  // that the system had two different expense forms (single + multi-line).
  // One unified form: by default behaves like a single-line submit, but
  // the secondary button stays on the page and resets ONLY the amount /
  // description / account / allocation, preserving shared header fields
  // (date, branch, payment method, source treasury). Operators get the
  // multi-line workflow without a second form.
  const handleSubmit = async (opts: { addAnother?: boolean } = {}) => {
    const firstError = validate({
      // بند المصروفات اختياري: إن تُرك فارغًا يُوجّهه المحرّك المالي تلقائيًا
      // (قاعدة توجيه → «مصروفات عمومية أخرى» 5399 القابلة للترحيل). غير المحاسب
      // لا يُجبَر على اختيار حساب — النظام يَحضُر لا يُحضَر له.
      amount: form.amount ? null : "المبلغ مطلوب",
      // الفرع ومركز التكلفة أبعاد اختيارية في الخلفية (.optional) — يُشتقّان من
      // سياق الدخول والربط؛ لا يُفرضان على المستخدم (النظام يَحضُر لا يُحضَر له).
      attachmentUrl: attachmentRequired && !form.attachmentUrl ? "المرفق إلزامي — هذا النوع من العمليات يتطلب إرفاق مستند داعم" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (ccRows.length > 0 && !ccBalanced) {
      toast({ variant: "destructive", title: `مجموع نسب توزيع مراكز التكلفة يجب أن يساوي 100% (الحالي ${ccPctTotal}%)` });
      return;
    }
    // #2234 — vehicle fuel must carry a SAVED supplier (the gas station is a
    // supplier, not free text). The unregistered exception is draft-only and
    // policy-gated on the backend; the form still requires an explicit choice.
    if (allocTarget.target === "vehicle" && allocTarget.createFuelLog &&
        !allocTarget.fuelSupplierUnregistered && !allocTarget.allocation.vendorId) {
      toast({ variant: "destructive", title: "اختر مورد محطة الوقود — أو فعّل «مورد غير مسجّل» للمسودة" });
      return;
    }
    // #2236 — vehicle fuel drives the journal line: refuse to post without the
    // hard fields the journal needs (vehicle dimension + supplier + liters/
    // price/odometer). The vehicle dimension is also enforced server-side
    // (account 5510, #2233); this is the early, friendly gate.
    if (isFuelScenario && fuelHardMissing.length > 0) {
      toast({ variant: "destructive", title: `أكمل بيانات الوقود الإلزامية: ${fuelHardMissing.join("، ")}` });
      return;
    }
    try {
      await createMut.mutateAsync({
        accountCode: form.accountCode || undefined,
        sourceAccountCode: form.sourceAccountCode || undefined,
        // #1715 review — post the NET amount. The backend treats `amount` as net
        // and adds VAT on top; when «شامل الضريبة» is on, form.amount is the GROSS
        // the operator typed, so sending it raw posted gross+VAT (more than the
        // on-screen preview). taxSplit.net == form.amount when NOT inclusive, so
        // this only changes the inclusive case.
        amount: Number(taxSplit.net),
        description: [
          form.description,
          lineItem.itemName
            ? `بند: ${lineItem.itemName}${lineItem.quantity ? ` — ${lineItem.quantity} ${lineItem.unit || "وحدة"} × ${lineItem.unitPrice}` : ""}`
            : "",
        ].filter(Boolean).join(" | ") || undefined,
        date: form.date || undefined,
        period: form.period || undefined,
        operationType: form.operationType,
        expenseType: form.expenseType,
        paymentMethod: form.paymentMethod,
        vatRate: form.vatRate ? Number(form.vatRate) : undefined,
        taxCodeId: form.taxCodeId ? Number(form.taxCodeId) : undefined,
        taxInclusive: form.taxCodeId ? form.taxInclusive : undefined,
        reference: form.reference || undefined,
        costCenter: form.costCenter || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        companyId: form.companyId ? Number(form.companyId) : undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        taxCategory: form.taxCategory || undefined,
        relatedEntityType: derivedRelated.type || undefined,
        relatedEntityId: derivedRelated.id ? Number(derivedRelated.id) : undefined,
        relatedEntityName: derivedRelatedName || undefined,
        attachmentUrl: form.attachmentUrl || undefined,
        attachmentType: form.attachmentType || undefined,
        autoDescription: form.autoDescription,
        isTaxLinked: form.isTaxLinked,
        invoiceTypeCode: form.isTaxLinked ? form.invoiceTypeCode : undefined,
        taxCategoryCode: form.isTaxLinked ? form.taxCategoryCode : undefined,
        exemptionReason: form.isTaxLinked && form.exemptionReason ? form.exemptionReason : undefined,
        govSyncEnabled: form.govSyncEnabled || undefined,
        govIntegrationId: form.govIntegrationId ? Number(form.govIntegrationId) : undefined,
        govEntityType: form.govEntityType || undefined,
        govEntityId: form.govEntityId ? Number(form.govEntityId) : undefined,
        // Audit item #2 — ship operator overrides (if any field was pinned)
        lineAllocation: Object.values(allocation).some((v) => v != null && v !== "")
          ? buildAllocationPayload(allocation)
          : undefined,
        // #1715 — multi cost-center distribution (percentage-based).
        costCenterDistribution: ccRows.length > 0
          ? ccRows.map((r) => ({ costCenterId: Number(r.costCenterId), percentage: Number(r.percentage) }))
          : undefined,
        // #1715 — maintenance ticket / fixed-asset / fuel-log effects, built by
        // the shared helper (same mapping as the voucher form — single source).
        ...buildOperationalEffectsPayload(allocTarget),
      });
      toast({ title: "تم إضافة المصروف بنجاح" });
      clearDraft();
      if (opts.addAnother) {
        // Reset only the line-specific fields so the operator can keep
        // adding expenses against the same date / branch / source /
        // payment method without re-typing them. Mirrors the multi-line
        // form's UX in a single page.
        setForm((f) => ({
          ...f,
          accountCode: "",
          amount: "",
          description: "",
          vatRate: "",
          taxCodeId: "",
          taxInclusive: false,
          reference: "",
          projectId: "",
          attachmentUrl: "",
        }));
        setAllocation({});
        setAllocTarget(EMPTY_ALLOCATION_TARGET);
        setAttachments([]);
        return;
      }
      setLocation("/finance/expenses");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: err?.message || "حدث خطأ أثناء إضافة المصروف" });
    }
  };

  return (
    <CreatePageLayout title="إضافة مصروف جديد" backPath="/finance/expenses" isDirty={isDirty}>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div data-form className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 lg:items-start">
        {/* #2237 — financial attachment workspace: the document sits beside the
            items form (left in RTL, sticky) during entry, instead of a bottom
            upload field. Reusable across entry/approval/view (create mode here). */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <FormFieldWrapper label="التاريخ" required>
            <DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          </FormFieldWrapper>
          <TextField label="الفترة المالية" type="month" value={form.period} onChange={(v) => setForm({ ...form, period: v })} />
        </div>

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">تصنيف العملية</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="نوع العملية">
              <Select value={form.operationType} onValueChange={(v) => setForm({ ...form, operationType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="التصنيف التفصيلي">
              <Select value={form.expenseType} onValueChange={(v) => setForm({ ...form, expenseType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="طريقة الدفع">
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          </div>
        </div>

        {/* #1715 (owner reorder #6) — السيناريو التشغيلي comes right after
            operation info, BEFORE the accounts, so the scenario drives the
            smart accounting direction instead of the operator picking accounts
            blind. */}
        <FinanceOperationContextPanel
          value={allocTarget}
          onChange={(v) => { setAllocTarget(v); setAllocation((prev) => ({ ...prev, ...v.allocation })); }}
          title="ربط المصروف بـ (السيناريو التشغيلي)"
          description="اختر ما يُربط به المصروف، وستظهر الحقول المناسبة فقط. الربط يُنتج الأبعاد المحاسبية ومركز التكلفة تلقائياً."
        />

        {/* «التوجيه المحاسبي المتوقّع» live: suggested debit/credit account,
            cost-center budget, linked entity, operational effect, future task. */}
        {form.amount && Number(form.amount) > 0 && (
          <div className="mb-4">
            <LiveImpactPreview
              endpoint="/finance/expenses/impact-preview"
              enabled={Boolean(form.amount && Number(form.amount) > 0)}
              payload={{
                // #2238 — ship the FULL expense inputs so the backend builds the
                // REAL journal plan (debit/credit + dimensions) through the same
                // shared resolver the save path uses. `amount` is the NET (the
                // backend adds VAT on top), matching the save payload exactly.
                amount: Number(taxSplit.net),
                expenseType: form.expenseType,
                paymentMethod: form.paymentMethod,
                costCenter: form.costCenter,
                accountCode: form.accountCode || undefined,
                sourceAccountCode: form.sourceAccountCode || undefined,
                relatedEntityType: derivedRelated.type || undefined,
                relatedEntityId: derivedRelated.id ? Number(derivedRelated.id) : undefined,
                projectId: form.projectId ? Number(form.projectId) : undefined,
                vatRate: form.vatRate ? Number(form.vatRate) : undefined,
                operationType: form.operationType,
                lineAllocation: Object.values(allocation).some((v) => v != null && v !== "")
                  ? buildAllocationPayload(allocation)
                  : undefined,
                costCenterDistribution: ccRows.length > 0
                  ? ccRows.map((r) => ({ costCenterId: Number(r.costCenterId), percentage: Number(r.percentage) }))
                  : undefined,
                supplierId: derivedRelated.type === "supplier" && derivedRelated.id ? Number(derivedRelated.id) : undefined,
                targetType: allocTarget.target !== "none" ? allocTarget.target : undefined,
                itemType: form.expenseType || undefined,
              }}
              // #1945 (owner review #3) — the scenario's suggested account becomes
              // the real DEFAULT at save: pre-fill the (editable) charge account
              // when the operator hasn't chosen one. Override stays one edit away.
              // #2238 — capture the journal-preview blockers to gate the save button.
              onResult={(r) => {
                if (r.suggestedAccountCode && !form.accountCode) {
                  setForm((f) => (f.accountCode ? f : { ...f, accountCode: r.suggestedAccountCode! }));
                }
                setJournalBlockers(r.journalPreview?.ready ? (r.journalPreview.blockers ?? []) : []);
              }}
            />
          </div>
        )}

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحسابات المحاسبية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* #2236 — in the condensed fuel scenario the charge account is
                resolved by the financial engine (vehicle_fuel_expense), not
                picked by hand, so fuel can't be posted to a fallback account. */}
            {isFuelScenario ? (
              <FormFieldWrapper label="بند المصروفات (توجيه تلقائي)">
                <div className="rounded-md border bg-muted/40 p-2 text-sm flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>
                    {form.accountCode
                      ? `حساب وقود المركبة: ${form.accountCode}`
                      : "يُشتق تلقائيًا من ربط المركبة…"}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      يحدّده المحرّك المالي ويتحقّق منه preflight — غير قابل للتعديل اليدوي.
                    </span>
                  </span>
                </div>
              </FormFieldWrapper>
            ) : (
              <FormFieldWrapper label="بند المصروفات (توجيه تلقائي حسب نوع المصروف)">
                {/* العقيدة: الحساب الفرعي مطويّ ومُشتق من نوع المصروف — يُعرض
                    للقراءة، ولا يختاره غير المحاسب. زر «تعديل» (لذوي صلاحية
                    الاعتماد فقط) يفتح المنتقي اليدوي عند الحاجة النادرة. */}
                <div className="rounded-md border bg-muted/40 p-2 text-sm flex items-start gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="block">
                      {form.accountCode
                        ? `حساب المصروف: ${form.accountCode}${derivedAccountName ? ` — ${derivedAccountName}` : ""}`
                        : "يُشتق تلقائيًا حسب نوع المصروف عند إدخال المبلغ…"}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      يحدّده النظام حسب «التصنيف التفصيلي» أعلاه — لا حاجة لاختياره يدويًا.
                    </span>
                  </div>
                  {canManualOverride && (
                    <button type="button" onClick={() => setManualAccountOpen((v) => !v)}
                      className="text-xs text-status-info-foreground hover:underline shrink-0 flex items-center gap-1">
                      {manualAccountOpen ? "إخفاء" : "تعديل"}
                      <ChevronDown className={`h-3 w-3 transition-transform ${manualAccountOpen ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
                {canManualOverride && manualAccountOpen && (
                  <div className="mt-2">
                    <Autocomplete options={expenseOptions} value={form.accountCode}
                      onChange={(val) => setForm(prev => ({ ...prev, accountCode: String(val) }))}
                      placeholder="اتركه فارغًا للتوجيه التلقائي…" loading={accountsLoading} />
                    <p className="text-xs text-muted-foreground mt-1">
                      تجاوز يدوي (لذوي الصلاحية) — اتركه فارغًا ليوجّهه النظام تلقائيًا.
                    </p>
                  </div>
                )}
              </FormFieldWrapper>
            )}
            <FormFieldWrapper label="مصدر الصرف (الخزنة / البنك)">
              {onlySource ? (
                /* خزنة واحدة متطابقة مع طريقة الدفع — تُعرض مطويّة للقراءة (لا
                   بديل لاختياره). تغيير «طريقة الدفع» أعلاه يعيد الترشيح. */
                <div className="rounded-md border bg-muted/40 p-2 text-sm flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>
                    {onlySource.label}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      الخزنة الوحيدة المطابقة لطريقة الدفع — تُحدَّد تلقائيًا.
                    </span>
                  </span>
                </div>
              ) : (
                <Autocomplete options={sourceOptions} value={form.sourceAccountCode}
                  onChange={(val) => setForm(prev => ({ ...prev, sourceAccountCode: String(val) }))}
                  placeholder="ابحث عن مصدر صرف..." loading={accountsLoading} />
              )}
            </FormFieldWrapper>
          </div>
        </div>

        {/* #1715 (owner feedback) — purchase/fleet line item: بند / كمية /
            وحدة / سعر الوحدة. The amount auto-fills from الكمية × سعر الوحدة. */}
        {/* #2236 — vehicle-fuel: a condensed read-only summary of the fuel log
            (liters × price = amount, odometer) next to the live journal preview,
            instead of the generic line-item block. */}
        {isFuelScenario && (
          <div className="border rounded-lg p-4 mb-4 space-y-2 bg-muted/30">
            <h3 className="font-semibold text-sm text-muted-foreground">ملخّص تعبئة الوقود</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div><span className="text-xs text-muted-foreground block">اللترات</span>{fuelLiters || "—"}</div>
              <div><span className="text-xs text-muted-foreground block">سعر اللتر</span>{fuelPricePerLiter || "—"}</div>
              <div><span className="text-xs text-muted-foreground block">العداد</span>{allocTarget.fuelOdometer || "—"}</div>
              <div><span className="text-xs text-muted-foreground block">المبلغ (لتر×سعر)</span><span className="font-mono font-medium">{formatCurrency(fuelDerivedAmount)}</span></div>
            </div>
            {fuelHardMissing.length > 0 && (
              <p className="text-xs text-status-warning-foreground">أكمل: {fuelHardMissing.join("، ")}</p>
            )}
          </div>
        )}

        {(form.operationType === "purchase" || form.expenseType === "fleet") && !isFuelScenario && (
          <div className="border rounded-lg p-4 mb-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">تفاصيل البند</h3>
            <p className="text-xs text-muted-foreground">أدخل بند الشراء وكميته؛ يُحسب المبلغ تلقائياً (الكمية × سعر الوحدة).</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <FormFieldWrapper label="بند المصروف">
                <Input value={lineItem.itemName} onChange={(e) => setLineItem({ ...lineItem, itemName: e.target.value })} placeholder="مثال: إطارات" />
              </FormFieldWrapper>
              <FormFieldWrapper label="الكمية">
                <Input type="number" step="0.01" value={lineItem.quantity} onChange={(e) => {
                  const q = e.target.value; setLineItem((li) => ({ ...li, quantity: q }));
                  if (Number(q) > 0 && Number(lineItem.unitPrice) > 0) setForm((f) => ({ ...f, amount: String(Number((Number(q) * Number(lineItem.unitPrice)).toFixed(2))) }));
                }} placeholder="0" />
              </FormFieldWrapper>
              <FormFieldWrapper label="الوحدة">
                <Input value={lineItem.unit} onChange={(e) => setLineItem({ ...lineItem, unit: e.target.value })} placeholder="قطعة / لتر / كجم" />
              </FormFieldWrapper>
              <FormFieldWrapper label="سعر الوحدة">
                <Input type="number" step="0.01" value={lineItem.unitPrice} onChange={(e) => {
                  const p = e.target.value; setLineItem((li) => ({ ...li, unitPrice: p }));
                  if (Number(lineItem.quantity) > 0 && Number(p) > 0) setForm((f) => ({ ...f, amount: String(Number((Number(lineItem.quantity) * Number(p)).toFixed(2))) }));
                }} placeholder="0.00" />
              </FormFieldWrapper>
            </div>
            {Number(lineItem.quantity) > 0 && Number(lineItem.unitPrice) > 0 && (
              <p className="text-xs text-status-info-foreground">الإجمالي: {formatCurrency(Number(lineItem.quantity) * Number(lineItem.unitPrice))} ({lineItem.quantity} × {lineItem.unitPrice})</p>
            )}
          </div>
        )}

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">المبالغ والضريبة</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NumberField label={isFuelScenario ? "المبلغ (لتر × سعر — تلقائي)" : "المبلغ (ريال)"} required value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })} min={0} step={0.01} placeholder="0.00"
              disabled={isFuelScenario} />
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
                  id="expTaxInclusive"
                  checked={form.taxInclusive}
                  onCheckedChange={(v) => setForm({ ...form, taxInclusive: v })}
                  disabled={!form.taxCodeId || effectiveRate === 0}
                />
                <Label htmlFor="expTaxInclusive" className="text-sm">
                  {form.taxInclusive ? "شامل الضريبة" : "غير شامل"}
                </Label>
              </div>
            </FormFieldWrapper>
            {/* #1945 — «التصنيف الضريبي» اليدوي أُزيل: يُشتق تلقائيًا من رمز
                الضريبة المختار (TAX_TYPE_TO_CATEGORY) فلا يتكرر مع رمز الضريبة. */}
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

        <AdvancedSection
          perm="finance:update"
          title="مركز التكلفة والمرجع — نمذجة محاسبية (اختياري)"
          className="mb-4"
          summary={
            <span>
              الأبعاد المحاسبية تُشتقّ تلقائيًا من الفرع والربط
              {form.costCenter ? <> · مركز التكلفة: <b>{form.costCenter}</b></> : null}.
            </span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BranchSelect
              value={form.branchId}
              onChange={(v) => setForm({ ...form, branchId: v })}
              label="الفرع"
              autoSelectOwnBranch
            />
            <DepartmentSelect
              value={form.departmentId}
              onChange={(v) => setForm({ ...form, departmentId: v })}
              label="القسم / الإدارة"
            />
            <CostCenterSelect
              value={form.costCenter}
              onChange={(v) => setForm({ ...form, costCenter: v })}
            />
            <ProjectSelect
              value={form.projectId}
              onChange={(v) => {
                const proj = projects.find((p: any) => String(p.id) === v);
                const costCenter = proj ? `مشروع-${proj.name || proj.title}` : form.costCenter;
                setForm({ ...form, projectId: v, costCenter });
              }}
              label="المشروع المرتبط"
            />
            <TextField label="رقم المرجع / الفاتورة" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })}
              placeholder="رقم الفاتورة أو أمر الشراء" />
          </div>
          {/* #1945 — the linked entity (الجهة المرتبطة) is no longer a separate
              duplicate picker; it is whatever «ربط المصروف بـ» chose. We only
              show the entity's context card here so the operator still gets the
              live context, driven by the single scenario source. */}
          {derivedRelated.id && (
            <div>
              {derivedRelated.type === "employee" && <EmployeeContextCard employeeId={derivedRelated.id} />}
              {derivedRelated.type === "vehicle" && <VehicleContextCard vehicleId={derivedRelated.id} section="maintenance" />}
              {derivedRelated.type === "supplier" && <SupplierContextCard supplierId={derivedRelated.id} />}
              {derivedRelated.type === "property" && <PropertyUnitContextCard unitId={derivedRelated.id} section="payment" />}
            </div>
          )}
        </AdvancedSection>

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground">البيان</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.autoDescription}
                onCheckedChange={(v) => setForm({ ...form, autoDescription: v === true })} />
              توليد بيان تلقائي
            </label>
          </div>
          <TextField label="البيان" value={form.description} onChange={(v) => setForm({ ...form, description: v })}
            placeholder={form.autoDescription ? "سيتم توليده تلقائياً..." : "أدخل وصفاً للمصروف"}
            disabled={form.autoDescription} />
        </div>

        {/* #1715 (owner feedback) — ADVANCED manual override. Hidden entirely
            for non-approvers (smart routing is their only path); collapsed by
            default for approvers; any override requires a documented reason
            (logged to «Manual Overrides»). It is NOT a substitute for the
            smart operation context above. */}
        {canManualOverride && !isFuelScenario && (
          <div className="border border-dashed rounded-lg p-4 mb-4 space-y-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center justify-between w-full text-sm font-semibold text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4" /> التفاصيل اليدوية المتقدمة (تجاوز يدوي — يتطلب صلاحية وسبب)
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </button>
            {advancedOpen && (
              <>
                <p className="text-xs text-muted-foreground">
                  التوجيه الذكي أعلاه يحدّد الحساب والأبعاد تلقائياً. لا تفتح هذا القسم إلا لتجاوز
                  الحساب أو إضافة بُعد مفقود، ويجب إرفاق سبب نصّي — سيُسجَّل في تقرير «Manual Overrides».
                </p>
                <LineAllocationPanel
                  value={allocation}
                  onChange={setAllocation}
                  status={deriveAllocationStatus(allocation)}
                  required={false}
                />
              </>
            )}
          </div>
        )}

        {/* #1715 — multi cost-center distribution. Optional; when used, the
            expense DR is split into one balanced leg per cost center. */}
        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Split className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-muted-foreground">توزيع على عدة مراكز تكلفة (اختياري)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            وزّع المصروف على أكثر من مركز تكلفة بالنسبة المئوية. عند الاستخدام يُقسَّم الطرف المدين تلقائيًا إلى سطر متوازن لكل مركز،
            ويجب أن يساوي مجموع النسب 100%. اتركه فارغًا لتسجيل المصروف على مركز التكلفة الواحد أعلاه.
          </p>
          {ccDist.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <FormFieldWrapper label="مركز التكلفة">
                  <Select
                    value={row.costCenterId}
                    onValueChange={(v) => setCcDist((d) => d.map((r, j) => (j === i ? { ...r, costCenterId: v } : r)))}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر مركز التكلفة" /></SelectTrigger>
                    <SelectContent>
                      {costCenters.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormFieldWrapper>
              </div>
              <div className="w-28">
                <NumberField
                  label="النسبة %"
                  value={row.percentage}
                  onChange={(v) => setCcDist((d) => d.map((r, j) => (j === i ? { ...r, percentage: String(v) } : r)))}
                  min={0} max={100} step={0.01} placeholder="0"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setCcDist((d) => d.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4 text-status-error" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => setCcDist((d) => [...d, { costCenterId: "", percentage: "" }])}>
              <Plus className="h-4 w-4 me-1" /> إضافة مركز تكلفة
            </Button>
            {ccRows.length > 0 && (
              <span className={`text-sm font-medium ${ccBalanced ? "text-status-success-foreground" : "text-status-error"}`}>
                مجموع النسب: {ccPctTotal}% {ccBalanced ? "✓" : "(يجب أن يساوي 100%)"}
              </span>
            )}
          </div>
        </div>

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-muted-foreground">المرفقات</h3>
            {attachmentRequired && <span className="text-xs text-status-error font-medium">(إلزامي لهذا النوع)</span>}
          </div>
          {attachmentRequired && !form.attachmentUrl && (
            <div className="flex items-start gap-2 p-3 bg-status-error-surface border border-status-error-surface rounded-md">
              <AlertCircle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
              <p className="text-sm text-status-error-foreground">هذا النوع من العمليات يستوجب إرفاق مستند داعم (فاتورة، وصل استلام، أو إشعار تحويل) قبل الحفظ.</p>
            </div>
          )}
          {/* #2237 — رفع/استبدال المستند يتم من لوحة «مستند السجل المالي»
              الجانبية (FinancialAttachmentViewer) التي تعرضه أثناء الإدخال؛
              فأُزيل مربّع الرفع المكرّر الذي كان هنا (كان يكتب نفس الحالة
              attachmentUrl/attachments)، وبقي تصنيف النوع والرابط البديل
              والتحذير الإلزامي. رفع المستند (عبر اللوحة الجانبية أو لصق رابط)
              يُحقّق شرط «المرفق إلزامي» مباشرةً. */}
          <p className="text-xs text-muted-foreground">
            ارفع المستند الداعم (فاتورة / وصل استلام / إشعار تحويل) من لوحة «مستند السجل المالي» الجانبية. الحقول أدناه لتصنيف نوع المستند، أو للصق رابطه إن كان مرفوعًا على نظام آخر.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="أو الصق رابط المستند (اختياري)"
              value={form.attachmentUrl.startsWith("data:") ? "" : form.attachmentUrl}
              onChange={(v) => setForm({ ...form, attachmentUrl: v })}
              placeholder="https://... (إن كان المستند مرفوعًا على نظام آخر)" />
            <FormFieldWrapper label="نوع المرفق">
              <Select value={form.attachmentType} onValueChange={(v) => setForm({ ...form, attachmentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">فاتورة</SelectItem>
                  <SelectItem value="receipt">وصل استلام</SelectItem>
                  <SelectItem value="transfer">إشعار تحويل</SelectItem>
                  <SelectItem value="contract">عقد</SelectItem>
                  <SelectItem value="approval">موافقة</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          </div>
        </div>

        {/* #1945 — الحالة/الدفع/الترحيل مفصولة وغير قابلة للعبث اليدوي.
            «تم الدفع» و«الحالة» القديمتان كانتا بلا أثر فعلي (القيد يُرحَّل
            ويخرج المال بصرف النظر عنهما، و«في انتظار الموافقة» كانت تُرفض من
            الخادم)، فأُزيلتا. الحالة الحقيقية تُحسم على الخادم بعد الحفظ حسب
            سياسة الاعتماد، وتُعرض هنا بشفافية على ثلاثة محاور منفصلة. */}
        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحالة والدفع والترحيل</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">حالة المستند</div>
              <div className="font-medium">{DOCUMENT_STATUS_LABELS.draft} ← {DOCUMENT_STATUS_LABELS.approved}</div>
              <p className="text-xs text-muted-foreground mt-1">تُحسم بعد الحفظ: تُعتمد فورًا إن لم تتجاوز حدّ الاعتماد، وإلا تُرسَل للاعتماد.</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">حالة الدفع</div>
              <div className="font-medium">{form.sourceAccountCode ? PAYMENT_STATUS_LABELS.paid : PAYMENT_STATUS_LABELS.unpaid}</div>
              <p className="text-xs text-muted-foreground mt-1">{form.sourceAccountCode ? "يخرج المال من «مصدر الصرف» المحدّد." : "اختر «مصدر الصرف» لينتج أثر خروج المال."}</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">حالة الترحيل</div>
              <div className="font-medium">{POSTING_STATUS_LABELS.posted}</div>
              <p className="text-xs text-muted-foreground mt-1">يُرحَّل القيد فور الحفظ (أو بعد الاعتماد إن لزم).</p>
            </div>
          </div>
        </div>

        {GOV_LINKED_OPERATION_TYPES.includes(form.operationType) && (
          <div className="border border-status-info-surface rounded-lg p-4 mb-4 space-y-3 bg-status-info-surface">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-status-info-foreground" />
              <h3 className="font-semibold text-sm text-status-info-foreground">الربط بنظام حكومي</h3>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="govSyncEnabled"
                checked={!!form.govSyncEnabled}
                onCheckedChange={(v) => setForm({ ...form, govSyncEnabled: v === true })}
              />
              <label htmlFor="govSyncEnabled" className="text-sm cursor-pointer font-medium">
                ربط هذا المصروف بنظام حكومي خارجي
              </label>
            </div>
            {form.govSyncEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormFieldWrapper label="النظام الحكومي">
                  <Select
                    value={form.govIntegrationId || "_none"}
                    onValueChange={(v) => setForm({ ...form, govIntegrationId: v === "_none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— اختر النظام —</SelectItem>
                      {(govIntegrationsData?.data || []).filter((gi: any) => gi.enabled).map((gi: any) => (
                        <SelectItem key={gi.id} value={String(gi.id)}>{gi.name}</SelectItem>
                      ))}
                      {(govIntegrationsData?.data || []).filter((gi: any) => gi.enabled).length === 0 && (
                        <SelectItem disabled value="_none">لا توجد أنظمة مفعّلة — فعّل النظام من الإعدادات</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </FormFieldWrapper>
                <FormFieldWrapper label="نوع الكيان المرتبط">
                  <Select
                    value={form.govEntityType || "_none"}
                    onValueChange={(v) => setForm({ ...form, govEntityType: v === "_none" ? "" : v, govEntityId: "" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— اختر النوع —</SelectItem>
                      <SelectItem value="employee">موظف (إقامة / تصريح)</SelectItem>
                      <SelectItem value="vehicle">مركبة (استمارة / فحص)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormFieldWrapper>
                {form.govEntityType === "employee" && (
                  <EmployeeSelect
                    value={form.govEntityId}
                    onChange={(v) => setForm({ ...form, govEntityId: v })}
                    label="الموظف المرتبط"
                    allowCreate={false}
                  />
                )}
                {form.govEntityType === "vehicle" && (
                  <VehicleSelect
                    value={form.govEntityId}
                    onChange={(v) => setForm({ ...form, govEntityId: v })}
                    label="المركبة المرتبطة"
                    allowCreate={false}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* #1945 — the old «القيد اليومي المتوقع» table hard-coded 1100/1400
            and never matched what posts. The real, server-resolved entry is
            shown by «التوجيه المحاسبي المتوقّع» (LiveImpactPreview) above. */}

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-status-success-foreground">🏛</span>
              ربط مع هيئة الزكاة والضريبة والجمارك
            </h3>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setForm({ ...form, isTaxLinked: !form.isTaxLinked })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isTaxLinked ? "bg-green-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isTaxLinked ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <span className="text-sm font-medium">{form.isTaxLinked ? "مفعّل" : "غير مفعّل"}</span>
            </label>
          </div>
          {form.isTaxLinked && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
            <FormFieldWrapper label="نوع الفاتورة الضريبية">
              <Select value={form.invoiceTypeCode} onValueChange={(v) => setForm({ ...form, invoiceTypeCode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_TYPE_CODES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="فئة الضريبة">
              <Select value={form.taxCategoryCode} onValueChange={(v) => setForm({ ...form, taxCategoryCode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CATEGORY_CODES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
              {(form.taxCategoryCode === "E" || form.taxCategoryCode === "Z") && (
                <TextField label="سبب الإعفاء / النسبة الصفرية" value={form.exemptionReason}
                  onChange={(v) => setForm({ ...form, exemptionReason: v })}
                  placeholder="أدخل سبب الإعفاء..." />
              )}
              <div className="md:col-span-3 flex items-start gap-2 p-3 bg-status-success-surface border border-status-success-surface rounded-md">
                <span className="text-status-success-foreground text-xs mt-0.5">✓</span>
                <p className="text-xs text-status-success-foreground">سيتم ربط هذا المصروف مع منظومة الفوترة الإلكترونية لهيئة الزكاة والضريبة وتوليد رمز استجابة سريعة متوافق عند الإرسال للهيئة.</p>
              </div>
            </div>
          )}
        </div>

        {/* #2238 — surface why save is blocked (critical journal-preview blocker). */}
        {journalBlockers.length > 0 && (
          <div className="mt-4 rounded-lg border border-status-error-surface bg-status-error-surface p-3 text-xs text-status-error-foreground">
            <p className="font-semibold mb-1">لا يمكن الحفظ — أصلِح القيد أولًا:</p>
            <ul className="list-disc pr-4 space-y-0.5">
              {journalBlockers.map((b, i) => <li key={i}>{b.message}</li>)}
            </ul>
          </div>
        )}

        {/* #2236 — fuel hard-field gate: surface the missing dimensions the
            vehicle-fuel journal needs before the save buttons unlock. */}
        {isFuelScenario && fuelHardMissing.length > 0 && (
          <div className="mt-4 rounded-lg border border-status-warning-surface bg-status-warning-surface p-3 text-xs text-status-warning-foreground">
            <p className="font-semibold mb-1">لإتمام قيد وقود المركبة، أكمل:</p>
            <ul className="list-disc pr-4 space-y-0.5">
              {fuelHardMissing.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/finance/expenses")}>إلغاء</Button>
          <Button variant="secondary" onClick={() => handleSubmit({ addAnother: true })} disabled={createMut.isPending || !activeCtx.ready || journalBlockers.length > 0 || (isFuelScenario && fuelHardMissing.length > 0)} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ وإضافة آخر"}
          </Button>
          <Button onClick={() => handleSubmit()} disabled={createMut.isPending || !activeCtx.ready || journalBlockers.length > 0 || (isFuelScenario && fuelHardMissing.length > 0)} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ المصروف"}
          </Button>
        </div>
        </div>
      </div>
    </CreatePageLayout>
  );
}
