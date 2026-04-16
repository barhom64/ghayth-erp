import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Users, UserCheck, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const stageMap: Record<string, { label: string; color: string }> = {
  new: { label: "جديد", color: "bg-blue-100 text-blue-700" },
  screening: { label: "فرز", color: "bg-yellow-100 text-yellow-700" },
  interview: { label: "مقابلة", color: "bg-purple-100 text-purple-700" },
  offer: { label: "عرض", color: "bg-green-100 text-green-700" },
  hired: { label: "تم التوظيف", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

export default function RecruitmentAdvancedPage() {
  const { data: stats } = useApiQuery<any>(["recruitment-stats"], "/recruitment/stats");
  const { data: appsData } = useApiQuery<any>(["applicants"], "/recruitment/applications");
  const apps = appsData?.data || [];

  const pipeline = Object.entries(stageMap).map(([key, val]) => ({
    stage: key,
    label: val.label,
    color: val.color,
    count: apps.filter((a: any) => (a.status || a.stage) === key).length,
  }));

  return (
    <PageShell
      title="تحليلات التوظيف المتقدمة"
      subtitle="إحصائيات ومؤشرات عمليات التوظيف"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تحليلات التوظيف المتقدمة" }]}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "وظائف مفتوحة", value: stats?.openPostings ?? 0, icon: Briefcase, color: "text-blue-600 bg-blue-50" },
          { label: "إجمالي المتقدمين", value: stats?.totalApplications ?? apps.length, icon: Users, color: "text-green-600 bg-green-50" },
          { label: "تم التوظيف", value: apps.filter((a: any) => a.status === "hired").length, icon: UserCheck, color: "text-purple-600 bg-purple-50" },
          { label: "معدل التحويل", value: apps.length > 0 ? Math.round((apps.filter((a: any) => a.status === "hired").length / apps.length) * 100) + "%" : "0%", icon: BarChart3, color: "text-orange-600 bg-orange-50" },
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
              { key: "status", header: "المرحلة", sortable: true, render: (v) => <Badge className={stageMap[v.status]?.color || ""}>{stageMap[v.status]?.label || v.status}</Badge> },
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
