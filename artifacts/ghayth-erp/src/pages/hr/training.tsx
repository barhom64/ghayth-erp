import { Link, useLocation } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
// Phase A — HR training on unified primitives.
import { PageShell } from "@/components/page-shell";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PageStatusBadge } from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, GraduationCap, Users, BookOpen, Award } from "lucide-react";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "planned",   label: "مخطط"   },
  { value: "upcoming",  label: "قادم"   },
  { value: "active",    label: "جاري"   },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغي"  },
];

export default function TrainingPage() {
  const [, navigate] = useLocation();
  const { permissions } = useAppContext();
  const canManage = permissions.canManageEmployees;
  const [filters, setFilters] = useFilters();
  const { data, isLoading, isError, refetch: refetchPrograms } = useApiQuery<any>(["training-programs"], "/hr/training/programs");
  const { data: statsData } = useApiQuery<any>(["training-stats"], "/hr/training/stats");
  const { data: enrollmentsData, refetch: refetchEnrollments } = useApiQuery<any>(["training-enrollments"], "/hr/training/enrollments");
  const items = data?.data || [];
  const enrollments = enrollmentsData?.data || [];
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const filteredEnrollments = applyFilters(enrollments, filters, { searchFields: ["employeeName"], statusField: "status" });
  const stats = statsData || {};

  const filtered = applyFilters(items, filters, { searchFields: ["title", "trainer"], statusField: "status" });

  const kpis = [
    { label: "إجمالي البرامج", value: stats.totalPrograms ?? items.length, icon: BookOpen, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "برامج نشطة", value: stats.activePrograms ?? items.filter((i: any) => i.status === "active").length, icon: GraduationCap, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "إجمالي التسجيلات", value: stats.totalEnrollments ?? enrollments.length, icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "مكتملة", value: stats.completedEnrollments ?? 0, icon: Award, color: "text-orange-600 bg-orange-50" },
  ];

  const programActions = useInlineActions({
    endpoint: "/hr/training/programs",
    queryKeys: [["training-programs"], ["training-stats"]],
    onSuccess: () => refetchPrograms(),
  });

  const programEditFields = [
    { key: "title", label: "العنوان" },
    { key: "trainer", label: "المدرب" },
    { key: "location", label: "الموقع" },
    { key: "capacity", label: "السعة", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: STATUS_OPTIONS as unknown as { value: string; label: string }[] },
  ];

  const enrollmentActions = useInlineActions({
    endpoint: "/hr/training/enrollments",
    queryKeys: [["training-enrollments"], ["training-stats"]],
    onSuccess: () => refetchEnrollments(),
  });

  const enrollmentEditFields = [
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "enrolled", label: "مسجل" }, { value: "completed", label: "مكتمل" }, { value: "cancelled", label: "ملغي" }] },
    { key: "score", label: "الدرجة", type: "number" as const },
  ];

  const enrollmentColumns: DataTableColumn<any>[] = [
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
    { key: "employeeName", header: "الموظف", sortable: true, render: (e) => <span className="font-medium">{e.employeeName || "-"}</span> },
    { key: "programTitle", header: "البرنامج", sortable: true, render: (e) => e.programTitle || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (e) => <PageStatusBadge status={e.status} /> },
    { key: "score", header: "الدرجة", sortable: true, render: (e) => e.score ?? "-" },
    {
      key: "actions",
      header: "إجراءات",
      render: (e) => (
        <div onClick={(ev) => ev.stopPropagation()}>
          <RowActions
            canEdit={canManage}
            onEdit={() => enrollmentActions.startEdit(e.id, { status: e.status || "enrolled", score: e.score || 0 })}
            onDelete={() => enrollmentActions.startDelete(e.id)}
            deletePerm="hr:delete"
          />
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="برامج التدريب"
      subtitle="إدارة برامج التدريب وتسجيلات الموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/training/create">
          <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة برنامج</GuardedButton>
        </Link>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في البرامج...",
          statuses: STATUS_OPTIONS as unknown as { value: string; label: string }[],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <BulkActionsBar
        entityType="training-program"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["training-programs"], ["training-stats"]]}
        actions={["export"]}
        csvColumns={[
          { key: "title", label: "عنوان البرنامج" },
          { key: "trainer", label: "المدرب" },
          { key: "startDate", label: "تاريخ البدء" },
          { key: "endDate", label: "تاريخ الانتهاء" },
          { key: "location", label: "الموقع" },
          { key: "capacity", label: "السعة" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="برامج_التدريب"
      />

      <Tabs defaultValue="programs" dir="rtl">
        <TabsList>
          <TabsTrigger value="programs">البرامج</TabsTrigger>
          <TabsTrigger value="enrollments">التسجيلات</TabsTrigger>
        </TabsList>
        <TabsContent value="programs">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t: any) => (
              <Card key={t.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/hr/training/${t.id}`} className="flex items-center gap-2 hover:text-status-info-foreground transition-colors">
                      <GraduationCap className="w-5 h-5 text-status-info" />
                      <span className="font-semibold">{t.title}</span>
                    </Link>
                    <div className="flex items-center gap-1">
                      <PageStatusBadge status={t.status} />
                      <RowActions
                        canEdit={canManage}
                        onEdit={() => programActions.startEdit(t.id, { title: t.title, trainer: t.trainer || "", location: t.location || "", capacity: t.capacity || t.maxParticipants || 0, status: t.status || "planned" })}
                        onDelete={() => programActions.startDelete(t.id)}
                        deletePerm="hr:delete"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {t.trainer && <p>المدرب: <span className="text-status-neutral-foreground">{t.trainer}</span></p>}
                    {t.startDate && <p>التاريخ: {formatDateAr(t.startDate)} {t.endDate ? `— ${formatDateAr(t.endDate)}` : ""}</p>}
                    {t.location && <p>الموقع: {t.location}</p>}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span>المشاركين: {t.enrolled || t.currentParticipants || 0}/{t.capacity || t.maxParticipants || 0}</span>
                      {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
                    </div>
                  </div>
                  {programActions.editingId === t.id && (
                    <div className="mt-3">
                      <InlineEditForm fields={programEditFields} form={programActions.editForm} setForm={programActions.setEditForm} onSave={() => programActions.handleSave(t.id, programActions.editForm)} onCancel={programActions.cancelEdit} isPending={programActions.isPending} />
                    </div>
                  )}
                  {programActions.deletingId === t.id && (
                    <div className="mt-3">
                      <InlineDeleteConfirm onConfirm={() => programActions.handleDelete(t.id)} onCancel={programActions.cancelDelete} isPending={programActions.isPending} itemName={t.title} entityType="training" entityId={t.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground col-span-3 text-center py-8">لا توجد برامج تدريبية</p>}
          </div>
        </TabsContent>
        <TabsContent value="enrollments">
          <DataTable
            columns={enrollmentColumns}
            data={filteredEnrollments}
            noToolbar
            emptyMessage="لا توجد تسجيلات"
            pageSize={20}
            onRowClick={(row) => navigate(`/hr/training/${row.programId || row.id}`)}
            renderRowExtras={(e) => {
              if (enrollmentActions.editingId === e.id) {
                return (
                  <InlineEditForm
                    fields={enrollmentEditFields}
                    form={enrollmentActions.editForm}
                    setForm={enrollmentActions.setEditForm}
                    onSave={() => enrollmentActions.handleSave(e.id, enrollmentActions.editForm)}
                    onCancel={enrollmentActions.cancelEdit}
                    isPending={enrollmentActions.isPending}
                  />
                );
              }
              if (enrollmentActions.deletingId === e.id) {
                return (
                  <InlineDeleteConfirm
                    onConfirm={() => enrollmentActions.handleDelete(e.id)}
                    onCancel={enrollmentActions.cancelDelete}
                    isPending={enrollmentActions.isPending}
                    itemName={e.employeeName}
                    entityType="training"
                    entityId={e.id}
                  />
                );
              }
              return null;
            }}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
