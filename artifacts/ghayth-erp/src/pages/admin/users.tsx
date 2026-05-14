import { useState } from "react";
import { z } from "zod";
import { useApiQuery, apiFetch, isRateLimitedError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FormShell, FormEmailField, FormTextField, FormSelectField, FormGrid,
} from "@/components/form-shell";

// Same schema as users-tab.tsx (#301) — both pages create users with
// the same payload shape. Email is validated client-side now;
// the old `if (!form.email)` accepted "x" as a valid email.
const newUserSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  role: z.string().min(1, "اختر دورًا"),
  password: z.string(),
  employeeId: z.string(),
});
type NewUserForm = z.infer<typeof newUserSchema>;
const defaultNewUser: NewUserForm = {
  email: "", role: "employee", password: "", employeeId: "",
};

// Edit form — PATCH semantics. `role` is required (server treats
// blank as "no change"), `employeeId` may be blank ("unlink") or a
// numeric string. Both fields are seeded from the row via the
// FormShell key={editUser.id} remount trick.
const editUserSchema = z.object({
  role: z.string().min(1, "اختر دورًا"),
  employeeId: z.string(),
});
type EditUserForm = z.infer<typeof editUserSchema>;
import {
  Shield, Plus, X, CheckCircle, KeySquare, Eye, EyeOff, ToggleLeft, ToggleRight,
  Search, Users, Trash2, Edit2, ShieldAlert, AlertCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { PageStatusBadge } from "@/components/page-status-badge";
import { roleKeyColors } from "@/contexts/app-context";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

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
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["admin-users"], "/admin/users");
  const { data: employeesData } = useApiQuery<any>(["employees-list-admin"], "/employees?limit=200");
  const [showForm, setShowForm] = useState(false);
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editUser, setEditUser] = useState<any>(null);
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

  const userColumns: DataTableColumn<any>[] = [
    {
      key: "email",
      header: "المستخدم",
      sortable: true,
      searchable: true,
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: roleKeyColors[r.role] || "#95A5A6" }}>
            {r.email?.charAt(0)?.toUpperCase()}
          </div>
          <span className="font-mono text-xs">{r.email}</span>
        </div>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف المرتبط",
      sortable: true,
      render: (r: any) => r.employeeName ? (
        <div>
          <p className="text-sm font-medium">{r.employeeName}</p>
          <p className="text-xs text-muted-foreground">{r.empNumber}</p>
        </div>
      ) : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: "role",
      header: "الدور",
      sortable: true,
      render: (r: any) => (
        <Badge variant="outline" className="text-xs" style={{ borderColor: roleKeyColors[r.role] + "60", color: roleKeyColors[r.role] }}>
          {roleLabel(r.role)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r: any) => <PageStatusBadge status={r.status || (r.isActive ? "active" : "inactive")} />,
    },
    {
      key: "lastLoginAt",
      header: "آخر دخول",
      sortable: true,
      render: (r: any) => <span className="text-xs text-muted-foreground">{r.lastLoginAt ? formatDateAr(r.lastLoginAt) : "لم يسجل بعد"}</span>,
    },
    {
      key: "failedAttempts7d",
      header: "محاولات فاشلة (7 أيام)",
      render: (r: any) => {
        const failedCount = Number(r.failedAttempts7d) || 0;
        return failedCount > 0 ? (
          <div className="flex items-center gap-1">
            <ShieldAlert className={cn("h-4 w-4", failedCount > 3 ? "text-status-error" : "text-status-warning")} />
            <span className={cn("text-xs font-medium", failedCount > 3 ? "text-status-error-foreground" : "text-status-warning-foreground")}>{failedCount}</span>
          </div>
        ) : <span className="text-xs text-gray-300">—</span>;
      },
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (r: any) => (
        <div className="flex gap-1">
          <GuardedButton perm="admin:delete" variant="ghost" size="sm" className="h-7 text-xs gap-1" title={r.isActive ? "تعليق الحساب" : "تفعيل الحساب"} onClick={() => toggleActive(r)}>
            {r.isActive ? <ToggleRight className="h-4 w-4 text-status-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
          </GuardedButton>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-status-info-foreground" title="تعديل" onClick={() => startEditUser(r)}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-orange-600" title="إعادة تعيين كلمة المرور" onClick={() => { setResetUserId(r.id); setResetPassword(""); setCreatedUser(null); setShowForm(false); setEditUser(null); setDeleteConfirmId(null); }}>
            <KeySquare className="h-3.5 w-3.5" />
          </Button>
          <GuardedButton perm="admin:delete" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-status-error-foreground" title="حذف المستخدم" onClick={() => { setDeleteConfirmId(r.id); setEditUser(null); setResetUserId(null); setShowForm(false); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  const createUser = async (values: NewUserForm) => {
    try {
      const result = await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          role: values.role,
          password: values.password || undefined,
          employeeId: values.employeeId ? Number(values.employeeId) : undefined,
        }),
      });
      setCreatedUser(result);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في إنشاء المستخدم" });
    }
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
    } catch (err) {
      // The shared apiFetch already shows a debounced rate-limit toast on
      // 429, so swallow it here to avoid a duplicate generic error toast.
      if (isRateLimitedError(err)) return;
      toast({ variant: "destructive", title: "فشل في إعادة تعيين كلمة المرور" });
    }
  };

  const startEditUser = (u: any) => {
    setEditUser(u);
    setResetUserId(null); setShowForm(false); setDeleteConfirmId(null);
  };

  const saveEdit = async (values: EditUserForm) => {
    if (!editUser) return;
    try {
      await apiFetch(`/admin/users/${editUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          // Partial update: only send role when it actually changed
          // (preserves the original semantics from the useState form).
          role: values.role !== editUser.role ? values.role : undefined,
          employeeId: values.employeeId ? Number(values.employeeId) : undefined,
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
            <Users className="w-8 h-8 text-status-info-foreground" />
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
          { label: "إجمالي المستخدمين", value: items.length, color: "bg-status-info-surface text-status-info-foreground" },
          { label: "نشط", value: activeCount, color: "bg-status-success-surface text-status-success-foreground" },
          { label: "معلق", value: inactiveCount, color: "bg-status-error-surface text-status-error-foreground" },
          { label: "محاولات مشبوهة (7 أيام)", value: suspiciousCount, color: suspiciousCount > 0 ? "bg-orange-50 text-orange-700" : "bg-surface-subtle text-muted-foreground" },
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
          <FormShell
            schema={newUserSchema}
            defaultValues={defaultNewUser}
            submitLabel="إنشاء حساب"
            secondaryActions={
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values, ctx) => {
              await createUser(values);
              ctx.reset();
            }}
          >
            <FormGrid cols={2}>
              <FormEmailField name="email" label="البريد الإلكتروني" required className="md:col-span-2" placeholder="user@company.com" />
              <FormSelectField name="role" label="الدور الوظيفي" options={ROLE_OPTIONS} />
              <FormSelectField
                name="employeeId"
                label="ربط بموظف (اختياري)"
                options={[
                  { value: "", label: "— بدون ربط —" },
                  ...employees.map((e: any) => ({ value: String(e.id), label: `${e.name} (${e.empNumber})` })),
                ]}
              />
              <FormTextField name="password" label="كلمة المرور (اختياري - ستُنشأ تلقائياً)" type="password" placeholder="اتركها فارغة للإنشاء التلقائي" />
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}

      {createdUser && (
        <Card className="border-status-success-surface bg-status-success-surface">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-status-success-foreground flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />تم إنشاء الحساب بنجاح — بيانات الدخول
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground mb-1">البريد الإلكتروني</p>
                <p className="font-mono text-sm font-medium">{createdUser.email}</p>
              </div>
              {createdUser.tempPassword && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs text-muted-foreground mb-1">كلمة المرور المؤقتة</p>
                  <p className="font-mono text-sm font-bold text-status-info-foreground">{createdUser.tempPassword}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-status-success-foreground">احفظ هذه البيانات وأرسلها للمستخدم. يُنصح بتغيير كلمة المرور بعد أول تسجيل دخول.</p>
            <Button size="sm" variant="outline" onClick={() => { setCreatedUser(null); setShowForm(false); }}>إغلاق</Button>
          </CardContent>
        </Card>
      )}

      {editUser && (
        <Card className="border-status-info-surface bg-status-info-surface">
          <CardContent className="p-4 space-y-4">
            <h4 className="font-semibold text-status-info-foreground flex items-center gap-2">
              <Edit2 className="h-5 w-5" />تعديل بيانات المستخدم — {editUser.email}
            </h4>
            <FormShell
              key={editUser.id}
              schema={editUserSchema}
              defaultValues={{
                role: editUser.role || "",
                employeeId: editUser.employeeId ? String(editUser.employeeId) : "",
              }}
              submitLabel="حفظ التعديلات"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await saveEdit(values);
              }}
            >
              <FormGrid cols={3}>
                <FormSelectField name="role" label="الدور الوظيفي" options={ROLE_OPTIONS} />
                <FormSelectField
                  name="employeeId"
                  label="ربط بموظف"
                  options={[
                    { value: "", label: "— بدون ربط —" },
                    ...employees.map((e: any) => ({ value: String(e.id), label: `${e.name} (${e.empNumber})` })),
                  ]}
                />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      {deleteConfirmId && (
        <Card className="border-status-error-surface bg-status-error-surface">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-status-error-foreground flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />تأكيد تعطيل المستخدم
            </h4>
            <p className="text-sm text-status-error-foreground">سيتم تعطيل هذا المستخدم وإلغاء صلاحياته في شركتك. يمكن إعادة تفعيله لاحقاً.</p>
            <div className="flex gap-2">
              <GuardedButton perm="admin:delete" size="sm" variant="destructive" onClick={() => deleteUser(deleteConfirmId)}>تعطيل</GuardedButton>
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
                  {showResetPw ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>
              <Button onClick={resetUserPassword} disabled={resetPassword.length < 6}>تأكيد</Button>
              <Button variant="outline" onClick={() => { setResetUserId(null); setResetPassword(""); }}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={userColumns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
       
        emptyMessage="لا يوجد مستخدمين"
        pageSize={0}
        searchPlaceholder="بحث بالبريد أو الاسم..."
        toolbarEnd={
          <div className="flex gap-2">
            <Select value={filterRole || "_none"} onValueChange={(v) => setFilterRole(v === "_none" ? "" : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">كل الأدوار</SelectItem>
                {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus || "_none"} onValueChange={(v) => setFilterStatus(v === "_none" ? "" : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">كل الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">معلق</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Shield className="h-4 w-4 text-status-info" />تعيين الأدوار للمستخدمين</h3>
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
      <Select value={selectedUserId ? String(selectedUserId) : "_none"} onValueChange={(v) => { const id = v === "_none" ? null : Number(v); setSelectedUserId(id); if (id) loadUserRoles(id); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">— اختر مستخدم لإدارة أدواره —</SelectItem>
          {users.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.employeeName || u.email}</SelectItem>)}
        </SelectContent>
      </Select>
      {selectedUserId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">الأدوار المسندة</p>
            {loading ? <p className="text-xs text-muted-foreground">جاري التحميل...</p> :
              userRoles.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد أدوار</p> :
              <div className="space-y-1">
                {userRoles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-subtle text-xs">
                    <span className="font-medium">{role.label}</span>
                    <button onClick={() => removeRole(role.id)} className="text-status-error hover:text-status-error-foreground text-xs">حذف</button>
                  </div>
                ))}
              </div>
            }
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">إضافة دور</p>
            <div className="space-y-1">
              {predefinedRoles.filter(r => !assignedKeys.includes(r.roleKey)).slice(0, 8).map((role) => (
                <button key={role.roleKey} onClick={() => assignRole(role.roleKey)}
                  className="w-full text-start flex items-center gap-2 p-2 rounded-lg border border-dashed hover:border-blue-400 hover:bg-status-info-surface text-xs transition-all">
                  <span className="font-medium">{role.label}</span>
                  <span className="text-muted-foreground">مستوى {role.level}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
