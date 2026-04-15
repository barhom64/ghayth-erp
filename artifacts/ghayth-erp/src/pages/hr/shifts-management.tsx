import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, Users, Plus, Sun, Moon, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";

export default function ShiftsManagementPage() {
  const { data: shiftsData } = useApiQuery<any>(["shifts"], "/hr/shifts");
  const { data: assignmentsData } = useApiQuery<any>(["shift-assignments"], "/hr/shift-assignments");
  const { data: empData } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const shifts = shiftsData?.data || [];
  const assignments = assignmentsData?.data || [];
  const employees = empData?.data || [];

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({ assignmentId: "", shiftId: "", startDate: "" });
  // HR-U4 — successMessage + onSuccess بدل buildErrorToast اليدوي.
  const assignMut = useApiMutation("/hr/shift-assignments", "POST", [["shift-assignments"]], {
    successMessage: "تم تعيين الوردية",
  });

  const handleAssign = () => {
    assignMut.mutate(
      {
        assignmentId: Number(assignForm.assignmentId),
        shiftId: Number(assignForm.shiftId),
        startDate: assignForm.startDate,
      },
      {
        onSuccess: () => {
          setShowAssignForm(false);
          setAssignForm({ assignmentId: "", shiftId: "", startDate: "" });
        },
      },
    );
  };

  return (
    <PageShell
      title="إدارة الورديات المتقدمة"
      subtitle="تعيين الموظفين للورديات وإدارة الجداول"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "إدارة الورديات المتقدمة" }]}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "الورديات", value: shifts.length, icon: CalendarClock, color: "text-blue-600 bg-blue-50" },
          { label: "نشطة", value: shifts.filter((s: any) => s.status === "active").length, icon: Clock, color: "text-green-600 bg-green-50" },
          { label: "التعيينات", value: assignments.length, icon: Users, color: "text-purple-600 bg-purple-50" },
          { label: "الموظفين", value: employees.length, icon: Users, color: "text-orange-600 bg-orange-50" },
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

      <Tabs defaultValue="shifts" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="shifts">الورديات</TabsTrigger>
          <TabsTrigger value="assign">تعيين الموظفين</TabsTrigger>
        </TabsList>
        <TabsContent value="shifts">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map((s: any) => {
              const isNight = s.startTime && parseInt(s.startTime.split(":")[0]) >= 18;
              const assignedCount = assignments.filter((a: any) => a.shiftId === s.id).length;
              return (
                <Card key={s.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isNight ? <Moon className="w-5 h-5 text-indigo-500" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                        <span className="font-semibold">{s.name}</span>
                      </div>
                      {s.isDefault && <Badge className="bg-blue-100 text-blue-700 text-xs">افتراضية</Badge>}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between p-2 bg-gray-50 rounded"><span>البداية</span><span className="font-mono text-green-600">{s.startTime}</span></div>
                      <div className="flex justify-between p-2 bg-gray-50 rounded"><span>النهاية</span><span className="font-mono text-red-600">{s.endTime}</span></div>
                      <div className="flex justify-between p-2 bg-gray-50 rounded"><span>الموظفين</span><span className="font-medium">{assignedCount}</span></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {shifts.length === 0 && <p className="col-span-3 text-center text-gray-400 py-8">لا توجد ورديات</p>}
          </div>
        </TabsContent>
        <TabsContent value="assign">
          <div className="mb-4">
            <Button size="sm" onClick={() => setShowAssignForm(!showAssignForm)}>
              <Plus className="h-4 w-4 me-1" />{showAssignForm ? "إلغاء" : "تعيين وردية لموظف"}
            </Button>
          </div>
          {showAssignForm && (
            <Card className="mb-4 border-blue-200">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><Label>الوردية</Label>
                    <select className="w-full border rounded-md p-2 mt-1" value={assignForm.shiftId} onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })}>
                      <option value="">اختر</option>
                      {shifts.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                    </select>
                  </div>
                  <div><Label>من تاريخ</Label><div className="mt-1"><DatePicker value={assignForm.startDate} onChange={(v) => setAssignForm({ ...assignForm, startDate: v })} /></div></div>
                  <div className="flex items-end"><Button onClick={handleAssign} disabled={!assignForm.shiftId || assignMut.isPending}>تعيين</Button></div>
                </div>
              </CardContent>
            </Card>
          )}
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-start">الموظف</th>
                <th className="p-3 text-start">الوردية</th>
                <th className="p-3 text-start">الوقت</th>
                <th className="p-3 text-start">من</th>
                <th className="p-3 text-start">إلى</th>
              </tr></thead>
              <tbody>
                {assignments.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{a.employeeName || "-"}</td>
                    <td className="p-3">{a.shiftName || "-"}</td>
                    <td className="p-3 font-mono">{a.startTime} - {a.endTime}</td>
                    <td className="p-3 text-gray-500">{a.startDate || "-"}</td>
                    <td className="p-3 text-gray-500">{a.endDate || "مستمر"}</td>
                  </tr>
                ))}
                {assignments.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد تعيينات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
