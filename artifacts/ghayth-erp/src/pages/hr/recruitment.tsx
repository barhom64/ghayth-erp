import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// Phase A — HR recruitment on unified primitives.
import { PageShell } from "@/components/page-shell";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Briefcase, Users, UserCheck, FileText } from "lucide-react";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useAppContext } from "@/contexts/app-context";
import { RECRUITMENT_STAGES } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const jobStatusMap: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوح", color: "bg-green-100 text-green-700" },
  closed: { label: "مغلق", color: "bg-red-100 text-red-700" },
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
};

export default function RecruitmentPage() {
  const [, navigate] = useLocation();
  const { permissions } = useAppContext();
  const canManage = permissions.canManageEmployees;
  const [filters, setFilters] = useFilters();
  const { data: jobsData, isLoading, isError, refetch: refetchJobs } = useApiQuery<any>(["jobs"], "/hr/recruitment/postings");
  const { data: appsData, refetch: refetchApps } = useApiQuery<any>(["applicants"], "/hr/recruitment/applications");
  const { data: stats } = useApiQuery<any>(["recruitment-stats"], "/hr/recruitment/stats");
  const jobs = jobsData?.data || [];
  const apps = appsData?.data || [];
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const filteredJobs = applyFilters(jobs, filters, { searchFields: ["title", "department"], statusField: "status" });
  const filteredApps = applyFilters(apps, filters, { searchFields: ["applicantName", "name"], statusField: "status" });

  const kpis = [
    { label: "وظائف مفتوحة", value: stats?.openPostings ?? jobs.filter((j: any) => j.status === "open").length, icon: Briefcase, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي المتقدمين", value: stats?.totalApplications ?? apps.length, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "طلبات جديدة", value: stats?.newApplications ?? apps.filter((a: any) => a.status === "new").length, icon: FileText, color: "text-yellow-600 bg-yellow-50" },
    { label: "مقابلات مجدولة", value: stats?.scheduledInterviews ?? apps.filter((a: any) => a.status === "interview").length, icon: UserCheck, color: "text-purple-600 bg-purple-50" },
  ];

  const jobActions = useInlineActions({
    endpoint: "/hr/recruitment/postings",
    queryKeys: [["jobs"], ["recruitment-stats"]],
    onSuccess: () => refetchJobs(),
  });

  const jobEditFields = [
    { key: "title", label: "المسمى الوظيفي" },
    { key: "department", label: "القسم" },
    { key: "location", label: "الموقع" },
    { key: "type", label: "النوع" },
    { key: "status", label: "الحالة", type: "select" as const, options: Object.entries(jobStatusMap).map(([k, v]) => ({ value: k, label: v.label })) },
  ];

  const appActions = useInlineActions({
    endpoint: "/hr/recruitment/applications",
    queryKeys: [["applicants"], ["recruitment-stats"]],
    onSuccess: () => refetchApps(),
  });

  const appEditFields = [
    { key: "status", label: "المرحلة", type: "select" as const, options: Object.entries(RECRUITMENT_STAGES).map(([k, v]) => ({ value: k, label: v.label })) },
    { key: "rating", label: "التقييم", type: "number" as const },
  ];

  const jobColumns: DataTableColumn<any>[] = [
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
    {
      key: "title",
      header: "المسمى الوظيفي",
      sortable: true,
      render: (j) => <span className="font-medium">{j.title}</span>,
    },
    { key: "department", header: "القسم", sortable: true, className: "text-gray-500", render: (j) => j.department || "-" },
    { key: "location", header: "الموقع", sortable: true, className: "text-gray-500", render: (j) => j.location || "-" },
    { key: "type", header: "النوع", sortable: true, className: "text-gray-500", render: (j) => j.type || "-" },
    {
      key: "applicantsCount",
      header: "المتقدمين",
      sortable: true,
      render: (j) => <span className="font-medium">{j.applicantsCount || apps.filter((a: any) => a.postingId === j.id).length}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (j) => <Badge className={jobStatusMap[j.status]?.color || ""}>{jobStatusMap[j.status]?.label || j.status}</Badge>,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (j) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            canEdit={canManage}
            onEdit={() => jobActions.startEdit(j.id, { title: j.title, department: j.department || "", location: j.location || "", type: j.type || "", status: j.status || "open" })}
            onDelete={() => jobActions.startDelete(j.id)}
            deletePerm="hr:delete"
          />
        </div>
      ),
    },
  ];

  const appColumns: DataTableColumn<any>[] = [
    {
      key: "applicantName",
      header: "الاسم",
      sortable: true,
      render: (a) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={a.applicantName || a.name} color="indigo" />
          <span className="font-medium">{a.applicantName || a.name}</span>
        </div>
      ),
    },
    { key: "postingTitle", header: "المنصب", sortable: true, className: "text-gray-500", render: (a) => a.postingTitle || a.position || "-" },
    { key: "email", header: "البريد", sortable: true, className: "text-gray-500", render: (a) => a.email || "-" },
    { key: "phone", header: "الهاتف", sortable: true, className: "text-gray-500", render: (a) => a.phone || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (a) => a.rating ? `${a.rating}/5` : "-" },
    {
      key: "status",
      header: "المرحلة",
      sortable: true,
      render: (a) => <Badge className={RECRUITMENT_STAGES[a.status || a.stage]?.color || ""}>{RECRUITMENT_STAGES[a.status || a.stage]?.label || a.status || a.stage}</Badge>,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (a) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            canEdit={canManage}
            onEdit={() => appActions.startEdit(a.id, { status: a.status || a.stage || "new", rating: a.rating || 0 })}
            onDelete={() => appActions.startDelete(a.id)}
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
      title="التوظيف والاستقطاب"
      subtitle="إدارة الوظائف المفتوحة وطلبات التوظيف"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link href="/hr/recruitment/create">
            <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />وظيفة جديدة</GuardedButton>
          </Link>
          <Link href="/hr/recruitment/applicants/create">
            <GuardedButton perm="hr:create" size="sm" variant="outline"><Plus className="h-4 w-4 me-1" />إضافة متقدم</GuardedButton>
          </Link>
        </div>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث...",
          statuses: [
            ...Object.entries(jobStatusMap).map(([k, v]) => ({ value: k, label: v.label })),
            ...Object.entries(RECRUITMENT_STAGES).map(([k, v]) => ({ value: k, label: v.label })),
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredJobs.length + filteredApps.length}
      />

      <BulkActionsBar
        entityType="job-posting"
        items={filteredJobs}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filteredJobs.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["jobs"], ["recruitment-stats"]]}
        actions={["export"]}
        csvColumns={[
          { key: "title", label: "المسمى الوظيفي" },
          { key: "department", label: "القسم" },
          { key: "location", label: "الموقع" },
          { key: "type", label: "النوع" },
          { key: "applicantsCount", label: "عدد المتقدمين" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="التوظيف_والاستقطاب"
      />

      <Tabs defaultValue="jobs" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="jobs">الوظائف ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applicants">المتقدمين ({apps.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs">
          <DataTable
            columns={jobColumns}
            data={filteredJobs}
            noToolbar
            emptyMessage="لا توجد وظائف"
            pageSize={20}
            onRowClick={(j) => navigate(`/hr/recruitment/jobs/${j.id}`)}
            renderRowExtras={(j) => {
              if (jobActions.editingId === j.id) {
                return (
                  <InlineEditForm
                    fields={jobEditFields}
                    form={jobActions.editForm}
                    setForm={jobActions.setEditForm}
                    onSave={() => jobActions.handleSave(j.id, jobActions.editForm)}
                    onCancel={jobActions.cancelEdit}
                    isPending={jobActions.isPending}
                  />
                );
              }
              if (jobActions.deletingId === j.id) {
                return (
                  <InlineDeleteConfirm
                    onConfirm={() => jobActions.handleDelete(j.id)}
                    onCancel={jobActions.cancelDelete}
                    isPending={jobActions.isPending}
                    itemName={j.title}
                    entityType="application"
                    entityId={j.id}
                  />
                );
              }
              return null;
            }}
          />
        </TabsContent>
        <TabsContent value="applicants">
          <DataTable
            columns={appColumns}
            data={filteredApps}
            noToolbar
            emptyMessage="لا يوجد متقدمين"
            pageSize={20}
            renderRowExtras={(a) => {
              if (appActions.editingId === a.id) {
                return (
                  <InlineEditForm
                    fields={appEditFields}
                    form={appActions.editForm}
                    setForm={appActions.setEditForm}
                    onSave={() => appActions.handleSave(a.id, appActions.editForm)}
                    onCancel={appActions.cancelEdit}
                    isPending={appActions.isPending}
                  />
                );
              }
              if (appActions.deletingId === a.id) {
                return (
                  <InlineDeleteConfirm
                    onConfirm={() => appActions.handleDelete(a.id)}
                    onCancel={appActions.cancelDelete}
                    isPending={appActions.isPending}
                    itemName={a.applicantName || a.name}
                    entityType="application"
                    entityId={a.id}
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
