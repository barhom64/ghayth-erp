import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Phase A — HR recruitment on unified primitives.
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Briefcase, Users, UserCheck, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

const jobStatusMap: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوح", color: "bg-green-100 text-green-700" },
  closed: { label: "مغلق", color: "bg-red-100 text-red-700" },
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
};

const stageMap: Record<string, { label: string; color: string }> = {
  new: { label: "جديد", color: "bg-blue-100 text-blue-700" },
  screening: { label: "فرز", color: "bg-yellow-100 text-yellow-700" },
  interview: { label: "مقابلة", color: "bg-purple-100 text-purple-700" },
  offer: { label: "عرض", color: "bg-green-100 text-green-700" },
  hired: { label: "تم التوظيف", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

export default function RecruitmentPage() {
  const [, navigate] = useLocation();
  const { permissions } = useAppContext();
  const canManage = permissions.canManageEmployees;
  const [filters, setFilters] = useFilters();
  const { data: jobsData, refetch: refetchJobs } = useApiQuery<any>(["jobs"], "/recruitment/postings");
  const { data: appsData, refetch: refetchApps } = useApiQuery<any>(["applicants"], "/recruitment/applications");
  const { data: stats } = useApiQuery<any>(["recruitment-stats"], "/recruitment/stats");
  const jobs = jobsData?.data || [];
  const apps = appsData?.data || [];
  const filteredJobs = applyFilters(jobs, filters, { searchFields: ["title", "department"], statusField: "status" });
  const filteredApps = applyFilters(apps, filters, { searchFields: ["applicantName", "name"], statusField: "status" });

  const kpis = [
    { label: "وظائف مفتوحة", value: stats?.openPostings ?? jobs.filter((j: any) => j.status === "open").length, icon: Briefcase, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي المتقدمين", value: stats?.totalApplications ?? apps.length, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "طلبات جديدة", value: stats?.newApplications ?? apps.filter((a: any) => a.status === "new").length, icon: FileText, color: "text-yellow-600 bg-yellow-50" },
    { label: "مقابلات مجدولة", value: stats?.scheduledInterviews ?? apps.filter((a: any) => a.status === "interview").length, icon: UserCheck, color: "text-purple-600 bg-purple-50" },
  ];

  const jobActions = useInlineActions({
    endpoint: "/recruitment/postings",
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
    endpoint: "/recruitment/applications",
    queryKeys: [["applicants"], ["recruitment-stats"]],
    onSuccess: () => refetchApps(),
  });

  const appEditFields = [
    { key: "status", label: "المرحلة", type: "select" as const, options: Object.entries(stageMap).map(([k, v]) => ({ value: k, label: v.label })) },
    { key: "rating", label: "التقييم", type: "number" as const },
  ];

  const jobColumns: DataTableColumn<any>[] = [
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
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
            {(a.applicantName || a.name || "؟").charAt(0)}
          </div>
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
      render: (a) => <Badge className={stageMap[a.status || a.stage]?.color || ""}>{stageMap[a.status || a.stage]?.label || a.status || a.stage}</Badge>,
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
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="التوظيف والاستقطاب"
      subtitle="إدارة الوظائف المفتوحة وطلبات التوظيف"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link href="/hr/recruitment/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />وظيفة جديدة</Button>
          </Link>
          <Link href="/hr/recruitment/applicants/create">
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 me-1" />إضافة متقدم</Button>
          </Link>
        </div>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث...",
          statuses: [
            ...Object.entries(jobStatusMap).map(([k, v]) => ({ value: k, label: v.label })),
            ...Object.entries(stageMap).map(([k, v]) => ({ value: k, label: v.label })),
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredJobs.length + filteredApps.length}
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
