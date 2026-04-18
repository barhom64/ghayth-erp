import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Scale, Shield } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { SEVERITY_LEVELS } from "@/lib/hr-type-maps";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";

export default function PenaltyEscalationPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["violations"], "/hr/violations");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const items = (data?.data || []).filter((v: any) => v.status === "active");

  const grouped: Record<string, any[]> = items.reduce((acc: Record<string, any[]>, v: any) => {
    const name = v.employeeName || "غير معروف";
    if (!acc[name]) acc[name] = [];
    acc[name].push(v);
    return acc;
  }, {} as Record<string, any[]>);

  const escalationRules = [
    { count: 1, action: "تنبيه شفهي", severity: "low" },
    { count: 2, action: "إنذار كتابي", severity: "medium" },
    { count: 3, action: "خصم من الراتب", severity: "high" },
    { count: 5, action: "إيقاف مؤقت عن العمل", severity: "critical" },
  ];

  const kpis = [
    { label: "مخالفات نشطة", value: items.length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "موظفين متأثرين", value: Object.keys(grouped).length, icon: Scale, color: "text-orange-600 bg-orange-50" },
    { label: "تصعيدات عالية", value: items.filter((v: any) => v.severity === "high" || v.severity === "critical").length, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
    { label: "تم الحل", value: (data?.data || []).filter((v: any) => v.status !== "active").length, icon: Shield, color: "text-green-600 bg-green-50" },
  ];

  return (
    <PageShell
      title="تصعيد الجزاءات"
      subtitle="نظام التصعيد التلقائي للمخالفات المتكررة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تصعيد الجزاءات" }]}
    >
      <KpiGrid items={kpis} />

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">سلم التصعيد</h4>
          <div className="flex gap-3">
            {escalationRules.map((r, i) => (
              <div key={i} className="flex-1 p-3 rounded-lg bg-gray-50 text-center">
                <Badge className={SEVERITY_LEVELS[r.severity]?.color}>{SEVERITY_LEVELS[r.severity]?.label}</Badge>
                <p className="text-sm mt-2 font-medium">{r.action}</p>
                <p className="text-xs text-gray-400 mt-1">{r.count}+ مخالفات</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {Object.entries(grouped).map(([name, vList]: [string, any[]]) => {
          const count = vList.length;
          const rule = [...escalationRules].reverse().find(r => count >= r.count) || escalationRules[0];
          return (
            <Card key={name} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AvatarInitial name={name} color="red" />
                    <div>
                      <p className="font-semibold">{name}</p>
                      <p className="text-sm text-gray-500">{count} مخالفة — {rule.action}</p>
                    </div>
                  </div>
                  <Badge className={SEVERITY_LEVELS[rule.severity]?.color}>{SEVERITY_LEVELS[rule.severity]?.label}</Badge>
                </div>
                <div className="mt-3 ms-13 space-y-1">
                  {vList.slice(0, 3).map((v: any) => (
                    <div key={v.id} className="text-sm text-gray-500 flex items-center justify-between">
                      <span>{v.type}: {v.description?.slice(0, 50)}</span>
                      <span className="text-red-500">{formatCurrency(Number(v.deduction || 0))}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {Object.keys(grouped).length === 0 && <Card><CardContent className="p-8 text-center text-gray-400">لا توجد مخالفات نشطة</CardContent></Card>}
      </div>
    </PageShell>
  );
}
