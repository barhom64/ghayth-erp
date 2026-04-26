import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Plus, Users, UserCheck, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { RECRUITMENT_STAGES } from "@/lib/hr-type-maps";

const STATUS_OPTIONS = Object.entries(RECRUITMENT_STAGES).map(([value, { label }]) => ({ value, label }));

export default function ApplicationListPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { data, isLoading, isError } = useApiQuery<any>(["applicants"], "/hr/recruitment/applications");
  const apps = data?.data || [];

  const filtered = applyFilters(apps, filters, {
    searchFields: ["applicantName", "name", "email", "postingTitle"],
    statusField: "status",
    dateField: "createdAt",
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const kpis = [
    { label: "إجمالي المتقدمين", value: apps.length, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "جدد", value: apps.filter((a: any) => (a.status || a.stage) === "new").length, icon: Clock, color: "text-amber-600 bg-amber-50" },
    { label: "تم توظيفهم", value: apps.filter((a: any) => (a.status || a.stage) === "hired").length, icon: UserCheck, color: "text-green-600 bg-green-50" },
    { label: "مرفوض", value: apps.filter((a: any) => (a.status || a.stage) === "rejected").length, icon: XCircle, color: "text-red-600 bg-red-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "applicantName",
      header: "الاسم",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.applicantName || v.name} color="indigo" />
          <span className="font-medium text-sm">{v.applicantName || v.name}</span>
        </div>
      ),
    },
    {
      key: "postingTitle",
      header: "المنصب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">{v.postingTitle || v.position || "-"}</span>
      ),
    },
    {
      key: "email",
      header: "البريد",
      render: (v) => (
        <span className="text-sm text-gray-500">{v.email || "-"}</span>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      render: (v) => (
        <span className="text-sm text-gray-500 font-mono">{v.phone || "-"}</span>
      ),
    },
    {
      key: "rating",
      header: "التقييم",
      sortable: true,
      render: (v) => {
        if (!v.rating) return <span className="text-gray-400">-</span>;
        const r = Number(v.rating);
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              r >= 4 ? "border-green-300 text-green-700 bg-green-50" :
              r >= 3 ? "border-amber-300 text-amber-700 bg-amber-50" :
              "border-red-300 text-red-700 bg-red-50",
            )}
          >
            {r}/5
          </Badge>
        );
      },
    },
    {
      key: "status",
      header: "المرحلة",
      sortable: true,
      render: (v) => {
        const stage = v.status || v.stage;
        const st = RECRUITMENT_STAGES[stage];
        return (
          <Badge variant="outline" className={cn("text-xs", st?.color || "")}>
            {st?.label || stage || "-"}
          </Badge>
        );
      },
    },
  ];

  return (
    <PageShell
      title="قائمة المتقدمين"
      subtitle="متابعة طلبات التوظيف ومراحل الفرز"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/recruitment", label: "التوظيف" },
      ]}
      actions={
        <Link href="/hr/recruitment/applicants/create">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            إضافة متقدم
          </Button>
        </Link>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو البريد أو المنصب...",
          statuses: STATUS_OPTIONS,
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
        emptyMessage="لا يوجد متقدمين — أضف متقدم جديد للبدء"
        pageSize={20}
      />
    </PageShell>
  );
}
