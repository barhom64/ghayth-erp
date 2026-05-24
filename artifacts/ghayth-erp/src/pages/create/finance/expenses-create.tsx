import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext, Controller } from "react-hook-form";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormCheckboxField,
  FormSwitchField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { formatCurrency, todayLocal } from "@/lib/formatters";
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
  { value: "exempt", label: "معفى" },
  { value: "zero_rated", label: "نسبة صفرية" },
  { value: "standard", label: "النسبة الأساسية (15%)" },
  { value: "reduced", label: "نسبة مخفضة (5%)" },
];

const VAT_OPTIONS = [
  { value: "5", label: "5%" },
  { value: "15", label: "15%" },
];

const RELATED_ENTITY_TYPE_OPTIONS = [
  { value: "employee", label: "موظف" },
  { value: "vehicle", label: "مركبة" },
  { value: "supplier", label: "مورد" },
  { value: "contract", label: "عقد" },
  { value: "property", label: "عقار" },
  { value: "legal_case", label: "قضية قانونية" },
];

const ATTACHMENT_TYPE_OPTIONS = [
  { value: "invoice", label: "فاتورة" },
  { value: "receipt", label: "وصل استلام" },
  { value: "transfer", label: "إشعار تحويل" },
  { value: "contract", label: "عقد" },
  { value: "approval", label: "موافقة" },
  { value: "other", label: "أخرى" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "pending", label: "في انتظار الموافقة" },
  { value: "posted", label: "مرحّل" },
];

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

function getRelatedEntityLabel(entityType: string, entityId: string, data: {
  employees: any[];
  vehicles: any[];
  suppliers: any[];
  contracts: any[];
  units: any[];
  legalCases: any[];
}): string {
  if (!entityId) return "";
  if (entityType === "employee") {
    const emp = data.employees.find((e: any) => String(e.id) === entityId);
    return emp ? `${emp.name} - ${emp.jobTitle || ""}` : "";
  }
  if (entityType === "vehicle") {
    const v = data.vehicles.find((v: any) => String(v.id) === entityId);
    return v ? `${v.plateNumber} - ${v.make} ${v.model}` : "";
  }
  if (entityType === "supplier") {
    const s = data.suppliers.find((s: any) => String(s.id) === entityId);
    return s ? s.name : "";
  }
  if (entityType === "contract") {
    const c = data.contracts.find((c: any) => String(c.id) === entityId);
    return c ? `${c.tenantName} - عقد #${c.id}` : "";
  }
  if (entityType === "property") {
    const u = data.units.find((u: any) => String(u.id) === entityId);
    return u ? `${u.unitNumber || u.name} - ${u.type || "وحدة"}` : "";
  }
  if (entityType === "legal_case") {
    const c = data.legalCases.find((c: any) => String(c.id) === entityId);
    return c ? `${c.title || c.caseNumber || `قضية #${c.id}`}` : "";
  }
  return "";
}

const schema = z.object({
  accountCode: z.string().min(1, "بند المصروفات مطلوب"),
  sourceAccountCode: z.string().optional(),
  amount: z.string().min(1, "المبلغ مطلوب"),
  description: z.string().optional(),
  date: z.string(),
  period: z.string().optional(),
  operationType: z.string(),
  expenseType: z.string(),
  paymentMethod: z.string(),
  vatRate: z.string().optional(),
  reference: z.string().optional(),
  costCenter: z.string().min(1, "مركز التكلفة مطلوب"),
  branchId: z.string().min(1, "الفرع مطلوب"),
  companyId: z.string().optional(),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  taxCategory: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  relatedEntityName: z.string().optional(),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string(),
  isPaid: z.boolean(),
  autoDescription: z.boolean(),
  status: z.enum(["draft", "pending", "posted"]),
  isTaxLinked: z.boolean(),
  invoiceTypeCode: z.string(),
  taxCategoryCode: z.string(),
  exemptionReason: z.string().optional(),
  govSyncEnabled: z.boolean(),
  govIntegrationId: z.string().optional(),
  govEntityType: z.string().optional(),
  govEntityId: z.string().optional(),
});

function AccountPicker({ name, options, placeholder, loading }: {
  name: string;
  options: AutocompleteOption[];
  placeholder: string;
  loading: boolean;
}) {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Autocomplete
          options={options}
          value={field.value ?? ""}
          onChange={(v) => field.onChange(String(v))}
          placeholder={placeholder}
          loading={loading}
        />
      )}
    />
  );
}

