import { useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
  exportToCSV,
  FormShell,
  FormSelectField,
  FormDateField,
  FormGrid,
} from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, Plus, Clock, Users, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

// HR-REV — نموذج إسناد الموظف لوردية. كان حصريًّا في صفحة «إدارة الورديات
// المتقدمة» المكرّرة (مسارها يرتدّ هنا)؛ نُقل إلى تبويب «التعيينات» حتى لا تفقد
// الواجهة القدرة على إنشاء التعيينات (تبويب التعيينات كان للعرض فقط).
// كل الـ IDs مطلوبة — النموذج الأصلي تتبّع assignmentId دون حقل، فكان يرسل 0
// ويُرفض FK؛ المنتقي أُضيف ليصلح ذلك.
const shiftAssignSchema = z.object({
  assignmentId: z.string().min(1, "الموظف مطلوب"),
  shiftId: z.string().min(1, "الوردية مطلوبة"),
  startDate: z.string().min(1, "تاريخ البدء مطلوب"),
});
type ShiftAssignForm = z.infer<typeof shiftAssignSchema>;
const defaultShiftAssignForm: ShiftAssignForm = {
  assignmentId: "", shiftId: "", startDate: "",
};

export default function ShiftsPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["shifts"], "/hr/shifts");
  const { data: assignmentsData } = useApiQuery<any>(["shift-assignments"], "/hr/shift-assignments");
  const { data: empData } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const employees = empData?.data || [];
  const [showAssignForm, setShowAssignForm] = useState(false);
  const assignMut = useApiMutation<unknown, { assignmentId: number; shiftId: number; startDate: string }>(
    "/hr/shift-assignments",
    "POST",
    [["shift-assignments"]],
    { successMessage: "تم تعيين الوردية" },
  );
  const handleAssign = async (values: ShiftAssignForm) => {
    await assignMut.mutateAsync({
      assignmentId: Number(values.assignmentId),
      shiftId: Number(values.shiftId),
      startDate: values.startDate,
    });
    setShowAssignForm(false);
  };
  const items = data?.data || [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);
  const assignments = assignmentsData?.data || [];
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const [filters, setFilters] = useFilters();

  const filteredAssignments = applyFilters(assignments, filters, { searchFields: ["employeeName", "shiftName"] });

  const assignmentColumns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "employeeName", header: "الموظف", sortable: true, render: (a) => <span className="font-medium">{a.employeeName || "-"}</span> },
    { key: "shiftName", header: "الوردية", sortable: true, render: (a) => a.shiftName || "-" },
    { key: "startDate", header: "من", sortable: true, className: "text-muted-foreground", render: (a) => a.startDate || "-" },
    { key: "endDate", header: "إلى", sortable: true, className: "text-muted-foreground", render: (a) => a.endDate || "مستمر" },
    { key: "startTime", header: "الوقت", sortable: true, className: "font-mono text-sm", render: (a) => `${a.startTime} - ${a.endTime}` },
  ];

  const kpis = [
    { label: "إجمالي الورديات", value: items.length, icon: CalendarClock, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "ورديات نشطة", value: items.filter((s: any) => s.status === "active" || s.isActive !== false).length, icon: Clock, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "تعيينات الورديات", value: assignments.length, icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "الوردية الافتراضية", value: items.filter((s: any) => s.isDefault).length, icon: Sun, color: "text-orange-600 bg-orange-50" },
  ];

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/hr/shifts",
    queryKeys: [["shifts"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "اسم الوردية" },
    { key: "startTime", label: "وقت البدء" },
    { key: "endTime", label: "وقت الانتهاء" },
    { key: "breakMinutes", label: "الاستراحة (دقيقة)", type: "number" as const },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="إدارة الورديات"
      subtitle="تنظيم وجدولة ورديات العمل"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "إدارة الورديات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_shifts"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "ورديات العمل", total: printRows.length },
              items: printRows.map((s: any) => ({
                "الاسم": s.name || "—",
                "الكود": s.code || "—",
                "وقت البداية": s.startTime || "—",
                "وقت النهاية": s.endTime || "—",
                "الساعات": s.totalHours ?? "—",
                "أيام العمل": s.workDays || "—",
                "الحالة": s.status || "—",
              })),
            })}
          />
          <Link href="/hr/shifts/create">
            <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة وردية</GuardedButton>
          </Link>
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <BulkActionsBar
        entityType="shift"
        items={items}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(items.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["shifts"]]}
        actions={["export"]}
        csvColumns={[
          { key: "name", label: "اسم الوردية" },
          { key: "startTime", label: "وقت البدء" },
          { key: "endTime", label: "وقت الانتهاء" },
          { key: "breakMinutes", label: "الاستراحة (دقيقة)" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="الورديات"
      />

      <Tabs defaultValue="shifts" dir="rtl">
        <TabsList>
          <TabsTrigger value="shifts">الورديات</TabsTrigger>
          <TabsTrigger value="assignments">تعيينات الموظفين</TabsTrigger>
        </TabsList>
        <TabsContent value="shifts">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((s: any) => {
              const isNight = s.startTime && parseInt(s.startTime.split(":")[0]) >= 18;
              return (
                <Card key={s.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isNight ? <Moon className="w-5 h-5 text-indigo-500" /> : <Sun className="w-5 h-5 text-status-warning" />}
                        <span className="font-semibold">{s.name}</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        {s.isDefault && <Badge className="bg-status-info-surface text-status-info-foreground text-xs">افتراضية</Badge>}
                        <PageStatusBadge status={s.status || (s.isActive !== false ? "active" : "inactive")} />
                        <RowActions
                          onEdit={() => startEdit(s.id, { name: s.name, startTime: s.startTime || "", endTime: s.endTime || "", breakMinutes: s.breakMinutes || s.breakDuration || 0 })}
                          onDelete={() => startDelete(s.id)}
                          deletePerm="hr:delete"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between p-2 bg-surface-subtle rounded-lg">
                        <span className="text-muted-foreground">وقت البدء</span>
                        <span className="font-mono font-medium text-status-success-foreground">{s.startTime}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-surface-subtle rounded-lg">
                        <span className="text-muted-foreground">وقت الانتهاء</span>
                        <span className="font-mono font-medium text-status-error-foreground">{s.endTime}</span>
                      </div>
                      {(s.breakDuration || s.breakMinutes) && (
                        <div className="flex items-center justify-between p-2 bg-surface-subtle rounded-lg">
                          <span className="text-muted-foreground">الاستراحة</span>
                          <span>{s.breakDuration || s.breakMinutes} دقيقة</span>
                        </div>
                      )}
                      {s.days && (
                        <div className="flex items-center justify-between p-2 bg-surface-subtle rounded-lg">
                          <span className="text-muted-foreground">أيام العمل</span>
                          <span className="text-xs">{s.days || s.workDays}</span>
                        </div>
                      )}
                    </div>
                    {editingId === s.id && (
                      <div className="mt-3">
                        <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(s.id, values)} onCancel={cancelEdit} isPending={isPending} />
                      </div>
                    )}
                    {deletingId === s.id && (
                      <div className="mt-3">
                        <InlineDeleteConfirm onConfirm={() => handleDelete(s.id)} onCancel={cancelDelete} isPending={isPending} itemName={s.name} entityType="shift" entityId={s.id} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {items.length === 0 && <p className="text-muted-foreground col-span-3 text-center py-8">لا توجد ورديات</p>}
          </div>
        </TabsContent>
        <TabsContent value="assignments">
          <div className="space-y-4">
            <div>
              <GuardedButton perm="hr:create" size="sm" onClick={() => setShowAssignForm(!showAssignForm)}>
                <Plus className="h-4 w-4 me-1" />{showAssignForm ? "إلغاء" : "تعيين وردية لموظف"}
              </GuardedButton>
            </div>
            {showAssignForm && (
              <Card className="mb-4 border-status-info-surface">
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
                      {/* employee/assignment picker — submit used to send
                          `Number("") = 0` as assignmentId and FK-fail. */}
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
                          ...items.map((s: any) => ({
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
            <AdvancedFilters
              config={{
                searchPlaceholder: "بحث بالموظف أو الوردية...",
                showDateRange: true,
              }}
              values={filters}
              onChange={setFilters}
              onExportCSV={() =>
                exportToCSV(
                  filteredAssignments || [],
                  [
                    { key: "employeeName", label: "الموظف" },
                    { key: "shiftName", label: "الوردية" },
                    { key: "startDate", label: "تاريخ البداية" },
                    { key: "endDate", label: "تاريخ النهاية" },
                    { key: "startTime", label: "وقت البداية" },
                    { key: "endTime", label: "وقت النهاية" },
                    { key: "branchName", label: "الفرع" },
                  ],
                  "تعيينات-الورديات",
                )
              }
              resultCount={filteredAssignments.length}
            />
            <DataTable
              columns={assignmentColumns}
              onSortedDataChange={setPrintRows}
              data={filteredAssignments}
              noToolbar
              emptyMessage="لا توجد تعيينات"
              pageSize={20}
            />
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
