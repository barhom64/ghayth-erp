import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";

function ScoreDot({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground">-</span>;
  const color = score >= 80 ? "bg-status-success-surface0" : score >= 60 ? "bg-status-warning-surface0" : "bg-status-error-surface0";
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

  const { data, isLoading, isError } = useApiQuery<any>(
    ["evaluation-history", employeeId],
    `/hr/employees/${employeeId}/evaluation-history`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

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
          <CardContent className="p-8 text-center text-muted-foreground">
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
                const color = Number(h.finalScore) >= 80 ? "bg-status-success-surface0" :
                  Number(h.finalScore) >= 60 ? "bg-status-warning-surface0" : "bg-status-error-surface0";
                return (
                  <div key={h.id} className="flex flex-col items-center gap-1 flex-1">
                    <span className={cn("text-xs font-bold", Number(h.finalScore) >= 80 ? "text-status-success-foreground" : Number(h.finalScore) >= 60 ? "text-status-warning-foreground" : "text-status-error-foreground")}>
                      {h.finalScore}%
                    </span>
                    <div className="w-full flex items-end" style={{ height: "120px" }}>
                      <div
                        className={cn("w-full rounded-t transition-all", color)}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground text-center truncate w-full">{h.period}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <DataTable
        columns={[
          { key: "period", header: "الفترة", sortable: true, render: (v) => <span className="font-medium">{v.period}</span> },
          { key: "startDate", header: "تاريخ البدء", sortable: true, render: (v) => <span className="text-muted-foreground">{formatDateAr(v.startDate)}</span> },
          { key: "systemScore", header: "النظام", sortable: true, render: (v) => <ScoreDot score={v.systemScore} /> },
          { key: "managerScore", header: "المدير", sortable: true, render: (v) => <ScoreDot score={v.managerScore} /> },
          { key: "peerScore", header: "الزملاء", sortable: true, render: (v) => <ScoreDot score={v.peerScore} /> },
          { key: "finalScore", header: "360° النهائي", sortable: true, render: (v) => <ScoreDot score={v.finalScore} /> },
          { key: "id", header: "", render: (v) => (
            <Link href={`/hr/evaluation-360/${v.id}`}>
              <Button variant="ghost" size="sm" className="text-xs">عرض</Button>
            </Link>
          ) },
        ] as DataTableColumn<any>[]}
        data={history}
        noToolbar
        emptyMessage="لا توجد سجلات"
        pageSize={20}
      />
    </PageShell>
  );
}
