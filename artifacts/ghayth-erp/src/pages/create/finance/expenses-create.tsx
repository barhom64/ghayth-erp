import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
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
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { CostCenterSelect, ProjectSelect, BranchSelect, DepartmentSelect, EmployeeSelect, VehicleSelect } from "@/components/shared/entity-selects";
import { LineAllocationPanel, type LineAllocation, deriveAllocationStatus, buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { EMPTY_ALLOCATION_TARGET, type AllocationTargetValue } from "@/components/shared/allocation-target-select";
import { FinanceOperationContextPanel } from "@/components/shared/finance-operation-context-panel";
import { useAppContext } from "@/contexts/app-context";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { LiveImpactPreview } from "@/components/shared/impact-preview";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface TaxCodeOption {
  id: number;
  code: string;
  name: string;
  rate: number | string;
  taxType: "standard" | "zero" | "exempt" | "out_of_scope" | "reverse_charge";
  zatcaCategoryCode: string | null;
  isInclusiveDefault: boolean;
  isActive: boolean;
}

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

const PAYMENT_METHODS = [
  { value: "cash", label: "نقدي" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "check", label: "شيك" },
  { value: "credit_card", label: "بطاقة ائتمان" },
  { value: "custody", label: "من العهدة" },
];

const TAX_CATEGORIES = [
  { value: "", label: "بدون تصنيف" },
  { value: "exempt", label: "معفى" },
  { value: "zero_rated", label: "نسبة صفرية" },
  { value: "standard", label: "النسبة الأساسية (15%)" },
  { value: "reduced", label: "نسبة مخفضة (5%)" },
];

const ATTACHMENT_REQUIRED_TYPES = ["vendor_invoice", "purchase", "custody_settlement", "advance_claim", "legal_fee"];

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

function getRelatedEntityLabel(entityType: string, entityId: string, data: {
  employees: any[];
  vehicles: any[];
  suppliers: any[];
  contracts: any[];
  units: any[];
  legalCases: any[];
}): string {
  if (!entityId) return "";
  const id = entityId;
  if (entityType === "employee") {
    const emp = data.employees.find((e: any) => String(e.id) === id);
    return emp ? `${emp.name} - ${emp.jobTitle || ""}` : "";
  }
  if (entityType === "vehicle") {
    const v = data.vehicles.find((v: any) => String(v.id) === id);
    return v ? `${v.plateNumber} - ${v.make} ${v.model}` : "";
  }
  if (entityType === "supplier") {
    const s = data.suppliers.find((s: any) => String(s.id) === id);
    return s ? s.name : "";
  }
  if (entityType === "contract") {
    const c = data.contracts.find((c: any) => String(c.id) === id);
    return c ? `${c.tenantName} - عقد #${c.id}` : "";
  }
  if (entityType === "property") {
    const u = data.units.find((u: any) => String(u.id) === id);
    return u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : "";
  }
  if (entityType === "legal_case") {
    const c = data.legalCases.find((c: any) => String(c.id) === id);
    return c ? `${c.title || c.caseNumber || `قضية #${c.id}`}` : "";
  }
  return "";
}

export default function ExpensesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
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
  const { data: legalCasesData } = useApiQuery<{ data: any[] }>(["legal-cases-list"], "/legal/cases");
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
    relatedEntityType: "",
    relatedEntityId: "",
    relatedEntityName: "",
    attachmentUrl: "",
    attachmentType: "invoice",
    isPaid: true,
    autoDescription: false,
    status: "draft",
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

  // Audit item #2 — per-line allocation overrides. Default state mirrors
  // the auto-derived fields (accountCode + costCenter + relatedEntity)
  // so the panel reflects what the backend will resolve before the
  // operator opens it. Any manual edit becomes an override that the
  // submit handler ships under `lineAllocation` and the backend logs.
  const [allocation, setAllocation] = useState<LineAllocation>({});
  // #1715 PR-3: the master «ربط المصروف بـ» field. Its conditional fields
  // feed the same `allocation` dim payload the backend already consumes.
  const [allocTarget, setAllocTarget] = useState<AllocationTargetValue>(EMPTY_ALLOCATION_TARGET);
  // #1715 (owner feedback) — the manual GL override is an ADVANCED escape
  // hatch, not a normal path: only finance approvers see it, it's collapsed by
  // default, and any override must carry a documented reason. Smart routing
  // (the operation context + impact preview) is the default for everyone else.
  const canManualOverride = usePermission("finance:approve");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // #1715 — optional multi cost-center distribution. Each row pins a cost
  // center (department id) and a percentage; the backend splits the expense
  // DR into one balanced leg per row. Empty = single-line (legacy) behaviour.
  const [ccDist, setCcDist] = useState<{ costCenterId: string; percentage: string }[]>([]);
  const ccRows = ccDist.filter((r) => r.costCenterId && r.percentage);
  const ccPctTotal = ccRows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
  const ccBalanced = ccRows.length === 0 || Math.abs(ccPctTotal - 100) < 0.01;
  useEffect(() => {
    setAllocation((prev) => {
      if (prev.manualOverrideReason) return prev; // operator has pinned — don't clobber
      const next: LineAllocation = {
        accountCode: form.accountCode || undefined,
        projectId: form.projectId || undefined,
        vehicleId: form.relatedEntityType === "vehicle" && form.relatedEntityId ? form.relatedEntityId : undefined,
        propertyId: form.relatedEntityType === "property" && form.relatedEntityId ? form.relatedEntityId : undefined,
        contractId: form.relatedEntityType === "contract" && form.relatedEntityId ? form.relatedEntityId : undefined,
      };
      return next;
    });
  }, [form.accountCode, form.projectId, form.relatedEntityType, form.relatedEntityId]);

  const attachmentRequired = ATTACHMENT_REQUIRED_TYPES.includes(form.operationType) ||
    (form.operationType === "payment" && Number(form.amount) >= 5000);

  useEffect(() => {
    if (form.autoDescription) {
      const autoDesc = generateAutoDescription({
        operationType: form.operationType,
        relatedEntityName: form.relatedEntityName,
        period: form.period,
        amount: Number(form.amount) || undefined,
        expenseType: form.expenseType,
      });
      setForm(prev => ({ ...prev, description: autoDesc }));
    }
  }, [form.operationType, form.relatedEntityName, form.period, form.amount, form.autoDescription, form.expenseType]);

  if (accountsLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const selectedTaxCode = form.taxCodeId
    ? activeTaxCodes.find((t) => String(t.id) === String(form.taxCodeId))
    : null;
  const effectiveRate = selectedTaxCode ? Number(selectedTaxCode.rate) : Number(form.vatRate) || 0;
  const taxSplit = expenseTaxSplit(Number(form.amount) || 0, effectiveRate, form.taxInclusive);
  const vatAmount = taxSplit.vat;
  const totalWithVat = taxSplit.gross;

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
      accountCode: form.accountCode ? null : "بند المصروفات مطلوب",
      amount: form.amount ? null : "المبلغ مطلوب",
      branchId: form.branchId ? null : "الفرع مطلوب",
      costCenter: form.costCenter ? null : "مركز التكلفة مطلوب",
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
    try {
      await createMut.mutateAsync({
        accountCode: form.accountCode || undefined,
        sourceAccountCode: form.sourceAccountCode || undefined,
        amount: Number(form.amount),
        description: form.description,
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
        relatedEntityType: form.relatedEntityType || undefined,
        relatedEntityId: form.relatedEntityId ? Number(form.relatedEntityId) : undefined,
        relatedEntityName: form.relatedEntityName || undefined,
        attachmentUrl: form.attachmentUrl || undefined,
        attachmentType: form.attachmentType || undefined,
        isPaid: form.isPaid,
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
        // #1715 §5 — when the operator chose a maintenance allocation target,
        // open + link a maintenance ticket. The fields are already collected
        // by AllocationTargetSelect (odometer / maintenanceType / costBearer).
        maintenanceTicket:
          allocTarget.target === "vehicle_maintenance" || allocTarget.target === "property_maintenance"
            ? {
                create: true,
                maintenanceType: allocTarget.maintenanceType || undefined,
                odometer: allocTarget.odometer ? Number(allocTarget.odometer) : undefined,
                costBearer: allocTarget.costBearer || undefined,
                existingTicketId: allocTarget.existingTicketId ? Number(allocTarget.existingTicketId) : undefined,
              }
            : undefined,
        // #1715 — capital purchase: open a new fixed asset (+ depreciation).
        assetCreation:
          allocTarget.target === "fixed_asset" && allocTarget.createAsset && allocTarget.assetName
            ? {
                create: true,
                name: allocTarget.assetName,
                usefulLifeYears: allocTarget.assetUsefulLifeYears ? Number(allocTarget.assetUsefulLifeYears) : undefined,
              }
            : undefined,
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
          relatedEntityType: "",
          relatedEntityId: "",
          relatedEntityName: "",
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

  const journalPreviewLines = (() => {
    if (!form.accountCode || !form.amount) return [];
    const base = Number(form.amount) || 0;
    const vat = vatAmount;
    const total = base + vat;
    const sourceAcct = form.sourceAccountCode || "1100";
    const lines: { account: string; debit: number; credit: number }[] = [
      { account: form.accountCode, debit: base, credit: 0 },
    ];
    if (vat > 0) {
      lines.push({ account: "1400 (ض.م.م مدخلات)", debit: vat, credit: 0 });
    }
    lines.push({ account: sourceAcct || "1100", debit: 0, credit: total });
    return lines;
  })();

  return (
    <CreatePageLayout title="إضافة مصروف جديد" backPath="/finance/expenses" isDirty={isDirty}>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div data-form>
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

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحسابات المحاسبية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormFieldWrapper label="بند المصروفات" required>
              <Autocomplete options={expenseOptions} value={form.accountCode}
                onChange={(val) => setForm(prev => ({ ...prev, accountCode: String(val) }))}
                placeholder="ابحث عن بند مصروفات..." loading={accountsLoading} />
            </FormFieldWrapper>
            <FormFieldWrapper label="مصدر الصرف (الخزنة / البنك)">
              <Autocomplete options={sourceOptions} value={form.sourceAccountCode}
                onChange={(val) => setForm(prev => ({ ...prev, sourceAccountCode: String(val) }))}
                placeholder="ابحث عن مصدر صرف..." loading={accountsLoading} />
            </FormFieldWrapper>
          </div>
        </div>

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">المبالغ والضريبة</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <NumberField label="المبلغ (ريال)" required value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })} min={0} step={0.01} placeholder="0.00" />
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
            <FormFieldWrapper label="التصنيف الضريبي">
              <Select value={form.taxCategory || "_none"} onValueChange={(v) => setForm({ ...form, taxCategory: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CATEGORIES.map(t => <SelectItem key={t.value || "_none"} value={t.value || "_none"}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
          <h3 className="font-semibold text-sm text-muted-foreground">الجهة المرتبطة ومركز التكلفة</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BranchSelect
              value={form.branchId}
              onChange={(v) => setForm({ ...form, branchId: v })}
              label="الفرع"
              required
            />
            <DepartmentSelect
              value={form.departmentId}
              onChange={(v) => setForm({ ...form, departmentId: v })}
              label="القسم / الإدارة"
            />
            <CostCenterSelect
              value={form.costCenter}
              onChange={(v) => setForm({ ...form, costCenter: v })}
              required
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
            <FormFieldWrapper label="نوع الجهة المرتبطة">
              <Select value={form.relatedEntityType || "_none"} onValueChange={(v) => setForm({ ...form, relatedEntityType: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">بدون ربط</SelectItem>
                  <SelectItem value="employee">موظف</SelectItem>
                  <SelectItem value="vehicle">مركبة</SelectItem>
                  <SelectItem value="supplier">مورد</SelectItem>
                  <SelectItem value="contract">عقد</SelectItem>
                  <SelectItem value="property">عقار</SelectItem>
                  <SelectItem value="legal_case">قضية قانونية</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            {form.relatedEntityType && (
              <FormFieldWrapper label="الجهة المرتبطة">
                <Select value={form.relatedEntityId || "_none"} onValueChange={(v) => {
                  const val = v === "_none" ? "" : v;
                  const label = val ? getRelatedEntityLabel(form.relatedEntityType, val, {
                    employees: employeesData?.data || [],
                    vehicles: vehiclesData?.data || [],
                    suppliers: suppliersData?.data || [],
                    contracts: contractsData?.data || [],
                    units: unitsData?.data || [],
                    legalCases: legalCasesData?.data || [],
                  }) : "";
                  setForm({ ...form, relatedEntityId: val, relatedEntityName: label });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— اختر —</SelectItem>
                    {form.relatedEntityType === "employee" && (employeesData?.data || []).map((emp: any) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || ""}</SelectItem>
                    ))}
                    {form.relatedEntityType === "vehicle" && (vehiclesData?.data || []).map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} - {v.make} {v.model}</SelectItem>
                    ))}
                    {form.relatedEntityType === "supplier" && (suppliersData?.data || []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                    {form.relatedEntityType === "contract" && (contractsData?.data || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.tenantName} - عقد #{c.id}</SelectItem>
                    ))}
                    {form.relatedEntityType === "property" && (unitsData?.data || []).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber || u.name} - {u.type || "وحدة"}</SelectItem>
                    ))}
                    {form.relatedEntityType === "legal_case" && (legalCasesData?.data || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.title || c.caseNumber || `قضية #${c.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
            )}
            {form.relatedEntityType && form.relatedEntityId && (
              <div className="md:col-span-3">
                {form.relatedEntityType === "employee" && <EmployeeContextCard employeeId={form.relatedEntityId} />}
                {form.relatedEntityType === "vehicle" && <VehicleContextCard vehicleId={form.relatedEntityId} section="maintenance" />}
                {form.relatedEntityType === "supplier" && <SupplierContextCard supplierId={form.relatedEntityId} />}
                {form.relatedEntityType === "property" && <PropertyUnitContextCard unitId={form.relatedEntityId} section="payment" />}
              </div>
            )}
            <TextField label="رقم المرجع / الفاتورة" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })}
              placeholder="رقم الفاتورة أو أمر الشراء" />
          </div>
        </div>

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

        <FinanceOperationContextPanel
          value={allocTarget}
          onChange={(v) => { setAllocTarget(v); setAllocation((prev) => ({ ...prev, ...v.allocation })); }}
          title="ربط المصروف بـ"
          description="اختر ما يُربط به المصروف، وستظهر الحقول المناسبة فقط. الربط يُنتج الأبعاد المحاسبية ومركز التكلفة تلقائياً."
        />

        {/* #1715 (owner feedback) — «التوجيه المحاسبي المتوقّع» live under the
            operation: suggested debit/credit account, cost-center budget,
            linked entity, operational effect, and future task — auto-updates. */}
        {form.amount && Number(form.amount) > 0 && (
          <div className="mb-4">
            <LiveImpactPreview
              endpoint="/finance/expenses/impact-preview"
              enabled={Boolean(form.amount && Number(form.amount) > 0)}
              payload={{
                amount: Number(form.amount),
                expenseType: form.expenseType,
                paymentMethod: form.paymentMethod,
                costCenter: form.costCenter,
                supplierId: form.relatedEntityType === "supplier" && form.relatedEntityId ? Number(form.relatedEntityId) : undefined,
                targetType: allocTarget.target !== "none" ? allocTarget.target : undefined,
                itemType: form.expenseType || undefined,
              }}
            />
          </div>
        )}

        {/* #1715 (owner feedback) — ADVANCED manual override. Hidden entirely
            for non-approvers (smart routing is their only path); collapsed by
            default for approvers; any override requires a documented reason
            (logged to «Manual Overrides»). It is NOT a substitute for the
            smart operation context above. */}
        {canManualOverride && (
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="رابط المرفق" value={form.attachmentUrl} onChange={(v) => setForm({ ...form, attachmentUrl: v })}
              placeholder="https://... أو مسار الملف" />
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

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحالة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormFieldWrapper label="الحالة">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="pending">في انتظار الموافقة</SelectItem>
                  <SelectItem value="posted">مرحّل</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <div className="flex items-center gap-3 mt-6">
              <Checkbox id="isPaid" checked={form.isPaid}
                onCheckedChange={(v) => setForm({ ...form, isPaid: v === true })} />
              <label htmlFor="isPaid" className="text-sm cursor-pointer">تم الدفع</label>
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

        {journalPreviewLines.length > 0 && (
          <div className="border rounded-lg p-4 mb-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">القيد اليومي المتوقع</h3>
            <table className="w-full text-sm border">
              <thead>
                <tr className="bg-surface-subtle border-b">
                  <th className="p-2 text-start">الحساب</th>
                  <th className="p-2 text-start">مدين</th>
                  <th className="p-2 text-start">دائن</th>
                </tr>
              </thead>
              <tbody>
                {journalPreviewLines.map((line, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2 font-mono text-xs">{line.account}</td>
                    <td className="p-2 text-status-error-foreground">{line.debit > 0 ? formatCurrency(line.debit) : ""}</td>
                    <td className="p-2 text-status-success-foreground">{line.credit > 0 ? formatCurrency(line.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="bg-surface-subtle font-semibold">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-status-error-foreground">{formatCurrency(journalPreviewLines.reduce((s, l) => s + l.debit, 0))}</td>
                  <td className="p-2 text-status-success-foreground">{formatCurrency(journalPreviewLines.reduce((s, l) => s + l.credit, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <FileDropZone files={attachments} onFilesChange={setAttachments} />

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

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/finance/expenses")}>إلغاء</Button>
          <Button variant="secondary" onClick={() => handleSubmit({ addAnother: true })} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ وإضافة آخر"}
          </Button>
          <Button onClick={() => handleSubmit()} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ المصروف"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
