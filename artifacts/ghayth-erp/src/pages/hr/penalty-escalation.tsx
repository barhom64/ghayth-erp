import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Scale, Shield } from "lucide-react";
import { PageShell } from "@workspace/ui-core";
import { SEVERITY_LEVELS } from "@/lib/hr-type-maps";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";

// The discipline regulation (hr_discipline_regulation) escalates every
// article across four occurrence levels — penalty1..penalty4. That four-
// step structure IS the escalation ladder; this page surfaces it instead
// of inventing client-side thresholds. The card only renders when a
// regulation is actually configured for the company.
const ESCALATION_TIERS = [
  { level: 1, label: "المخالفة الأولى", severity: "low" },
  { level: 2, label: "المخالفة الثانية", severity: "medium" },
  { level: 3, label: "المخالفة الثالثة", severity: "high" },
  { level: 4, label: "المخالفة الرابعة فأكثر", severity: "critical" },
] as const;

export default function PenaltyEscalationPage() {
  const violationsQ = useApiQuery<any>(["violations"], "/hr/violations");
  const regulationQ = useApiQuery<any>(["discipline-regulation"], "/hr/discipline/regulation");

  if (violationsQ.isLoading || regulationQ.isLoading) return <LoadingSpinner />;
  if (violationsQ.isError || regulationQ.isError) return <ErrorState />;

  const allViolations: any[] = violationsQ.data?.data || [];
  const regulation: any[] = regulationQ.data?.data || [];
  const regulationConfigured = regulation.length > 0;

  // A violation counts toward escalation while it is not rejected — the
  // lifecycle is pending/approved/rejected; "active" never existed, which
  // is why this page used to render empty.
  const items = allViolations.filter((v: any) => v.status !== "rejected");
  const rejectedCount = allViolations.filter((v: any) => v.status === "rejected").length;

  const grouped: Record<string, any[]> = items.reduce((acc: Record<string, any[]>, v: any) => {
    const name = v.employeeName || "غير معروف";
    if (!acc[name]) acc[name] = [];
    acc[name].push(v);
    return acc;
  }, {} as Record<string, any[]>);

  // How many regulation articles escalate all the way to termination —
  // a real, DB-backed signal that the ladder reflects the live regulation.
  const terminationArticles = regulation.filter((r: any) => r.isTermination).length;

  const kpis = [
    { label: "مخالفات قيد التصعيد", value: items.length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "موظفين متأثرين", value: Object.keys(grouped).length, icon: Scale, color: "text-orange-600 bg-orange-50" },
    { label: "تصعيدات عالية", value: items.filter((v: any) => v.severity === "high" || v.severity === "critical").length, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
    { label: "مخالفات مرفوضة", value: rejectedCount, icon: Shield, color: "text-status-success-foreground bg-status-success-surface" },
  ];

  return (
    <PageShell
      title="تصعيد الجزاءات"
      subtitle="تصعيد المخالفات المتكررة وفق لائحة الجزاءات"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات والجزاءات" },
        { label: "تصعيد الجزاءات" },
      ]}
    >
      <KpiGrid items={kpis} />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">سلم التصعيد — وفق لائحة الجزاءات</h4>
            {regulationConfigured && (
              <span className="text-xs text-muted-foreground">
                {regulation.length} مادة · {terminationArticles} مادة تصل للفصل
              </span>
            )}
          </div>
          {regulationConfigured ? (
            <div className="flex flex-col gap-3 md:flex-row">
              {ESCALATION_TIERS.map((t) => (
                <div key={t.level} className="flex-1 p-3 rounded-lg bg-surface-subtle text-center">
                  <Badge className={SEVERITY_LEVELS[t.severity]?.color}>{SEVERITY_LEVELS[t.severity]?.label}</Badge>
                  <p className="text-sm mt-2 font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">العقوبة المقرّرة في اللائحة لكل مادة</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              لم تُعدّ لائحة الجزاءات لهذه الشركة — يرجى إعدادها من صفحة لائحة الجزاءات أولاً.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {Object.entries(grouped).map(([name, vList]: [string, any[]]) => {
          const count = vList.length;
          const tier = ESCALATION_TIERS[Math.min(count, ESCALATION_TIERS.length) - 1];
          return (
            <Card key={name} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AvatarInitial name={name} color="red" />
                    <div>
                      <p className="font-semibold">{name}</p>
                      <p className="text-sm text-muted-foreground">{count} مخالفة — {tier.label}</p>
                    </div>
                  </div>
                  <Badge className={SEVERITY_LEVELS[tier.severity]?.color}>{SEVERITY_LEVELS[tier.severity]?.label}</Badge>
                </div>
                <div className="mt-3 ms-13 space-y-1">
                  {vList.slice(0, 3).map((v: any) => (
                    <div key={v.id} className="text-sm text-muted-foreground flex items-center justify-between">
                      <span>{v.type}: {v.description?.slice(0, 50)}</span>
                      <span className="text-status-error">{formatCurrency(Number(v.deduction || 0))}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {Object.keys(grouped).length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد مخالفات قيد التصعيد</CardContent></Card>}
      </div>
    </PageShell>
  );
}
