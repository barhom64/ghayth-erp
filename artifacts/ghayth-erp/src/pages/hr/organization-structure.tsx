import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Network, ChevronDown } from "lucide-react";
import { PageShell } from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";

export default function OrganizationStructurePage() {
  const { data: depts, isLoading: deptsLoading, isError: deptsError } = useApiQuery<any>(["departments"], "/settings/departments");
  const { data: empData, isLoading: empLoading, isError: empError } = useApiQuery<any>(["employees"], "/employees?limit=200");

  const isLoading = deptsLoading || empLoading;
  const isError = deptsError || empError;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const departments = depts?.data || [];
  const employees = empData?.data || [];

  const kpis = [
    { label: "الأقسام", value: departments.length, icon: Building2, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "الموظفين", value: employees.length, icon: Users, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "المناصب", value: [...new Set(employees.map((e: any) => e.jobTitle))].length, icon: Network, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <PageShell
      title="الهيكل التنظيمي المفصل"
      subtitle="عرض شجري للأقسام والمسؤولين والعلاقات التنظيمية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "الهيكل التنظيمي المفصل" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <div className="flex justify-center">
        <div className="text-center">
          <div className="inline-block p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-lg mb-4">
            <Building2 className="w-8 h-8 mx-auto mb-1" />
            <p className="font-bold text-lg">المنشأة</p>
            <p className="text-sm opacity-80">{employees.length} موظف</p>
          </div>
          <div className="w-0.5 h-8 bg-gray-300 mx-auto" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {departments.map((dept: any) => {
              const deptEmps = employees.filter((e: any) => e.departmentName === dept.name || e.departmentId === dept.id);
              return (
                <Card key={dept.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-status-info-surface flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-status-info-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{dept.name}</p>
                        <p className="text-xs text-muted-foreground">{deptEmps.length} موظف</p>
                      </div>
                    </div>
                    {deptEmps.length > 0 && (
                      <div className="space-y-1 mt-2 border-t pt-2">
                        {deptEmps.slice(0, 5).map((e: any) => (
                          <div key={e.id} className="flex items-center gap-2 text-sm">
                            <AvatarInitial name={e.name} size="sm" />
                            <span>{e.name}</span>
                            <span className="text-muted-foreground text-xs ms-auto">{e.jobTitle}</span>
                          </div>
                        ))}
                        {deptEmps.length > 5 && <p className="text-xs text-muted-foreground text-center">+{deptEmps.length - 5} آخرين</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {departments.length === 0 && <p className="text-muted-foreground py-8">لم يتم إعداد الأقسام بعد</p>}
        </div>
      </div>
    </PageShell>
  );
}
