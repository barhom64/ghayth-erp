import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Pencil, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function RolePermissionsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["role-modules"], "/settings/role-modules");
  const { toast } = useToast();
  const roles = data?.data || [];
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const allModules = [
    { key: "home", label: "الرئيسية" }, { key: "hr", label: "الموارد البشرية" },
    { key: "finance", label: "المالية" }, { key: "fleet", label: "الأسطول" },
    { key: "property", label: "الأملاك" }, { key: "operations", label: "العمليات" },
    { key: "warehouse", label: "المستودعات" }, { key: "governance", label: "الحوكمة" },
    { key: "bi", label: "ذكاء الأعمال" }, { key: "requests", label: "الطلبات" },
    { key: "documents", label: "المستندات" }, { key: "reports", label: "التقارير" },
    { key: "admin", label: "الإدارة" }, { key: "comms", label: "الاتصالات" },
    { key: "legal", label: "القانونية" }, { key: "crm", label: "المبيعات" },
    { key: "marketing", label: "التسويق" }, { key: "store", label: "المتجر" },
    { key: "support", label: "الدعم" }, { key: "settings", label: "الإعدادات" },
    { key: "umrah", label: "العمرة" },
  ];

  const startEdit = (roleKey: string, modules: any) => {
    setEditingRole(roleKey);
    let mods = typeof modules === "string" ? JSON.parse(modules) : modules;
    if (mods && typeof mods === "object" && !Array.isArray(mods) && mods.all === true) {
      mods = allModules.map(m => m.key);
    }
    setEditModules(Array.isArray(mods) ? mods : []);
  };

  const toggleModule = (mod: string) => {
    setEditModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
  };

  const handleSave = async () => {
    if (!editingRole) return;
    try {
      await apiFetch(`/settings/role-modules/${editingRole}`, {
        method: "PUT",
        body: JSON.stringify({ modules: editModules }),
      });
      toast({ title: "تم تحديث صلاحيات الدور" });
      setEditingRole(null);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="h-5 w-5" />
        صلاحيات الأدوار
      </h3>
      <div className="space-y-3">
        {roles.map((role: any) => {
          let mods = typeof role.modules === "string" ? JSON.parse(role.modules) : role.modules || [];
          if (mods && typeof mods === "object" && !Array.isArray(mods) && mods.all === true) {
            mods = allModules.map(m => m.key);
          }
          const isEditing = editingRole === role.roleKey;

          return (
            <Card key={role.roleKey}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold">{role.label}</span>
                    <Badge variant="outline" className="text-xs">{role.roleKey}</Badge>
                    <Badge variant="outline" className="text-xs">مستوى {role.level}</Badge>
                  </div>
                  {!isEditing ? (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(role.roleKey, role.modules)}>
                      <Pencil className="h-4 w-4 me-1" />تعديل
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave}><Save className="h-4 w-4 me-1" />حفظ</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingRole(null)}>إلغاء</Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isEditing ? (
                    allModules.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => toggleModule(m.key)}
                        className={cn(
                          "px-2 py-1 rounded-md text-xs border transition-colors",
                          editModules.includes(m.key)
                            ? "bg-blue-100 text-blue-700 border-blue-300"
                            : "bg-gray-50 text-gray-400 border-gray-200"
                        )}
                      >
                        {m.label}
                      </button>
                    ))
                  ) : (
                    (Array.isArray(mods) ? mods : []).map((m: string) => (
                      <Badge key={m} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                        {allModules.find(am => am.key === m)?.label || m}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {roles.length === 0 && (
          <Card><CardContent className="p-8 text-center text-gray-400">لا توجد أدوار مسندة بعد. قم بإسناد أدوار للمستخدمين من صفحة المدير.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
