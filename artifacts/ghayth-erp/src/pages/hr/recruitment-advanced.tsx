import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Users, UserCheck, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { RECRUITMENT_STAGES } from "@/lib/hr-type-maps";

export default function RecruitmentAdvancedPage() {
  const { data: stats } = useApiQuery<any>(["recruitment-stats"], "/recruitment/stats");
  const { data: appsData } = useApiQuery<any>(["applicants"], "/recruitment/applications");
  const apps = appsData?.data || [];

  const pipeline = Object.entries(RECRUITMENT_STAGES).map(([key, val]) => ({
    stage: key,
    label: val.label,
    color: val.color,
    count: apps.filter((a: any) => (a.status || a.stage) === key).length,
  }));

  const kpis = [
    { label: "وظائف مفتوحة", value: stats?.openPostings ?? 0, icon: Briefcase, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي المتقدمين", value: stats?.totalApplications ?? apps.length, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "تم التوظيف", value: apps.filter((a: any) => a.status === "hired").length, icon: UserCheck, color: "text-purple-600 bg-purple-50" },
    { label: "معدل التحويل", value: apps.length > 0 ? Math.round((apps.filter((a: any) => a.status === "hired").length / apps.length) * 100) + "%" : "0%", icon: BarChart3, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <PageShell
      title="تحليلات التوظيف المتقدمة"
      subtitle="إحصائيات ومؤشرات عمليات التوظيف"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تحليلات التوظيف المتقدمة" }]}
    >
      <KpiGrid items={kpis} />

      <Card>
        <CardHeader><CardTitle className="text-base">مسار التوظيف</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {pipeline.map((p) => (
              <div key={p.stage} className="flex-1 text-center">
                <div className={cn("p-3 rounded-lg mb-2", p.color)}>
                  <p className="text-2xl font-bold">{p.count}</p>
                </div>
                <p className="text-xs font-medium">{p.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">آخر المتقدمين</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "applicantName", header: "الاسم", sortable: true, render: (v) => <span className="font-medium">{v.applicantName || v.name}</span> },
              { key: "postingTitle", header: "المنصب", sortable: true, render: (v) => <span className="text-gray-500">{v.postingTitle || v.position || "-"}</span> },
              { key: "email", header: "البريد", sortable: true, render: (v) => <span className="text-gray-500">{v.email || "-"}</span> },
              { key: "rating", header: "التقييم", sortable: true, render: (v) => <span>{v.rating ? `${v.rating}/5` : "-"}</span> },
              { key: "status", header: "المرحلة", sortable: true, render: (v) => <Badge className={RECRUITMENT_STAGES[v.status]?.color || ""}>{RECRUITMENT_STAGES[v.status]?.label || v.status}</Badge> },
            ] as DataTableColumn<any>[]}
            data={apps}
            noToolbar
            emptyMessage="لا يوجد متقدمين"
            pageSize={15}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
