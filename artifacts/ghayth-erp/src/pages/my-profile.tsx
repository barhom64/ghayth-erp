// Employee self-service profile completion. Used by employees who
// were added via HR's quick-create flow — they fill in their own
// personal data here (national ID, phone, DOB, address, bank,
// emergency contact) instead of bouncing back to HR for every field.
//
// Drives PATCH /employees/:id/complete-profile which:
//   - Updates only the supplied fields
//   - Flips employees.profileCompleted=true + stamps
//     profileCompletedAt when nationalId + phone + dateOfBirth +
//     bankAccount are all populated
//   - Returns the list of still-missing required fields so the UI
//     can highlight what's left

import { useState, useEffect } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertTriangle, User, Phone, Mail, MapPin, Calendar, CreditCard, AlertCircle, Heart, Save } from "lucide-react";

interface ProfileForm {
  personalEmail: string;
  phone: string;
  nationalId: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  bankName: string;
  bankAccount: string;
  iban: string;
  iqamaNumber: string;
  iqamaExpiry: string;
}

const EMPTY: ProfileForm = {
  personalEmail: "", phone: "", nationalId: "", dateOfBirth: "", gender: "",
  nationality: "saudi", address: "", emergencyContact: "", emergencyPhone: "",
  bankName: "", bankAccount: "", iban: "", iqamaNumber: "", iqamaExpiry: "",
};

const REQUIRED_LABELS: Record<string, string> = {
  nationalId: "رقم الهوية",
  phone: "رقم الهاتف",
  dateOfBirth: "تاريخ الميلاد",
  bankAccount: "رقم الحساب البنكي",
};

