import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Award, BarChart3, Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">تحليلات الأداء المتقدمة</h1>
        <p className="text-sm text-muted-foreground mt-0.5">تحليل مؤشرات الأداء والمقارنات المعيارية</p>
      </div>

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
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-start">#</th>
              <th className="p-3 text-start">الموظف</th>
              <th className="p-3 text-start">التقييم</th>
              <th className="p-3 text-start">الفترة</th>
            </tr></thead>
            <tbody>
              {items.sort((a: any, b: any) => Number(b.overallScore || 0) - Number(a.overallScore || 0)).slice(0, 10).map((p: any, i: number) => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", i < 3 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700")}>{i + 1}</div>
                  </td>
                  <td className="p-3 font-medium">{p.employeeName}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} className={cn("w-4 h-4", j < Number(p.overallScore) ? "text-yellow-400 fill-yellow-400" : "text-gray-200")} />
                      ))}
                      <span className="ms-2 font-bold">{Number(p.overallScore).toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-500">{p.period || "-"}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد تقييمات</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
