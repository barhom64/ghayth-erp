import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KeyRound, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleKeyColors } from "@/contexts/app-context";
import { useToast } from "@/hooks/use-toast";
import { MODULE_LABELS, PredefinedRole } from "./shared";

const ALL_MODULES = Object.keys(MODULE_LABELS);

export function RolesTab() {
  const { toast } = useToast();
  const { data: predefinedData, isLoading: isLoading1, isError: isError1 } = useApiQuery<any>(["predefined-roles"], "/admin/predefined-roles");
  const { data: roleModulesData, refetch, isLoading: isLoading2, isError: isError2 } = useApiQuery<any>(["role-modules"], "/settings/role-modules");
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

  if (isLoading1 || isLoading2) return <LoadingSpinner />;
  if (isError1 || isError2) return <ErrorState onRetry={() => window.location.reload()} />;

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
