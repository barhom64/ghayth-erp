import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert, RefreshCw, Users, Lock, AlertTriangle, Scan,
} from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
};

const TYPE_LABELS: Record<string, string> = {
  separation_of_duties: "فصل المهام",
  max_privilege: "تجاوز الصلاحيات",
  sensitive_unaudited: "عملية حساسة بدون تدقيق",
  orphan_permission: "صلاحية يتيمة",
};

export default function AdminPolicyEngine() {
  const { data: audit, isLoading: auditLoading, error: auditError, refetch: refetchAudit } = useApiQuery<any>(
    ["policy-audit"], "/admin/governance/policy-audit"
  );
  const { data: strategies, isLoading: stratLoading } = useApiQuery<any>(
    ["role-strategies"], "/admin/governance/role-strategies"
  );

  const violations = audit?.violations ?? [];
  const critical = audit?.critical ?? 0;
  const roleStrategies = strategies?.strategies ?? [];
  const separationRules = strategies?.separationOfDuties ?? [];
  const sensitiveOps = strategies?.sensitiveOperations ?? [];

  const isLoading = auditLoading || stratLoading;

  return (
    <PageShell
      title="محرك السياسات"
      subtitle="سياسات الصلاحيات وفصل المهام والعمليات الحساسة"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
          <Scan className="h-4 w-4 me-1" />فحص السياسات
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !audit} error={auditError} onRetry={refetchAudit}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className={critical > 0 ? "bg-red-50/50" : "bg-green-50/50"}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{violations.length}</p>
                <p className="text-xs text-gray-500">إجمالي المخالفات</p>
              </CardContent>
            </Card>
            <Card className={critical > 0 ? "bg-red-50/50" : "bg-green-50/50"}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{critical}</p>
                <p className="text-xs text-gray-500">حرجة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{separationRules.length}</p>
                <p className="text-xs text-gray-500">قواعد فصل المهام</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{sensitiveOps.length}</p>
                <p className="text-xs text-gray-500">عمليات حساسة</p>
              </CardContent>
            </Card>
          </div>

          {violations.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  مخالفات السياسات ({violations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 sticky top-0">
                        <th className="p-2 text-start">النوع</th>
                        <th className="p-2 text-start">الخطورة</th>
                        <th className="p-2 text-start">التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map((v: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="p-2">
                            <Badge variant="outline">{TYPE_LABELS[v.type] || v.type}</Badge>
                          </td>
                          <td className="p-2">
                            <Badge className={SEVERITY_COLORS[v.severity] || ""}>{v.severity}</Badge>
                          </td>
                          <td className="p-2 text-xs">{v.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {violations.length === 0 && audit && (
            <Card className="border-green-200 bg-green-50/30">
              <CardContent className="p-6 text-center text-green-700">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2" />
                <p className="font-semibold">لا توجد مخالفات — جميع السياسات مطبقة بنجاح</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  قواعد فصل المهام
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {separationRules.map((rule: any, i: number) => (
                  <div key={i} className="p-2 bg-gray-50 rounded border text-sm flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{rule.roleA} ⇄ {rule.roleB}</p>
                      <p className="text-xs text-gray-500">{rule.reason}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  العمليات الحساسة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sensitiveOps.map((op: any, i: number) => (
                  <div key={i} className="p-2 bg-gray-50 rounded border text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{op.permission}</span>
                      <div className="flex gap-1">
                        {op.requiresDualApproval && <Badge variant="outline" className="text-red-600">موافقة ثنائية</Badge>}
                        <Badge variant="outline">{op.auditLevel}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{op.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                استراتيجيات الأدوار ({roleStrategies.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-2 text-start">الدور</th>
                      <th className="p-2 text-start">المستوى</th>
                      <th className="p-2 text-start">تفويض</th>
                      <th className="p-2 text-start">حد الفروع</th>
                      <th className="p-2 text-start">الوصف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleStrategies.map((s: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{s.label}</td>
                        <td className="p-2"><Badge variant="outline">{s.tier}</Badge></td>
                        <td className="p-2">{s.canDelegate ? "✓" : "—"}</td>
                        <td className="p-2">{s.maxBranches ?? "∞"}</td>
                        <td className="p-2 text-xs text-gray-500">{s.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
