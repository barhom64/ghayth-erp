import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Award, BarChart3, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";

export default function PerformanceAdvancedPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["performance"], "/hr/performance");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const items = data?.data || [];

  const avgScore = items.length > 0
    ? (items.reduce((s: number, p: any) => s + Number(p.overallScore || 0), 0) / items.length).toFixed(1)
    : "0";

  const kpis = [
    { label: "إجمالي التقييمات", value: items.length, icon: Target, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "متوسط الأداء", value: avgScore, icon: TrendingUp, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "الأعلى أداءً", value: items.filter((p: any) => Number(p.overallScore) >= 4).length, icon: Award, color: "text-purple-600 bg-purple-50" },
    { label: "يحتاج تطوير", value: items.filter((p: any) => Number(p.overallScore) < 3).length, icon: BarChart3, color: "text-orange-600 bg-orange-50" },
  ];

  const distribution = [
    { range: "ممتاز (4.5-5)", count: items.filter((p: any) => Number(p.overallScore) >= 4.5).length, color: "bg-status-success-surface0" },
    { range: "جيد جداً (3.5-4.4)", count: items.filter((p: any) => Number(p.overallScore) >= 3.5 && Number(p.overallScore) < 4.5).length, color: "bg-status-info-surface0" },
    { range: "جيد (2.5-3.4)", count: items.filter((p: any) => Number(p.overallScore) >= 2.5 && Number(p.overallScore) < 3.5).length, color: "bg-status-warning-surface0" },
    { range: "مقبول (1.5-2.4)", count: items.filter((p: any) => Number(p.overallScore) >= 1.5 && Number(p.overallScore) < 2.5).length, color: "bg-orange-500" },
    { range: "ضعيف (أقل من 1.5)", count: items.filter((p: any) => Number(p.overallScore) < 1.5).length, color: "bg-status-error-surface0" },
  ];

  return (
    <PageShell
      title="تحليلات الأداء المتقدمة"
      subtitle="تحليل مؤشرات الأداء والمقارنات المعيارية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تحليلات الأداء المتقدمة" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Card>
        <CardHeader><CardTitle className="text-base">توزيع التقييمات</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {distribution.map((d) => (
              <div key={d.range} className="flex items-center gap-3">
                <span className="text-sm w-40">{d.range}</span>
                <div className="flex-1 bg-surface-subtle rounded-full h-6 overflow-hidden">
                  <div className={cn("h-full rounded-full", d.color)} style={{ width: `${items.length > 0 ? (d.count / items.length) * 100 : 0}%` }} />
                </div>
                <span className="text-sm font-medium w-8 text-start">{d.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">أفضل الموظفين أداءً</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "rank", header: "#", render: (_v, i) => {
                return <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", i < 3 ? "bg-status-warning-surface text-status-warning-foreground" : "bg-surface-subtle text-status-neutral-foreground")}>{i + 1}</div>;
              } },
              { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
              { key: "overallScore", header: "التقييم", sortable: true, render: (v) => (
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className={cn("w-4 h-4", j < Number(v.overallScore) ? "text-yellow-400 fill-yellow-400" : "text-gray-200")} />
                  ))}
                  <span className="ms-2 font-bold">{Number(v.overallScore).toFixed(1)}</span>
                </div>
              ) },
              { key: "period", header: "الفترة", sortable: true, render: (v) => <span className="text-muted-foreground">{v.period || "-"}</span> },
            ] as DataTableColumn<any>[]}
            data={[...items].sort((a: any, b: any) => Number(b.overallScore || 0) - Number(a.overallScore || 0)).slice(0, 10)}
            noToolbar
            emptyMessage="لا توجد تقييمات"
            pageSize={10}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
