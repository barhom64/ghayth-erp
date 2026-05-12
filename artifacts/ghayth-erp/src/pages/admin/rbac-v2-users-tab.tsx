import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, UserPlus, X, Calendar, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface UserRow {
  userId: number;
  email: string;
  userName: string;
  empNumber: string | null;
  legacy_role: string | null;
  jobTitle: string | null;
  branchName: string | null;
  departmentName: string | null;
  v2_role_count: number;
}

interface UserRoleBinding {
  id: number;
  role_id: number;
  branchId: number | null;
  departmentId: number | null;
  is_primary: boolean;
  expires_at: string | null;
  role_key: string;
  label_ar: string;
  color: string;
  level: number;
}

interface Role {
  id: number;
  role_key: string;
  label_ar: string;
  color: string;
  level: number;
  is_template: boolean;
}

export function UserRoleAssignmentTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [pickRole, setPickRole] = useState<string>("");
  const [pickExpiry, setPickExpiry] = useState<string>("");

  const { data: usersData, isLoading: usersLoading } = useApiQuery<{ users: UserRow[] }>(
    ["rbac-users", search],
    `/rbac/v2/users${search ? `?q=${encodeURIComponent(search)}` : ""}`
  );
  const { data: rolesData } = useApiQuery<{ data: Role[] }>(
    ["rbac-roles"],
    "/rbac/v2/roles"
  );
  const { data: bindingsData, refetch: refetchBindings } = useApiQuery<{ roles: UserRoleBinding[] }>(
    ["rbac-user-bindings", String(selectedUserId || "")],
    selectedUserId ? `/rbac/v2/users/${selectedUserId}/roles` : "/rbac/v2/users/0/roles",
    !!selectedUserId
  );

  const users = usersData?.users || [];
  const roles = (rolesData?.data || []).filter((r) => !r.is_template);
  const bindings = bindingsData?.roles || [];
  const selectedUser = users.find((u) => u.userId === selectedUserId);

  const assign = async () => {
    if (!selectedUserId || !pickRole) return;
    try {
      await apiFetch(`/rbac/v2/users/${selectedUserId}/roles`, {
        method: "POST",
        body: JSON.stringify({
          roleId: Number(pickRole),
          isPrimary: bindings.length === 0,
          expiresAt: pickExpiry || null,
        }),
      });
      toast({ title: "تم الإسناد", description: "تم منح الدور للمستخدم" });
      setPickRole("");
      setPickExpiry("");
      refetchBindings();
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
    } catch (err: any) {
      toast({ title: "فشل الإسناد", description: err?.message || "خطأ", variant: "destructive" });
    }
  };

  const unassign = async (roleId: number) => {
    if (!selectedUserId) return;
    try {
      await apiFetch(`/rbac/v2/users/${selectedUserId}/roles/${roleId}`, { method: "DELETE" });
      toast({ title: "تم الإلغاء" });
      refetchBindings();
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
    } catch (err: any) {
      toast({ title: "فشل الإلغاء", description: err?.message || "خطأ", variant: "destructive" });
    }
  };

  const syncAllRoles = async () => {
    try {
      const result = await apiFetch<{ added: number; totalRoles: number }>(
        "/rbac/v2/admin/sync-all-roles",
        { method: "POST" }
      );
      toast({
        title: "تم تحديث الأدوار",
        description: `أُضيف ${result.added} دور — لديك الآن ${result.totalRoles} دور للتنقل بينها`,
      });
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
      qc.invalidateQueries({ queryKey: ["rbac-user-bindings"] });
    } catch (err: any) {
      toast({
        title: "فشل التحديث",
        description: err?.message || "تأكد أنك المالك أو المدير العام",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">للاختبار: امنح حسابك كل الأدوار</p>
              <p className="text-xs text-amber-700">
                يفعّل قائمة التنقّل بين الأدوار في الـheader حتى تجرّب كل دور بنفسك بدون تسجيل خروج
              </p>
            </div>
          </div>
          <GuardedButton perm="admin:create" size="sm" onClick={syncAllRoles}>
            <Sparkles className="h-4 w-4 me-1" />
            مزامنة كل الأدوار لي
          </GuardedButton>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4" />
              المستخدمون ({users.length})
            </CardTitle>
            <Input
              placeholder="ابحث بالاسم أو البريد"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm mt-2"
            />
          </CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-auto">
            {usersLoading ? <LoadingSpinner /> : users.map((u) => (
              <button
                key={u.userId}
                onClick={() => setSelectedUserId(u.userId)}
                className={`w-full text-start p-3 border-b hover:bg-gray-50 transition ${
                  selectedUserId === u.userId ? "bg-blue-50 border-r-4 border-r-blue-500" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{u.userName}</span>
                  <Badge variant="outline" className="text-xs">
                    {u.v2_role_count} دور
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {u.jobTitle || u.legacy_role} · {u.branchName || "—"}
                  {u.departmentName && ` · ${u.departmentName}`}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{u.email}</div>
              </button>
            ))}
            {!usersLoading && users.length === 0 && (
              <p className="p-6 text-center text-gray-400 text-sm">لا يوجد مستخدمون</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-7 overflow-x-auto">
        {!selectedUser ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-400">
              <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>اختر مستخدماً لإدارة أدواره</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                {selectedUser.userName}
              </CardTitle>
              <p className="text-xs text-gray-500">
                {selectedUser.email} · {selectedUser.jobTitle || selectedUser.legacy_role}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">الأدوار الحالية ({bindings.length})</p>
                {bindings.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center bg-gray-50 rounded">
                    لم يُسنَد له أي دور v2 — يستخدم الدور القديم: <Badge variant="outline">{selectedUser.legacy_role}</Badge>
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bindings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                          <span className="font-medium text-sm">{b.label_ar}</span>
                          {b.is_primary && <Badge className="text-xs bg-blue-600">رئيسي</Badge>}
                          <Badge variant="outline" className="text-xs">المستوى {b.level}</Badge>
                          {b.expires_at && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                              <Calendar className="h-3 w-3 me-1" />
                              ينتهي {new Date(b.expires_at).toLocaleDateString("ar")}
                            </Badge>
                          )}
                        </div>
                        <GuardedButton perm="admin:create" size="sm" variant="ghost" onClick={() => unassign(b.role_id)}>
                          <X className="h-4 w-4" />
                        </GuardedButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">إسناد دور جديد</p>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={pickRole} onValueChange={setPickRole}>
                    <SelectTrigger className="h-9 text-sm col-span-2">
                      <SelectValue placeholder="اختر دوراً..." />
                    </SelectTrigger>
                    <SelectContent>
                      {roles
                        .filter((r) => !bindings.find((b) => b.role_id === r.id))
                        .map((r) => (
                          <SelectItem key={r.id} value={String(r.id)} className="text-sm">
                            {r.label_ar}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={pickExpiry}
                    onChange={(e) => setPickExpiry(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="تاريخ انتهاء (اختياري)"
                  />
                </div>
                <GuardedButton perm="admin:create" onClick={assign} disabled={!pickRole} className="w-full mt-2" size="sm">
                  <UserPlus className="h-4 w-4 me-1" />
                  إسناد
                </GuardedButton>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
    </div>
  );
}
