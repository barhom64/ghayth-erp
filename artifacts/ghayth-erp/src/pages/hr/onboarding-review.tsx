import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, CheckCircle, Clock, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "in_review",  label: "قيد المراجعة" },
  { value: "probation",  label: "فترة التجربة" },
  { value: "completed",  label: "مكتمل"        },
];

export default function OnboardingReviewPage() {
  const [filters, setFilters] = useFilters();
  const { data } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const { data: stepsData } = useApiQuery<any>(["onboarding-steps"], "/hr/onboarding-steps");
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
    { label: "موظفين جدد (آخر 30 يوم)", value: recentHires.length, icon: UserPlus, color: "text-blue-600 bg-blue-50" },
    { label: "مكتمل التعيين", value: Math.max(0, allActive.length - inProbation.length - pendingOnboarding.length), icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "قيد المراجعة", value: pendingOnboarding.length, icon: Clock, color: "text-amber-600 bg-amber-50" },
    { label: "فترة التجربة", value: inProbation.length, icon: ClipboardCheck, color: "text-purple-600 bg-purple-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
            {(v.name || "؟").charAt(0)}
          </div>
          <span className="font-medium text-sm">{v.name}</span>
        </div>
      ),
    },
    {
      key: "empNumber",
      header: "الرقم الوظيفي",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-mono text-gray-500">{v.empNumber || "-"}</span>
      ),
    },
    {
      key: "jobTitle",
      header: "المنصب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">{v.jobTitle || "-"}</span>
      ),
    },
    {
      key: "hireDate",
      header: "تاريخ التعيين",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-500">
          {v.hireDate ? formatDateAr(v.hireDate) : "-"}
        </span>
      ),
    },
    {
      key: "branchName",
      header: "الفرع",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-500">{v.branchName || "-"}</span>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Onboarding steps */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3 text-sm">خطوات التأهيل</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {steps.map((step: string, i: number) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg text-center">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto mb-2 text-sm font-bold">{i + 1}</div>
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
