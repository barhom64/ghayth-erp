import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, CheckCircle, Clock, ClipboardCheck } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { PageShell } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "in_review",  label: "قيد المراجعة" },
  { value: "probation",  label: "فترة التجربة" },
  { value: "completed",  label: "مكتمل"        },
];

export default function OnboardingReviewPage() {
  const [filters, setFilters] = useFilters();
  const { data, isLoading: empLoading, isError: empError } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const { data: stepsData, isLoading: stepsLoading, isError: stepsError } = useApiQuery<any>(["onboarding-steps"], "/hr/onboarding-steps");

  const isLoading = empLoading || stepsLoading;
  const isError = empError || stepsError;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const employees = data?.data || [];
  const steps: string[] = stepsData?.data || ["تسليم أجهزة تقنية المعلومات", "توقيع عقد العمل", "تعريف المدير", "دورة التعريف"];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const recentHires = employees.filter((e: any) => {
    const hireDate = e.hireDate ? new Date(e.hireDate) : null;
    return hireDate && hireDate >= thirtyDaysAgo;
  });

  const allActive = employees.filter((e: any) => e.status === "active");

  const inProbation = employees.filter((e: any) => {
    if (e.status !== "active") return false;
    const hireDate = e.hireDate ? new Date(e.hireDate) : null;
    return hireDate ? hireDate >= ninetyDaysAgo : false;
  });

  const pendingOnboarding = employees.filter((e: any) => e.status === "pending" || e.status === "onboarding");

  const getOnboardingStatus = (emp: any) => {
    if (emp.status === "pending" || emp.status === "onboarding") return "in_review";
    const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
    if (hireDate && hireDate >= ninetyDaysAgo) return "probation";
    return "completed";
  };

  const displayList = [...pendingOnboarding, ...recentHires, ...inProbation.filter((e: any) => !recentHires.some((r: any) => r.id === e.id))]
    .filter((e, i, arr) => arr.findIndex((x: any) => x.id === e.id) === i)
    .map((e: any) => ({ ...e, _onboardingStatus: getOnboardingStatus(e) }))
    .slice(0, 50);

  const filtered = applyFilters(displayList, filters, {
    searchFields: ["name", "empNumber", "jobTitle"],
    statusField: "_onboardingStatus",
    dateField: "hireDate",
  });

  const kpis = [
    { label: "موظفين جدد (آخر 30 يوم)", value: recentHires.length, icon: UserPlus, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "مكتمل التعيين", value: Math.max(0, allActive.length - inProbation.length - pendingOnboarding.length), icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "قيد المراجعة", value: pendingOnboarding.length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "فترة التجربة", value: inProbation.length, icon: ClipboardCheck, color: "text-purple-600 bg-purple-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.name} color="blue" />
          <span className="font-medium text-sm">{v.name}</span>
        </div>
      ),
    },
    {
      key: "empNumber",
      header: "الرقم الوظيفي",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-mono text-muted-foreground">{v.empNumber || "-"}</span>
      ),
    },
    {
      key: "jobTitle",
      header: "المنصب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.jobTitle || "-"}</span>
      ),
    },
    {
      key: "hireDate",
      header: "تاريخ التعيين",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {v.hireDate ? formatDateAr(v.hireDate) : "-"}
        </span>
      ),
    },
    {
      key: "branchName",
      header: "الفرع",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.branchName || "-"}</span>
      ),
    },
    {
      key: "_onboardingStatus",
      header: "حالة التأهيل",
      sortable: true,
      render: (v) => <PageStatusBadge status={v._onboardingStatus} />,
    },
  ];

  return (
    <PageShell
      title="مراجعة التعيين والتأهيل"
      subtitle="متابعة إجراءات التعيين وتأهيل الموظفين الجدد"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Onboarding steps */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3 text-sm">خطوات التأهيل</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {steps.map((step: string, i: number) => (
              <div key={i} className="p-3 bg-surface-subtle rounded-lg text-center">
                <div className="w-8 h-8 rounded-full bg-status-info-surface text-status-info-foreground flex items-center justify-center mx-auto mb-2 text-sm font-bold">{i + 1}</div>
                <p className="text-sm font-medium">{step}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الرقم الوظيفي...",
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
        emptyMessage="لا يوجد موظفين في مرحلة التأهيل"
        pageSize={20}
      />
    </PageShell>
  );
}
