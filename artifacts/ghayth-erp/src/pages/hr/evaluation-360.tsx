import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { Plus, Target, TrendingUp, Award, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "in_progress", label: "جارٍ التقييم" },
  { value: "completed",   label: "مكتمل"        },
  { value: "cancelled",   label: "ملغي"         },
];

function ScoreBadge({ score, label }: { score: number | null | undefined; label?: string }) {
  if (score == null) return <span className="text-muted-foreground text-xs">-</span>;
  const color = score >= 80 ? "text-status-success-foreground" : score >= 60 ? "text-status-warning-foreground" : "text-status-error-foreground";
  return (
    <div className="text-center">
      {label && <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>}
      <span className={cn("font-bold text-sm", color)}>{score}%</span>
    </div>
  );
}

export default function Evaluation360Page() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();

  const { data: cyclesData, isLoading, isError } = useApiQuery<any>(["evaluation-cycles"], "/hr/evaluation-cycles");
  const cycles = cyclesData?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

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
    { label: "إجمالي الدورات", value: stats.total, icon: Target, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "جارٍ التقييم", value: stats.inProgress, icon: RefreshCw, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "مكتملة", value: stats.completed, icon: Award, color: "text-status-success-foreground bg-status-success-surface" },
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
              <span className="text-xs text-muted-foreground">#{v.empNumber}</span>
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
        <span className="text-sm text-muted-foreground">{v.period || "-"}</span>
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
        if (v.finalScore == null) return <span className="text-muted-foreground">-</span>;
        const score = Number(v.finalScore);
        const color =
          score >= 80 ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" :
          score >= 60 ? "bg-status-warning-surface text-status-warning-foreground border-yellow-300" :
          "bg-status-error-surface text-status-error-foreground border-status-error-surface";
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
          <GuardedButton perm="hr:create" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            بدء دورة تقييم
          </GuardedButton>
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
