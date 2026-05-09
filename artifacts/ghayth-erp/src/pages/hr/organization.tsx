import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Network, Briefcase, MapPin, User } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function OrganizationPage() {
  const { data: depts, isLoading, isError } = useApiQuery<any>(["departments"], "/settings/departments");
  const { data: empData } = useApiQuery<any>(["employees"], "/employees");
  const items = depts?.data || [];
  const employees = empData?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const kpis = [
    { label: "الأقسام", value: items.length, icon: Building2, color: "text-blue-600 bg-blue-50" },
    { label: "الموظفين النشطين", value: employees.length, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "المناصب", value: [...new Set(employees.map((e: any) => e.jobTitle))].length, icon: Briefcase, color: "text-purple-600 bg-purple-50" },
    { label: "الفروع", value: [...new Set(employees.map((e: any) => e.branchName).filter(Boolean))].length || 1, icon: MapPin, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <PageShell
      title="الهيكل التنظيمي"
      subtitle="عرض الأقسام والإدارات والمناصب"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "الهيكل التنظيمي" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Card>
        <CardHeader><CardTitle className="text-base">الأقسام والإدارات</CardTitle></CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((d: any) => {
                const deptEmployees = employees.filter((e: any) => e.departmentName === d.name || e.departmentId === d.id);
                return (
                  <div key={d.id} className="p-4 border rounded-xl hover:shadow-md transition-shadow bg-white">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <span className="font-semibold block">{d.name}</span>
                        {d.nameEn && <span className="text-xs text-gray-400">{d.nameEn}</span>}
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-gray-500">
                      {d.manager && <div className="flex items-center gap-1"><User className="w-3.5 h-3.5" />المدير: {d.manager}</div>}
                      <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />الموظفين: {deptEmployees.length}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">لم يتم إعداد الأقسام بعد. اذهب إلى الإعدادات لإضافة الأقسام.</p>
          )}
        </CardContent>
      </Card>

      {employees.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">توزيع الموظفين حسب المنصب</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(
                employees.reduce((acc: Record<string, number>, e: any) => {
                  const title = e.jobTitle || "غير محدد";
                  acc[title] = (acc[title] || 0) + 1;
                  return acc;
                }, {})
              ).map(([title, count]) => (
                <div key={title} className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="font-bold text-lg">{count as number}</p>
                  <p className="text-xs text-gray-500">{title}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
