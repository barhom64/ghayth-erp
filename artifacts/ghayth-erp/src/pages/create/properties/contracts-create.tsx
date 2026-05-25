import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormSwitchField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users2, FileText, Calendar, Banknote, Shield, ScrollText, Zap } from "lucide-react";
import { formatCurrency, formatDateAr, getCurrencySymbol } from "@/lib/formatters";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";

const EJAR_STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "pending", label: "قيد المراجعة" },
  { value: "active", label: "مُفعّل" },
  { value: "expired", label: "منتهي" },
  { value: "cancelled", label: "ملغى" },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "residential", label: "سكني" },
  { value: "commercial", label: "تجاري" },
  { value: "ejar_unified", label: "عقد إيجار الموحد" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "expired", label: "منتهي" },
  { value: "cancelled", label: "ملغى" },
];

const PAYMENT_FREQUENCY_OPTIONS = [
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربع سنوي" },
  { value: "semi_annual", label: "نصف سنوي" },
  { value: "annual", label: "سنوي" },
];

const PENALTY_TYPE_OPTIONS = [
  { value: "percentage", label: "نسبة مئوية (%)" },
  { value: "fixed", label: "مبلغ ثابت" },
];

const DEPOSIT_HOLDER_OPTIONS = [
  { value: "owner", label: "المالك" },
  { value: "ejar_platform", label: "منصة إيجار" },
  { value: "bank", label: "البنك" },
];

const BROKERAGE_PAYOR_OPTIONS = [
  { value: "tenant", label: "المستأجر" },
  { value: "owner", label: "المالك" },
  { value: "shared", label: "مشتركة" },
];

const RESPONSIBILITY_OPTIONS = [
  { value: "tenant", label: "المستأجر" },
  { value: "owner", label: "المالك" },
  { value: "shared", label: "مشتركة" },
];

