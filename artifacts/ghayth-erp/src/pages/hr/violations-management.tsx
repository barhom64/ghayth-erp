import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Scale, DollarSign, Shield, TrendingUp } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { SEVERITY_LEVELS } from "@/lib/hr-type-maps";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";

export default function ViolationsManagementPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["violations"], "/hr/violations");
  const { data: stats } = useApiQuery<any>(["violations-stats"], "/hr/violations-stats");
  const items = data?.data || [];

  // Approve drives the real lifecycle endpoint (applyTransition +
  // discipline ladder). The old "resolve" button PATCHed /hr/violations/:id
  // with {status:"resolved"} — a field the patch schema rejects — and was
  // gated on a non-existent "active" status (HR functional audit C7).
  const approveViolationMut = useApiMutation<any, { id: number }>(
    (body) => `/hr/violations/${body.id}/approve`,
    "PATCH",
    [["violations"], ["violations-stats"]],
    { successMessage: "تم اعتماد المخالفة" }
  );
  const approvingId = approveViolationMut.isPending ? approveViolationMut.variables?.id ?? null : null;

  const [filters, setFilters] = useFilters();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });

  const byType = items.reduce((acc: Record<string, number>, v: any) => {
    const t = v.type || "أخرى";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const columns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
    { key: "type", header: "النوع", sortable: true, render: (v) => v.type },
    { key: "description", header: "الوصف", sortable: true, className: "text-muted-foreground max-w-48 truncate", render: (v) => v.description },
    {
      key: "severity",
      header: "الشدة",
      sortable: true,
      render: (v) => <Badge className={SEVERITY_LEVELS[v.severity]?.color || ""}>{SEVERITY_LEVELS[v.severity]?.label || v.severity}</Badge>,
    },
    {
      key: "deduction",
      header: "الخصم",
      sortable: true,
      className: "text-status-error-foreground font-medium",
      render: (v) => formatCurrency(Number(v.deduction || 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => (
        <PageStatusBadge status={v.status} />
      ),
    },
    {
      key: "actions",
      header: "إجراء",
      render: (v) => (
        !["approved", "rejected"].includes(v.status) ? (
          <GuardedButton
            perm="hr:approve"
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={(e) => { e.stopPropagation(); approveViolationMut.mutate({ id: v.id }); }}
            disabled={approvingId === v.id}
          >
            <Shield className="h-3 w-3 me-1" />{approvingId === v.id ? "..." : "اعتماد"}
          </GuardedButton>
        ) : null
      ),
    },
  ];

  return (
    <PageShell
      title="إدارة المخالفات المتقدمة"
      subtitle="تحليل وإدارة المخالفات مع التصعيد التلقائي"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات والجزاءات" },
        { label: "تحليل متقدم" },
      ]}
    >
      <HrTabsNav />
      <KpiGrid items={[
        { label: "إجمالي المخالفات", value: stats?.total ?? items.length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "نشطة", value: stats?.active ?? 0, icon: Scale, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "إجمالي الخصومات", value: formatCurrency(stats?.totalDeductions ?? 0), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
        { label: "أنواع المخالفات", value: Object.keys(byType).length, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
      ]} />

      <Tabs defaultValue="list" dir="rtl">
        <TabsList>
          <TabsTrigger value="list">القائمة</TabsTrigger>
          <TabsTrigger value="analysis">التحليل</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <div className="space-y-4">
            <AdvancedFilters
              config={{
                searchPlaceholder: "بحث بالاسم...",
                statuses: Object.entries(SEVERITY_LEVELS).map(([k, v]) => ({ value: k, label: v.label })),
                showDateRange: true,
              }}
              values={filters}
              onChange={setFilters}
              resultCount={filtered.length}
              onExportCSV={() =>
                exportToCSV(filtered, [
                  { key: "employeeName", label: "الموظف" },
                  { key: "type", label: "النوع" },
                  { key: "description", label: "الوصف" },
                  { key: "severity", label: "الشدة" },
                  { key: "deduction", label: "الخصم" },
                  { key: "status", label: "الحالة" },
                ], "المخالفات")
              }
            />
            <DataTable
              columns={columns}
              data={filtered}
              noToolbar
              emptyMessage="لا توجد مخالفات"
              pageSize={20}
            />
          </div>
        </TabsContent>
        <TabsContent value="analysis">
          <Card>
            <CardHeader><CardTitle className="text-base">توزيع المخالفات حسب النوع</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(byType).sort(([,a], [,b]) => (b as number) - (a as number)).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-sm w-40 truncate">{type}</span>
                    <div className="flex-1 bg-surface-subtle rounded-full h-6 overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${(count as number / items.length) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium w-8">{count as number}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