function AutoDescriptionEffect() {
  const { watch, setValue } = useFormContext();
  const autoDescription = watch("autoDescription") as boolean;
  const operationType = watch("operationType") as string;
  const relatedEntityName = watch("relatedEntityName") as string;
  const period = watch("period") as string;
  const amount = watch("amount") as string;
  const expenseType = watch("expenseType") as string;
  useEffect(() => {
    if (autoDescription) {
      setValue("description", generateAutoDescription({
        operationType,
        relatedEntityName,
        period,
        amount: Number(amount) || undefined,
        expenseType,
      }));
    }
  }, [autoDescription, operationType, relatedEntityName, period, amount, expenseType, setValue]);
  return null;
}

function TotalDisplay() {
  const { watch } = useFormContext();
  const amount = watch("amount") as string;
  const vatRate = watch("vatRate") as string;
  const vatAmount = vatRate ? Math.round(Number(amount) * (Number(vatRate) / 100) * 100) / 100 : 0;
  const totalWithVat = Number(amount) + vatAmount;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">الإجمالي مع الضريبة</label>
      <div className="p-2 bg-muted rounded-md text-sm font-medium">
        {vatAmount > 0
          ? `${formatCurrency(totalWithVat)} (ضريبة: ${formatCurrency(vatAmount)})`
          : formatCurrency(Number(amount || 0))}
      </div>
    </div>
  );
}

function AttachmentWarning() {
  const { watch } = useFormContext();
  const operationType = watch("operationType") as string;
  const amount = Number(watch("amount") || 0);
  const attachmentUrl = watch("attachmentUrl") as string;
  const required = ATTACHMENT_REQUIRED_TYPES.includes(operationType) ||
    (operationType === "payment" && amount >= 5000);
  if (!required || attachmentUrl) return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-status-error-surface border border-status-error-surface rounded-md">
      <AlertCircle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
      <p className="text-sm text-status-error-foreground">هذا النوع من العمليات يستوجب إرفاق مستند داعم (فاتورة، وصل استلام، أو إشعار تحويل) قبل الحفظ.</p>
    </div>
  );
}

