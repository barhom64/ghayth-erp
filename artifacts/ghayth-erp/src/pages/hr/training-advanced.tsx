import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { GraduationCap, Users, Award, BarChart3, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";

export default function TrainingAdvancedPage() {
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useApiQuery<any>(["training-stats"], "/hr/training/stats");
  const { data: programsData, isLoading: programsLoading, isError: programsError } = useApiQuery<any>(["training-programs"], "/hr/training/programs");
  const { data: enrollmentsData, isLoading: enrollmentsLoading, isError: enrollmentsError } = useApiQuery<any>(["training-enrollments"], "/hr/training/enrollments");

  const isLoading = statsLoading || programsLoading || enrollmentsLoading;
  const isError = statsError || programsError || enrollmentsError;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const stats = statsData || {};
  const programs = programsData?.data || [];
  const enrollments = enrollmentsData?.data || [];

  const completionRate = stats.totalEnrollments > 0
    ? Math.round((stats.completedEnrollments / stats.totalEnrollments) * 100) : 0;

  const kpis = [
    { label: "إجمالي البرامج", value: stats.totalPrograms ?? programs.length, icon: BookOpen, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "برامج نشطة", value: stats.activePrograms ?? 0, icon: GraduationCap, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "نسبة الإكمال", value: completionRate + "%", icon: Award, color: "text-purple-600 bg-purple-50" },
    { label: "المشاركين", value: stats.totalEnrollments ?? enrollments.length, icon: Users, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <PageShell
      title="تحليلات التدريب المتقدمة"
      subtitle="متابعة فعالية البرامج التدريبية ونتائجها"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تحليلات التدريب المتقدمة" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Card>
        <CardHeader><CardTitle className="text-base">البرامج حسب الحالة</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["upcoming", "active", "completed", "cancelled"].map((s) => {
              const label = s === "upcoming" ? "قادم" : s === "active" ? "جاري" : s === "completed" ? "مكتمل" : "ملغي";
              const count = programs.filter((p: any) => p.status === s).length;
              const color = s === "active" ? "bg-status-success-surface text-status-success-foreground" : s === "completed" ? "bg-status-info-surface text-status-info-foreground" : s === "cancelled" ? "bg-status-error-surface text-status-error-foreground" : "bg-status-warning-surface text-status-warning-foreground";
              return (
                <div key={s} className={cn("p-4 rounded-lg text-center", color)}>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-sm">{label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">أحدث التسجيلات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName || "-"}</span> },
              { key: "programTitle", header: "البرنامج", sortable: true, render: (v) => <span>{v.programTitle || "-"}</span> },
              { key: "status", header: "الحالة", sortable: true, render: (v) => <PageStatusBadge status={v.status} /> },
              { key: "score", header: "الدرجة", sortable: true, render: (v) => <span>{v.score ?? "-"}</span> },
            ] as DataTableColumn<any>[]}
            data={enrollments}
            noToolbar
            emptyMessage="لا توجد تسجيلات"
            pageSize={15}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
