// Quick employee onboarding — HR fills only the essentials (name,
// login email, job title, branch, salary) and the new hire completes
// their personal data (national ID, phone, DOB, address, bank, photo,
// emergency contact) from /my-profile after first login.
//
// Companion to backend POST /employees/quick-create + the
// /my-profile/complete page. The full /employees/create form is still
// available for HR teams that have all the paperwork ready up front.

import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Zap, UserPlus, Mail, Briefcase, Building2, DollarSign, Wallet, Copy, ArrowLeft } from "lucide-react";

interface QuickForm {
  name: string;
  internalEmail: string;
  jobTitleId: string;
  branchId: string;
  salary: string;
  role: string;
  createCustodyAccount: boolean;
}

const DEFAULT_FORM: QuickForm = {
  name: "",
  internalEmail: "",
  jobTitleId: "",
  branchId: "",
  salary: "",
  role: "",
  createCustodyAccount: false,
};

export default function EmployeesQuickCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<QuickForm>(DEFAULT_FORM);
  const [createdInfo, setCreatedInfo] = useState<{
    id: number;
    empNumber: string | null;
    loginEmail: string | null;
    tempPassword: string | null;
  } | null>(null);

  const { data: jobTitlesResp } = useApiQuery<any>(["job-titles"], "/employees/job-titles");
  const jobTitles = asList(jobTitlesResp?.data || jobTitlesResp);

  const { data: branchesResp } = useApiQuery<any>(["branches-list-quick"], "/settings/branches");
  const branches = asList(branchesResp?.data || branchesResp);

  const createMut = useApiMutation<any, any>(
    "/employees/quick-create",
    "POST",
    [["employees"], ["pending-profile-employees"]],
    {
      onSuccess: (response: any) => {
        setCreatedInfo({
          id: response.id,
          empNumber: response.empNumber ?? null,
          loginEmail: response.userEmail ?? form.internalEmail,
          tempPassword: response.tempPassword ?? null,
        });
        toast({
          title: "تم إنشاء الموظف",
          description: "أرسِل بيانات الدخول للموظف ليكمل ملفه الشخصي",
        });
      },
    }
  );

  const handleSubmit = async () => {
    if (!form.name || !form.internalEmail) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "الاسم والبريد الداخلي مطلوبان",
      });
      return;
    }
    await createMut.mutateAsync({
      name: form.name,
      internalEmail: form.internalEmail,
      jobTitleId: form.jobTitleId ? Number(form.jobTitleId) : undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
      salary: form.salary ? Number(form.salary) : undefined,
      role: form.role || undefined,
      createCustodyAccount: form.createCustodyAccount,
    });
  };

  const copyCredentials = () => {
    if (!createdInfo) return;
    const txt = [
      `بيانات دخول الموظف ${form.name}:`,
      `البريد: ${createdInfo.loginEmail}`,
      `كلمة المرور المؤقتة: ${createdInfo.tempPassword}`,
      "",
      "بعد تسجيل الدخول، يُرجى استكمال البيانات الشخصية من /my-profile",
    ].join("\n");
    navigator.clipboard.writeText(txt);
    toast({ title: "تم النسخ", description: "أرسل النص للموظف عبر واتساب أو البريد" });
  };

  // Post-create confirmation screen — surfaces the temp password so HR
  // can hand it off, and points the operator at the pending-profile
  // dashboard so they can track who hasn't completed yet.
  if (createdInfo) {
    return (
      <PageShell
        title="تم إنشاء الموظف"
        subtitle="أرسل بيانات الدخول للموظف ليكمل ملفه الشخصي"
        breadcrumbs={[
          { label: "الموارد البشرية", href: "/hr" },
          { label: "إضافة سريعة" },
        ]}
      >
        <Card className="border-status-success-surface bg-status-success-surface/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-status-success-foreground" />
              {form.name} — مُنشأ بنجاح
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm">
              {createdInfo.empNumber && (
                <p>
                  <span className="text-muted-foreground">رقم الموظف: </span>
                  <span className="font-mono font-semibold">{createdInfo.empNumber}</span>
                </p>
              )}
              <p>
                <span className="text-muted-foreground">البريد للدخول: </span>
                <span className="font-mono font-semibold" dir="ltr">{createdInfo.loginEmail}</span>
              </p>
              {createdInfo.tempPassword && (
                <p>
                  <span className="text-muted-foreground">كلمة المرور المؤقتة: </span>
                  <span className="font-mono font-bold text-status-warning-foreground" dir="ltr">{createdInfo.tempPassword}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyCredentials} variant="outline" size="sm" className="gap-2">
                <Copy className="h-4 w-4" />
                نسخ بيانات الدخول للإرسال
              </Button>
              <Button onClick={() => navigate(`/employees/${createdInfo.id}`)} variant="outline" size="sm">
                فتح ملف الموظف
              </Button>
              <Button onClick={() => { setCreatedInfo(null); setForm(DEFAULT_FORM); }} size="sm">
                إضافة موظف آخر
              </Button>
              <Button onClick={() => navigate("/hr/pending-profile")} variant="ghost" size="sm">
                قائمة الانتظار للاكتمال ←
              </Button>
            </div>
            <div className="border-t pt-3 text-xs text-muted-foreground">
              <p className="font-semibold mb-1">الخطوة التالية:</p>
              <p>1. الموظف يسجّل الدخول بالبريد وكلمة المرور أعلاه</p>
              <p>2. يفتح صفحة "ملفي الشخصي" /my-profile</p>
              <p>3. يكمل: رقم الهوية، الهاتف، تاريخ الميلاد، الحساب البنكي، جهة الطوارئ</p>
              <p>4. ستظهر علامة "مكتمل" على ملفه فور إنهاء البيانات الإلزامية</p>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="إضافة موظف — سريع"
      subtitle="أدخل الأساسيات فقط — الموظف يكمل بياناته الشخصية من بوابته"
      breadcrumbs={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "إضافة موظف سريع" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate("/employees/create")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          الإضافة التفصيلية (كل الحقول)
        </Button>
      }
    >
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 flex items-start gap-3">
          <Zap className="h-5 w-5 text-status-info-foreground shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium mb-1">المسار السريع:</p>
            <p className="text-muted-foreground">
              تدخل أنت الاسم + البريد الداخلي + المسمى الوظيفي + الفرع. الموظف يستلم بيانات الدخول
              ويُكمل بنفسه: الهوية، الهاتف، تاريخ الميلاد، الحساب البنكي، جهة الاتصال للطوارئ.
              يُحتفظ بسجله بحالة "في انتظار الاستكمال" حتى يُنهي البيانات الإلزامية.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">الأساسيات</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs flex items-center gap-1">
              <UserPlus className="h-3 w-3" />
              الاسم الكامل *
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="مثال: محمد عبدالله العتيبي"
              data-testid="quick-name"
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" />
              البريد الداخلي (للدخول) *
            </Label>
            <Input
              type="email"
              dir="ltr"
              value={form.internalEmail}
              onChange={(e) => setForm((f) => ({ ...f, internalEmail: e.target.value }))}
              placeholder="m.alotaibi@company.sa"
              data-testid="quick-internal-email"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              سيُنشأ حساب مستخدم بهذا البريد ودور النظام المختار. الموظف يضيف بريده الشخصي لاحقاً.
            </p>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              المسمى الوظيفي
            </Label>
            <Select
              value={form.jobTitleId || "_none"}
              onValueChange={(v) => {
                const id = v === "_none" ? "" : v;
                const picked = jobTitles.find((jt: any) => String(jt.id) === id);
                setForm((f) => ({
                  ...f,
                  jobTitleId: id,
                  role: picked?.defaultRoleKey || f.role,
                  createCustodyAccount: Boolean(picked?.opensCustody) || f.createCustodyAccount,
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="اختر المسمى" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— غير محدد —</SelectItem>
                {jobTitles.map((jt: any) => (
                  <SelectItem key={jt.id} value={String(jt.id)}>
                    {jt.name}{jt.defaultRoleKey ? ` — ${jt.defaultRoleKey}` : ""}{jt.opensCustody ? " · 💰" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              يحدد دور النظام تلقائياً وعلامة 💰 تعني فتح عهدة تلقائياً.
            </p>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              الفرع
            </Label>
            <Select
              value={form.branchId || "_none"}
              onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "_none" ? "" : v }))}
            >
              <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— الفرع الافتراضي —</SelectItem>
                {branches.map((b: any) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              الراتب الشهري (ر.س)
            </Label>
            <Input
              type="number"
              value={form.salary}
              onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
              placeholder="0"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              يمكن تركه فارغاً وإضافته لاحقاً قبل أول مسير راتب.
            </p>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer border rounded p-2 bg-status-info-surface/20 w-full">
              <input
                type="checkbox"
                checked={form.createCustodyAccount}
                onChange={(e) => setForm((f) => ({ ...f, createCustodyAccount: e.target.checked }))}
                data-testid="quick-custody"
              />
              <span>
                <span className="flex items-center gap-1 font-medium">
                  <Wallet className="h-3 w-3" />
                  فتح عهدة تلقائياً
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  حساب فرعي تحت 1131 لتتبع رصيد عهد الموظف
                </span>
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => navigate("/employees")}
        >
          إلغاء
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!form.name || !form.internalEmail || createMut.isPending}
          rateLimitAware
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          إنشاء سريع
        </Button>
      </div>

      <div className="mt-6 text-[11px] text-muted-foreground border-t pt-3 flex items-center justify-between">
        <span>
          البيانات المتبقية (الهوية، الهاتف، تاريخ الميلاد، الحساب البنكي، صورة، جهة الطوارئ) — يستكملها الموظف بنفسه
        </span>
        <Badge variant="outline" className="text-[10px]">في انتظار الاستكمال</Badge>
      </div>
    </PageShell>
  );
}
