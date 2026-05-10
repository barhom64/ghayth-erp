import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { AlertCircle, Paperclip, Link2 } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { CostCenterSelect, ProjectSelect, BranchSelect, DepartmentSelect, EmployeeSelect, VehicleSelect } from "@/components/shared/entity-selects";
import { useAppContext } from "@/contexts/app-context";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";

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
  const { data: govIntegrationsData } = useApiQuery<{ data: any[] }>(["gov-integrations"], "/gov-integrations");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const { data: suppliersData } = useApiQuery<{ data: any[] }>(["suppliers-list"], "/warehouse/suppliers");

  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");
  const { data: contractsData } = useApiQuery<{ data: any[] }>(["contracts-list"], "/properties/contracts");
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["units-list"], "/properties/units");
  const { data: legalCasesData } = useApiQuery<{ data: any[] }>(["legal-cases-list"], "/legal/cases");
  const projects = projectsData?.data || [];
  const accounts = accountsData?.data || [];
  const expenseAccounts = accounts.filter((a: any) => a.type === "expense" || a.code?.startsWith("5"));
  // خزائن وبنوك فقط (11xx = نقد، 12xx = بنوك) — لتفادي اختيار حسابات مدينة/ذمم عن طريق الخطأ
  const sourceAccounts = accounts.filter((a: any) => a.code?.startsWith("11") || a.code?.startsWith("12"));

  const expenseOptions: AutocompleteOption[] = expenseAccounts.map((a: any) => ({
    value: a.code || String(a.id),
    label: `${a.code} - ${a.name}`,
  }));
  const sourceOptions: AutocompleteOption[] = sourceAccounts.map((a: any) => ({
    value: a.code || String(a.id),
    label: `${a.code} - ${a.name}`,
  }));

  const defaultForm = {
    accountCode: "",
    sourceAccountCode: "",
    amount: "",
    description: "",
    date: todayLocal(),
    period: new Date().toISOString().slice(0, 7),
    operationType: "expense",
    expenseType: "operational",
    paymentMethod: "cash",
    vatRate: "",
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

  const vatAmount = form.vatRate ? Math.round(Number(form.amount) * (Number(form.vatRate) / 100) * 100) / 100 : 0;
  const totalWithVat = Number(form.amount) + vatAmount;

  const handleSubmit = async () => {
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
      });
      toast({ title: "تم إضافة المصروف بنجاح" });
      clearDraft();
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
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
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
          <h3 className="font-semibold text-sm text-muted-foreground">المبالغ</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <NumberField label="المبلغ (ريال)" required value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })} min={0} step={0.01} placeholder="0.00" />
            <FormFieldWrapper label="نسبة ضريبة القيمة المضافة (%)">
              <Select value={form.vatRate || "_none"} onValueChange={(v) => setForm({ ...form, vatRate: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">بدون ضريبة</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="15">15%</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="التصنيف الضريبي">
              <Select value={form.taxCategory || "_none"} onValueChange={(v) => setForm({ ...form, taxCategory: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CATEGORIES.map(t => <SelectItem key={t.value || "_none"} value={t.value || "_none"}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="الإجمالي مع الضريبة">
              <div className="p-2 bg-muted rounded-md text-sm font-medium">
                {vatAmount > 0
                  ? `${formatCurrency(totalWithVat)} (ضريبة: ${formatCurrency(vatAmount)})`
                  : formatCurrency(Number(form.amount || 0))}
              </div>
            </FormFieldWrapper>
          </div>
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

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            <h3 className="font-semibold text-sm text-muted-foreground">المرفقات</h3>
            {attachmentRequired && <span className="text-xs text-red-500 font-medium">(إلزامي لهذا النوع)</span>}
          </div>
          {attachmentRequired && !form.attachmentUrl && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">هذا النوع من العمليات يستوجب إرفاق مستند داعم (فاتورة، وصل استلام، أو إشعار تحويل) قبل الحفظ.</p>
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
          <div className="border border-blue-200 rounded-lg p-4 mb-4 space-y-3 bg-blue-50/30">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-600" />
              <h3 className="font-semibold text-sm text-blue-700">الربط بنظام حكومي</h3>
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
                <tr className="bg-gray-50 border-b">
                  <th className="p-2 text-start">الحساب</th>
                  <th className="p-2 text-start">مدين</th>
                  <th className="p-2 text-start">دائن</th>
                </tr>
              </thead>
              <tbody>
                {journalPreviewLines.map((line, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2 font-mono text-xs">{line.account}</td>
                    <td className="p-2 text-red-600">{line.debit > 0 ? formatCurrency(line.debit) : ""}</td>
                    <td className="p-2 text-green-600">{line.credit > 0 ? formatCurrency(line.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-red-600">{formatCurrency(journalPreviewLines.reduce((s, l) => s + l.debit, 0))}</td>
                  <td className="p-2 text-green-600">{formatCurrency(journalPreviewLines.reduce((s, l) => s + l.credit, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <FileDropZone files={attachments} onFilesChange={setAttachments} />

        {form.amount && Number(form.amount) > 0 && (
          <ImpactPreviewButton
            endpoint="/finance/expenses/impact-preview"
            payload={{
              amount: Number(form.amount),
              expenseType: form.expenseType,
              paymentMethod: form.paymentMethod,
              costCenter: form.costCenter,
              supplierId: form.relatedEntityType === "supplier" && form.relatedEntityId ? Number(form.relatedEntityId) : undefined,
            }}
            label="معاينة أثر المصروف"
          />
        )}

        <div className="border rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-green-600">🏛</span>
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
              <div className="md:col-span-3 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <span className="text-green-600 text-xs mt-0.5">✓</span>
                <p className="text-xs text-green-700">سيتم ربط هذا المصروف مع منظومة الفوترة الإلكترونية لهيئة الزكاة والضريبة وتوليد رمز استجابة سريعة متوافق عند الإرسال للهيئة.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/finance/expenses")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ المصروف"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
