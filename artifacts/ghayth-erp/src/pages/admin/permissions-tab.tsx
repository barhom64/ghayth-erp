import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Shield, UserCog, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ROLE_OPTIONS } from "./shared";

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