function RelatedEntityBlock({ data }: { data: any }) {
  const { watch, setValue } = useFormContext();
  const relatedEntityType = watch("relatedEntityType") as string;
  const relatedEntityId = watch("relatedEntityId") as string;
  if (!relatedEntityType) return null;
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">الجهة المرتبطة</label>
        <Select
          value={relatedEntityId || "_none"}
          onValueChange={(v) => {
            const val = v === "_none" ? "" : v;
            setValue("relatedEntityId", val);
            setValue("relatedEntityName", val ? getRelatedEntityLabel(relatedEntityType, val, data) : "");
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— اختر —</SelectItem>
            {relatedEntityType === "employee" && data.employees.map((emp: any) => (
              <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || ""}</SelectItem>
            ))}
            {relatedEntityType === "vehicle" && data.vehicles.map((v: any) => (
              <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} - {v.make} {v.model}</SelectItem>
            ))}
            {relatedEntityType === "supplier" && data.suppliers.map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
            {relatedEntityType === "contract" && data.contracts.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.tenantName} - عقد #{c.id}</SelectItem>
            ))}
            {relatedEntityType === "property" && data.units.map((u: any) => (
              <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber || u.name} - {u.type || "وحدة"}</SelectItem>
            ))}
            {relatedEntityType === "legal_case" && data.legalCases.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.title || c.caseNumber || `قضية #${c.id}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {relatedEntityId && (
        <div className="md:col-span-3">
          {relatedEntityType === "employee" && <EmployeeContextCard employeeId={relatedEntityId} />}
          {relatedEntityType === "vehicle" && <VehicleContextCard vehicleId={relatedEntityId} section="maintenance" />}
          {relatedEntityType === "supplier" && <SupplierContextCard supplierId={relatedEntityId} />}
          {relatedEntityType === "property" && <PropertyUnitContextCard unitId={relatedEntityId} section="payment" />}
        </div>
      )}
    </>
  );
}

function GovSyncBlock({ govIntegrationsData }: { govIntegrationsData: any }) {
  const { watch } = useFormContext();
  const operationType = watch("operationType") as string;
  const govSyncEnabled = watch("govSyncEnabled") as boolean;
  const govEntityType = watch("govEntityType") as string;
  if (!GOV_LINKED_OPERATION_TYPES.includes(operationType)) return null;
  return (
    <div className="border border-status-info-surface rounded-lg p-4 space-y-3 bg-status-info-surface">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-status-info-foreground" />
        <h3 className="font-semibold text-sm text-status-info-foreground">الربط بنظام حكومي</h3>
      </div>
      <FormCheckboxField name="govSyncEnabled" label="ربط هذا المصروف بنظام حكومي خارجي" />
      {govSyncEnabled && (
        <FormGrid cols={2}>
          <FormSelectField
            name="govIntegrationId"
            label="النظام الحكومي"
            options={(govIntegrationsData?.data || []).filter((gi: any) => gi.enabled).map((gi: any) => ({
              value: String(gi.id),
              label: gi.name,
            }))}
            placeholder="— اختر النظام —"
          />
          <FormSelectField
            name="govEntityType"
            label="نوع الكيان المرتبط"
            options={[
              { value: "employee", label: "موظف (إقامة / تصريح)" },
              { value: "vehicle", label: "مركبة (استمارة / فحص)" },
            ]}
            placeholder="— اختر النوع —"
          />
          {govEntityType === "employee" && (
            <FormEntitySelect name="govEntityId" select={EmployeeSelect} label="الموظف المرتبط" />
          )}
          {govEntityType === "vehicle" && (
            <FormEntitySelect name="govEntityId" select={VehicleSelect} label="المركبة المرتبطة" />
          )}
        </FormGrid>
      )}
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

  if (accountsLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const accounts = accountsData?.data || [];
  const projects = projectsData?.data || [];
  const expenseAccounts = accounts.filter((a: any) => a.type === "expense" || a.code?.startsWith("5"));
  const sourceAccounts = accounts.filter((a: any) => a.code?.startsWith("11") || a.code?.startsWith("12"));
  const expenseOptions: AutocompleteOption[] = expenseAccounts.map((a: any) => ({
    value: a.code || String(a.id),
    label: `${a.code} - ${a.name}`,
  }));
  const sourceOptions: AutocompleteOption[] = sourceAccounts.map((a: any) => ({
    value: a.code || String(a.id),
    label: `${a.code} - ${a.name}`,
  }));

  const relatedData = {
    employees: employeesData?.data || [],
    vehicles: vehiclesData?.data || [],
    suppliers: suppliersData?.data || [],
    contracts: contractsData?.data || [],
    units: unitsData?.data || [],
    legalCases: legalCasesData?.data || [],
  };

  return (
    <CreatePageLayout title="إضافة مصروف جديد" backPath="/finance/expenses">
      <FormShell
        schema={schema}
        defaultValues={{
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
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ المصروف"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/expenses")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const required = ATTACHMENT_REQUIRED_TYPES.includes(values.operationType) ||
            (values.operationType === "payment" && Number(values.amount) >= 5000);
          if (required && !values.attachmentUrl) {
            toast({ variant: "destructive", title: "المرفق إلزامي — هذا النوع من العمليات يتطلب إرفاق مستند داعم" });
            return;
          }
          await createMut.mutateAsync({
            accountCode: values.accountCode || undefined,
            sourceAccountCode: values.sourceAccountCode || undefined,
            amount: Number(values.amount),
            description: values.description,
            date: values.date || undefined,
            period: values.period || undefined,
            operationType: values.operationType,
            expenseType: values.expenseType,
            paymentMethod: values.paymentMethod,
            vatRate: values.vatRate ? Number(values.vatRate) : undefined,
            reference: values.reference || undefined,
            costCenter: values.costCenter || undefined,
            branchId: values.branchId ? Number(values.branchId) : undefined,
            companyId: values.companyId ? Number(values.companyId) : undefined,
            departmentId: values.departmentId ? Number(values.departmentId) : undefined,
            projectId: values.projectId ? Number(values.projectId) : undefined,
            taxCategory: values.taxCategory || undefined,
            relatedEntityType: values.relatedEntityType || undefined,
            relatedEntityId: values.relatedEntityId ? Number(values.relatedEntityId) : undefined,
            relatedEntityName: values.relatedEntityName || undefined,
            attachmentUrl: values.attachmentUrl || undefined,
            attachmentType: values.attachmentType || undefined,
            isPaid: values.isPaid,
            autoDescription: values.autoDescription,
            isTaxLinked: values.isTaxLinked,
            invoiceTypeCode: values.isTaxLinked ? values.invoiceTypeCode : undefined,
            taxCategoryCode: values.isTaxLinked ? values.taxCategoryCode : undefined,
            exemptionReason: values.isTaxLinked && values.exemptionReason ? values.exemptionReason : undefined,
            govSyncEnabled: values.govSyncEnabled || undefined,
            govIntegrationId: values.govIntegrationId ? Number(values.govIntegrationId) : undefined,
            govEntityType: values.govEntityType || undefined,
            govEntityId: values.govEntityId ? Number(values.govEntityId) : undefined,
          });
          toast({ title: "تم إضافة المصروف بنجاح" });
          setLocation("/finance/expenses");
        }}
      >
        <AutoDescriptionEffect />

        <FormGrid cols={2}>
          <FormDateField name="date" label="التاريخ" required />
          <FormTextField name="period" label="الفترة المالية" type="month" />
        </FormGrid>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">تصنيف العملية</h3>
          <FormGrid cols={3}>
            <FormSelectField name="operationType" label="نوع العملية" options={OPERATION_TYPES} />
            <FormSelectField name="expenseType" label="التصنيف التفصيلي" options={EXPENSE_TYPES} />
            <FormSelectField name="paymentMethod" label="طريقة الدفع" options={PAYMENT_METHODS} />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحسابات المحاسبية</h3>
          <FormGrid cols={2}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">بند المصروفات <span className="text-red-500 ms-1">*</span></label>
              <AccountPicker name="accountCode" options={expenseOptions} placeholder="ابحث عن بند مصروفات..." loading={accountsLoading} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">مصدر الصرف (الخزنة / البنك)</label>
              <AccountPicker name="sourceAccountCode" options={sourceOptions} placeholder="ابحث عن مصدر صرف..." loading={accountsLoading} />
            </div>
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">المبالغ</h3>
          <FormGrid cols={4}>
            <FormNumberField name="amount" label="المبلغ (ريال)" required min="0" step="0.01" placeholder="0.00" />
            <FormSelectField name="vatRate" label="نسبة ضريبة القيمة المضافة (%)" options={VAT_OPTIONS} placeholder="بدون ضريبة" />
            <FormSelectField name="taxCategory" label="التصنيف الضريبي" options={TAX_CATEGORIES} placeholder="بدون تصنيف" />
            <TotalDisplay />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الجهة المرتبطة ومركز التكلفة</h3>
          <FormGrid cols={3}>
            <FormEntitySelect name="branchId" select={BranchSelect} label="الفرع" required />
            <FormEntitySelect name="departmentId" select={DepartmentSelect} label="القسم / الإدارة" />
            <FormEntitySelect name="costCenter" select={CostCenterSelect} label="مركز التكلفة" required />
            <FormEntitySelect name="projectId" select={ProjectSelect} label="المشروع المرتبط" />
            <FormSelectField name="relatedEntityType" label="نوع الجهة المرتبطة" options={RELATED_ENTITY_TYPE_OPTIONS} placeholder="بدون ربط" />
            <RelatedEntityBlock data={relatedData} />
            <FormTextField name="reference" label="رقم المرجع / الفاتورة" placeholder="رقم الفاتورة أو أمر الشراء" />
          </FormGrid>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground">البيان</h3>
            <FormCheckboxField name="autoDescription" label="توليد بيان تلقائي" />
          </div>
          <FormTextField name="description" label="البيان" placeholder="أدخل وصفاً للمصروف" />
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

        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground">الحالة</h3>
          <FormGrid cols={2}>
            <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
            <FormCheckboxField name="isPaid" label="تم الدفع" className="pt-6" />
          </FormGrid>
        </div>

        <GovSyncBlock govIntegrationsData={govIntegrationsData} />

        <FileDropZone files={attachments} onFilesChange={setAttachments} />

        <ExpenseImpactPreview />

        <TaxLinkedBlock />
      </FormShell>
    </CreatePageLayout>
  );
}

function ExpenseImpactPreview() {
  const { watch } = useFormContext();
  const amount = watch("amount") as string;
  const expenseType = watch("expenseType") as string;
  const paymentMethod = watch("paymentMethod") as string;
  const costCenter = watch("costCenter") as string;
  const relatedEntityType = watch("relatedEntityType") as string;
  const relatedEntityId = watch("relatedEntityId") as string;
  if (!amount || Number(amount) <= 0) return null;
  return (
    <ImpactPreviewButton
      endpoint="/finance/expenses/impact-preview"
      payload={{
        amount: Number(amount),
        expenseType,
        paymentMethod,
        costCenter,
        supplierId: relatedEntityType === "supplier" && relatedEntityId ? Number(relatedEntityId) : undefined,
      }}
      label="معاينة أثر المصروف"
    />
  );
}
