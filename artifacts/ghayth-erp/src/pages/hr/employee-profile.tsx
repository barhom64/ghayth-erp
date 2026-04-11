import { useApiQuery } from "@/lib/api";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Mail, Phone, Briefcase, Calendar, MapPin, Clock, Star, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmployeeProfilePage() {
  const [, params] = useRoute("/hr/employee-profile/:id");
  const id = params?.id;
  const { data: emp } = useApiQuery<any>(["employee", id || ""], `/employees/${id}`, !!id) as any;

  if (!emp) return <div className="text-center py-12 text-gray-400">جاري التحميل...</div>;


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/employees"><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4 me-1" />العودة</Button></Link>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
              {(emp.name || "؟").charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold">{emp.name}</h2>
                <StatusBadge status={emp.status} />
              </div>
              <p className="text-gray-500 mb-1">{emp.jobTitle || "موظف"} — {emp.departmentName || "غير محدد"}</p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-3">
                {emp.empNumber && <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" />{emp.empNumber}</span>}
                {emp.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{emp.email}</span>}
                {emp.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" />{emp.phone}</span>}
                {emp.branchName && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{emp.branchName}</span>}
                {emp.hireDate && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />تاريخ التعيين: {emp.hireDate}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="attendance" dir="rtl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="attendance">الحضور</TabsTrigger>
          <TabsTrigger value="leaves">الإجازات</TabsTrigger>
          <TabsTrigger value="tasks">المهام</TabsTrigger>
          <TabsTrigger value="training">التدريب</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">التاريخ</th>
                <th className="p-3 text-start">الحضور</th>
                <th className="p-3 text-start">الانصراف</th>
                <th className="p-3 text-start">التأخير</th>
                <th className="p-3 text-start">الحالة</th>
              </tr></thead>
              <tbody>
                {(emp.attendance || []).map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{a.date}</td>
                    <td className="p-3 font-mono text-green-600">{a.checkIn ? new Date(a.checkIn).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="p-3 font-mono text-red-600">{a.checkOut ? new Date(a.checkOut).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="p-3">{a.lateMinutes > 0 ? <span className="text-red-500">{a.lateMinutes} دقيقة</span> : "-"}</td>
                    <td className="p-3"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
                {(!emp.attendance || emp.attendance.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد سجلات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">النوع</th>
                <th className="p-3 text-start">من</th>
                <th className="p-3 text-start">إلى</th>
                <th className="p-3 text-start">الأيام</th>
                <th className="p-3 text-start">الحالة</th>
              </tr></thead>
              <tbody>
                {(emp.leaves || []).map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{l.leaveTypeName || "-"}</td>
                    <td className="p-3 text-gray-500">{l.startDate}</td>
                    <td className="p-3 text-gray-500">{l.endDate}</td>
                    <td className="p-3 font-medium">{l.days}</td>
                    <td className="p-3"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
                {(!emp.leaves || emp.leaves.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد إجازات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">المهمة</th>
                <th className="p-3 text-start">المشروع</th>
                <th className="p-3 text-start">الأولوية</th>
                <th className="p-3 text-start">الحالة</th>
              </tr></thead>
              <tbody>
                {(emp.tasks || []).map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{t.title}</td>
                    <td className="p-3 text-gray-500">{t.projectName || "-"}</td>
                    <td className="p-3"><Badge variant="outline">{t.priority || "عادي"}</Badge></td>
                    <td className="p-3"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
                {(!emp.tasks || emp.tasks.length === 0) && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد مهام</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="training">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">الدورة</th>
                <th className="p-3 text-start">النوع</th>
                <th className="p-3 text-start">الحالة</th>
              </tr></thead>
              <tbody>
                {(emp.trainings || []).map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{t.courseTitle || "-"}</td>
                    <td className="p-3 text-gray-500">{t.courseType || "-"}</td>
                    <td className="p-3"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
                {(!emp.trainings || emp.trainings.length === 0) && <tr><td colSpan={3} className="p-8 text-center text-gray-400">لا توجد تدريبات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
