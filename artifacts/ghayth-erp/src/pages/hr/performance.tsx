import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
// Phase A — HR performance on unified primitives.
import { PageShell } from "@/components/page-shell";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, Star, Target, TrendingUp, Users, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";


export default function PerformancePage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { data, isLoading, isError } = useApiQuery<any>(["performance"], "/hr/performance");
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });

  const avgScore = items.length > 0
    ? (items.reduce((s: number, p: any) => s + Number(p.overallScore || 0), 0) / items.length).toFixed(1)
    : "0";

  const kpis = [
    { label: "إجمالي التقييمات", value: items.length, icon: Target, color: "text-blue-600 bg-blue-50" },
    { label: "متوسط الأداء", value: avgScore + "/5", icon: TrendingUp, color: "text-green-600 bg-green-50" },
    { label: "مكتملة", value: items.filter((i: any) => i.status === "completed").length, icon: Award, color: "text-purple-600 bg-purple-50" },
    { label: "قيد التقييم", value: items.filter((i: any) => i.status === "draft" || i.status === "in_progress").length, icon: Users, color: "text-orange-600 bg-orange-50" },
  ];

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
            {p.empNumber && <span className="text-xs text-gray-400">{p.empNumber}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      className: "text-gray-500",
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
          <span className={cn("font-bold", score >= 4 ? "text-green-600" : score >= 3 ? "text-yellow-600" : "text-red-600")}>
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
        <Link href="/hr/performance/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />تقييم جديد</Button>
        </Link>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

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
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد تقييمات"
        pageSize={20}
        onRowClick={(row) => navigate(`/hr/performance/${row.id}`)}
      />
    </PageShell>
  );
}
