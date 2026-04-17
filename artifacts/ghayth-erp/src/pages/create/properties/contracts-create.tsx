import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Users2, FileText, Calendar, Banknote, Shield, ScrollText, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { getCurrencySymbol } from "@/lib/formatters";

export default function ContractsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/contracts", "POST", [["rental-contracts"]]);
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["property-units"], "/properties/units");
  const { data: tenantsResp } = useApiQuery<any>(["tenants-registry"], "/properties/tenants");
  const { data: ownersResp } = useApiQuery<any>(["property-owners"], "/properties/owners");
  const units = unitsData?.data || [];
  const tenants = asList(tenantsResp);
  const owners = asList(ownersResp);

  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges(isDirty);

  const [form, setForm] = useState({
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
    if (!form.unitId) {
      toast({ variant: "destructive", title: "يرجى اختيار الوحدة" });
      return;
    }
    if (!form.tenantName) {
      toast({ variant: "destructive", title: "اسم المستأجر مطلوب" });
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast({ variant: "destructive", title: "تاريخ بدء وانتهاء العقد مطلوبان" });
      return;
    }
    if (form.endDate <= form.startDate) {
      toast({ variant: "destructive", title: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" });
      return;
    }
    if (!form.monthlyRent || Number(form.monthlyRent) <= 0) {
      toast({ variant: "destructive", title: "الإيجار الشهري مطلوب" });
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
      toast({ title: "تم إنشاء العقد بنجاح" });
      setLocation("/properties/contracts");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء العقد" });
    }
  };

  const selectedTenant = tenants.find((t: any) => String(t.id) === form.tenantId);
  const currency = getCurrencySymbol();

  return (
    <CreatePageLayout title="عقد إيجار جديد" backPath="/properties/contracts">
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
              <div>
                <Label>رقم العقد</Label>
                <Input className="mt-1" value={form.contractNumber} onChange={e => set("contractNumber", e.target.value)} placeholder="يُولّد تلقائياً" dir="ltr" />
              </div>
              <div>
                <Label>رقم عقد إيجار</Label>
                <Input className="mt-1" value={form.ejarNumber} onChange={e => set("ejarNumber", e.target.value)} placeholder="رقم العقد في منصة إيجار" dir="ltr" />
              </div>
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
              <div>
                <Label>الوحدة <span className="text-red-500">*</span></Label>
                <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.unitId} onChange={e => set("unitId", e.target.value)}>
                  <option value="">اختر الوحدة</option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.unitNumber} - {u.buildingName || ""} ({u.type || ""})</option>
                  ))}
                </select>
              </div>
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
              <div>
                <Label className="flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-blue-500" /> اختر من سجل المستأجرين
                </Label>
                <Select value={form.tenantId || "manual"} onValueChange={handleTenantSelect}>
                  <SelectTrigger className="mt-1">
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
              </div>
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
              <div>
                <Label>المستأجر <span className="text-red-500">*</span></Label>
                <Input className="mt-1" value={form.tenantName} onChange={e => set("tenantName", e.target.value)} placeholder="اسم المستأجر" />
              </div>
              <div>
                <Label>هاتف المستأجر</Label>
                <Input className="mt-1" dir="ltr" value={form.tenantPhone} onChange={e => set("tenantPhone", e.target.value)} />
              </div>
              <div>
                <Label>بريد المستأجر</Label>
                <Input className="mt-1" type="email" dir="ltr" value={form.tenantEmail} onChange={e => set("tenantEmail", e.target.value)} />
              </div>
              <div>
                <Label>رقم هوية المستأجر</Label>
                <Input className="mt-1" value={form.tenantIdNumber} onChange={e => set("tenantIdNumber", e.target.value)} placeholder="رقم الهوية أو الإقامة" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-500" /> مدة العقد والإيجار</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>من تاريخ <span className="text-red-500">*</span></Label>
                <div className="mt-1"><DatePicker value={form.startDate} onChange={v => set("startDate", v)} /></div>
              </div>
              <div>
                <Label>إلى تاريخ <span className="text-red-500">*</span></Label>
                <div className="mt-1"><DatePicker value={form.endDate} onChange={v => set("endDate", v)} /></div>
              </div>
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
              <div>
                <Label>الإيجار الشهري ({currency}) <span className="text-red-500">*</span></Label>
                <Input className="mt-1" type="number" value={form.monthlyRent} onChange={e => set("monthlyRent", e.target.value)} />
              </div>
              <div>
                <Label>الإيجار السنوي ({currency})</Label>
                <Input className="mt-1" type="number" value={form.yearlyRent} onChange={e => set("yearlyRent", e.target.value)} />
              </div>
              <div>
                <Label>إجمالي قيمة العقد ({currency})</Label>
                <Input className="mt-1" type="number" value={form.totalContractValue} onChange={e => set("totalContractValue", e.target.value)} placeholder="يُحسب تلقائياً" />
              </div>
              <div>
                <Label>عدد الأقساط</Label>
                <Input className="mt-1" type="number" value={form.numberOfInstallments} onChange={e => set("numberOfInstallments", e.target.value)} placeholder="يُحسب من الدورة" />
              </div>
              <div>
                <Label>يوم السداد (من الشهر)</Label>
                <Input className="mt-1" type="number" min="1" max="28" value={form.paymentDay} onChange={e => set("paymentDay", e.target.value)} />
              </div>
              <div>
                <Label>مبلغ التأمين ({currency})</Label>
                <Input className="mt-1" type="number" value={form.depositAmount} onChange={e => set("depositAmount", e.target.value)} />
              </div>
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
              <div>
                <Label>قيمة الغرامة {form.latePenaltyType === "percentage" ? "(%)" : `(${currency})`}</Label>
                <Input className="mt-1" type="number" value={form.latePenaltyValue} onChange={e => set("latePenaltyValue", e.target.value)} />
              </div>
              <div>
                <Label>فترة السماح (أيام)</Label>
                <Input className="mt-1" type="number" value={form.gracePeriodDays} onChange={e => set("gracePeriodDays", e.target.value)} />
              </div>
              <div>
                <Label>مدة إشعار الإنهاء (أيام)</Label>
                <Input className="mt-1" type="number" value={form.terminationNoticeDays} onChange={e => set("terminationNoticeDays", e.target.value)} />
              </div>
              <div>
                <Label>رسم الإنهاء المبكر ({currency})</Label>
                <Input className="mt-1" type="number" value={form.earlyTerminationFee} onChange={e => set("earlyTerminationFee", e.target.value)} />
              </div>
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
                  <div>
                    <Label>إشعار التجديد قبل (أيام)</Label>
                    <Input className="mt-1" type="number" value={form.renewalNoticeDays} onChange={e => set("renewalNoticeDays", e.target.value)} />
                  </div>
                  <div>
                    <Label>مدة التجديد (أشهر)</Label>
                    <Input className="mt-1" type="number" value={form.renewalPeriodMonths} onChange={e => set("renewalPeriodMonths", e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <Label>رسم السمسرة ({currency})</Label>
                <Input className="mt-1" type="number" value={form.brokerageFee} onChange={e => set("brokerageFee", e.target.value)} />
              </div>
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
                        <td className="p-2">{item.date}</td>
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

        <div>
          <Label>شروط خاصة</Label>
          <Textarea className="mt-1" rows={3} value={form.specialConditions} onChange={e => set("specialConditions", e.target.value)} placeholder="شروط إضافية خاصة بالعقد..." />
        </div>

        <div>
          <Label>ملاحظات</Label>
          <Textarea className="mt-1" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="ملاحظات إضافية..." />
        </div>

        {Number(form.monthlyRent || form.yearlyRent) > 0 && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            <p className="font-semibold mb-1">سيتم تلقائياً عند حفظ العقد:</p>
            <ul className="list-disc list-inside space-y-1 text-green-700">
              <li>إنشاء قيد محاسبي لإثبات إيراد الإيجار</li>
              <li>توليد جدول أقساط حسب عدد الأقساط المحدد</li>
              <li>ربط القيود بالوحدة والعقد لتتبع الإيرادات العقارية</li>
            </ul>
          </div>
        )}

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العقد" />

        <div className="flex justify-end gap-3 pt-6">
          <Button variant="outline" onClick={() => setLocation("/properties/contracts")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ العقد"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
