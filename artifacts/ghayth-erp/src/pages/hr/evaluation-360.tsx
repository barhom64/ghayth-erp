import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, Target, TrendingUp, Award, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "in_progress", label: "جارٍ التقييم" },
  { value: "completed",   label: "مكتمل"        },
  { value: "cancelled",   label: "ملغي"         },
];

function ScoreBadge({ score, label }: { score: number | null | undefined; label?: string }) {
  if (score == null) return <span className="text-gray-400 text-xs">-</span>;
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="text-center">
      {label && <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>}
      <span className={cn("font-bold text-sm", color)}>{score}%</span>
    </div>
  );
}

export default function Evaluation360Page() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();

  const { data: cyclesData } = useApiQuery<any>(["evaluation-cycles"], "/hr/evaluation-cycles");
  const cycles = cyclesData?.data || [];

  const filtered = applyFilters(cycles, filters, {
    searchFields: ["employeeName", "period"],
    statusField: "status",
    dateField: "createdAt",
  });

  const stats = {
    total: cycles.length,
    inProgress: cycles.filter((c: any) => c.status === "in_progress").length,
    completed: cycles.filter((c: any) => c.status === "completed").length,
    avgScore: cycles.length > 0
      ? Math.round(
          cycles
            .filter((c: any) => c.finalScore)
            .reduce((s: number, c: any) => s + Number(c.finalScore), 0) /
            (cycles.filter((c: any) => c.finalScore).length || 1),
        )
      : 0,
  };

  const kpis = [
    { label: "إجمالي الدورات", value: stats.total, icon: Target, color: "text-blue-600 bg-blue-50" },
    { label: "جارٍ التقييم", value: stats.inProgress, icon: RefreshCw, color: "text-amber-600 bg-amber-50" },
    { label: "مكتملة", value: stats.completed, icon: Award, color: "text-green-600 bg-green-50" },
    { label: "متوسط الأداء", value: stats.avgScore ? `${stats.avgScore}%` : "-", icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="orange" />
          <div>
            <span className="font-medium text-sm block">{v.employeeName}</span>
            {v.empNumber && (
              <span className="text-xs text-gray-400">#{v.empNumber}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">{v.period || "-"}</span>
      ),
    },
    {
      key: "systemScore",
      header: "النظام",
      sortable: true,
      render: (v) => <ScoreBadge score={v.systemScore} />,
    },
    {
      key: "managerScore",
      header: "المدير",
      sortable: true,
      render: (v) => <ScoreBadge score={v.managerScore} />,
    },
    {
      key: "peerScore",
      header: "الزملاء",
      sortable: true,
      render: (v) => <ScoreBadge score={v.peerScore} />,
    },
    {
      key: "finalScore",
      header: "النهائي 360°",
      sortable: true,
      render: (v) => {
        if (v.finalScore == null) return <span className="text-gray-400">-</span>;
        const score = Number(v.finalScore);
        const color =
          score >= 80 ? "bg-green-100 text-green-700 border-green-300" :
          score >= 60 ? "bg-yellow-100 text-yellow-700 border-yellow-300" :
          "bg-red-100 text-red-700 border-red-300";
        return (
          <Badge variant="outline" className={cn("text-xs font-bold", color)}>
            {score}%
          </Badge>
        );
      },
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => <PageStatusBadge status={v.status} />,
    },
  ];

  return (
    <PageShell
      title="التقييم الذكي 360°"
      subtitle="تقييم شامل يجمع بيانات النظام وتقييم المدير والزملاء والتقييم العكسي السري"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/evaluation-360/create">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            بدء دورة تقييم
          </Button>
        </Link>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الفترة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد دورات تقييم — ابدأ بإنشاء دورة تقييم للموظفين"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/evaluation-360/${item.id}`)}
      />
    </PageShell>
  );
}
