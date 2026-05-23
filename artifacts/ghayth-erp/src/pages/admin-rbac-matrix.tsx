import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  RefreshCw, Shield, CheckCircle, XCircle,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  owner: "مالك النظام",
  general_manager: "المدير العام",
  hr_manager: "مدير الموارد البشرية",
  finance_manager: "المدير المالي",
  fleet_manager: "مدير الأسطول",
  warehouse_manager: "مدير المستودعات",
  property_manager: "مدير العقارات",
  projects_manager: "مدير المشاريع",
  legal_manager: "المستشار القانوني",
  support_manager: "مدير الدعم",
  crm_manager: "مدير العلاقات",
  bi_manager: "محلل الأعمال",
  branch_manager: "مدير الفرع",
  employee: "موظف",
};

export default function AdminRbacMatrix() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["rbac-matrix"], "/admin/governance/rbac-matrix"
  );
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const permissions = data?.permissions ?? [];
  const roleDefaults = data?.roleDefaults ?? {};
  const customPermissions = data?.customPermissions ?? [];
  const roles = Object.keys(roleDefaults);

  const rolePerms = selectedRole ? (roleDefaults[selectedRole] ?? []) : [];
  const isWildcard = rolePerms.includes("*");
  const customForRole = customPermissions.filter((cp: any) => cp.role === selectedRole);

  const permissionModules: Record<string, string[]> = permissions.reduce((acc: Record<string, string[]>, p: string) => {
    if (p === "*") return acc;
    const module = p.split(":")[0];
    if (!acc[module]) acc[module] = [];
    acc[module].push(p);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <PageShell
      title="مصفوفة الصلاحيات"
      subtitle="الأدوار والصلاحيات الافتراضية والمخصصة"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{data?.totalPermissions ?? 0}</p>
                <p className="text-xs text-muted-foreground">صلاحية</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{data?.totalRoles ?? 0}</p>
                <p className="text-xs text-muted-foreground">دور</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{Object.keys(permissionModules).length}</p>
                <p className="text-xs text-muted-foreground">وحدة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{customPermissions.length}</p>
                <p className="text-xs text-muted-foreground">تخصيص</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4" /> الأدوار
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-auto">
                  {roles.map((role) => {
                    const perms = roleDefaults[role] || [];
                    const hasWild = perms.includes("*");
                    return (
                      <button
                        key={role}
                        className={`w-full text-start p-3 border-b hover:bg-surface-subtle flex items-center justify-between ${selectedRole === role ? "bg-primary/5 border-r-2 border-r-primary" : ""}`}
                        onClick={() => setSelectedRole(role)}
                      >
                        <div>
                          <p className="font-medium text-sm">{ROLE_LABELS[role] || role}</p>
                          <p className="font-mono text-xs text-muted-foreground">{role}</p>
                        </div>
                        <Badge variant="outline" className={hasWild ? "text-status-warning-foreground" : ""}>
                          {hasWild ? "∞" : perms.length}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">
                  {selectedRole ? (
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      {ROLE_LABELS[selectedRole] || selectedRole}
                      {isWildcard && <Badge className="bg-status-warning-surface text-status-warning-foreground">صلاحية كاملة (*)</Badge>}
                      {customForRole.length > 0 && <Badge className="bg-purple-100 text-purple-800">{customForRole.length} تخصيص</Badge>}
                    </span>
                  ) : "اختر دوراً لعرض صلاحياته"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedRole ? (
                  isWildcard ? (
                    <div className="text-center py-8">
                      <Shield className="w-12 h-12 mx-auto mb-2 text-status-warning" />
                      <p className="text-lg font-bold text-status-warning-foreground">صلاحية كاملة</p>
                      <p className="text-sm text-muted-foreground">هذا الدور يملك wildcard (*) — وصول كامل لجميع الصلاحيات</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(permissionModules).map(([module, modulePerms]) => {
                        const granted = modulePerms.filter(p => rolePerms.includes(p));
                        if (granted.length === 0) return null;
                        return (
                          <div key={module}>
                            <p className="font-medium text-sm mb-1">{module}</p>
                            <div className="flex flex-wrap gap-1">
                              {modulePerms.map((perm) => {
                                const hasIt = rolePerms.includes(perm);
                                return (
                                  <Badge
                                    key={perm}
                                    variant="outline"
                                    className={`text-[10px] ${hasIt ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" : "bg-surface-subtle text-muted-foreground border-border"}`}
                                  >
                                    {hasIt ? <CheckCircle className="w-3 h-3 me-0.5" /> : <XCircle className="w-3 h-3 me-0.5" />}
                                    {perm.split(":").slice(1).join(":")}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>اختر دوراً من القائمة لعرض مصفوفة صلاحياته</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
