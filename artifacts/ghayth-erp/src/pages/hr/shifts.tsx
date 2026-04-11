import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, Plus, Clock, Users, Sun, Moon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function ShiftsPage() {
  const { data, refetch } = useApiQuery<any>(["shifts"], "/hr/shifts");
  const { data: assignmentsData } = useApiQuery<any>(["shift-assignments"], "/hr/shift-assignments");
  const items = data?.data || [];
  const assignments = assignmentsData?.data || [];
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filteredAssignments = applyFilters(assignments, filters, { searchFields: ["employeeName", "shiftName"] });
  const { sortedData: sortedAssignments, sortState, handleSort } = useSortedData(filteredAssignments);
  const paginatedAssignments = sortedAssignments?.slice((page - 1) * pageSize, page * pageSize);

  const kpis = [
    { label: "إجمالي الورديات", value: items.length, icon: CalendarClock, color: "text-blue-600 bg-blue-50" },
    { label: "ورديات نشطة", value: items.filter((s: any) => s.status === "active" || s.isActive !== false).length, icon: Clock, color: "text-green-600 bg-green-50" },
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">إدارة الورديات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">تنظيم وجدولة ورديات العمل</p>
        </div>
        <Link href="/hr/shifts/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة وردية</Button>
        </Link>
      </div>

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
                        {isNight ? <Moon className="w-5 h-5 text-indigo-500" /> : <Sun className="w-5 h-5 text-yellow-500" />}
                        <span className="font-semibold">{s.name}</span>
                      </div>
                      <div className="flex gap-1 items-center">
                        {s.isDefault && <Badge className="bg-blue-100 text-blue-700 text-xs">افتراضية</Badge>}
                        <Badge className={s.status === "active" || s.isActive !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                          {s.status === "active" || s.isActive !== false ? "نشطة" : "غير نشطة"}
                        </Badge>
                        <RowActions
                          onEdit={() => startEdit(s.id, { name: s.name, startTime: s.startTime || "", endTime: s.endTime || "", breakMinutes: s.breakMinutes || s.breakDuration || 0 })}
                          onDelete={() => startDelete(s.id)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className="text-gray-500">وقت البدء</span>
                        <span className="font-mono font-medium text-green-600">{s.startTime}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className="text-gray-500">وقت الانتهاء</span>
                        <span className="font-mono font-medium text-red-600">{s.endTime}</span>
                      </div>
                      {(s.breakDuration || s.breakMinutes) && (
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <span className="text-gray-500">الاستراحة</span>
                          <span>{s.breakDuration || s.breakMinutes} دقيقة</span>
                        </div>
                      )}
                      {s.days && (
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <span className="text-gray-500">أيام العمل</span>
                          <span className="text-xs">{s.days || s.workDays}</span>
                        </div>
                      )}
                    </div>
                    {editingId === s.id && (
                      <div className="mt-3">
                        <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(s.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
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
            {items.length === 0 && <p className="text-gray-400 col-span-3 text-center py-8">لا توجد ورديات</p>}
          </div>
        </TabsContent>
        <TabsContent value="assignments">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالموظف أو الوردية...",
              showDateRange: true,
            }}
            values={filters}
            onChange={(v) => { setFilters(v); setPage(1); }}
            resultCount={filteredAssignments.length}
          />
          <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
                  <SortableTableHead column="shiftName" label="الوردية" sortState={sortState} onSort={handleSort} />
                  <SortableTableHead column="startDate" label="من" sortState={sortState} onSort={handleSort} />
                  <SortableTableHead column="endDate" label="إلى" sortState={sortState} onSort={handleSort} />
                  <SortableTableHead column="startTime" label="الوقت" sortState={sortState} onSort={handleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(paginatedAssignments || []).map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{a.employeeName || "-"}</td>
                    <td className="p-3">{a.shiftName || "-"}</td>
                    <td className="p-3 text-gray-500">{a.startDate || "-"}</td>
                    <td className="p-3 text-gray-500">{a.endDate || "مستمر"}</td>
                    <td className="p-3 font-mono text-sm">{a.startTime} - {a.endTime}</td>
                  </tr>
                ))}
                {filteredAssignments.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد تعيينات</td></tr>}
              </TableBody>
            </Table>
            <PaginationBar page={page} pageSize={pageSize} total={filteredAssignments.length} onPageChange={setPage} />
          </div></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
