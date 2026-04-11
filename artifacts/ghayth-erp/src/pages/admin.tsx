import { useState, useEffect, Fragment } from "react";
import { useApiQuery, useApiMutation, apiFetch, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, KeyRound, ScrollText, Plus, X, Trash2, CheckCircle, UserCog, Lock, Search, ChevronDown, ChevronUp, FileSearch, KeySquare, Eye, EyeOff, ToggleLeft, ToggleRight, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { roleKeyColors } from "@/contexts/app-context";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";

interface PredefinedRole {
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
}

interface UserRoleRow {
  id: number;
  userId: number;
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
}

const MODULE_LABELS: Record<string, string> = {
  home: "الرئيسية", hr: "الموارد البشرية", finance: "المالية", fleet: "الأسطول",
  property: "الأملاك", operations: "العمليات", warehouse: "المستودعات", governance: "الحوكمة",
  bi: "ذكاء الأعمال", requests: "الطلبات", documents: "المستندات", reports: "التقارير",
  admin: "مدير النظام", comms: "التواصل", legal: "القانونية", crm: "المبيعات",
  marketing: "التسويق", store: "المتجر", support: "الدعم", settings: "الإعدادات",
};


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

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  "status.change": "تغيير حالة",
  approve: "موافقة",
  reject: "رفض",
};

