import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";

function ScoreDot({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-gray-400">-</span>;
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-3 h-3 rounded-full", color)} />
      <span className="font-bold">{score}%</span>
    </div>
  );
}

export default function Evaluation360HistoryPage() {
  const [, params] = useRoute("/hr/evaluation-360/history/:employeeId");
  const employeeId = params?.employeeId ?? "";

  const { data, isLoading } = useApiQuery<any>(
    ["evaluation-history", employeeId],
    `/hr/employees/${employeeId}/evaluation-history`
  );

  const employee = data?.employee;
  const history = data?.history || [];

  // Build chart data
  const chartData = history.filter((h: any) => h.finalScore != null);
  const maxScore = 100;

  return (
    <PageShell
      title="تاريخ التقييمات"
      subtitle={employee ? `${employee.name} · ${employee.jobTitle}` : undefined}
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/evaluation-360", label: "التقييم 360°" }, { label: "تاريخ التقييمات" }]}
      loading={isLoading}
      actions={
        <Link href="/hr/evaluation-360">
          <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4 me-1" />عودة</Button>
        </Link>
      }
    >

      {!isLoading && history.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-gray-400">
            لا توجد دورات تقييم لهذا الموظف بعد
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      {chartData.length > 1 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-4">مخطط تطور الأداء عبر الزمن</h3>
            <div className="flex items-end gap-4 h-40">
              {chartData.map((h: any, i: number) => {
                const pct = (Number(h.finalScore) / maxScore) * 100;
                const color = Number(h.finalScore) >= 80 ? "bg-green-500" :
                  Number(h.finalScore) >= 60 ? "bg-yellow-500" : "bg-red-500";
                return (
                  <div key={h.id} className="flex flex-col items-center gap-1 flex-1">
                    <span className={cn("text-xs font-bold", Number(h.finalScore) >= 80 ? "text-green-600" : Number(h.finalScore) >= 60 ? "text-yellow-600" : "text-red-600")}>
                      {h.finalScore}%
                    </span>
                    <div className="w-full flex items-end" style={{ height: "120px" }}>
                      <div
                        className={cn("w-full rounded-t transition-all", color)}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 text-center truncate w-full">{h.period}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 text-start font-medium">الفترة</th>
              <th className="p-3 text-start font-medium">تاريخ البدء</th>
              <th className="p-3 text-start font-medium">النظام</th>
              <th className="p-3 text-start font-medium">المدير</th>
              <th className="p-3 text-start font-medium">الزملاء</th>
              <th className="p-3 text-start font-medium">360° النهائي</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {history.map((h: any) => (
              <tr key={h.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{h.period}</td>
                <td className="p-3 text-gray-500">{h.startDate ? new Date(h.startDate).toLocaleDateString('ar-SA') : '-'}</td>
                <td className="p-3"><ScoreDot score={h.systemScore} /></td>
                <td className="p-3"><ScoreDot score={h.managerScore} /></td>
                <td className="p-3"><ScoreDot score={h.peerScore} /></td>
                <td className="p-3"><ScoreDot score={h.finalScore} /></td>
                <td className="p-3">
                  <Link href={`/hr/evaluation-360/${h.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs">عرض</Button>
                  </Link>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا توجد سجلات</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
