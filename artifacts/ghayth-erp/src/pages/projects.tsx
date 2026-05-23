import { useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FolderKanban, Plus, Activity, CheckCircle, DollarSign, Eye,
  AlertTriangle, Clock, Target, Flag, ShieldAlert, TrendingUp,
  BarChart2, ListTodo,
} from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { ProjectsTabsNav } from "@/components/shared/projects-tabs-nav";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

const PROJECT_STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "completed", label: "مكتمل" },
  { value: "on_hold", label: "متوقف" },
  { value: "planning", label: "تخطيط" },
  { value: "cancelled", label: "ملغي" },
];

function OverviewTab() {
  const { data: overview } = useApiQuery<any>(["projects-overview"], "/projects/stats/overview");
  const c = overview?.counts;
  const b = overview?.budget;
  const t = overview?.tasks;

  return (
    <div className="space-y-6">
      <KpiGrid items={[
        { label: "إجمالي المشاريع", value: c?.total ?? 0, icon: FolderKanban, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "نشطة", value: c?.active ?? 0, icon: Activity, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "متأخرة", value: c?.slipping ?? 0, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "إجمالي الميزانية", value: formatCurrency(b?.total ?? 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "تخطيط", value: c?.planning ?? 0, color: "bg-surface-subtle text-status-neutral-foreground" },
          { label: "نشطة", value: c?.active ?? 0, color: "bg-status-info-surface text-status-info-foreground" },
          { label: "متوقفة", value: c?.onHold ?? 0, color: "bg-status-warning-surface text-status-warning-foreground" },
          { label: "مكتملة", value: c?.completed ?? 0, color: "bg-status-success-surface text-status-success-foreground" },
          { label: "ملغاة", value: c?.cancelled ?? 0, color: "bg-status-error-surface text-status-error-foreground" },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <CardContent className="p-3">
              <Badge className={s.color}>{s.label}</Badge>
              <p className="text-2xl font-bold mt-2">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {t && t.total > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ListTodo className="w-4 h-4" /> ملخص المهام</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-sm">
              <div className="p-2 rounded bg-surface-subtle"><p className="text-lg font-bold">{t.total}</p><p className="text-muted-foreground">إجمالي</p></div>
              <div className="p-2 rounded bg-status-info-surface"><p className="text-lg font-bold text-status-info-foreground">{t.inProgress}</p><p className="text-muted-foreground">جاري</p></div>
              <div className="p-2 rounded bg-status-success-surface"><p className="text-lg font-bold text-status-success-foreground">{t.done}</p><p className="text-muted-foreground">مكتمل</p></div>
              <div className="p-2 rounded bg-status-error-surface"><p className="text-lg font-bold text-status-error-foreground">{t.blocked}</p><p className="text-muted-foreground">محجوب</p></div>
              <div className="p-2 rounded bg-orange-50"><p className="text-lg font-bold text-orange-600">{t.overdue}</p><p className="text-muted-foreground">متأخر</p></div>
            </div>
            {t.total > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span>نسبة الإنجاز</span>
                  <span>{Math.round((t.done / t.total) * 100)}%</span>
                </div>
                <Progress value={(t.done / t.total) * 100} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(overview?.slippingProjects?.length ?? 0) > 0 && (
          <Card className="border-status-error-surface">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-status-error-foreground">
                <AlertTriangle className="w-4 h-4" /> مشاريع متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overview.slippingProjects.map((p: any) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-status-error-surface cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.managerName || "—"} • انتهاء {formatDateAr(p.endDate)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={p.progress || 0} className="h-2 w-16" />
                      <span className="text-xs font-medium">{p.progress || 0}%</span>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {(overview?.recentProjects?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> المشاريع النشطة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overview.recentProjects.map((p: any) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-surface-subtle cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.managerName || "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatCurrency(p.budget || 0)}</span>
                      <Progress value={p.progress || 0} className="h-2 w-16" />
                      <span className="text-xs font-medium">{p.progress || 0}%</span>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {(overview?.upcomingMilestones?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="w-4 h-4 text-orange-500" /> معالم قادمة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overview.upcomingMilestones.map((m: any) => (
                <Link key={m.id} href={`/projects/${m.projectId}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-surface-subtle cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.projectName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDateAr(m.targetDate)}</span>
                      <PageStatusBadge status={m.status} domain="project" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {(overview?.openRisks?.length ?? 0) > 0 && (
          <Card className="border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-orange-600">
                <ShieldAlert className="w-4 h-4" /> مخاطر مفتوحة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overview.openRisks.map((r: any) => (
                <Link key={r.id} href={`/projects/${r.projectId}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-orange-50 cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.projectName}</p>
                    </div>
                    <Badge className={
                      r.riskLevel === "critical" ? "bg-status-error-surface text-status-error-foreground" :
                      r.riskLevel === "high" ? "bg-orange-100 text-orange-700" :
                      r.riskLevel === "medium" ? "bg-status-warning-surface text-status-warning-foreground" :
                      "bg-status-success-surface text-status-success-foreground"
                    }>{r.riskLevel === "critical" ? "حرج" : r.riskLevel === "high" ? "عالٍ" : r.riskLevel === "medium" ? "متوسط" : "منخفض"}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">إجراءات سريعة</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link href="/projects/create"><GuardedButton perm="projects:create" size="sm" className="gap-1"><Plus className="h-3 w-3" /> مشروع جديد</GuardedButton></Link>
            <Link href="/projects/gantt"><Button variant="outline" size="sm" className="gap-1"><BarChart2 className="h-3 w-3" /> مخطط غانت</Button></Link>
            <Link href="/projects/risks"><Button variant="outline" size="sm" className="gap-1"><ShieldAlert className="h-3 w-3" /> إدارة المخاطر</Button></Link>
            <Link href="/finance/project-costing"><Button variant="outline" size="sm" className="gap-1"><DollarSign className="h-3 w-3" /> تكاليف المشاريع</Button></Link>
            <Link href="/tasks"><Button variant="outline" size="sm" className="gap-1"><ListTodo className="h-3 w-3" /> المهام</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectListTab() {
  const [, navigate] = useLocation();
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery(["projects-stats", scopeQueryString], `/projects/stats/summary${scopeQueryString ? `?${scopeQueryString}` : ""}`);
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const canManage = roleLevel >= 50;
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { data: projectsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["projects", String(page), scopeQueryString],
    `/projects?page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const projects = asList(projectsResp);
  const total = projectsResp?.total || projects.length;

  const filtered = applyFilters(projects, filters, {
    searchFields: ["name", "clientName"],
    statusField: "status",
    dateField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/projects",
    queryKeys: [["projects", String(page)], ["projects-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "المشروع" },
    { key: "budget", label: "الميزانية", type: "number" as const },
    { key: "progress", label: "التقدم %", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "completed", label: "مكتمل" }, { value: "on_hold", label: "متوقف" }, { value: "cancelled", label: "ملغي" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select", header: "", width: "32px",
      render: (v) => <span onClick={(ev) => ev.stopPropagation()}><BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} /></span>,
    },
    { key: "name", header: "المشروع", sortable: true, render: (p) => <Link href={`/projects/${p.id}`}><span className="font-medium text-primary hover:underline cursor-pointer">{p.name}</span></Link> },
    { key: "clientName", header: "العميل", sortable: true, render: (p) => p.clientName || "-" },
    { key: "startDate", header: "البدء", sortable: true, render: (p) => formatDateAr(p.startDate) },
    { key: "endDate", header: "الانتهاء", sortable: true, render: (p) => formatDateAr(p.endDate) },
    { key: "budget", header: "الميزانية", sortable: true, render: (p) => formatCurrency(p.budget || 0) },
    {
      key: "progress", header: "التقدم", sortable: true, className: "w-[120px]",
      render: (p) => (
        <div className="flex items-center gap-2">
          <Progress value={p.progress || 0} className="h-2" />
          <span className="text-xs text-muted-foreground">{p.progress || 0}%</span>
        </div>
      ),
    },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} domain="project" /> },
    {
      key: "actions", header: "الإجراءات",
      render: (p) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Link href={`/projects/${p.id}`}><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></Link>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(p.id, { name: p.name, budget: p.budget || 0, progress: p.progress || 0, status: p.status || "active" })}
            onDelete={() => startDelete(p.id)}
            deletePerm="projects:delete"
          />
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <KpiGrid items={[
        { label: "إجمالي المشاريع", value: (stats as any)?.totalProjects || 0, icon: FolderKanban, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "نشط", value: (stats as any)?.activeProjects || 0, icon: Activity, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "مكتمل", value: (stats as any)?.completedProjects || 0, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
        { label: "إجمالي الميزانية", value: formatCurrency((stats as any)?.totalBudget || 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في المشاريع...",
          statuses: PROJECT_STATUS_OPTIONS,
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "name", label: "المشروع" },
          { key: "clientName", label: "العميل" },
          { key: "startDate", label: "تاريخ البدء" },
          { key: "endDate", label: "تاريخ الانتهاء" },
          { key: "budget", label: "الميزانية" },
          { key: "status", label: "الحالة" },
        ], "المشاريع")}
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="project"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["projects"]]}
        actions={["export"]}
        csvColumns={[
          { key: "name", label: "المشروع" },
          { key: "clientName", label: "العميل" },
          { key: "budget", label: "الميزانية" },
          { key: "progress", label: "التقدم" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="المشاريع"
      />

      <Card>
        <CardHeader><CardTitle className="gap-2 flex items-center"><FolderKanban className="h-5 w-5" /> المشاريع</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مشاريع"
            emptyIcon={<FolderKanban className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            page={page}
            total={total}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/projects/${row.id}`)}
            renderRowExtras={(p) => {
              if (editingId === p.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === p.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="project" entityId={p.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function Projects() {
  const { roleLevel } = useAppContext();
  const canManage = roleLevel >= 50;
  const search = useSearch();
  const params = new URLSearchParams(search);
  const defaultTab = params.get("tab") || "overview";

  return (
    <PageShell
      title="إدارة المشاريع"
      subtitle="متابعة المشاريع والمراحل والتكاليف والمخاطر"
      breadcrumbs={[{ label: "العمليات" }]}
      actions={
        canManage ? (
          <Link href="/projects/create">
            <GuardedButton perm="projects:create" className="gap-2"><Plus className="h-4 w-4" /> مشروع جديد</GuardedButton>
          </Link>
        ) : null
      }
    >
      <ProjectsTabsNav />
      <Tabs defaultValue={defaultTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="list">قائمة المشاريع</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="list"><ProjectListTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