export default function MyProfile() {
  const { toast } = useToast();
  const auth = useAuth();
  const userId = auth.user?.id;

  // Resolve the current user's employee id. The login response carries
  // employeeId; if it's missing the user isn't bound to an employee
  // (e.g. an admin-only account) and this page doesn't apply.
  const employeeId: number | null = (auth.user as any)?.employeeId ?? null;

  const { data: me, isLoading, refetch } = useApiQuery<any>(
    ["my-employee", String(employeeId)],
    employeeId ? `/employees/${employeeId}` : null,
    !!employeeId
  );

  const [form, setForm] = useState<ProfileForm>(EMPTY);
  useEffect(() => {
    if (!me) return;
    setForm({
      personalEmail: me.personalEmail || "",
      phone: me.phone || "",
      nationalId: me.nationalId || "",
      dateOfBirth: me.dateOfBirth ? me.dateOfBirth.split("T")[0] : "",
      gender: me.gender || "",
      nationality: me.nationality || "saudi",
      address: me.address || "",
      emergencyContact: me.emergencyContact || "",
      emergencyPhone: me.emergencyPhone || "",
      bankName: me.bankName || "",
      bankAccount: me.bankAccount || "",
      iban: me.iban || "",
      iqamaNumber: me.iqamaNumber || "",
      iqamaExpiry: me.iqamaExpiry ? me.iqamaExpiry.split("T")[0] : "",
    });
  }, [me]);

  const saveMut = useApiMutation<any, Partial<ProfileForm>>(
    employeeId ? `/employees/${employeeId}/complete-profile` : "",
    "PATCH",
    [["my-employee", String(employeeId)], ["employees", String(employeeId)]],
    {
      onSuccess: (resp: any) => {
        if (resp.profileCompleted) {
          toast({
            title: "✓ تم إكمال الملف",
            description: "شكراً — بياناتك مكتملة الآن",
          });
        } else {
          const missing = (resp.missingFields || []).map((f: string) => REQUIRED_LABELS[f] || f).join("، ");
          toast({
            title: "تم الحفظ",
            description: missing ? `لإكمال الملف: ${missing}` : "بياناتك محفوظة",
          });
        }
        refetch();
      },
    }
  );

  if (!userId) {
    return (
      <PageShell title="ملفي الشخصي">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            يجب تسجيل الدخول لعرض الملف الشخصي
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!employeeId) {
    return (
      <PageShell title="ملفي الشخصي">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            حسابك ليس مرتبطاً بسجل موظف — هذه الصفحة للموظفين فقط.
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (isLoading) return <LoadingSpinner />;

  const isComplete = Boolean(me?.profileCompleted);
  const missingCount = (["nationalId", "phone", "dateOfBirth", "bankAccount"] as const).filter(
    (k) => !form[k]
  ).length;

  const handleSave = () => {
    // Send only the changed (non-empty) fields. The endpoint already
    // ignores empty strings server-side but we trim the payload here
    // for a smaller request.
    const payload: Partial<ProfileForm> = {};
    for (const k of Object.keys(form) as Array<keyof ProfileForm>) {
      if (form[k]) (payload as any)[k] = form[k];
    }
    saveMut.mutate(payload);
  };

  return (
    <PageShell
      title="ملفي الشخصي"
      subtitle={isComplete ? "بياناتك مكتملة" : `يتبقى ${missingCount} حقول إلزامية لإكمال الملف`}
      breadcrumbs={[{ label: "ملفي الشخصي" }]}
      actions={
        <Button onClick={handleSave} disabled={saveMut.isPending} rateLimitAware className="gap-2">
          <Save className="h-4 w-4" />
          حفظ
        </Button>
      }
    >
      {/* Status banner — green when complete, amber while pending. */}
      <Card
        className={
          isComplete
            ? "mb-4 border-status-success-surface bg-status-success-surface/30"
            : "mb-4 border-status-warning-surface bg-status-warning-surface/30"
        }
      >
        <CardContent className="p-4 flex items-start gap-3">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-status-success-foreground shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-status-warning-foreground shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            {isComplete ? (
              <>
                <p className="font-medium mb-1">ملفك مكتمل — يمكن لقسم الموارد البشرية معالجة راتبك دون عوائق.</p>
                <p className="text-muted-foreground">
                  يمكنك تحديث أي بيان أدناه في أي وقت — أي تغييرات على البيانات الإلزامية قد تتطلب تأكيد من HR.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">أكمل بياناتك الإلزامية لتفعيل ملفك بالكامل.</p>
                <p className="text-muted-foreground">
                  المطلوب: {(["nationalId", "phone", "dateOfBirth", "bankAccount"] as const)
                    .filter((k) => !form[k])
                    .map((k) => REQUIRED_LABELS[k])
                    .join("، ")}.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Identity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> الهوية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">
                رقم الهوية الوطنية / الإقامة *
                {!form.nationalId && <Badge variant="outline" className="text-[10px] mx-2">مطلوب</Badge>}
              </Label>
              <Input
                value={form.nationalId}
                onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
                placeholder="10 أرقام"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">
                تاريخ الميلاد *
                {!form.dateOfBirth && <Badge variant="outline" className="text-[10px] mx-2">مطلوب</Badge>}
              </Label>
              <DatePicker
                value={form.dateOfBirth}
                onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
              />
            </div>
            <div>
              <Label className="text-xs">الجنس</Label>
              <Select value={form.gender || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, gender: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  <SelectItem value="male">ذكر</SelectItem>
                  <SelectItem value="female">أنثى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الجنسية</Label>
              <Input
                value={form.nationality}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">رقم الإقامة (للوافدين)</Label>
              <Input
                value={form.iqamaNumber}
                onChange={(e) => setForm((f) => ({ ...f, iqamaNumber: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">انتهاء الإقامة</Label>
              <DatePicker
                value={form.iqamaExpiry}
                onChange={(v) => setForm((f) => ({ ...f, iqamaExpiry: v }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="h-4 w-4" /> التواصل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">
                رقم الهاتف *
                {!form.phone && <Badge variant="outline" className="text-[10px] mx-2">مطلوب</Badge>}
              </Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+9665…"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Mail className="h-3 w-3" />
                البريد الشخصي (للتواصل — ليس للدخول)
              </Label>
              <Input
                type="email"
                value={form.personalEmail}
                onChange={(e) => setForm((f) => ({ ...f, personalEmail: e.target.value }))}
                placeholder="me@gmail.com"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                العنوان
              </Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="الحي، المدينة"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> الحساب البنكي (للراتب)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">اسم البنك</Label>
              <Input
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                placeholder="البنك الأهلي"
              />
            </div>
            <div>
              <Label className="text-xs">
                رقم الحساب *
                {!form.bankAccount && <Badge variant="outline" className="text-[10px] mx-2">مطلوب</Badge>}
              </Label>
              <Input
                value={form.bankAccount}
                onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">IBAN (24 خانة)</Label>
              <Input
                value={form.iban}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value.toUpperCase() }))}
                placeholder="SA…"
                dir="ltr"
                maxLength={24}
              />
            </div>
          </CardContent>
        </Card>

        {/* Emergency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4" /> جهة الاتصال للطوارئ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">الاسم</Label>
              <Input
                value={form.emergencyContact}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContact: e.target.value }))}
                placeholder="مثلاً: الوالد - محمد"
              />
            </div>
            <div>
              <Label className="text-xs">رقم التواصل</Label>
              <Input
                value={form.emergencyPhone}
                onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))}
                placeholder="+9665…"
                dir="ltr"
              />
            </div>
            <p className="text-[10px] text-muted-foreground border-t pt-2">
              تُستخدم فقط في حالات الطوارئ. لن يُشارك رقمها مع أي طرف خارج إدارة الموارد البشرية.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={saveMut.isPending} rateLimitAware className="gap-2">
          <Save className="h-4 w-4" />
          حفظ التغييرات
        </Button>
      </div>
    </PageShell>
  );
}
