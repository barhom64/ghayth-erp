import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Plus, Trash2, CheckCircle } from "lucide-react";
import { roleKeyColors } from "@/contexts/app-context";
import { MODULE_LABELS, PredefinedRole, UserRoleRow } from "./shared";

export function RoleAssignmentTab() {
  const { data: usersData, isLoading: isLoading1, isError: isError1 } = useApiQuery<any>(["admin-users"], "/admin/users");
  const { data: predefinedData, isLoading: isLoading2, isError: isError2 } = useApiQuery<any>(["predefined-roles"], "/admin/predefined-roles");
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

  if (isLoading1 || isLoading2) return <LoadingSpinner />;
  if (isError1 || isError2) return <ErrorState onRetry={() => window.location.reload()} />;

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
