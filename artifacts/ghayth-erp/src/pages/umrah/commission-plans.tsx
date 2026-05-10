import { useApiQuery } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Plus, Award, Pencil, Calculator } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency } from "@/lib/formatters";

type Plan = {
  id: number;
  employeeId: number;
  employeeName: string | null;
  planName: string;
  baseSalary: string | number;
  commissionType: string;
  conditionType: string;
  tierUnit: number;
  status: "active" | "suspended" | "expired";
  excludedMonths: number[] | null;
  approvedAt: string | null;
};

export default function UmrahCommissionPlans() {
  const { data: resp, refetch, isLoading, isError } = useApiQuery<{ data: Plan[] }>(
    ["umrah-commission-plans"], "/umrah/commission-plans"
  );
  const items = resp?.data ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const activeCount = items.filter((p) => p.status === "active").length;
  const suspendedCount = items.filter((p) => p.status === "suspended").length;

  const columns: DataTableColumn<Plan>[] = [
    { key: "planName", header: "اسم الخطة", searchable: true,
      render: (p) => <span className="font-medium">{p.planName}</span> },
    { key: "employeeName", header: "الموظف", searchable: true,
      render: (p) => p.employeeName ?? "—" },
    { key: "baseSalary", header: "الراتب الأساسي",
      render: (p) => formatCurrency(Number(p.baseSalary)) },
    { key: "commissionType", header: "نوع العمولة",
      render: (p) => <PageStatusBadge status={p.commissionType} /> },
    { key: "conditionType", header: "الشرط",
      render: (p) => <PageStatusBadge status={p.conditionType} /> },
    { key: "tierUnit", header: "وحدة الشريحة",
      render: (p) => `${p.tierUnit.toLocaleString()} معتمر` },
    { key: "excludedMonths", header: "الأشهر المستثناة",
      render: (p) => Array.isArray(p.excludedMonths) && p.excludedMonths.length > 0
        ? <span className="text-xs">{p.excludedMonths.join("، ")}</span>
        : <span className="text-muted-foreground">—</span> },
    { key: "status", header: "الحالة",
      render: (p) => <PageStatusBadge status={p.status} /> },
    { key: "actions", header: "إجراءات",
      render: (p) => (
        <div className="flex gap-2">
          <Link href={`/umrah/commission-plans/${p.id}`}>
            <Button size="sm" variant="outline" className="gap-1">
              <Pencil className="h-3.5 w-3.5" />تعديل
            </Button>
          </Link>
        </div>
      ) },
  ];

  return (
    <PageShell
      title="خطط العمولات"
      breadcrumbs={[{ label: "العمرة" }, { label: "العمولات" }]}
    >
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <Link href="/umrah/commission-plans/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />خطة جديدة
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">
          العمولات تخص موظفين محددين في قسم العمرة. الخطة لا تُنشأ إلا بموافقة المدير العام.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50">
            <Award className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{items.length}</p>
            <p className="text-xs text-gray-500">إجمالي الخطط</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50">
            <Calculator className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{activeCount}</p>
            <p className="text-xs text-gray-500">خطط نشطة</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-50">
            <Award className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{suspendedCount}</p>
            <p className="text-xs text-gray-500">خطط موقوفة</p>
          </div>
        </CardContent></Card>
      </div>

      <DataTable
        columns={columns}
        data={items}
        emptyMessage="لا توجد خطط عمولات بعد"
        emptyIcon={<Award className="h-6 w-6 text-slate-400" />}
        pageSize={20}
        searchPlaceholder="بحث عن خطة..."
      />
    </PageShell>
  );
}
