import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
// Phase A — HR performance on unified primitives.
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Plus, Star, Target, TrendingUp, Users, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";


export default function PerformancePage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { data, isLoading, isError } = useApiQuery<any>(["performance"], "/hr/performance");
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const avgScore = items.length > 0
    ? (items.reduce((s: number, p: any) => s + Number(p.overallScore || 0), 0) / items.length).toFixed(1)
    : "0";

  const kpis = [
    { label: "إجمالي التقييمات", value: items.length, icon: Target, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "متوسط الأداء", value: avgScore + "/5", icon: TrendingUp, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "مكتملة", value: items.filter((i: any) => i.status === "completed").length, icon: Award, color: "text-purple-600 bg-purple-50" },
    { label: "قيد التقييم", value: items.filter((i: any) => i.status === "draft" || i.status === "in_progress").length, icon: Users, color: "text-orange-600 bg-orange-50" },
  ];

  // HR-REV — التحليلات المشتقّة التي كانت في صفحة «تحليلات الأداء المتقدمة»
  // المكرّرة (مسارها يرتدّ هنا) صارت تبويب «التحليلات»: نفس بيانات /hr/performance.
  const distribution = [
    { range: "ممتاز (4.5-5)", count: items.filter((p: any) => Number(p.overallScore) >= 4.5).length, color: "bg-status-success-surface0" },
    { range: "جيد جداً (3.5-4.4)", count: items.filter((p: any) => Number(p.overallScore) >= 3.5 && Number(p.overallScore) < 4.5).length, color: "bg-status-info-surface0" },
    { range: "جيد (2.5-3.4)", count: items.filter((p: any) => Number(p.overallScore) >= 2.5 && Number(p.overallScore) < 3.5).length, color: "bg-status-warning-surface0" },
    { range: "مقبول (1.5-2.4)", count: items.filter((p: any) => Number(p.overallScore) >= 1.5 && Number(p.overallScore) < 2.5).length, color: "bg-orange-500" },
    { range: "ضعيف (أقل من 1.5)", count: items.filter((p: any) => Number(p.overallScore) < 1.5).length, color: "bg-status-error-surface0" },
  ];
  const topPerformers = [...items].sort((a: any, b: any) => Number(b.overallScore || 0) - Number(a.overallScore || 0)).slice(0, 10);

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={p.employeeName} color="orange" />
          <div>
            <span className="font-medium block">{p.employeeName}</span>
            {p.empNumber && <span className="text-xs text-muted-foreground">{p.empNumber}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      className: "text-muted-foreground",
      render: (p) => p.period || "-",
    },
    {
      key: "stars",
      header: "التقييم",
      render: (p) => {
        const score = Number(p.overallScore || 0);
        return (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn("w-4 h-4", i < score ? "text-yellow-400 fill-yellow-400" : "text-gray-200")} />
            ))}
          </div>
        );
      },
    },
    {
      key: "overallScore",
      header: "الدرجة",
      sortable: true,
      render: (p) => {
        const score = Number(p.overallScore || 0);
        return (
          <span className={cn("font-bold", score >= 4 ? "text-status-success-foreground" : score >= 3 ? "text-status-warning-foreground" : "text-status-error-foreground")}>
            {score.toFixed(1)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status || "draft"} />,
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="تقييمات الأداء"
      subtitle="متابعة تقييمات أداء الموظفين ونتائجهم"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_performance"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تقييمات الأداء", total: printRows.length },
              items: printRows.map((p: any) => ({
                "الموظف": p.employeeName || "—",
                "الفترة": p.evaluationPeriod || p.period || "—",
                "التقييم": p.score ?? p.rating ?? "—",
                "الوزن": p.weight ?? "—",
                "المُقيِّم": p.evaluatorName || "—",
                "الحالة": p.status || "—",
              })),
            })}
          />
          <Link href="/hr/performance/create">
            <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />تقييم جديد</GuardedButton>
          </Link>
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Tabs defaultValue="list" dir="rtl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="list">التقييمات</TabsTrigger>
          <TabsTrigger value="analytics">التحليلات</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "in_progress", label: "قيد التقييم" },
            { value: "completed", label: "مكتمل" },
            { value: "reviewed", label: "تمت المراجعة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "employeeName", label: "الموظف" },
              { key: "period", label: "الفترة" },
              { key: "overallScore", label: "التقييم الإجمالي" },
              { key: "status", label: "الحالة" },
              { key: "reviewedBy", label: "المراجِع" },
              { key: "comments", label: "ملاحظات" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ],
            "تقييمات-الأداء",
          )
        }
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد تقييمات"
        pageSize={20}
        onRowClick={(row) => navigate(`/hr/performance/${row.id}`)}
      />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">توزيع التقييمات</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {distribution.map((d) => (
                  <div key={d.range} className="flex items-center gap-3">
                    <span className="text-sm w-40">{d.range}</span>
                    <div className="flex-1 bg-surface-subtle rounded-full h-6 overflow-hidden">
                      <div className={cn("h-full rounded-full", d.color)} style={{ width: `${items.length > 0 ? (d.count / items.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-medium w-8 text-start">{d.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">أفضل الموظفين أداءً</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  { key: "rank", header: "#", render: (_v, i) => (
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", i < 3 ? "bg-status-warning-surface text-status-warning-foreground" : "bg-surface-subtle text-status-neutral-foreground")}>{i + 1}</div>
                  ) },
                  { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
                  { key: "overallScore", header: "التقييم", sortable: true, render: (v) => (
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} className={cn("w-4 h-4", j < Number(v.overallScore) ? "text-yellow-400 fill-yellow-400" : "text-gray-200")} />
                      ))}
                      <span className="ms-2 font-bold">{Number(v.overallScore).toFixed(1)}</span>
                    </div>
                  ) },
                  { key: "period", header: "الفترة", sortable: true, render: (v) => <span className="text-muted-foreground">{v.period || "-"}</span> },
                ] as DataTableColumn<any>[]}
                data={topPerformers}
                noToolbar
                emptyMessage="لا توجد تقييمات"
                pageSize={10}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
