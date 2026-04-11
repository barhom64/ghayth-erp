import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Network, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OrganizationStructurePage() {
  const { data: depts } = useApiQuery<any>(["departments"], "/settings/departments");
  const { data: empData } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const departments = depts?.data || [];
  const employees = empData?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الهيكل التنظيمي المفصل</h1>
        <p className="text-sm text-muted-foreground mt-0.5">عرض شجري للأقسام والمسؤولين والعلاقات التنظيمية</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "الأقسام", value: departments.length, icon: Building2, color: "text-blue-600 bg-blue-50" },
          { label: "الموظفين", value: employees.length, icon: Users, color: "text-green-600 bg-green-50" },
          { label: "المناصب", value: [...new Set(employees.map((e: any) => e.jobTitle))].length, icon: Network, color: "text-purple-600 bg-purple-50" },
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
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold">{dept.name}</p>
                        <p className="text-xs text-gray-400">{deptEmps.length} موظف</p>
                      </div>
                    </div>
                    {deptEmps.length > 0 && (
                      <div className="space-y-1 mt-2 border-t pt-2">
                        {deptEmps.slice(0, 5).map((e: any) => (
                          <div key={e.id} className="flex items-center gap-2 text-sm">
                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs">{(e.name || "").charAt(0)}</div>
                            <span>{e.name}</span>
                            <span className="text-gray-400 text-xs ms-auto">{e.jobTitle}</span>
                          </div>
                        ))}
                        {deptEmps.length > 5 && <p className="text-xs text-gray-400 text-center">+{deptEmps.length - 5} آخرين</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {departments.length === 0 && <p className="text-gray-400 py-8">لم يتم إعداد الأقسام بعد</p>}
        </div>
      </div>
    </div>
  );
}
