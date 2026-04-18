import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X, CheckCircle, KeySquare, Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ROLE_OPTIONS } from "./shared";

export function UsersTab() {
  const { toast } = useToast();
  const { data, refetch, isLoading: isLoading1 } = useApiQuery<any>(["admin-users"], "/admin/users");
  const { data: employeesData, isLoading: isLoading2 } = useApiQuery<any>(["employees-list-admin"], "/employees?limit=200");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", role: "employee", password: "", employeeId: "" });
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const items = data?.data || [];
  const employees = employeesData?.data || [];

  const roleLabel = (r: string) => ROLE_OPTIONS.find(o => o.value === r)?.label || r;

  const createUser = async () => {
    if (!form.email) { toast({ variant: "destructive", title: "البريد الإلكتروني مطلوب" }); return; }
    setSubmitting(true);
    try {
      const result = await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: form.email,
          role: form.role,
          password: form.password || undefined,
          employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        }),
      });
      setCreatedUser(result);
      setForm({ email: "", role: "employee", password: "", employeeId: "" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في إنشاء المستخدم" });
    }
    setSubmitting(false);
  };

  const toggleActive = async (u: any) => {
    try {
      await apiFetch(`/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      toast({ title: u.isActive ? "تم تعليق الحساب" : "تم تفعيل الحساب" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل في تحديث الحساب" });
    }
  };

  const resetUserPassword = async () => {
    if (!resetPassword || resetPassword.length < 6) {
      toast({ variant: "destructive", title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return;
    }
    try {
      await apiFetch(`/admin/users/${resetUserId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      toast({ title: "تم إعادة تعيين كلمة المرور بنجاح" });
      setResetUserId(null);
      setResetPassword("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل في إعادة تعيين كلمة المرور" });
    }
  };

  if (isLoading1 || isLoading2) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">المستخدمين</h1>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setCreatedUser(null); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مستخدم</>}
        </Button>
      </div>

      {showForm && !createdUser && (
        <Card><CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>البريد الإلكتروني <span className="text-red-500">*</span></Label>
              <Input className="mt-1" type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@company.com" />
            </div>
            <div>
              <Label>الدور الوظيفي</Label>
              <select className="w-full border rounded-md p-2 mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <Label>ربط بموظف (اختياري)</Label>
              <select className="w-full border rounded-md p-2 mt-1" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">— بدون ربط —</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.empNumber})</option>)}
              </select>
            </div>
            <div>
              <Label>كلمة المرور (اختياري - ستُنشأ تلقائياً)</Label>
              <Input className="mt-1" type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="اتركها فارغة للإنشاء التلقائي" />
            </div>
          </div>
          <Button onClick={createUser} disabled={!form.email || submitting}>
            {submitting ? "جاري الإنشاء..." : "إنشاء حساب"}
          </Button>
        </CardContent></Card>
      )}

      {createdUser && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              تم إنشاء الحساب بنجاح — بيانات الدخول
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-gray-500 mb-1">البريد الإلكتروني</p>
                <p className="font-mono text-sm font-medium">{createdUser.email}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-gray-500 mb-1">كلمة المرور المؤقتة</p>
                <p className="font-mono text-sm font-bold text-blue-700">{createdUser.tempPassword}</p>
              </div>
            </div>
            <p className="text-xs text-green-700">احفظ هذه البيانات وأرسلها للمستخدم. يُنصح بتغيير كلمة المرور بعد أول تسجيل دخول.</p>
            <Button size="sm" variant="outline" onClick={() => { setCreatedUser(null); setShowForm(false); }}>إغلاق</Button>
          </CardContent>
        </Card>
      )}

      {resetUserId && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-orange-800 flex items-center gap-2">
              <KeySquare className="h-5 w-5" />
              إعادة تعيين كلمة المرور
            </h4>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showResetPw ? "text" : "password"}
                  dir="ltr"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                />
                <button className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => setShowResetPw(!showResetPw)}>
                  {showResetPw ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                </button>
              </div>
              <Button onClick={resetUserPassword} disabled={resetPassword.length < 6}>تأكيد</Button>
              <Button variant="outline" onClick={() => { setResetUserId(null); setResetPassword(""); }}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 text-start">البريد الإلكتروني</th>
                <th className="p-3 text-start">الموظف المرتبط</th>
                <th className="p-3 text-start">الدور</th>
                <th className="p-3 text-start">الحالة</th>
                <th className="p-3 text-start">آخر دخول</th>
                <th className="p-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u: any) => {
                return (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{u.email}</td>
                    <td className="p-3">
                      {u.employeeName ? (
                        <div>
                          <p className="text-sm font-medium">{u.employeeName}</p>
                          <p className="text-xs text-gray-400">{u.empNumber}</p>
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{roleLabel(u.role)}</Badge></td>
                    <td className="p-3"><PageStatusBadge status={u.status || (u.isActive ? "active" : "inactive")} /></td>
                    <td className="p-3 text-xs text-gray-400">{u.lastLoginAt ? formatDateAr(u.lastLoginAt) : "لم يسجل بعد"}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1"
                          title={u.isActive ? "تعليق الحساب" : "تفعيل الحساب"}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive
                            ? <ToggleRight className="h-4 w-4 text-green-500" />
                            : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1 text-orange-600"
                          onClick={() => { setResetUserId(u.id); setResetPassword(""); setCreatedUser(null); setShowForm(false); }}
                        >
                          <KeySquare className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا يوجد مستخدمين</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
