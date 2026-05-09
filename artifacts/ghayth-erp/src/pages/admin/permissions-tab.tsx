import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, UserCog, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ROLE_OPTIONS } from "./shared";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

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

export function PermissionsTab() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState("employee");
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const { data: usersData, isLoading, isError } = useApiQuery<any>(["admin-users"], "/admin/users");
  const users = usersData?.data || [];
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userPerms, setUserPerms] = useState<any[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const loadRolePerms = async (role: string) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/permissions/role-permissions?role=${encodeURIComponent(role)}`);
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
        await apiFetch("/permissions/role-permissions", {
          method: "DELETE",
          body: JSON.stringify({ role: selectedRole, permission: perm }),
        });
        setRolePerms(prev => { const s = new Set(prev); s.delete(perm); return s; });
      } else if (!hasPerm) {
        await apiFetch("/permissions/role-permissions", {
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

  const rolePermColumns: DataTableColumn<any>[] = [
    { key: "label", header: "الوحدة", width: "128px", render: (r: any) => <span className="font-medium text-sm text-gray-700">{r.label}</span> },
    ...PERM_ACTIONS.map((action) => ({
      key: action.key,
      header: action.label,
      align: "center" as const,
      render: (r: any) => {
        const perm = `${r.key}:${action.key}`;
        const hasWildcard = rolePerms.has("*") || rolePerms.has(`${r.key}:*`);
        const hasPerm = hasWildcard || rolePerms.has(perm);
        const isSaving = saving === perm;
        return (
          <button
            onClick={() => !hasWildcard && toggleRolePerm(r.key, action.key)}
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
        );
      },
    })),
  ];

  const userPermColumns: DataTableColumn<any>[] = [
    { key: "label", header: "الوحدة", width: "128px", render: (r: any) => <span className="font-medium text-sm text-gray-700">{r.label}</span> },
    ...PERM_ACTIONS.map((action) => ({
      key: action.key,
      header: action.label,
      align: "center" as const,
      render: (r: any) => {
        const perm = `${r.key}:${action.key}`;
        const existing = userPerms.find((p: any) => p.permission === perm);
        const isGranted = existing?.type === "grant";
        const isRevoked = existing?.type === "revoke";
        return (
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
        );
      },
    })),
  ];

  if (isLoading) return <DataTable columns={rolePermColumns} data={[]} isLoading={true} searchPlaceholder={null} noToolbar />;
  if (isError) return <DataTable columns={rolePermColumns} data={[]} isError={true} onRetry={() => window.location.reload()} searchPlaceholder={null} noToolbar />;

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
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">جاري التحميل...</p>
            ) : (
              <div>
                <DataTable
                  columns={rolePermColumns}
                  data={PERM_MODULES}
                  noToolbar
                  pageSize={0}
                  rowKey={(r: any) => r.key}
                />
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
              <Select value={selectedUserId?.toString() ?? ""} onValueChange={(v) => setSelectedUserId(v ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="— اختر مستخدم —" /></SelectTrigger>
                <SelectContent>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.employeeName || u.email} ({ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedUserId && (
              <>
                {userLoading ? (
                  <p className="text-sm text-gray-400">جاري التحميل...</p>
                ) : (
                  <div>
                    <DataTable
                      columns={userPermColumns}
                      data={PERM_MODULES}
                      noToolbar
                      pageSize={0}
                      rowKey={(r: any) => r.key}
                    />
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
