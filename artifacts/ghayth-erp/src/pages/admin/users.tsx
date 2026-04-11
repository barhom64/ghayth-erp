import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Plus, X, CheckCircle, KeySquare, Eye, EyeOff, ToggleLeft, ToggleRight,
  Search, Users, Trash2, Edit2, ShieldAlert, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { roleKeyColors } from "@/contexts/app-context";

const ROLE_OPTIONS = [
  { value: "owner", label: "مالك النظام" },
  { value: "general_manager", label: "مدير عام" },
  { value: "hr_manager", label: "مدير الموارد البشرية" },
  { value: "finance_manager", label: "مدير المالية" },
  { value: "fleet_manager", label: "مدير الأسطول" },
  { value: "property_manager", label: "مدير الأملاك" },
  { value: "projects_manager", label: "مدير المشاريع" },
  { value: "warehouse_manager", label: "مدير المستودعات" },
  { value: "legal_manager", label: "مدير الشؤون القانونية" },
  { value: "support_manager", label: "مدير الدعم الفني" },
  { value: "crm_manager", label: "مدير المبيعات" },
  { value: "bi_manager", label: "مدير ذكاء الأعمال" },
  { value: "branch_manager", label: "مدير فرع" },
  { value: "employee", label: "موظف" },
];

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { data, refetch } = useApiQuery<any>(["admin-users"], "/admin/users");
  const { data: employeesData } = useApiQuery<any>(["employees-list-admin"], "/employees?limit=200");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", role: "employee", password: "", employeeId: "" });
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ email: "", role: "", employeeId: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const items: any[] = data?.data || [];
  const employees: any[] = employeesData?.data || [];

  const roleLabel = (r: string) => ROLE_OPTIONS.find(o => o.value === r)?.label || r;

  const filtered = items.filter(u => {
    if (search && !u.email?.includes(search) && !u.employeeName?.includes(search)) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (filterStatus === "active" && !u.isActive) return false;
    if (filterStatus === "inactive" && u.isActive) return false;
    return true;
  });

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
    } catch {
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
      setResetUserId(null); setResetPassword("");
    } catch {
      toast({ variant: "destructive", title: "فشل في إعادة تعيين كلمة المرور" });
    }
  };

  const startEditUser = (u: any) => {
    setEditUser(u);
    setEditForm({ email: u.email, role: u.role, employeeId: u.employeeId ? String(u.employeeId) : "" });
    setResetUserId(null); setShowForm(false); setDeleteConfirmId(null);
  };

  const saveEdit = async () => {
    if (!editUser) return;
    try {
      await apiFetch(`/admin/users/${editUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: editForm.role !== editUser.role ? editForm.role : undefined,
          employeeId: editForm.employeeId ? Number(editForm.employeeId) : undefined,
        }),
      });
      toast({ title: "تم تحديث بيانات المستخدم" });
      setEditUser(null);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في التحديث" });
    }
  };

  const deleteUser = async (id: number) => {
    try {
      await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
      toast({ title: "تم تعطيل المستخدم وإلغاء صلاحياته" });
      setDeleteConfirmId(null);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في التعطيل" });
    }
  };

  const activeCount = items.filter(u => u.isActive).length;
  const inactiveCount = items.filter(u => !u.isActive).length;
  const suspiciousCount = items.filter(u => Number(u.failedAttempts7d) > 3).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-8 h-8 text-blue-600" />
            إدارة المستخدمين
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">إنشاء وإدارة وحذف حسابات المستخدمين في النظام</p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setCreatedUser(null); setEditUser(null); setDeleteConfirmId(null); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مستخدم</>}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المستخدمين", value: items.length, color: "bg-blue-50 text-blue-700" },
          { label: "نشط", value: activeCount, color: "bg-green-50 text-green-700" },
          { label: "معلق", value: inactiveCount, color: "bg-red-50 text-red-700" },
          { label: "محاولات مشبوهة (7 أيام)", value: suspiciousCount, color: suspiciousCount > 0 ? "bg-orange-50 text-orange-700" : "bg-gray-50 text-gray-500" },
        ].map(c => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className={cn("p-4 rounded-lg", c.color)}>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && !createdUser && (
        <Card><CardContent className="p-4 space-y-4">
          <h3 className="font-semibold text-base">إنشاء حساب مستخدم جديد</h3>
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
              <CheckCircle className="h-5 w-5" />تم إنشاء الحساب بنجاح — بيانات الدخول
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-gray-500 mb-1">البريد الإلكتروني</p>
                <p className="font-mono text-sm font-medium">{createdUser.email}</p>
              </div>
              {createdUser.tempPassword && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-gray-500 mb-1">كلمة المرور المؤقتة</p>
                  <p className="font-mono text-sm font-bold text-blue-700">{createdUser.tempPassword}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-green-700">احفظ هذه البيانات وأرسلها للمستخدم. يُنصح بتغيير كلمة المرور بعد أول تسجيل دخول.</p>
            <Button size="sm" variant="outline" onClick={() => { setCreatedUser(null); setShowForm(false); }}>إغلاق</Button>
          </CardContent>
        </Card>
      )}

      {editUser && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 space-y-4">
            <h4 className="font-semibold text-blue-800 flex items-center gap-2">
              <Edit2 className="h-5 w-5" />تعديل بيانات المستخدم — {editUser.email}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">الدور الوظيفي</Label>
                <select className="w-full border rounded-md p-2 mt-1 text-sm bg-white" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">ربط بموظف</Label>
                <select className="w-full border rounded-md p-2 mt-1 text-sm bg-white" value={editForm.employeeId} onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}>
                  <option value="">— بدون ربط —</option>
                  {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.empNumber})</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>حفظ التعديلات</Button>
              <Button size="sm" variant="outline" onClick={() => setEditUser(null)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {deleteConfirmId && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />تأكيد تعطيل المستخدم
            </h4>
            <p className="text-sm text-red-700">سيتم تعطيل هذا المستخدم وإلغاء صلاحياته في شركتك. يمكن إعادة تفعيله لاحقاً.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => deleteUser(deleteConfirmId)}>تعطيل</Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {resetUserId && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-orange-800 flex items-center gap-2">
              <KeySquare className="h-5 w-5" />إعادة تعيين كلمة المرور
            </h4>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showResetPw ? "text" : "password"} dir="ltr" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" />
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

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="بحث بالبريد أو الاسم..." className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="">كل الأدوار</option>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select className="border rounded-md px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">معلق</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 text-start">المستخدم</th>
                <th className="p-3 text-start">الموظف المرتبط</th>
                <th className="p-3 text-start">الدور</th>
                <th className="p-3 text-start">الحالة</th>
                <th className="p-3 text-start">آخر دخول</th>
                <th className="p-3 text-start">محاولات فاشلة (7 أيام)</th>
                <th className="p-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: any) => {
                const failedCount = Number(u.failedAttempts7d) || 0;
                return (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: roleKeyColors[u.role] || "#95A5A6" }}>
                          {u.email?.charAt(0)?.toUpperCase()}
                        </div>
                        <span className="font-mono text-xs">{u.email}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {u.employeeName ? (
                        <div>
                          <p className="text-sm font-medium">{u.employeeName}</p>
                          <p className="text-xs text-gray-400">{u.empNumber}</p>
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: roleKeyColors[u.role] + "60", color: roleKeyColors[u.role] }}>
                        {roleLabel(u.role)}
                      </Badge>
                    </td>
                    <td className="p-3"><StatusBadge status={u.status || (u.isActive ? "active" : "inactive")} /></td>
                    <td className="p-3 text-xs text-gray-400">{u.lastLoginAt ? formatDateAr(u.lastLoginAt) : "لم يسجل بعد"}</td>
                    <td className="p-3">
                      {failedCount > 0 ? (
                        <div className="flex items-center gap-1">
                          <ShieldAlert className={cn("h-4 w-4", failedCount > 3 ? "text-red-500" : "text-amber-500")} />
                          <span className={cn("text-xs font-medium", failedCount > 3 ? "text-red-600" : "text-amber-600")}>{failedCount}</span>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" title={u.isActive ? "تعليق الحساب" : "تفعيل الحساب"} onClick={() => toggleActive(u)}>
                          {u.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600" title="تعديل" onClick={() => startEditUser(u)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-orange-600" title="إعادة تعيين كلمة المرور" onClick={() => { setResetUserId(u.id); setResetPassword(""); setCreatedUser(null); setShowForm(false); setEditUser(null); setDeleteConfirmId(null); }}>
                          <KeySquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-red-600" title="حذف المستخدم" onClick={() => { setDeleteConfirmId(u.id); setEditUser(null); setResetUserId(null); setShowForm(false); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا يوجد مستخدمين</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent></Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Shield className="h-4 w-4 text-blue-500" />تعيين الأدوار للمستخدمين</h3>
          <RoleAssignmentSection users={filtered} />
        </CardContent>
      </Card>
    </div>
  );
}

function RoleAssignmentSection({ users }: { users: any[] }) {
  const { toast } = useToast();
  const { data: predefinedData } = useApiQuery<any>(["predefined-roles"], "/admin/predefined-roles");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const predefinedRoles: any[] = predefinedData?.data || [];

  const loadUserRoles = async (userId: number) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/user-roles/${userId}`);
      setUserRoles(data.data || []);
    } catch { setUserRoles([]); }
    setLoading(false);
  };

  const assignRole = async (roleKey: string) => {
    if (!selectedUserId) return;
    try {
      await apiFetch("/admin/user-roles", { method: "POST", body: JSON.stringify({ userId: selectedUserId, roleKey }) });
      loadUserRoles(selectedUserId);
      toast({ title: "تم إسناد الدور" });
    } catch (e: any) { toast({ variant: "destructive", title: e.message || "فشل في إسناد الدور" }); }
  };

  const removeRole = async (id: number) => {
    try {
      await apiFetch(`/admin/user-roles/${id}`, { method: "DELETE" });
      if (selectedUserId) loadUserRoles(selectedUserId);
      toast({ title: "تم إزالة الدور" });
    } catch { toast({ variant: "destructive", title: "فشل في إزالة الدور" }); }
  };

  const assignedKeys = userRoles.map(r => r.roleKey);

  return (
    <div className="space-y-3">
      <select className="w-full border rounded-lg p-2.5 bg-white text-sm" value={selectedUserId ?? ""} onChange={(e) => { const id = Number(e.target.value) || null; setSelectedUserId(id); if (id) loadUserRoles(id); }}>
        <option value="">— اختر مستخدم لإدارة أدواره —</option>
        {users.map((u: any) => <option key={u.id} value={u.id}>{u.employeeName || u.email}</option>)}
      </select>
      {selectedUserId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">الأدوار المسندة</p>
            {loading ? <p className="text-xs text-gray-400">جاري التحميل...</p> :
              userRoles.length === 0 ? <p className="text-xs text-gray-400">لا توجد أدوار</p> :
              <div className="space-y-1">
                {userRoles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-xs">
                    <span className="font-medium">{role.label}</span>
                    <button onClick={() => removeRole(role.id)} className="text-red-500 hover:text-red-700 text-xs">حذف</button>
                  </div>
                ))}
              </div>
            }
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">إضافة دور</p>
            <div className="space-y-1">
              {predefinedRoles.filter(r => !assignedKeys.includes(r.roleKey)).slice(0, 8).map((role) => (
                <button key={role.roleKey} onClick={() => assignRole(role.roleKey)}
                  className="w-full text-start flex items-center gap-2 p-2 rounded-lg border border-dashed hover:border-blue-400 hover:bg-blue-50 text-xs transition-all">
                  <span className="font-medium">{role.label}</span>
                  <span className="text-gray-400">مستوى {role.level}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
