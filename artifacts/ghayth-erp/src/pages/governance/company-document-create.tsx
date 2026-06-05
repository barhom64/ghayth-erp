// Quick-add company document. Handles ANY duration-based company-
// level paper: سجل تجاري, ترخيص بلدي, تأمين طبي للموظفين, شهادة
// الزكاة, شهادة GOSI, عضوية غرفة التجارة, إلخ.
//
// Wires through POST /hr/company-documents which (since the bug fix
// in this branch) actually INSERTs the correct columns and registers
// a renewal obligation via obligationsEngine — so the new doc shows
// up on /calendar AND /governance/renewals-hub automatically.

import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { PageShell } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, ArrowLeft, AlertCircle, Wallet, Building2 } from "lucide-react";

interface Form {
  documentType: string;
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  issuingAuthority: string;
  reminderDays: string;
  notes: string;
  // Renewal-cost path: post an expense JE alongside the document so
  // the renewal fee is captured in finance from day one.
  renewalCost: string;
  renewalAccountCode: string;
  recordExpenseOnCreate: boolean;
  // Auto-task assignment: the manager of this department gets a task
  // when the obligation fires. Defaults to the hr_manager role
  // fallback in the backend if left empty.
  responsibleDepartmentId: string;
}

const EMPTY: Form = {
  documentType: "",
  documentNumber: "",
  issueDate: "",
  expiryDate: "",
  issuingAuthority: "",
  reminderDays: "30",
  notes: "",
  renewalCost: "",
  renewalAccountCode: "",
  recordExpenseOnCreate: false,
  responsibleDepartmentId: "",
};

// Smart presets — picking one of these fills the type label + default
// issuingAuthority + sensible reminder window. Operator can still edit
// every field. Each entry's `defaultReminder` reflects how much lead
// time the renewal actually needs (CR renewal at MoCI is a 2-week
// process so we warn 45 days early; a medical insurance renewal can
// be done overnight so 30 is fine).
const PRESETS: Array<{
  key: string;
  label: string;
  defaultAuthority?: string;
  defaultReminder?: number;
}> = [
  { key: "سجل تجاري", label: "سجل تجاري", defaultAuthority: "وزارة التجارة", defaultReminder: 45 },
  { key: "ترخيص بلدي", label: "ترخيص بلدي", defaultAuthority: "الأمانة / البلدية", defaultReminder: 30 },
  { key: "ترخيص نشاط", label: "ترخيص نشاط", defaultAuthority: "الجهة المختصة", defaultReminder: 30 },
  { key: "تأمين طبي", label: "تأمين طبي للموظفين", defaultAuthority: "شركة التأمين", defaultReminder: 30 },
  { key: "شهادة الزكاة", label: "شهادة الزكاة والدخل", defaultAuthority: "هيئة الزكاة والضريبة والجمارك (ZATCA)", defaultReminder: 30 },
  { key: "شهادة GOSI", label: "شهادة التأمينات الاجتماعية (GOSI)", defaultAuthority: "المؤسسة العامة للتأمينات الاجتماعية", defaultReminder: 30 },
  { key: "عضوية غرفة التجارة", label: "عضوية الغرفة التجارية", defaultAuthority: "الغرفة التجارية", defaultReminder: 30 },
  { key: "شهادة سعودة", label: "شهادة السعودة (نطاقات)", defaultAuthority: "وزارة الموارد البشرية", defaultReminder: 30 },
  { key: "ترخيص دفاع مدني", label: "رخصة دفاع مدني", defaultAuthority: "المديرية العامة للدفاع المدني", defaultReminder: 30 },
  { key: "شهادة VAT", label: "شهادة ضريبة القيمة المضافة", defaultAuthority: "ZATCA", defaultReminder: 30 },
];

