import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { actionLabelAr, scopeLabelAr } from "@/lib/permission-labels";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { UserPlus, Shield, HelpCircle, Plus, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════
// مركز المستخدمين والأدوار — واجهة #1413 §18 (Ghaith Operating Foundation)
//
// يربط بنقاط الـ backend المنفّذة في routes/admin.ts:
//   - POST /admin/onboard                          (RBAC-002 إنشاء سريع ذرّي)
//   - GET  /admin/users/:id/effective-permissions  (RBAC-004 الصلاحيات النهائية)
//   - POST /admin/permissions/explain              (RBAC-004 لماذا يستطيع/لا)
//
// لا يبني نظامًا جديدًا — يستهلك الموجود بمكوّنات الواجهة المشتركة.
// ════════════════════════════════════════════════════════════════════════════

interface RoleRow {
  id: number;
  roleKey: string;
  label?: string;
}
interface JobTitleRow {
  id: number;
  name: string;
  defaultRoleKey?: string | null;
  opensCustody?: boolean;
}
interface OnboardRole {
  roleKey: string;
  branchId?: string;
  departmentId?: string;
}

export default function UserOnboarding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── قائمة الأدوار المتاحة (لمنتقي الأدوار) ──
  const { data: rolesData } = useQuery<{ roles: RoleRow[] }>({
    queryKey: ["admin-roles"],
    queryFn: () => apiFetch("/admin/roles"),
  });
  const roles: RoleRow[] = Array.isArray(rolesData?.roles) ? rolesData!.roles : [];
  const roleLabel = (key: string) => roles.find((r) => r.roleKey === key)?.label || key;

  // ── المسميات الوظيفية (لتفعيل الدور الافتراضي تلقائيًا — migration 249) ──
  const { data: jobTitlesData } = useQuery<{ data: JobTitleRow[] }>({
    queryKey: ["admin-job-titles"],
    queryFn: () => apiFetch("/employees/job-titles"),
  });
  const jobTitles: JobTitleRow[] = Array.isArray(jobTitlesData?.data) ? jobTitlesData!.data : [];

  // ───────────────────────────────────────────────────────────────────────
  // 1) الإنشاء السريع: موظف + حساب + أدوار متعددة (RBAC-002)
  // ───────────────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: "",
    phone: "",
    nationalId: "",
    nationality: "سعودي",
    email: "",
    password: "",
    jobTitle: "",
    jobTitleId: "",
    branchId: "",
    departmentId: "",
  });
  const [onboardRoles, setOnboardRoles] = useState<OnboardRole[]>([{ roleKey: "" }]);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // الدور الافتراضي للمسمى المختار — يُفعَّل تلقائيًا عند الإنشاء دون اختيار يدوي.
  const selectedJobTitle = jobTitles.find((j) => String(j.id) === form.jobTitleId);
  const autoRoleKey = selectedJobTitle?.defaultRoleKey || "";
  const pickJobTitle = (id: string) => {
    const jt = jobTitles.find((j) => String(j.id) === id);
    setForm((f) => ({ ...f, jobTitleId: id, jobTitle: jt?.name || f.jobTitle }));
  };

  const addRole = () => setOnboardRoles((rs) => [...rs, { roleKey: "" }]);
  const removeRole = (i: number) => setOnboardRoles((rs) => rs.filter((_, idx) => idx !== i));
  const setRole = (i: number, patch: Partial<OnboardRole>) =>
    setOnboardRoles((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const onboardMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch("/admin/onboard", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم الإنشاء بنجاح", description: `الموظف #${res?.employeeId} والحساب #${res?.userId} والأدوار: ${(res?.roles || []).join("، ")}` });
      setForm({ name: "", phone: "", nationalId: "", nationality: "سعودي", email: "", password: "", jobTitle: "", jobTitleId: "", branchId: "", departmentId: "" });
      setOnboardRoles([{ roleKey: "" }]);
    },
    onError: (e: any) => toast({ title: "فشل الإنشاء", description: e?.message, variant: "destructive" }),
  });

  const submitOnboard = () => {
    const chosen = onboardRoles.filter((r) => r.roleKey);
    if (!form.name || !form.phone || !form.nationalId || !form.nationality || !form.email) {
      toast({ title: "بيانات ناقصة", description: "الاسم والجوال والهوية والجنسية والبريد مطلوبة", variant: "destructive" });
      return;
    }
    // دور يدوي واحد على الأقل، أو مسمى وظيفي له دور افتراضي يكفي.
    if (chosen.length === 0 && !autoRoleKey) {
      toast({ title: "اختر دورًا واحدًا على الأقل أو مسمى وظيفيًا له دور افتراضي", variant: "destructive" });
      return;
    }
    const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
    onboardMutation.mutate({
      name: form.name,
      phone: form.phone,
      nationalId: form.nationalId,
      nationality: form.nationality,
      email: form.email,
      password: form.password || undefined,
      jobTitle: form.jobTitle || undefined,
      jobTitleId: num(form.jobTitleId),
      branchId: num(form.branchId),
      departmentId: num(form.departmentId),
      roles: chosen.map((r) => ({
        roleKey: r.roleKey,
        branchId: num(r.branchId),
        departmentId: num(r.departmentId),
      })),
    });
  };

  // ── ملخص عربي مباشر لما سيستطيعه المستخدم (#1413 §6) ──
  const summary = [
    ...(autoRoleKey && !onboardRoles.some((r) => r.roleKey === autoRoleKey) ? [roleLabel(autoRoleKey)] : []),
    ...onboardRoles.filter((r) => r.roleKey).map((r) => `${roleLabel(r.roleKey)}${r.branchId ? ` (فرع ${r.branchId})` : ""}`),
  ];

  // ───────────────────────────────────────────────────────────────────────
  // 2) الصلاحيات النهائية + المصدر (RBAC-004)
  // ───────────────────────────────────────────────────────────────────────
  const [effUserId, setEffUserId] = useState("");
  const [effQueryId, setEffQueryId] = useState<number | null>(null);
  const { data: eff, isFetching: effLoading } = useQuery<any>({
    queryKey: ["effective-permissions", effQueryId],
    queryFn: () => apiFetch(`/admin/users/${effQueryId}/effective-permissions`),
    enabled: effQueryId != null,
  });

  // ───────────────────────────────────────────────────────────────────────
  // 3) مفسّر الصلاحية: لماذا يستطيع/لا يستطيع؟ (RBAC-004)
  // ───────────────────────────────────────────────────────────────────────
  const [explain, setExplain] = useState({ userId: "", feature: "", action: "view" });
  const [explainResult, setExplainResult] = useState<any>(null);
  const explainMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch("/admin/permissions/explain", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (res: any) => setExplainResult(res),
    onError: (e: any) => toast({ title: "تعذّر التفسير", description: e?.message, variant: "destructive" }),
  });

  return (
    <PageShell
      title="مركز المستخدمين والأدوار"
      subtitle="إنشاء سريع لموظف بحساب وأدوار متعددة، ومراجعة الصلاحيات النهائية، وتفسير القرار"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/admin", label: "الإدارة" }, { label: "مركز المستخدمين والأدوار" }]}
    >
      {/* ─── 1) الإنشاء السريع ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> إنشاء موظف + حساب + أدوار</CardTitle>
          <CardDescription>خطوة واحدة ذرّية: إمّا أن يُنشأ كل شيء أو لا شيء (موظف، حساب دخول، وأدوار متعددة بنطاق لكل دور)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>الاسم *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="الاسم الكامل" /></div>
            <div><Label>الجوال *</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="05xxxxxxxx" /></div>
            <div><Label>رقم الهوية *</Label><Input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} /></div>
            <div><Label>الجنسية *</Label><Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
            <div><Label>البريد الإلكتروني *</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="user@example.com" /></div>
            <div><Label>كلمة المرور (اختياري)</Label><Input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="تُولَّد تلقائيًا إن تُركت فارغة" /></div>
            <div>
              <Label>المسمى الوظيفي</Label>
              {jobTitles.length > 0 ? (
                <Select value={form.jobTitleId} onValueChange={pickJobTitle}>
                  <SelectTrigger><SelectValue placeholder="اختر المسمى الوظيفي" /></SelectTrigger>
                  <SelectContent>
                    {jobTitles.map((j) => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        {j.name}{j.defaultRoleKey ? ` — ${roleLabel(j.defaultRoleKey)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="موظف" />
              )}
            </div>
            <div><Label>الفرع (رقم، اختياري)</Label><Input value={form.branchId} onChange={(e) => set("branchId", e.target.value)} placeholder="فرع المنشئ افتراضيًا" /></div>
            <div><Label>الإدارة (رقم، اختياري)</Label><Input value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><Shield className="h-4 w-4" /> الأدوار (مستخدم واحد، أدوار متعددة)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRole}><Plus className="h-4 w-4 ml-1" /> أضف دورًا</Button>
            </div>
            {autoRoleKey && (
              <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  سيُفعَّل الدور تلقائيًا من المسمى الوظيفي: <Badge variant="secondary">{roleLabel(autoRoleKey)}</Badge>
                  {selectedJobTitle?.opensCustody ? <Badge variant="outline" className="mr-1">+ حساب عهدة</Badge> : null}
                  <span className="text-muted-foreground"> — يمكنك إضافة أدوار أخرى أدناه.</span>
                </span>
              </div>
            )}
            {onboardRoles.map((r, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end border rounded-md p-2">
                <div>
                  <Label className="text-xs">الدور</Label>
                  <Select value={r.roleKey} onValueChange={(v) => setRole(i, { roleKey: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر دورًا" /></SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.roleKey} value={role.roleKey}>{role.label || role.roleKey}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">الفرع (اختياري)</Label><Input value={r.branchId || ""} onChange={(e) => setRole(i, { branchId: e.target.value })} placeholder="رقم الفرع" /></div>
                <div><Label className="text-xs">الإدارة (اختياري)</Label><Input value={r.departmentId || ""} onChange={(e) => setRole(i, { departmentId: e.target.value })} placeholder="رقم الإدارة" /></div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRole(i)} disabled={onboardRoles.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>

          {summary.length > 0 && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <span className="font-semibold">{form.name || "المستخدم"} سيستطيع العمل بصفة: </span>
              {summary.map((s, i) => <Badge key={i} variant="secondary" className="ml-1">{s}</Badge>)}
            </div>
          )}

          <Button onClick={submitOnboard} disabled={onboardMutation.isPending}>
            {onboardMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <UserPlus className="h-4 w-4 ml-2" />}
            إنشاء
          </Button>
        </CardContent>
      </Card>

      {/* ─── 2) الصلاحيات النهائية ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> الصلاحيات النهائية</CardTitle>
          <CardDescription>ماذا يستطيع المستخدم؟ ومن أي دور جاءت كل صلاحية؟</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div><Label>رقم المستخدم</Label><Input value={effUserId} onChange={(e) => setEffUserId(e.target.value)} placeholder="userId" className="w-40" /></div>
            <Button variant="outline" onClick={() => /^\d+$/.test(effUserId) && setEffQueryId(Number(effUserId))} disabled={!/^\d+$/.test(effUserId)}>عرض</Button>
          </div>
          {effLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…</div>}
          {eff && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{eff.email}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الميزة</TableHead>
                    <TableHead>الإجراءات</TableHead>
                    <TableHead>النطاق</TableHead>
                    <TableHead>المصدر (الدور)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(eff.permissions || []).map((p: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{p.feature}</TableCell>
                      <TableCell>{(p.actions || []).map((a: string) => <Badge key={a} variant="outline" className="ml-1">{actionLabelAr(a)}</Badge>)}</TableCell>
                      <TableCell><Badge variant="secondary">{scopeLabelAr(p.scope)}</Badge></TableCell>
                      <TableCell>{p.source?.roleLabel || p.source?.roleKey}{p.source?.isPrimary ? " ★" : ""}</TableCell>
                    </TableRow>
                  ))}
                  {(eff.permissions || []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا توجد صلاحيات</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {(eff.overrides || []).length > 0 && (
                <div className="text-sm">
                  <span className="font-semibold">استثناءات على مستوى المستخدم: </span>
                  {eff.overrides.map((o: any, i: number) => (
                    <Badge key={i} variant={o.type === "revoke" ? "destructive" : "default"} className="ml-1">
                      {o.type === "revoke" ? "منع" : "منح"} {o.feature}{o.action ? ` — ${actionLabelAr(o.action)}` : ""}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 3) مفسّر الصلاحية ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5" /> لماذا يستطيع / لا يستطيع؟</CardTitle>
          <CardDescription>تفسير قرار الصلاحية لمستخدم على ميزة وإجراء محدّدين</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div><Label>رقم المستخدم</Label><Input value={explain.userId} onChange={(e) => setExplain((s) => ({ ...s, userId: e.target.value }))} placeholder="userId" /></div>
            <div><Label>الميزة</Label><Input value={explain.feature} onChange={(e) => setExplain((s) => ({ ...s, feature: e.target.value }))} placeholder="finance.invoices" /></div>
            <div>
              <Label>الإجراء</Label>
              <Select value={explain.action} onValueChange={(v) => setExplain((s) => ({ ...s, action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["view", "list", "create", "update", "delete", "approve", "reject", "export", "print"].map((a) => (
                    <SelectItem key={a} value={a}>{actionLabelAr(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (!/^\d+$/.test(explain.userId) || !explain.feature) {
                  toast({ title: "أدخل رقم المستخدم والميزة", variant: "destructive" });
                  return;
                }
                setExplainResult(null);
                explainMutation.mutate({ userId: Number(explain.userId), feature: explain.feature, action: explain.action });
              }}
              disabled={explainMutation.isPending}
            >
              {explainMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <HelpCircle className="h-4 w-4 ml-2" />}
              فسّر
            </Button>
          </div>
          {explainResult && (
            <div className={`rounded-md p-4 ${explainResult.allowed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center gap-2 font-semibold">
                {explainResult.allowed ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                {explainResult.allowed ? "مسموح" : "غير مسموح"}
              </div>
              <p className="text-sm mt-1">{explainResult.reason}</p>
              {explainResult.sourceRole && (
                <p className="text-xs text-muted-foreground mt-1">المصدر: {explainResult.sourceRole.roleLabel || explainResult.sourceRole.roleKey} · النطاق: {explainResult.scope}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