function UsersTab() {
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
                    <td className="p-3"><StatusBadge status={u.status || (u.isActive ? "active" : "inactive")} /></td>
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

function RoleAssignmentTab() {
  const { data: usersData } = useApiQuery<any>(["admin-users"], "/admin/users");
  const { data: predefinedData } = useApiQuery<any>(["predefined-roles"], "/admin/predefined-roles");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const users = usersData?.data || [];
  const predefinedRoles: PredefinedRole[] = predefinedData?.data || [];

  const loadUserRoles = async (userId: number) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/user-roles/${userId}`);
      setUserRoles(data.data || []);
    } catch { setUserRoles([]); }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedUserId) loadUserRoles(selectedUserId);
  }, [selectedUserId]);

  const assignRole = async (roleKey: string) => {
    if (!selectedUserId) return;
    try {
      await apiFetch("/admin/user-roles", {
        method: "POST",
        body: JSON.stringify({ userId: selectedUserId, roleKey }),
      });
      loadUserRoles(selectedUserId);
    } catch (e: any) { console.error(e); }
  };

  const removeRole = async (id: number) => {
    try {
      await apiFetch(`/admin/user-roles/${id}`, { method: "DELETE" });
      if (selectedUserId) loadUserRoles(selectedUserId);
    } catch (e: any) { console.error(e); }
  };

  const assignedKeys = (userRoles || []).map(r => r.roleKey);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">إسناد الأدوار الوظيفية</h3>

      <Card>
        <CardContent className="p-4">
          <Label className="text-sm font-medium mb-2 block">اختر المستخدم</Label>
          <select
            className="w-full border rounded-lg p-2.5 bg-white"
            value={selectedUserId ?? ""}
            onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
          >
            <option value="">— اختر مستخدم —</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedUserId && (
        <>
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                الأدوار المسندة حالياً
              </h4>
              {loading ? (
                <p className="text-gray-400 text-sm">جاري التحميل...</p>
              ) : userRoles.length === 0 ? (
                <p className="text-gray-400 text-sm">لا توجد أدوار مسندة لهذا المستخدم</p>
              ) : (
                <div className="space-y-2">
                  {userRoles.map((role) => (
                    <div key={role.id} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: (roleKeyColors[role.roleKey] || "#95A5A6") + "15" }}
                        >
                          <Shield className="w-4 h-4" style={{ color: roleKeyColors[role.roleKey] || "#95A5A6" }} />
                        </div>
                        <div>
                          <span className="font-medium text-sm">{role.label}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(role.modules || []).slice(0, 6).map((m: string) => (
                              <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">
                                {MODULE_LABELS[m] || m}
                              </Badge>
                            ))}
                            {(role.modules || []).length > 6 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{(role.modules || []).length - 6}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeRole(role.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-500" />
                إضافة دور جديد
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {predefinedRoles.filter(r => !assignedKeys.includes(r.roleKey)).map((role) => (
                  <button
                    key={role.roleKey}
                    onClick={() => assignRole(role.roleKey)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed hover:border-solid hover:bg-gray-50 transition-all text-start"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: (roleKeyColors[role.roleKey] || "#95A5A6") + "15" }}
                    >
                      <Shield className="w-4 h-4" style={{ color: roleKeyColors[role.roleKey] || "#95A5A6" }} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium block">{role.label}</span>
                      <span className="text-[10px] text-gray-400">
                        {role.modules.slice(0, 4).map(m => MODULE_LABELS[m] || m).join("، ")}
                        {role.modules.length > 4 && ` +${role.modules.length - 4}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {predefinedRoles.filter(r => !assignedKeys.includes(r.roleKey)).length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">تم إسناد جميع الأدوار المتاحة</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const ALL_MODULES = Object.keys(MODULE_LABELS);

function RolesTab() {
  const { toast } = useToast();
  const { data: predefinedData } = useApiQuery<any>(["predefined-roles"], "/admin/predefined-roles");
  const { data: roleModulesData, refetch } = useApiQuery<any>(["role-modules"], "/settings/role-modules");
  const predefinedRoles: PredefinedRole[] = predefinedData?.data || [];
  const roleModulesMap = new Map<string, string[]>(
    (roleModulesData?.data || []).map((r: any) => [r.roleKey, Array.isArray(r.modules) ? r.modules : []])
  );
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const startEdit = (r: PredefinedRole) => {
    setEditingRole(r.roleKey);
    const currentModules = roleModulesMap.get(r.roleKey) ?? r.modules;
    setEditModules([...currentModules]);
  };

  const toggleModule = (mod: string) => {
    setEditModules(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  };

  const saveModules = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      await apiFetch(`/settings/role-modules/${editingRole}`, {
        method: "PUT",
        body: JSON.stringify({ modules: editModules }),
      });
      toast({ title: "تم حفظ الوحدات بنجاح" });
      setEditingRole(null);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في حفظ الوحدات" });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">الأدوار المتاحة في النظام</h3>
      <p className="text-sm text-gray-500">يمكنك تعديل الوحدات المتاحة لكل دور بالنقر على "تعديل الوحدات".</p>
      <div className="grid grid-cols-1 gap-4">
        {predefinedRoles.map((r) => (
          <Card key={r.roleKey} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: (roleKeyColors[r.roleKey] || "#95A5A6") + "15" }}
                  >
                    <KeyRound className="w-4 h-4" style={{ color: roleKeyColors[r.roleKey] || "#95A5A6" }} />
                  </div>
                  <div>
                    <span className="font-semibold text-sm">{r.label}</span>
                    <Badge variant="outline" className="ms-2 text-[10px]">مستوى {r.level}</Badge>
                    <Badge className="ms-1 text-[10px]" style={{ backgroundColor: (roleKeyColors[r.roleKey] || "#95A5A6") + "20", color: roleKeyColors[r.roleKey] || "#95A5A6", border: "none" }}>
                      {r.roleKey}
                    </Badge>
                  </div>
                </div>
                {r.roleKey !== "owner" && (
                  editingRole === r.roleKey ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveModules} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingRole(null)}>إلغاء</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                      تعديل الوحدات
                    </Button>
                  )
                )}
              </div>

              {editingRole === r.roleKey ? (
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-2">
                  {ALL_MODULES.map(mod => (
                    <button
                      key={mod}
                      onClick={() => toggleModule(mod)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition-all text-start",
                        editModules.includes(mod)
                          ? "bg-blue-50 border-blue-400 text-blue-700 font-medium"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                      )}
                    >
                      {editModules.includes(mod) && <CheckCircle className="h-3 w-3 flex-shrink-0" />}
                      {MODULE_LABELS[mod] || mod}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(roleModulesMap.get(r.roleKey) ?? r.modules).map((m: string) => (
                    <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">
                      {MODULE_LABELS[m] || m}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LogsTab() {
  const { data } = useApiQuery<any>(["admin-logs"], "/settings/audit-log");
  const items = data?.data || [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجلات النظام</h3>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 text-start">المستخدم</th><th className="p-3 text-start">الإجراء</th><th className="p-3 text-start">الوحدة</th><th className="p-3 text-start">التاريخ</th></tr></thead>
          <tbody>
            {items.map((l: any) => (
              <tr key={l.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{l.userName || "-"}</td>
                <td className="p-3">{l.action || "-"}</td>
                <td className="p-3 text-gray-500">{l.module || "-"}</td>
                <td className="p-3 text-xs text-gray-400">{l.createdAt ? formatDateAr(l.createdAt) : "-"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد سجلات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

const PERM_MODULES = [
  { key: "hr", label: "الموارد البشرية" },
  { key: "finance", label: "المالية" },
  { key: "fleet", label: "الأسطول" },
  { key: "property", label: "الأملاك" },
  { key: "warehouse", label: "المستودعات" },
  { key: "legal", label: "القانونية" },
  { key: "crm", label: "المبيعات" },
  { key: "support", label: "الدعم الفني" },
  { key: "operations", label: "العمليات" },
  { key: "governance", label: "الحوكمة" },
  { key: "reports", label: "التقارير" },
  { key: "documents", label: "المستندات" },
  { key: "settings", label: "الإعدادات" },
  { key: "admin", label: "مدير النظام" },
];

const PERM_ACTIONS = [
  { key: "read", label: "عرض" },
  { key: "write", label: "تعديل" },
  { key: "create", label: "إنشاء" },
  { key: "delete", label: "حذف" },
  { key: "approve", label: "موافقة" },
];

function PermissionsTab() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState("employee");
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const { data: usersData } = useApiQuery<any>(["admin-users"], "/admin/users");
  const users = usersData?.data || [];
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userPerms, setUserPerms] = useState<any[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const loadRolePerms = async (role: string) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/role-permissions?role=${encodeURIComponent(role)}`);
      const perms = (data.data || []).map((p: any) => p.permission);
      setRolePerms(new Set(perms));
    } catch {
      try {
        const data2 = await apiFetch(`/permissions/role-permissions`);
        const perms2 = (data2.data || []).filter((p: any) => p.role === role).map((p: any) => p.permission);
        setRolePerms(new Set(perms2));
      } catch { setRolePerms(new Set()); }
    }
    setLoading(false);
  };

  const loadUserPerms = async (userId: number) => {
    setUserLoading(true);
    try {
      const data = await apiFetch(`/permissions/user-permissions?userId=${userId}`);
      setUserPerms(data.data || []);
    } catch { setUserPerms([]); }
    setUserLoading(false);
  };

  useEffect(() => { loadRolePerms(selectedRole); }, [selectedRole]);
  useEffect(() => { if (selectedUserId) loadUserPerms(selectedUserId); }, [selectedUserId]);

  const toggleRolePerm = async (module: string, action: string) => {
    const perm = `${module}:${action}`;
    const hasPerm = rolePerms.has(perm) || rolePerms.has(`${module}:*`) || rolePerms.has("*");
    const key = `${module}:${action}`;
    setSaving(key);
    try {
      if (hasPerm && rolePerms.has(perm)) {
        const rows = await apiFetch(`/admin/role-permissions?role=${encodeURIComponent(selectedRole)}`);
        const match = (rows.data || []).find((r: any) => r.permission === perm);
        if (match) {
          await apiFetch(`/admin/role-permissions/${match.id}`, { method: "DELETE" });
          setRolePerms(prev => { const s = new Set(prev); s.delete(perm); return s; });
        }
      } else if (!hasPerm) {
        await apiFetch("/admin/role-permissions", {
          method: "POST",
          body: JSON.stringify({ role: selectedRole, permission: perm }),
        });
        setRolePerms(prev => new Set([...prev, perm]));
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل في تحديث الصلاحية" });
    }
    setSaving(null);
  };

  const toggleUserPerm = async (permission: string, currentType: string | null) => {
    if (!selectedUserId) return;
    try {
      if (currentType) {
        await apiFetch("/permissions/user-permissions", {
          method: "DELETE",
          body: JSON.stringify({ userId: selectedUserId, permission }),
        });
        toast({ title: "تم إزالة الصلاحية" });
      } else {
        await apiFetch("/permissions/user-permissions", {
          method: "POST",
          body: JSON.stringify({ userId: selectedUserId, permission, type: "grant" }),
        });
        toast({ title: "تمت إضافة الصلاحية" });
      }
      loadUserPerms(selectedUserId);
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل في تحديث الصلاحية" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          مصفوفة صلاحيات الأدوار
        </h3>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">اختر الدور</Label>
              <select
                className="w-full border rounded-lg p-2.5 bg-white"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">جاري التحميل...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-start font-medium text-gray-600 w-32">الوحدة</th>
                      {PERM_ACTIONS.map(a => (
                        <th key={a.key} className="p-2 text-center font-medium text-gray-600 min-w-[70px]">{a.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERM_MODULES.map((mod) => (
                      <tr key={mod.key} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium text-sm text-gray-700">{mod.label}</td>
                        {PERM_ACTIONS.map(action => {
                          const perm = `${mod.key}:${action.key}`;
                          const hasWildcard = rolePerms.has("*") || rolePerms.has(`${mod.key}:*`);
                          const hasPerm = hasWildcard || rolePerms.has(perm);
                          const isSaving = saving === perm;
                          return (
                            <td key={action.key} className="p-2 text-center">
                              <button
                                onClick={() => !hasWildcard && toggleRolePerm(mod.key, action.key)}
                                disabled={hasWildcard || isSaving}
                                className={cn(
                                  "w-7 h-7 rounded-md transition-all mx-auto flex items-center justify-center border-2",
                                  hasPerm
                                    ? hasWildcard
                                      ? "bg-blue-100 border-blue-200 cursor-not-allowed"
                                      : "bg-green-100 border-green-500 hover:bg-green-200"
                                    : "bg-white border-gray-200 hover:border-gray-400",
                                  isSaving && "opacity-50"
                                )}
                                title={hasWildcard ? "صلاحية كاملة من الدور" : hasPerm ? "انقر لإزالة" : "انقر لإضافة"}
                              >
                                {hasPerm && <CheckCircle className={cn("h-4 w-4", hasWildcard ? "text-blue-500" : "text-green-600")} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(rolePerms.has("*")) && (
                  <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    هذا الدور يمتلك صلاحيات كاملة (*)
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <UserCog className="h-5 w-5 text-purple-600" />
          صلاحيات مخصصة للمستخدمين
        </h3>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">اختر المستخدم</Label>
              <select
                className="w-full border rounded-lg p-2.5 bg-white"
                value={selectedUserId ?? ""}
                onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
              >
                <option value="">— اختر مستخدم —</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.employeeName || u.email} ({ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role})</option>
                ))}
              </select>
            </div>
            {selectedUserId && (
              <>
                {userLoading ? (
                  <p className="text-sm text-gray-400">جاري التحميل...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="p-2 text-start font-medium text-gray-600 w-32">الوحدة</th>
                          {PERM_ACTIONS.map(a => (
                            <th key={a.key} className="p-2 text-center font-medium text-gray-600 min-w-[70px]">{a.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERM_MODULES.map((mod) => (
                          <tr key={mod.key} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium text-sm text-gray-700">{mod.label}</td>
                            {PERM_ACTIONS.map(action => {
                              const perm = `${mod.key}:${action.key}`;
                              const existing = userPerms.find((p: any) => p.permission === perm);
                              const isGranted = existing?.type === "grant";
                              const isRevoked = existing?.type === "revoke";
                              return (
                                <td key={action.key} className="p-2 text-center">
                                  <button
                                    onClick={() => toggleUserPerm(perm, existing?.type || null)}
                                    className={cn(
                                      "w-7 h-7 rounded-md transition-all mx-auto flex items-center justify-center border-2",
                                      isGranted ? "bg-green-100 border-green-500 hover:bg-green-200" :
                                      isRevoked ? "bg-red-100 border-red-500 hover:bg-red-200" :
                                      "bg-white border-gray-200 hover:border-gray-400"
                                    )}
                                    title={isGranted ? "مُمنوح — انقر لإزالة" : isRevoked ? "مسحوب — انقر لإزالة" : "انقر لمنح"}
                                  >
                                    {isGranted && <CheckCircle className="h-4 w-4 text-green-600" />}
                                    {isRevoked && <X className="h-4 w-4 text-red-600" />}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-2">الصلاحيات الخضراء مُضافة للمستخدم، الحمراء مسحوبة منه. الخلايا الفارغة تعتمد على صلاحيات الدور.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const REASON_LABELS: Record<string, string> = {
  permission_denied: "صلاحية مرفوضة",
  module_access_denied: "وحدة غير مسموحة",
  module_access_denied_no_modules: "لا توجد وحدات",
  insufficient_level: "مستوى غير كافٍ",
  role_required: "دور غير مصرح",
};

function SecurityLogTab() {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (reason) params.set("reason", reason);
  if (from) params.set("from", from);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["security-log", reason, from, String(page)],
    `/admin/security-log?${params.toString()}`
  );
  const rows = data?.data || [];
  const total = data?.total || 0;
  const summary = data?.summary || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          سجل محاولات الوصول المرفوضة
        </h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
      </div>

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center text-red-700">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">حدث خطأ في تحميل سجل الأمان. يرجى المحاولة مجدداً.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المحاولات", value: summary.total, color: "text-gray-700 bg-gray-50" },
          { label: "آخر 24 ساعة", value: summary.last24h, color: "text-amber-700 bg-amber-50" },
          { label: "صلاحية مرفوضة", value: summary.permissionDenied, color: "text-red-700 bg-red-50" },
          { label: "وحدة غير مسموحة", value: summary.moduleDenied, color: "text-orange-700 bg-orange-50" },
        ].map(c => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className={cn("p-3 rounded-lg", c.color.split(" ")[1])}>
              <p className="text-2xl font-bold">{c.value ?? 0}</p>
              <p className={cn("text-xs mt-0.5", c.color.split(" ")[0])}>{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs mb-1 block">نوع السبب</Label>
              <select className="w-full border rounded p-2 text-sm" value={reason} onChange={e => { setReason(e.target.value); setPage(1); }}>
                <option value="">— الكل —</option>
                {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs mb-1 block">من تاريخ</Label>
              <Input type="date" className="text-sm" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-6">جاري التحميل...</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد محاولات وصول مرفوضة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="p-2 text-start font-medium">المستخدم</th>
                    <th className="p-2 text-start font-medium">الدور</th>
                    <th className="p-2 text-start font-medium">المسار</th>
                    <th className="p-2 text-start font-medium">الصلاحيات المطلوبة</th>
                    <th className="p-2 text-start font-medium">السبب</th>
                    <th className="p-2 text-start font-medium">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-medium text-xs">{row.userName || row.userEmail || `#${row.userId}`}</div>
                        {row.userEmail && row.userName && <div className="text-gray-400 text-xs">{row.userEmail}</div>}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">{row.role}</Badge>
                      </td>
                      <td className="p-2">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{row.method} {row.path}</code>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(row.requiredPerms) ? row.requiredPerms : []).map((p: string) => (
                            <Badge key={p} className="text-xs bg-red-50 text-red-700 border-red-200">{p}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge className={cn("text-xs", row.reason === "permission_denied" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                          {REASON_LABELS[row.reason] || row.reason}
                        </Badge>
                      </td>
                      <td className="p-2 text-gray-500 text-xs whitespace-nowrap">{formatDateAr(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditExplorerTab() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: entitiesData } = useApiQuery<any>(["audit-entities"], "/audit-logs/entities");
  const entityTypes: string[] = entitiesData?.data || [];

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (entityFilter) params.set("entityType", entityFilter);
  if (actionFilter) params.set("action", actionFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: logsData, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["audit-logs", entityFilter, actionFilter, dateFrom, dateTo, String(page)],
    `/audit-logs?${params.toString()}`
  );
  const logs = logsData?.data || [];
  const total = logsData?.total || 0;

  const filteredLogs = searchText
    ? logs.filter((l: any) =>
        l.userName?.includes(searchText) ||
        l.entity?.includes(searchText) ||
        l.action?.includes(searchText) ||
        String(l.entityId)?.includes(searchText)
      )
    : logs;

  const ENTITY_LABELS: Record<string, string> = {
    employees: "الموظفين", clients: "العملاء", tasks: "المهام", projects: "المشاريع",
    invoices: "الفواتير", vehicles: "المركبات", tickets: "التذاكر", users: "المستخدمين",
    role_permissions: "صلاحيات الأدوار", permissions: "صلاحيات المستخدمين",
    employee_assignments: "التعيينات", hr_leave_requests: "الإجازات",
  };

  const renderChanges = (log: any) => {
    const beforeData = log.before || log.beforeData;
    const afterData = log.after || log.afterData;
    const changes = log.changes;

    if (changes && typeof changes === "object" && !Array.isArray(changes)) {
      return (
        <div className="space-y-1">
          {Object.entries(changes).map(([key, val]: [string, any]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 flex-shrink-0">{key}</span>
              {val && typeof val === "object" && "from" in val ? (
                <>
                  <span className="text-red-500 line-through">{String(val.from ?? "-")}</span>
                  <span className="text-gray-400">←</span>
                  <span className="text-green-600 font-medium">{String(val.to ?? "-")}</span>
                </>
              ) : (
                <span className="text-gray-600">{JSON.stringify(val)}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    const safeParse = (d: any) => {
      try {
        return JSON.stringify(typeof d === "string" ? JSON.parse(d) : d, null, 2);
      } catch {
        return String(d);
      }
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {beforeData && (
          <div>
            <Label className="text-xs text-red-500 mb-1 block">قبل التغيير</Label>
            <pre className="text-[10px] bg-red-50 p-2 rounded border border-red-100 overflow-auto max-h-40 font-mono" dir="ltr">
              {safeParse(beforeData)}
            </pre>
          </div>
        )}
        {afterData && (
          <div>
            <Label className="text-xs text-green-500 mb-1 block">بعد التغيير</Label>
            <pre className="text-[10px] bg-green-50 p-2 rounded border border-green-100 overflow-auto max-h-40 font-mono" dir="ltr">
              {safeParse(afterData)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <FileSearch className="h-5 w-5 text-amber-600" />
        مستعرض سجل المراجعة الشامل
      </h3>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs mb-1 block">نوع الكيان</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}>
                <option value="">الكل</option>
                {entityTypes.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">نوع الإجراء</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
                <option value="">الكل</option>
                <option value="create">إنشاء</option>
                <option value="update">تعديل</option>
                <option value="delete">حذف</option>
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">من تاريخ</Label>
              <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">إلى تاريخ</Label>
              <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">بحث حر</Label>
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input className="ps-8 text-sm" placeholder="بحث..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>سجلات المراجعة</span>
            <Badge variant="outline" className="text-xs">{total} سجل</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 text-start w-8"></th>
                <th className="p-3 text-start">المستخدم</th>
                <th className="p-3 text-start">الإجراء</th>
                <th className="p-3 text-start">الكيان</th>
                <th className="p-3 text-start">المعرّف</th>
                <th className="p-3 text-start">السبب</th>
                <th className="p-3 text-start">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : isError ? (
                <tr><td colSpan={7} className="p-8 text-center text-red-500">
                  حدث خطأ <Button variant="outline" size="sm" className="ms-2" onClick={() => refetch()}>إعادة المحاولة</Button>
                </td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">
                  <ScrollText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  لا توجد سجلات
                </td></tr>
              ) : (
                filteredLogs.map((log: any) => (
                  <Fragment key={log.id}>
                    <tr
                      className={cn("border-b hover:bg-gray-50 cursor-pointer transition-colors", expandedId === log.id && "bg-amber-50/50")}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="p-3">
                        {expandedId === log.id
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </td>
                      <td className="p-3 font-medium">{log.userName || "النظام"}</td>
                      <td className="p-3">
                        <Badge className={cn("text-[10px]",
                          log.action?.includes("create") ? "bg-green-100 text-green-700" :
                          log.action?.includes("delete") ? "bg-red-100 text-red-700" :
                          log.action?.includes("update") ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-700"
                        )}>
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </td>
                      <td className="p-3 text-gray-500">{ENTITY_LABELS[log.entity] || log.entity}</td>
                      <td className="p-3 font-mono text-xs text-gray-400">#{log.entityId}</td>
                      <td className="p-3 text-xs text-gray-500 max-w-[150px] truncate">{log.reason || "-"}</td>
                      <td className="p-3 text-xs text-gray-400">{log.createdAt ? formatDateAr(log.createdAt) : "-"}</td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={7} className="p-4 bg-gray-50 border-b">
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                              {log.ipAddress && <span>IP: <code className="bg-white px-1 rounded">{log.ipAddress}</code></span>}
                              {log.scope && <span>النطاق: <code className="bg-white px-1 rounded">{JSON.stringify(log.scope)}</code></span>}
                            </div>
                            {renderChanges(log)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
        {[
          { label: "المستخدمين", icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "إسناد الأدوار", icon: UserCog, color: "text-orange-600 bg-orange-50" },
          { label: "الأدوار المتاحة", icon: KeyRound, color: "text-purple-600 bg-purple-50" },
          { label: "سجلات النظام", icon: ScrollText, color: "text-gray-600 bg-gray-50" },
          { label: "الصلاحيات", icon: Lock, color: "text-emerald-600 bg-emerald-50" },
          { label: "سجل الأمن", icon: ShieldAlert, color: "text-red-600 bg-red-50" },
          { label: "سجل المراجعة", icon: FileSearch, color: "text-amber-600 bg-amber-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <p className="font-semibold text-sm">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="users" dir="rtl">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="users">المستخدمين</TabsTrigger>
          <TabsTrigger value="assign">إسناد الأدوار</TabsTrigger>
          <TabsTrigger value="roles">الأدوار</TabsTrigger>
          <TabsTrigger value="logs">السجلات</TabsTrigger>
          <TabsTrigger value="permissions">الصلاحيات</TabsTrigger>
          <TabsTrigger value="security">سجل الأمن</TabsTrigger>
          <TabsTrigger value="audit">سجل المراجعة</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="assign"><RoleAssignmentTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
        <TabsContent value="security"><SecurityLogTab /></TabsContent>
        <TabsContent value="audit"><AuditExplorerTab /></TabsContent>
      </Tabs>
    </div>
  );
}