export default function CompanyDocumentCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const { data: deptsResp } = useApiQuery<any>(["departments-list-cd"], "/settings/departments");
  const departments = asList(deptsResp?.data || deptsResp);

  const createMut = useApiMutation<any, any>(
    "/hr/company-documents",
    "POST",
    [["company-documents"], ["renewals-hub"]],
    {
      onSuccess: () => {
        toast({
          title: "تم إضافة الوثيقة",
          description: "ستظهر في التقويم الموحد ومركز التجديدات قبل انتهائها",
        });
        navigate("/governance/renewals-hub");
      },
    }
  );

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setForm((f) => ({
      ...f,
      documentType: p.label,
      issuingAuthority: f.issuingAuthority || p.defaultAuthority || "",
      reminderDays: String(p.defaultReminder ?? 30),
    }));
  };

  const handleSave = async () => {
    if (!form.documentType || !form.expiryDate) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "نوع الوثيقة وتاريخ الانتهاء مطلوبان",
      });
      return;
    }
    await createMut.mutateAsync({
      documentType: form.documentType,
      documentNumber: form.documentNumber || undefined,
      issueDate: form.issueDate || undefined,
      expiryDate: form.expiryDate,
      issuingAuthority: form.issuingAuthority || undefined,
      reminderDays: form.reminderDays ? Number(form.reminderDays) : 30,
      notes: form.notes || undefined,
      renewalCost: form.renewalCost ? Number(form.renewalCost) : undefined,
      renewalAccountCode: form.renewalAccountCode || undefined,
      recordExpenseOnCreate: form.recordExpenseOnCreate,
      responsibleDepartmentId: form.responsibleDepartmentId ? Number(form.responsibleDepartmentId) : undefined,
    });
  };

  return (
    <PageShell
      title="إضافة وثيقة منشأة"
      subtitle="سجل تجاري، ترخيص، تأمين، شهادة جهة حكومية — أي شيء له مدة انتهاء"
      breadcrumbs={[
        { label: "الحوكمة", href: "/governance" },
        { label: "مركز التجديدات", href: "/governance/renewals-hub" },
        { label: "وثيقة جديدة" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate("/governance/renewals-hub")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          إلغاء
        </Button>
      }
    >
      <Card className="mb-3 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-3 flex items-start gap-2 text-xs">
          <AlertCircle className="h-4 w-4 text-status-info-foreground shrink-0 mt-0.5" />
          <p>
            عند الحفظ يُسجَّل التزام تجديد آلي يظهر في "التقويم الموحد" و"مركز التجديدات" قبل {form.reminderDays || 30} يوماً من تاريخ الانتهاء.
            cron الالتزامات سيُصعّد الإشعار تلقائياً إذا فات الموعد.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> قوالب جاهزة
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              variant={form.documentType === p.label ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(p.key)}
              className="text-xs"
            >
              {p.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات الوثيقة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label className="text-xs">نوع الوثيقة *</Label>
            <Input
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
              placeholder="مثال: سجل تجاري، ترخيص بلدي، تأمين طبي للموظفين"
            />
          </div>
          <div>
            <Label className="text-xs">رقم الوثيقة</Label>
            <Input
              value={form.documentNumber}
              onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))}
              placeholder="رقم تسلسلي"
              dir="ltr"
            />
          </div>
          <div>
            <Label className="text-xs">الجهة المُصدِرة</Label>
            <Input
              value={form.issuingAuthority}
              onChange={(e) => setForm((f) => ({ ...f, issuingAuthority: e.target.value }))}
              placeholder="مثال: وزارة التجارة"
            />
          </div>
          <div>
            <Label className="text-xs">تاريخ الإصدار</Label>
            <DatePicker
              value={form.issueDate}
              onChange={(v) => setForm((f) => ({ ...f, issueDate: v }))}
            />
          </div>
          <div>
            <Label className="text-xs">تاريخ الانتهاء *</Label>
            <DatePicker
              value={form.expiryDate}
              onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))}
            />
          </div>
          <div>
            <Label className="text-xs">التذكير قبل (يوم)</Label>
            <Input
              type="number"
              min={0}
              max={180}
              value={form.reminderDays}
              onChange={(e) => setForm((f) => ({ ...f, reminderDays: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="أي تفاصيل تساعد المسؤول عن التجديد"
            />
          </div>
        </CardContent>
      </Card>

      {/* Renewal cost + auto-expense — user said: "I want the
          renewal of the commercial registration to actually be tied
          to money in the expenses." Ticking the box posts a JE
          alongside the document so the renewal fee shows up in
          finance instantly. */}
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" /> رسوم التجديد (اختياري)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs">تكلفة التجديد (ر.س)</Label>
            <Input
              type="number"
              min={0}
              value={form.renewalCost}
              onChange={(e) => setForm((f) => ({ ...f, renewalCost: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">حساب المصروف</Label>
            <Input
              value={form.renewalAccountCode}
              onChange={(e) => setForm((f) => ({ ...f, renewalAccountCode: e.target.value }))}
              placeholder="افتراضي: 5400 رسوم حكومية"
              dir="ltr"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-start gap-2 text-xs cursor-pointer border rounded p-2 w-full bg-status-info-surface/20">
              <Checkbox
                checked={form.recordExpenseOnCreate}
                onCheckedChange={(v) => setForm((f) => ({ ...f, recordExpenseOnCreate: !!v }))}
              />
              <span>
                <span className="font-medium">قيّد المصروف الآن</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  ينشئ قيداً محاسبياً مدين/دائن بقيمة الرسوم لحظة الحفظ
                </span>
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Responsible department — user said: "any time something is
          about to expire the system must open a task for the
          responsible department". The backend resolves this to the
          department's manager (or falls back to the matching role)
          and creates a tasks row pre-assigned with status=pending. */}
      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" /> القسم المسؤول عن التجديد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">القسم</Label>
              <Select
                value={form.responsibleDepartmentId || "_none"}
                onValueChange={(v) => setForm((f) => ({ ...f, responsibleDepartmentId: v === "_none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— استخدم الافتراضي (مدير الموارد البشرية) —</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-[10px] text-muted-foreground self-end">
              ستُفتح مهمة آلية على قائمة مدير هذا القسم قبل {form.reminderDays || 30} يوماً من الانتهاء.
              إذا لم يكن للقسم مدير، تُفتح المهمة بدون مُسنَدة لها وتظهر لكل من له صلاحية HR.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/governance/renewals-hub")}>
          إلغاء
        </Button>
        <Button
          onClick={handleSave}
          disabled={!form.documentType || !form.expiryDate || createMut.isPending}
          rateLimitAware
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          حفظ وتسجيل التذكير
        </Button>
      </div>
    </PageShell>
  );
}
