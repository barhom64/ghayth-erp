import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Users2, FileText, Calendar, Banknote, Shield, ScrollText, Zap } from "lucide-react";
import { formatCurrency, formatDateAr, getCurrencySymbol } from "@/lib/formatters";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { fieldErrorClass, TextField, NumberField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";

export default function ContractsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/contracts", "POST", [["rental-contracts"]]);
  const { data: unitsData, isLoading: loadingU, isError: errorU } = useApiQuery<{ data: any[] }>(["property-units"], "/properties/units");
  const { data: tenantsResp, isLoading: loadingT, isError: errorT } = useApiQuery<any>(["tenants-registry"], "/properties/tenants");
  const { data: ownersResp, isLoading: loadingO, isError: errorO } = useApiQuery<any>(["property-owners"], "/properties/owners");
  const units = unitsData?.data || [];
  const tenants = asList(tenantsResp);
  const owners = asList(ownersResp);

  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges(isDirty);

  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const errCls = (field: string) => fieldErrorClass(fieldErrors[field]);
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("properties_contracts_create", {
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
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (loadingU || loadingT || loadingO) return <LoadingSpinner />;
  if (errorU || errorT || errorO) return <ErrorState />;

  const set = (field: string, value: any) => {
    setIsDirty(true);
    setForm(prev => {
      const update: any = { [field]: value };
      if (field === "monthlyRent") {
        update.yearlyRent = String(Number(value) * 12);
      }
      if (field === "yearlyRent") {
        update.monthlyRent = String(Math.round(Number(value) / 12));
      }
      return { ...prev, ...update };
    });
  };

  const handleTenantSelect = (tenantId: string) => {
    if (tenantId === "manual") {
      setIsDirty(true);
      setForm(prev => ({ ...prev, tenantId: "", tenantName: "", tenantPhone: "", tenantEmail: "", tenantIdNumber: "" }));
      return;
    }
    const tenant = tenants.find((t: any) => String(t.id) === tenantId);
    if (tenant) {
      setIsDirty(true);
      setForm(prev => ({
        ...prev,
        tenantId,
        tenantName: tenant.name || prev.tenantName,
        tenantPhone: tenant.phone || prev.tenantPhone,
        tenantEmail: tenant.email || prev.tenantEmail,
        tenantIdNumber: tenant.nationalId || prev.tenantIdNumber,
      }));
    }
  };

  const schedulePreview = useMemo(() => {
    if (!form.startDate || !form.endDate || !form.monthlyRent) return [];
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    const monthlyRent = Number(form.monthlyRent);
    const freq = form.paymentFrequency;
    const freqMonths = freq === 'quarterly' ? 3 : freq === 'semi_annual' ? 6 : freq === 'annual' ? 12 : 1;
    const contractMonths = Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    const totalValue = Number(form.totalContractValue) || monthlyRent * contractMonths;
    const count = Number(form.numberOfInstallments) || Math.ceil(contractMonths / freqMonths);
    const installmentAmt = Math.round((totalValue / count) * 100) / 100;

    const items = [];
    for (let i = 0; i < Math.min(count, 24); i++) {
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + (i * freqMonths));
      if (form.paymentDay) dueDate.setDate(Math.min(Number(form.paymentDay), 28));
      const isLast = i === count - 1;
      items.push({
        num: i + 1,
        date: dueDate.toISOString().split('T')[0],
        amount: isLast ? totalValue - (installmentAmt * (count - 1)) : installmentAmt,
      });
    }
    return items;
  }, [form.startDate, form.endDate, form.monthlyRent, form.paymentFrequency, form.paymentDay, form.totalContractValue, form.numberOfInstallments]);

  const handleSubmit = async () => {
    const firstError = validate({
      unitId: form.unitId ? null : "يرجى اختيار الوحدة",
      tenantId: !form.tenantId && !form.tenantName ? "يرجى اختيار أو إدخال المستأجر" : null,
      startDate: form.startDate ? null : "تاريخ بدء العقد مطلوب",
      endDate: !form.endDate
        ? "تاريخ انتهاء العقد مطلوب"
        : (form.startDate && form.endDate <= form.startDate ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" : null),
      monthlyRent: !form.monthlyRent || Number(form.monthlyRent) <= 0 ? "الإيجار الشهري يجب أن يكون أكبر من صفر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        unitId: Number(form.unitId),
        tenantId: form.tenantId ? Number(form.tenantId) : undefined,
        tenantName: form.tenantName,
        tenantPhone: form.tenantPhone || undefined,
        tenantEmail: form.tenantEmail || undefined,
        tenantIdNumber: form.tenantIdNumber || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        monthlyRent: Number(form.monthlyRent),
        depositAmount: form.depositAmount ? Number(form.depositAmount) : undefined,
        paymentDay: Number(form.paymentDay) || 1,
        status: form.status,
        notes: form.notes || undefined,
        contractNumber: form.contractNumber || undefined,
        ejarNumber: form.ejarNumber || undefined,
        contractType: form.contractType,
        paymentFrequency: form.paymentFrequency,
        yearlyRent: form.yearlyRent ? Number(form.yearlyRent) : undefined,
        totalContractValue: form.totalContractValue ? Number(form.totalContractValue) : undefined,
        latePenaltyType: form.latePenaltyType,
        latePenaltyValue: Number(form.latePenaltyValue) || 0,
        gracePeriodDays: Number(form.gracePeriodDays) || 0,
        terminationNoticeDays: Number(form.terminationNoticeDays) || 30,
        earlyTerminationFee: form.earlyTerminationFee ? Number(form.earlyTerminationFee) : 0,
        autoRenewal: form.autoRenewal,
        renewalNoticeDays: Number(form.renewalNoticeDays) || 60,
        renewalPeriodMonths: Number(form.renewalPeriodMonths) || 12,
        electricityResponsibility: form.electricityResponsibility,
        waterResponsibility: form.waterResponsibility,
        gasResponsibility: form.gasResponsibility,
        maintenanceResponsibility: form.maintenanceResponsibility,
        brokerageFee: form.brokerageFee ? Number(form.brokerageFee) : 0,
        brokeragePayor: form.brokeragePayor,
        depositHolder: form.depositHolder,
        insuranceRequired: form.insuranceRequired,
        ownerId: form.ownerId ? Number(form.ownerId) : undefined,
        numberOfInstallments: form.numberOfInstallments ? Number(form.numberOfInstallments) : undefined,
        specialConditions: form.specialConditions || undefined,
        ejarStatus: form.ejarStatus,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      setIsDirty(false);
      clearDraft();
      toast({ title: "تم إنشاء العقد بنجاح" });
      setLocation("/properties/contracts");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء العقد", description: err?.fix ?? err?.message });
    }
  };

  const selectedTenant = tenants.find((t: any) => String(t.id) === form.tenantId);
  const currency = getCurrencySymbol();

  return (
    <CreatePageLayout title="عقد إيجار جديد" backPath="/properties/contracts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /> بيانات العقد الأساسية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TextField label="رقم العقد" value={form.contractNumber} onChange={(v) => set("contractNumber", v)} placeholder="يُولّد تلقائياً" dir="ltr" />
              <TextField label="رقم عقد إيجار" value={form.ejarNumber} onChange={(v) => set("ejarNumber", v)} placeholder="رقم العقد في منصة إيجار" dir="ltr" />
              <div>
                <Label>حالة إيجار</Label>
                <Select value={form.ejarStatus} onValueChange={v => set("ejarStatus", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="pending">قيد المراجعة</SelectItem>
                    <SelectItem value="active">مُفعّل</SelectItem>
                    <SelectItem value="expired">منتهي</SelectItem>
                    <SelectItem value="cancelled">ملغى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع العقد</Label>
                <Select value={form.contractType} onValueChange={v => set("contractType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">سكني</SelectItem>
                    <SelectItem value="commercial">تجاري</SelectItem>
                    <SelectItem value="ejar_unified">عقد إيجار الموحد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormFieldWrapper label="الوحدة" required error={fieldErrors.unitId}>
                <Select value={form.unitId || "_none"} onValueChange={(v) => set("unitId", v === "_none" ? "" : v)}>
                  <SelectTrigger className={fieldErrorClass(fieldErrors.unitId)}><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">اختر الوحدة</SelectItem>
                    {units.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber} - {u.buildingName || ""} ({u.type || ""})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              {form.unitId && (
                <div className="md:col-span-3">
                  <PropertyUnitContextCard unitId={form.unitId} section="contract" />
                </div>
              )}
              <div>
                <Label>حالة العقد</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="expired">منتهي</SelectItem>
                    <SelectItem value="terminated">ملغى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users2 className="h-4 w-4 text-violet-500" /> بيانات المستأجر والمالك</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormFieldWrapper label="اختر من سجل المستأجرين" error={fieldErrors.tenantId}>
                <Select value={form.tenantId || "manual"} onValueChange={handleTenantSelect}>
                  <SelectTrigger className={fieldErrorClass(fieldErrors.tenantId)}>
                    <SelectValue placeholder="— اختر مستأجراً أو أدخل يدوياً —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">— إدخال يدوي —</SelectItem>
                    {tenants.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} {t.phone ? `· ${t.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTenant && (
                  <Badge variant="secondary" className="mt-1 text-xs gap-1">
                    <Users2 className="h-3 w-3" /> مرتبط بسجل المستأجر #{selectedTenant.id}
                  </Badge>
                )}
              </FormFieldWrapper>
              <div>
                <Label>المالك</Label>
                <Select value={form.ownerId || "none"} onValueChange={v => set("ownerId", v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— بدون مالك —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون مالك —</SelectItem>
                    {owners.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField label="المستأجر" required value={form.tenantName} onChange={(v) => set("tenantName", v)} placeholder="اسم المستأجر" />
              <TextField label="هاتف المستأجر" type="tel" inputMode="tel" value={form.tenantPhone} onChange={(v) => set("tenantPhone", v)} dir="ltr" />
              <TextField label="بريد المستأجر" value={form.tenantEmail} onChange={(v) => set("tenantEmail", v)} type="email" dir="ltr" />
              <TextField label="رقم هوية المستأجر" value={form.tenantIdNumber} onChange={(v) => set("tenantIdNumber", v)} placeholder="رقم الهوية أو الإقامة" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-500" /> مدة العقد والإيجار</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormFieldWrapper label="من تاريخ" required error={fieldErrors.startDate}>
                <div className={fieldErrorClass(fieldErrors.startDate)}><DatePicker value={form.startDate} onChange={v => set("startDate", v)} /></div>
              </FormFieldWrapper>
              <FormFieldWrapper label="إلى تاريخ" required error={fieldErrors.endDate}>
                <div className={fieldErrorClass(fieldErrors.endDate)}><DatePicker value={form.endDate} onChange={v => set("endDate", v)} /></div>
              </FormFieldWrapper>
              <div>
                <Label>دورة السداد</Label>
                <Select value={form.paymentFrequency} onValueChange={v => set("paymentFrequency", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="quarterly">ربع سنوي</SelectItem>
                    <SelectItem value="semi_annual">نصف سنوي</SelectItem>
                    <SelectItem value="annual">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField label={`الإيجار الشهري (${currency})`} required value={form.monthlyRent} onChange={(v) => set("monthlyRent", v)} step={0.01} min={0} error={fieldErrors.monthlyRent} />
              <NumberField label={`الإيجار السنوي (${currency})`} value={form.yearlyRent} onChange={(v) => set("yearlyRent", v)} step={0.01} min={0} />
              <NumberField label={`إجمالي قيمة العقد (${currency})`} value={form.totalContractValue} onChange={(v) => set("totalContractValue", v)} step={0.01} min={0} placeholder="يُحسب تلقائياً" />
              <NumberField label="عدد الأقساط" value={form.numberOfInstallments} onChange={(v) => set("numberOfInstallments", v)} placeholder="يُحسب من الدورة" />
              <NumberField label="يوم السداد (من الشهر)" value={form.paymentDay} onChange={(v) => set("paymentDay", v)} min={1} max={28} />
              <NumberField label={`مبلغ ا��تأمين (${currency})`} value={form.depositAmount} onChange={(v) => set("depositAmount", v)} step={0.01} min={0} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" /> الغرامات والشروط</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>نوع غرامة التأخير</Label>
                <Select value={form.latePenaltyType} onValueChange={v => set("latePenaltyType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">نسبة مئوية (%)</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField label={`قيمة الغرامة ${form.latePenaltyType === "percentage" ? "(%)" : `(${currency})`}`} value={form.latePenaltyValue} onChange={(v) => set("latePenaltyValue", v)} step={0.01} min={0} />
              <NumberField label="فترة السماح (أيام)" value={form.gracePeriodDays} onChange={(v) => set("gracePeriodDays", v)} />
              <NumberField label="مدة إشعار الإنهاء (أيام)" value={form.terminationNoticeDays} onChange={(v) => set("terminationNoticeDays", v)} />
              <NumberField label={`رسم الإنهاء المبكر (${currency})`} value={form.earlyTerminationFee} onChange={(v) => set("earlyTerminationFee", v)} step={0.01} min={0} />
              <div>
                <Label>حامل التأمين</Label>
                <Select value={form.depositHolder} onValueChange={v => set("depositHolder", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">المالك</SelectItem>
                    <SelectItem value="ejar_platform">منصة إيجار</SelectItem>
                    <SelectItem value="bank">البنك</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4 text-emerald-500" /> التجديد والسمسرة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.autoRenewal} onCheckedChange={v => set("autoRenewal", v)} />
                <Label>تجديد تلقائي</Label>
              </div>
              {form.autoRenewal && (
                <>
                  <NumberField label="إشعار التجديد قبل (أيام)" value={form.renewalNoticeDays} onChange={(v) => set("renewalNoticeDays", v)} />
                  <NumberField label="مدة التجديد (أشهر)" value={form.renewalPeriodMonths} onChange={(v) => set("renewalPeriodMonths", v)} />
                </>
              )}
              <NumberField label={`رسم السمسرة (${currency})`} value={form.brokerageFee} onChange={(v) => set("brokerageFee", v)} />
              <div>
                <Label>يدفعها</Label>
                <Select value={form.brokeragePayor} onValueChange={v => set("brokeragePayor", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant">المستأجر</SelectItem>
                    <SelectItem value="owner">المالك</SelectItem>
                    <SelectItem value="shared">مشتركة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.insuranceRequired} onCheckedChange={v => set("insuranceRequired", v)} />
                <Label>تأمين مطلوب</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> مسؤولية الخدمات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: "electricityResponsibility", label: "الكهرباء" },
                { key: "waterResponsibility", label: "المياه" },
                { key: "gasResponsibility", label: "الغاز" },
                { key: "maintenanceResponsibility", label: "الصيانة" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Select value={(form as any)[key]} onValueChange={v => set(key, v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tenant">المستأجر</SelectItem>
                      <SelectItem value="owner">المالك</SelectItem>
                      <SelectItem value="shared">مشتركة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {schedulePreview.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-500" /> جدول الأقساط ({schedulePreview.length} قسط)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-start p-2">#</th>
                      <th className="text-start p-2">تاريخ الاستحقاق</th>
                      <th className="text-start p-2">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePreview.map(item => (
                      <tr key={item.num} className="border-t">
                        <td className="p-2 font-mono">{item.num}</td>
                        <td className="p-2">{formatDateAr(item.date)}</td>
                        <td className="p-2 font-bold text-emerald-600">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t-2">
                    <tr>
                      <td className="p-2" colSpan={2}>الإجمالي</td>
                      <td className="p-2 text-emerald-600">{formatCurrency(schedulePreview.reduce((s, i) => s + i.amount, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <TextAreaField label="شروط خاصة" value={form.specialConditions} onChange={(v) => set("specialConditions", v)} rows={3} placeholder="شروط إضافية خاصة بالعقد..." />
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => set("notes", v)} rows={2} placeholder="ملاحظات إضافية..." />

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العقد" />

        {form.unitId && form.monthlyRent && form.startDate && form.endDate && (
          <ImpactPreviewButton
            endpoint="/properties/contracts/impact-preview"
            payload={{
              unitId: Number(form.unitId),
              tenantId: form.tenantId ? Number(form.tenantId) : undefined,
              monthlyRent: Number(form.monthlyRent),
              startDate: form.startDate,
              endDate: form.endDate,
              securityDeposit: form.depositAmount ? Number(form.depositAmount) : undefined,
            }}
            label="معاينة أثر العقد"
          />
        )}

        <div className="flex justify-end gap-3 pt-6">
          <Button variant="outline" onClick={() => setLocation("/properties/contracts")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ العقد"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
