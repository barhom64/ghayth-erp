import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Users, Award, BarChart3, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TrainingAdvancedPage() {
  const { data: statsData } = useApiQuery<any>(["training-stats"], "/training/stats");
  const { data: programsData } = useApiQuery<any>(["training-programs"], "/training/programs");
  const { data: enrollmentsData } = useApiQuery<any>(["training-enrollments"], "/training/enrollments");
  const stats = statsData || {};
  const programs = programsData?.data || [];
  const enrollments = enrollmentsData?.data || [];

  const completionRate = stats.totalEnrollments > 0
    ? Math.round((stats.completedEnrollments / stats.totalEnrollments) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">تحليلات التدريب المتقدمة</h1>
        <p className="text-sm text-muted-foreground mt-0.5">متابعة فعالية البرامج التدريبية ونتائجها</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي البرامج", value: stats.totalPrograms ?? programs.length, icon: BookOpen, color: "text-blue-600 bg-blue-50" },
          { label: "برامج نشطة", value: stats.activePrograms ?? 0, icon: GraduationCap, color: "text-green-600 bg-green-50" },
          { label: "نسبة الإكمال", value: completionRate + "%", icon: Award, color: "text-purple-600 bg-purple-50" },
          { label: "المشاركين", value: stats.totalEnrollments ?? enrollments.length, icon: Users, color: "text-orange-600 bg-orange-50" },
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
        <CardHeader><CardTitle className="text-base">البرامج حسب الحالة</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["upcoming", "active", "completed", "cancelled"].map((s) => {
              const label = s === "upcoming" ? "قادم" : s === "active" ? "جاري" : s === "completed" ? "مكتمل" : "ملغي";
              const count = programs.filter((p: any) => p.status === s).length;
              const color = s === "active" ? "bg-green-50 text-green-700" : s === "completed" ? "bg-blue-50 text-blue-700" : s === "cancelled" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700";
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
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-start">الموظف</th>
              <th className="p-3 text-start">البرنامج</th>
              <th className="p-3 text-start">الحالة</th>
              <th className="p-3 text-start">الدرجة</th>
            </tr></thead>
            <tbody>
              {enrollments.slice(0, 15).map((e: any) => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{e.employeeName || "-"}</td>
                  <td className="p-3">{e.programTitle || "-"}</td>
                  <td className="p-3"><Badge className={e.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>{e.status === "completed" ? "مكتمل" : e.status === "enrolled" ? "مسجل" : e.status}</Badge></td>
                  <td className="p-3">{e.score ?? "-"}</td>
                </tr>
              ))}
              {enrollments.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد تسجيلات</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
