import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, Users, Plus, Sun, Moon, Clock } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import {
  FormShell, FormSelectField, FormDateField, FormGrid,
} from "@/components/form-shell";

// All three IDs required — the original form tracked `assignmentId`
// in state but had NO UI input for it, so every submit sent
// `Number("") = 0` and the server FK-rejected. Migration adds the
// employee/assignment picker that was always supposed to be there.
const shiftAssignSchema = z.object({
  assignmentId: z.string().min(1, "الموظف مطلوب"),
  shiftId: z.string().min(1, "الوردية مطلوبة"),
  startDate: z.string().min(1, "تاريخ البدء مطلوب"),
});
type ShiftAssignForm = z.infer<typeof shiftAssignSchema>;
const defaultShiftAssignForm: ShiftAssignForm = {
  assignmentId: "", shiftId: "", startDate: "",
};

export default function ShiftsManagementPage() {
  const { data: shiftsData, isLoading: shiftsLoading, isError: shiftsError } = useApiQuery<any>(["shifts"], "/hr/shifts");
  const { data: assignmentsData, isLoading: assignmentsLoading, isError: assignmentsError } = useApiQuery<any>(["shift-assignments"], "/hr/shift-assignments");
  const { data: empData, isLoading: empLoading, isError: empError } = useApiQuery<any>(["employees"], "/employees?limit=200");

  const [showAssignForm, setShowAssignForm] = useState(false);
  // HR-U4 — successMessage + onSuccess بدل buildErrorToast اليدوي.
  const assignMut = useApiMutation<unknown, { assignmentId: number; shiftId: number; startDate: string }>(
    "/hr/shift-assignments",
    "POST",
    [["shift-assignments"]],
    { successMessage: "تم تعيين الوردية" },
  );

  const isLoading = shiftsLoading || assignmentsLoading || empLoading;
  const isError = shiftsError || assignmentsError || empError;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const shifts = shiftsData?.data || [];
  const assignments = assignmentsData?.data || [];
  const employees = empData?.data || [];

  const handleAssign = async (values: ShiftAssignForm) => {
    await assignMut.mutateAsync({
      assignmentId: Number(values.assignmentId),
      shiftId: Number(values.shiftId),
      startDate: values.startDate,
    });
    setShowAssignForm(false);
  };

  return (
    <PageShell
      title="إدارة الورديات المتقدمة"
      subtitle="تعيين الموظفين للورديات وإدارة الجداول"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "إدارة الورديات المتقدمة" }]}
    >
      <HrTabsNav />
      <KpiGrid items={[
        { label: "الورديات", value: shifts.length, icon: CalendarClock, color: "text-blue-600 bg-blue-50" },
        { label: "نشطة", value: shifts.filter((s: any) => s.status === "active").length, icon: Clock, color: "text-green-600 bg-green-50" },
        { label: "التعيينات", value: assignments.length, icon: Users, color: "text-purple-600 bg-purple-50" },
        { label: "الموظفين", value: employees.length, icon: Users, color: "text-orange-600 bg-orange-50" },
      ]} />

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
            <GuardedButton perm="hr:create" size="sm" onClick={() => setShowAssignForm(!showAssignForm)}>
              <Plus className="h-4 w-4 me-1" />{showAssignForm ? "إلغاء" : "تعيين وردية لموظف"}
            </GuardedButton>
          </div>
          {showAssignForm && (
            <Card className="mb-4 border-blue-200">
              <CardContent className="p-4">
                <FormShell
                  schema={shiftAssignSchema}
                  defaultValues={defaultShiftAssignForm}
                  submitLabel="تعيين"
                  secondaryActions={
                    <Button type="button" variant="outline" onClick={() => setShowAssignForm(false)}>
                      إلغاء
                    </Button>
                  }
                  onSubmit={async (values, ctx) => {
                    await handleAssign(values);
                    ctx.reset();
                  }}
                >
                  <FormGrid cols={3}>
                    {/* New: employee/assignment picker that was missing from the
                        original form — the submit used to send `Number("") = 0`
                        as assignmentId and FK-fail at the server. */}
                    <FormSelectField
                      name="assignmentId"
                      label="الموظف"
                      required
                      options={[
                        { value: "", label: "اختر موظفاً" },
                        ...employees.map((e: any) => ({
                          value: String(e.activeAssignmentId ?? e.assignmentId ?? e.id),
                          label: e.name,
                        })),
                      ]}
                    />
                    <FormSelectField
                      name="shiftId"
                      label="الوردية"
                      required
                      options={[
                        { value: "", label: "اختر" },
                        ...shifts.map((s: any) => ({
                          value: String(s.id),
                          label: `${s.name} (${s.startTime}-${s.endTime})`,
                        })),
                      ]}
                    />
                    <FormDateField name="startDate" label="من تاريخ" required />
                  </FormGrid>
                </FormShell>
              </CardContent>
            </Card>
          )}
          <DataTable
            columns={[
              { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName || "-"}</span> },
              { key: "shiftName", header: "الوردية", sortable: true, render: (v) => <span>{v.shiftName || "-"}</span> },
              { key: "startTime", header: "الوقت", sortable: true, render: (v) => <span className="font-mono">{v.startTime} - {v.endTime}</span> },
              { key: "startDate", header: "من", sortable: true, render: (v) => <span className="text-gray-500">{v.startDate || "-"}</span> },
              { key: "endDate", header: "إلى", sortable: true, render: (v) => <span className="text-gray-500">{v.endDate || "مستمر"}</span> },
            ] as DataTableColumn<any>[]}
            data={assignments}
            noToolbar
            emptyMessage="لا توجد تعيينات"
            pageSize={20}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
