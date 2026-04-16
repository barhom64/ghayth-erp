import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Award, BarChart3, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function PerformanceAdvancedPage() {
  const { data } = useApiQuery<any>(["performance"], "/hr/performance");
  const items = data?.data || [];

  const avgScore = items.length > 0
    ? (items.reduce((s: number, p: any) => s + Number(p.overallScore || 0), 0) / items.length).toFixed(1)
    : "0";

  const distribution = [
    { range: "ممتاز (4.5-5)", count: items.filter((p: any) => Number(p.overallScore) >= 4.5).length, color: "bg-green-500" },
    { range: "جيد جداً (3.5-4.4)", count: items.filter((p: any) => Number(p.overallScore) >= 3.5 && Number(p.overallScore) < 4.5).length, color: "bg-blue-500" },
    { range: "جيد (2.5-3.4)", count: items.filter((p: any) => Number(p.overallScore) >= 2.5 && Number(p.overallScore) < 3.5).length, color: "bg-yellow-500" },
    { range: "مقبول (1.5-2.4)", count: items.filter((p: any) => Number(p.overallScore) >= 1.5 && Number(p.overallScore) < 2.5).length, color: "bg-orange-500" },
    { range: "ضعيف (أقل من 1.5)", count: items.filter((p: any) => Number(p.overallScore) < 1.5).length, color: "bg-red-500" },
  ];

  return (
    <PageShell
      title="تحليلات الأداء المتقدمة"
      subtitle="تحليل مؤشرات الأداء والمقارنات المعيارية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تحليلات الأداء المتقدمة" }]}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي التقييمات", value: items.length, icon: Target, color: "text-blue-600 bg-blue-50" },
          { label: "متوسط الأداء", value: avgScore, icon: TrendingUp, color: "text-green-600 bg-green-50" },
          { label: "الأعلى أداءً", value: items.filter((p: any) => Number(p.overallScore) >= 4).length, icon: Award, color: "text-purple-600 bg-purple-50" },
          { label: "يحتاج تطوير", value: items.filter((p: any) => Number(p.overallScore) < 3).length, icon: BarChart3, color: "text-orange-600 bg-orange-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-2xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">توزيع التقييمات</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {distribution.map((d) => (
              <div key={d.range} className="flex items-center gap-3">
                <span className="text-sm w-40">{d.range}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
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
                return <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", i < 3 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700")}>{i + 1}</div>;
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
              { key: "period", header: "الفترة", sortable: true, render: (v) => <span className="text-gray-500">{v.period || "-"}</span> },
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
