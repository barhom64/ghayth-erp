import { useState } from "react";
import { z } from "zod";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, CheckCircle, KeySquare, Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormEmailField,
  FormTextField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";
import { ROLE_OPTIONS } from "./shared";

// Schema enforces email validity client-side (the old `!form.email`
// guard accepted "x" as valid). employeeId stays a string until the
// submit handler — same shape as official-letters.
const newUserSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  role: z.string().min(1, "اختر دورًا"),
  password: z.string(),
  employeeId: z.string(),
});
type NewUserForm = z.infer<typeof newUserSchema>;
const defaultNewUser: NewUserForm = {
  email: "",
  role: "employee",
  password: "",
  employeeId: "",
};

export function UsersTab() {
  const { toast } = useToast();
  const { data, refetch, isLoading: isLoading1, isError: isError1 } = useApiQuery<any>(["admin-users"], "/admin/users");
  const { data: employeesData, isLoading: isLoading2, isError: isError2 } = useApiQuery<any>(["employees-list-admin"], "/employees?limit=200");
  const [showForm, setShowForm] = useState(false);
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const items = data?.data || [];
  const employees = employeesData?.data || [];

  const roleLabel = (r: string) => ROLE_OPTIONS.find(o => o.value === r)?.label || r;

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

  const userColumns: DataTableColumn<any>[] = [
    {
      key: "email",
      header: "البريد الإلكتروني",
      sortable: true,
      searchable: true,
      ltr: true,
      render: (u) => <span className="font-mono text-xs">{u.email}</span>,
    },
    {
      key: "employeeName",
      header: "الموظف المرتبط",
      sortable: true,
      searchable: true,
      render: (u) =>
        u.employeeName ? (
          <div>
            <p className="text-sm font-medium">{u.employeeName}</p>
            <p className="text-xs text-muted-foreground">{u.empNumber}</p>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "role",
      header: "الدور",
      sortable: true,
      render: (u) => <Badge variant="outline" className="text-xs">{roleLabel(u.role)}</Badge>,
    },
    {
      key: "status",
      header: "الحالة",
      render: (u) => <PageStatusBadge status={u.status || (u.isActive ? "active" : "inactive")} />,
    },
    {
      key: "lastLoginAt",
      header: "آخر دخول",
      sortable: true,
      render: (u) => (
        <span className="text-xs text-muted-foreground">
          {u.lastLoginAt ? formatDateAr(u.lastLoginAt) : "لم يسجل بعد"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (u) => (
        <div className="flex gap-1">
          <GuardedButton
            perm="admin:create"
            variant="ghost" size="sm"
            className="h-7 text-xs gap-1"
            title={u.isActive ? "تعليق الحساب" : "تفعيل الحساب"}
            onClick={(e) => { e.stopPropagation(); toggleActive(u); }}
          >
            {u.isActive
              ? <ToggleRight className="h-4 w-4 text-status-success" />
              : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
          </GuardedButton>
          <GuardedButton
            perm="admin:create"
            variant="ghost" size="sm"
            className="h-7 text-xs gap-1 text-orange-600"
            onClick={(e) => { e.stopPropagation(); setResetUserId(u.id); setResetPassword(""); setCreatedUser(null); setShowForm(false); }}
          >
            <KeySquare className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">المستخدمين</h1>
        <GuardedButton perm="admin:create" size="sm" onClick={() => { setShowForm(!showForm); setCreatedUser(null); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مستخدم</>}
        </GuardedButton>
      </div>

      {showForm && !createdUser && (
        <Card><CardContent className="p-4">
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
              <CheckCircle className="h-5 w-5" />
              تم إنشاء الحساب بنجاح — بيانات الدخول
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground mb-1">البريد الإلكتروني</p>
                <p className="font-mono text-sm font-medium">{createdUser.email}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground mb-1">كلمة المرور المؤقتة</p>
                <p className="font-mono text-sm font-bold text-status-info-foreground">{createdUser.tempPassword}</p>
              </div>
            </div>
            <p className="text-xs text-status-success-foreground">احفظ هذه البيانات وأرسلها للمستخدم. يُنصح بتغيير كلمة المرور بعد أول تسجيل دخول.</p>
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
                  {showResetPw ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>
              <GuardedButton perm="admin:create" onClick={resetUserPassword} disabled={resetPassword.length < 6}>تأكيد</GuardedButton>
              <Button variant="outline" onClick={() => { setResetUserId(null); setResetPassword(""); }}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={userColumns}
        data={items}
        isLoading={isLoading1 || isLoading2}
        isError={isError1 || isError2}
       
        searchPlaceholder="بحث بالبريد أو اسم الموظف..."
        emptyMessage="لا يوجد مستخدمين"
        pageSize={0}
      />
    </div>
  );
}