const schema = z
  .object({
    unitId: z.string().min(1, "يرجى اختيار الوحدة"),
    tenantId: z.string().optional(),
    tenantName: z.string(),
    tenantPhone: z.string().optional(),
    tenantEmail: z.string().optional(),
    tenantIdNumber: z.string().optional(),
    startDate: z.string().min(1, "تاريخ بدء العقد مطلوب"),
    endDate: z.string().min(1, "تاريخ انتهاء العقد مطلوب"),
    monthlyRent: z.string().refine((v) => Number(v) > 0, "الإيجار الشهري يجب أن يكون أكبر من صفر"),
    depositAmount: z.string().optional(),
    paymentDay: z.string(),
    status: z.enum(["active", "expired", "cancelled"]),
    notes: z.string().optional(),
    contractNumber: z.string().optional(),
    ejarNumber: z.string().optional(),
    contractType: z.enum(["residential", "commercial", "ejar_unified"]),
    paymentFrequency: z.enum(["monthly", "quarterly", "semi_annual", "annual"]),
    yearlyRent: z.string().optional(),
    totalContractValue: z.string().optional(),
    latePenaltyType: z.enum(["percentage", "fixed"]),
    latePenaltyValue: z.string(),
    gracePeriodDays: z.string(),
    terminationNoticeDays: z.string(),
    earlyTerminationFee: z.string().optional(),
    autoRenewal: z.boolean(),
    renewalNoticeDays: z.string(),
    renewalPeriodMonths: z.string(),
    electricityResponsibility: z.string(),
    waterResponsibility: z.string(),
    gasResponsibility: z.string(),
    maintenanceResponsibility: z.string(),
    brokerageFee: z.string().optional(),
    brokeragePayor: z.string(),
    depositHolder: z.string(),
    insuranceRequired: z.boolean(),
    ownerId: z.string().optional(),
    numberOfInstallments: z.string().optional(),
    specialConditions: z.string().optional(),
    ejarStatus: z.string(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate > v.startDate,
    { message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", path: ["endDate"] },
  );

function UnitContextCard() {
  const { watch } = useFormContext();
  const unitId = watch("unitId") as string;
  if (!unitId) return null;
  return (
    <div className="mt-3">
      <PropertyUnitContextCard unitId={unitId} section="contract" />
    </div>
  );
}

function SyncYearlyRent() {
  const { watch, setValue, getValues } = useFormContext();
  const monthlyRent = watch("monthlyRent") as string;
  const yearlyRent = watch("yearlyRent") as string;

  // Two-way sync: when one changes, derive the other.
  useMemo(() => {
    if (monthlyRent && monthlyRent !== getValues("__lastMonthly")) {
      setValue("yearlyRent", String(Number(monthlyRent) * 12));
    }
  }, [monthlyRent, setValue, getValues]);

  useMemo(() => {
    if (yearlyRent && yearlyRent !== getValues("__lastYearly")) {
      const m = Math.round(Number(yearlyRent) / 12);
      if (String(m) !== monthlyRent) setValue("monthlyRent", String(m));
    }
  }, [yearlyRent, monthlyRent, setValue, getValues]);

  return null;
}

function TenantPicker({ tenants }: { tenants: any[] }) {
  const { watch, setValue } = useFormContext();
  const tenantId = watch("tenantId") as string;
  const selectedTenant = tenants.find((t: any) => String(t.id) === tenantId);
  return (
    <div className="space-y-1.5">
      <Label>اختر من سجل المستأجرين</Label>
      <FormSelectField
        name="tenantId"
        label=""
        placeholder="— اختر مستأجراً أو أدخل يدوياً —"
        options={tenants.map((t: any) => ({
          value: String(t.id),
          label: `${t.name}${t.phone ? ` · ${t.phone}` : ""}`,
        }))}
      />
      <input
        type="hidden"
        onChange={(e) => {
          const tid = e.target.value;
          const t = tenants.find((t: any) => String(t.id) === tid);
          if (t) {
            setValue("tenantName", t.name || "");
            setValue("tenantPhone", t.phone || "");
            setValue("tenantEmail", t.email || "");
            setValue("tenantIdNumber", t.nationalId || "");
          }
        }}
      />
      {selectedTenant && (
        <Badge variant="secondary" className="text-xs gap-1">
          <Users2 className="h-3 w-3" /> مرتبط بسجل المستأجر #{selectedTenant.id}
        </Badge>
      )}
    </div>
  );
}

function FillTenantFromRegistry({ tenants }: { tenants: any[] }) {
  const { watch, setValue } = useFormContext();
  const tenantId = watch("tenantId") as string;
  useMemo(() => {
    if (tenantId) {
      const t = tenants.find((tt: any) => String(tt.id) === tenantId);
      if (t) {
        setValue("tenantName", t.name || "");
        setValue("tenantPhone", t.phone || "");
        setValue("tenantEmail", t.email || "");
        setValue("tenantIdNumber", t.nationalId || "");
      }
    }
  }, [tenantId, tenants, setValue]);
  return null;
}

function SchedulePreview() {
  const { watch } = useFormContext();
  const startDate = watch("startDate") as string;
  const endDate = watch("endDate") as string;
  const monthlyRent = watch("monthlyRent") as string;
  const paymentFrequency = watch("paymentFrequency") as string;
  const paymentDay = watch("paymentDay") as string;
  const totalContractValue = watch("totalContractValue") as string;
  const numberOfInstallments = watch("numberOfInstallments") as string;

  if (!startDate || !endDate || !monthlyRent) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const monthly = Number(monthlyRent);
  const freqMonths = paymentFrequency === "quarterly" ? 3 : paymentFrequency === "semi_annual" ? 6 : paymentFrequency === "annual" ? 12 : 1;
  const contractMonths = Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
  const totalValue = Number(totalContractValue) || monthly * contractMonths;
  const count = Number(numberOfInstallments) || Math.ceil(contractMonths / freqMonths);
  const installmentAmt = Math.round((totalValue / count) * 100) / 100;

  const items = [];
  for (let i = 0; i < Math.min(count, 24); i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + (i * freqMonths));
    if (paymentDay) dueDate.setDate(Math.min(Number(paymentDay), 28));
    const isLast = i === count - 1;
    items.push({
      num: i + 1,
      date: dueDate.toISOString().split("T")[0],
      amount: isLast ? totalValue - (installmentAmt * (count - 1)) : installmentAmt,
    });
  }

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-4 w-4 text-status-success" /> جدول الأقساط ({items.length} قسط)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle sticky top-0">
              <tr>
                <th className="text-start p-2">#</th>
                <th className="text-start p-2">تاريخ الاستحقاق</th>
                <th className="text-start p-2">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.num} className="border-t">
                  <td className="p-2 font-mono">{item.num}</td>
                  <td className="p-2">{formatDateAr(item.date)}</td>
                  <td className="p-2 font-bold text-emerald-600">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-subtle font-bold border-t-2">
              <tr>
                <td className="p-2" colSpan={2}>الإجمالي</td>
                <td className="p-2 text-emerald-600">{formatCurrency(items.reduce((s, i) => s + i.amount, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ContractImpactPreview() {
  const { watch } = useFormContext();
  const unitId = watch("unitId") as string;
  const monthlyRent = watch("monthlyRent") as string;
  const startDate = watch("startDate") as string;
  const endDate = watch("endDate") as string;
  const tenantId = watch("tenantId") as string;
  const depositAmount = watch("depositAmount") as string;
  if (!unitId || !monthlyRent || !startDate || !endDate) return null;
  return (
    <ImpactPreviewButton
      endpoint="/properties/contracts/impact-preview"
      payload={{
        unitId: Number(unitId),
        tenantId: tenantId ? Number(tenantId) : undefined,
        monthlyRent: Number(monthlyRent),
        startDate,
        endDate,
        securityDeposit: depositAmount ? Number(depositAmount) : undefined,
      }}
      label="معاينة أثر العقد"
    />
  );
}

function RenewalBlock() {
  const { watch } = useFormContext();
  const autoRenewal = watch("autoRenewal") as boolean;
  if (!autoRenewal) return null;
  return (
    <>
      <FormNumberField name="renewalNoticeDays" label="إشعار التجديد قبل (أيام)" />
      <FormNumberField name="renewalPeriodMonths" label="مدة التجديد (أشهر)" />
    </>
  );
}

export default function ContractsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/contracts", "POST", [["rental-contracts"]]);
  const { data: unitsData, isLoading: loadingU, isError: errorU } = useApiQuery<{ data: any[] }>(["property-units"], "/properties/units");
  const { data: tenantsResp, isLoading: loadingT, isError: errorT } = useApiQuery<any>(["tenants-registry"], "/properties/tenants");
  const { data: ownersResp, isLoading: loadingO, isError: errorO } = useApiQuery<any>(["property-owners"], "/properties/owners");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (loadingU || loadingT || loadingO) return <LoadingSpinner />;
  if (errorU || errorT || errorO) return <ErrorState />;

  const units = unitsData?.data || [];
  const tenants = asList(tenantsResp);
  const owners = asList(ownersResp);

  const unitOptions = units.map((u: any) => ({
    value: String(u.id),
    label: `${u.unitNumber} - ${u.buildingName || ""} (${u.type || ""})`,
  }));
  const ownerOptions = owners.map((o: any) => ({ value: String(o.id), label: o.name }));
  const currency = getCurrencySymbol();

  return (
    <CreatePageLayout title="عقد إيجار جديد" backPath="/properties/contracts">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          unitId: "",
          tenantId: "",
          tenantName: "",
          tenantPhone: "",
          tenantEmail: "",
          tenantIdNumber: "",
          startDate: "",
          endDate: "",
          monthlyRent: "",
          depositAmount: "",
          paymentDay: "1",
          status: "active",
          notes: "",
          contractNumber: "",
          ejarNumber: "",
          contractType: "residential",
          paymentFrequency: "monthly",
          yearlyRent: "",
          totalContractValue: "",
          latePenaltyType: "percentage",
          latePenaltyValue: "2",
          gracePeriodDays: "0",
          terminationNoticeDays: "30",
          earlyTerminationFee: "",
          autoRenewal: false,
          renewalNoticeDays: "60",
          renewalPeriodMonths: "12",
          electricityResponsibility: "tenant",
          waterResponsibility: "tenant",
          gasResponsibility: "tenant",
          maintenanceResponsibility: "shared",
          brokerageFee: "",
          brokeragePayor: "tenant",
          depositHolder: "owner",
          insuranceRequired: false,
          ownerId: "",
          numberOfInstallments: "",
          specialConditions: "",
          ejarStatus: "draft",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ العقد"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties/contracts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          if (!values.tenantId && !values.tenantName) {
            toast({ variant: "destructive", title: "يرجى اختيار أو إدخال المستأجر" });
            return;
          }
          await createMut.mutateAsync({
            unitId: Number(values.unitId),
            tenantId: values.tenantId ? Number(values.tenantId) : undefined,
            tenantName: values.tenantName,
            tenantPhone: values.tenantPhone || undefined,
            tenantEmail: values.tenantEmail || undefined,
            tenantIdNumber: values.tenantIdNumber || undefined,
            startDate: values.startDate,
            endDate: values.endDate,
            monthlyRent: Number(values.monthlyRent),
            depositAmount: values.depositAmount ? Number(values.depositAmount) : undefined,
            paymentDay: Number(values.paymentDay) || 1,
            status: values.status,
            notes: values.notes || undefined,
            contractNumber: values.contractNumber || undefined,
            ejarNumber: values.ejarNumber || undefined,
            contractType: values.contractType,
            paymentFrequency: values.paymentFrequency,
            yearlyRent: values.yearlyRent ? Number(values.yearlyRent) : undefined,
            totalContractValue: values.totalContractValue ? Number(values.totalContractValue) : undefined,
            latePenaltyType: values.latePenaltyType,
            latePenaltyValue: Number(values.latePenaltyValue) || 0,
            gracePeriodDays: Number(values.gracePeriodDays) || 0,
            terminationNoticeDays: Number(values.terminationNoticeDays) || 30,
            earlyTerminationFee: values.earlyTerminationFee ? Number(values.earlyTerminationFee) : 0,
            autoRenewal: values.autoRenewal,
            renewalNoticeDays: Number(values.renewalNoticeDays) || 60,
            renewalPeriodMonths: Number(values.renewalPeriodMonths) || 12,
            electricityResponsibility: values.electricityResponsibility,
            waterResponsibility: values.waterResponsibility,
            gasResponsibility: values.gasResponsibility,
            maintenanceResponsibility: values.maintenanceResponsibility,
            brokerageFee: values.brokerageFee ? Number(values.brokerageFee) : 0,
            brokeragePayor: values.brokeragePayor,
            depositHolder: values.depositHolder,
            insuranceRequired: values.insuranceRequired,
            ownerId: values.ownerId ? Number(values.ownerId) : undefined,
            numberOfInstallments: values.numberOfInstallments ? Number(values.numberOfInstallments) : undefined,
            specialConditions: values.specialConditions || undefined,
            ejarStatus: values.ejarStatus,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إنشاء العقد بنجاح" });
          setLocation("/properties/contracts");
        }}
      >
        <FillTenantFromRegistry tenants={tenants} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-status-info" /> بيانات العقد الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={3}>
              <FormTextField name="contractNumber" label="رقم العقد" placeholder="يُولّد تلقائياً" />
              <FormTextField name="ejarNumber" label="رقم عقد إيجار" placeholder="رقم العقد في منصة إيجار" />
              <FormSelectField name="ejarStatus" label="حالة إيجار" options={EJAR_STATUS_OPTIONS} />
              <FormSelectField name="contractType" label="نوع العقد" options={CONTRACT_TYPE_OPTIONS} />
              <FormSelectField name="unitId" label="الوحدة" required options={unitOptions} placeholder="اختر الوحدة" />
              <FormSelectField name="status" label="حالة العقد" options={STATUS_OPTIONS} />
            </FormGrid>
            <UnitContextCard />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users2 className="h-4 w-4 text-violet-500" /> بيانات المستأجر والمالك
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormSelectField
                name="tenantId"
                label="اختر من سجل المستأجرين"
                options={tenants.map((t: any) => ({
                  value: String(t.id),
                  label: `${t.name}${t.phone ? ` · ${t.phone}` : ""}`,
                }))}
                placeholder="— اختر مستأجراً أو أدخل يدوياً —"
              />
              <FormSelectField name="ownerId" label="المالك" options={ownerOptions} placeholder="— بدون مالك —" />
              <FormTextField name="tenantName" label="المستأجر" required placeholder="اسم المستأجر" />
              <FormTextField name="tenantPhone" label="هاتف المستأجر" type="tel" />
              <FormTextField name="tenantEmail" label="بريد المستأجر" type="email" />
              <FormTextField name="tenantIdNumber" label="رقم هوية المستأجر" placeholder="رقم الهوية أو الإقامة" />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-500" /> مدة العقد والإيجار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SyncYearlyRent />
            <FormGrid cols={3}>
              <FormDateField name="startDate" label="من تاريخ" required />
              <FormDateField name="endDate" label="إلى تاريخ" required />
              <FormSelectField name="paymentFrequency" label="دورة السداد" options={PAYMENT_FREQUENCY_OPTIONS} />
              <FormNumberField name="monthlyRent" label={`الإيجار الشهري (${currency})`} required step="0.01" min="0" />
              <FormNumberField name="yearlyRent" label={`الإيجار السنوي (${currency})`} step="0.01" min="0" />
              <FormNumberField name="totalContractValue" label={`إجمالي قيمة العقد (${currency})`} step="0.01" min="0" placeholder="يُحسب تلقائياً" />
              <FormNumberField name="numberOfInstallments" label="عدد الأقساط" placeholder="يُحسب من الدورة" />
              <FormNumberField name="paymentDay" label="يوم السداد (من الشهر)" min="1" max="28" />
              <FormNumberField name="depositAmount" label={`مبلغ التأمين (${currency})`} step="0.01" min="0" />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-status-error" /> الغرامات والشروط
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={3}>
              <FormSelectField name="latePenaltyType" label="نوع غرامة التأخير" options={PENALTY_TYPE_OPTIONS} />
              <FormNumberField name="latePenaltyValue" label={`قيمة الغرامة`} step="0.01" min="0" />
              <FormNumberField name="gracePeriodDays" label="فترة السماح (أيام)" />
              <FormNumberField name="terminationNoticeDays" label="مدة إشعار الإنهاء (أيام)" />
              <FormNumberField name="earlyTerminationFee" label={`رسم الإنهاء المبكر (${currency})`} step="0.01" min="0" />
              <FormSelectField name="depositHolder" label="حامل التأمين" options={DEPOSIT_HOLDER_OPTIONS} />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-emerald-500" /> التجديد والسمسرة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={3}>
              <FormSwitchField name="autoRenewal" label="تجديد تلقائي" className="pt-6" />
              <RenewalBlock />
              <FormNumberField name="brokerageFee" label={`رسم السمسرة (${currency})`} />
              <FormSelectField name="brokeragePayor" label="يدفعها" options={BROKERAGE_PAYOR_OPTIONS} />
              <FormSwitchField name="insuranceRequired" label="تأمين مطلوب" className="pt-6" />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-status-warning" /> مسؤولية الخدمات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid cols={4}>
              <FormSelectField name="electricityResponsibility" label="الكهرباء" options={RESPONSIBILITY_OPTIONS} />
              <FormSelectField name="waterResponsibility" label="المياه" options={RESPONSIBILITY_OPTIONS} />
              <FormSelectField name="gasResponsibility" label="الغاز" options={RESPONSIBILITY_OPTIONS} />
              <FormSelectField name="maintenanceResponsibility" label="الصيانة" options={RESPONSIBILITY_OPTIONS} />
            </FormGrid>
          </CardContent>
        </Card>

        <SchedulePreview />

        <FormTextareaField name="specialConditions" label="شروط خاصة" rows={3} placeholder="شروط إضافية خاصة بالعقد..." />
        <FormTextareaField name="notes" label="ملاحظات" rows={2} placeholder="ملاحظات إضافية..." />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العقد" />

        <ContractImpactPreview />
      </FormShell>
    </CreatePageLayout>
  );
}
