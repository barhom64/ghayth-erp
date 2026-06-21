import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatUmrahDate, formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import { Plus, Eye, Pencil, CheckCircle2, Briefcase, Calculator } from "lucide-react";

type PlanStatus = "active" | "suspended" | "expired" | "pending";
type CommissionType = "percentage" | "fixed" | "tiered" | "mixed";

interface CommissionPlan {
  id: number;
  employeeId: number;
  employeeName?: string;
  assignmentId?: number;
  seasonId: number;
  seasonTitle?: string;
  planName: string;
  status: PlanStatus;
  baseSalary: number;
  commissionType: CommissionType;
  tierCount?: number;
  approvedAt?: string | null;
  createdAt?: string;
}

const STATUS_LABEL: Record<PlanStatus, { label: string; cls: string }> = {
  active: { label: "مفعّل", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  suspended: { label: "موقوف", cls: "bg-status-error-surface text-status-error-foreground border-status-error-surface" },
  expired: { label: "منتهي", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  pending: { label: "بانتظار الاعتماد", cls: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface" },
};

const TYPE_LABEL: Record<CommissionType, string> = {
  percentage: "نسبة مئوية",
  fixed: "مبلغ ثابت",
  tiered: "شرائح",
  mixed: "مختلط",
};

export default function UmrahCommissionPlans() {

  const plansQ = useApiQuery<{ data: CommissionPlan[] }>(["umrah-commission-plans"], "/umrah/commission-plans");
  const employeesQ = useApiQuery<{ data: any[] }>(["employees"], "/employees");
  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");
  // GET /umrah/commission-calculations — historical calculation runs
  // across all plans. Surfaced as a count card so the operator knows
  // how many calculations have been recorded.
  const calculationsQ = useApiQuery<{ data: any[] }>(
    ["umrah-commission-calculations"],
    "/umrah/commission-calculations",
  );
  const calculationsCount = (calculationsQ.data?.data ?? []).length;

  const plans = plansQ.data?.data ?? [];
  const employees = employeesQ.data?.data ?? [];
  const seasons = seasonsQ.data?.data ?? [];

  const { toast } = useToast();

  // POST /umrah/commission-plans/:id/calculate — recomputes commissions
  // for the current month / year (defaults to now in Riyadh). The page
  // already shows recent calculations via the editor's history.
  const calculateMut = useApiMutation<unknown, { id: number; month: number; year: number }>(
    (body) => `/umrah/commission-plans/${body.id}/calculate`,
    "POST",
    [["umrah-commission-plans"]],
    {
      successMessage: "تم احتساب العمولة",
    },
  );

  const handleCalculate = (planId: number) => {
    calculateMut.mutate(
      { id: planId, month: Number(currentMonthPaddedRiyadh()), year: currentYearRiyadh() },
      {
        onError: (e: any) => {
          toast({ variant: "destructive", title: "تعذر الاحتساب", description: e?.message });
        },
      },
    );
  };

  const [filters, setFilters] = useFilters();

  const filtered = useMemo(() => applyFilters(plans, filters, {
    searchFields: ["planName", "employeeName"],
    statusField: "status",
    extraFields: { employeeId: "employeeId", seasonId: "seasonId" },
  }), [plans, filters]);

  const counts = useMemo(() => ({
    total: plans.length,
    active: plans.filter((p) => p.status === "active").length,
    suspended: plans.filter((p) => p.status === "suspended").length,
    pending: plans.filter((p) => p.status === "pending").length,
  }), [plans]);

  const columns: DataTableColumn<CommissionPlan>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      render: (p) => <span className="font-medium">{p.employeeName ?? `#${p.employeeId}`}</span>,
    },
    {
      key: "planName",
      header: "اسم الخطة",
    },
    {
      key: "seasonTitle",
      header: "الموسم",
      render: (p) => p.seasonTitle ?? "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (p) => {
        const s = STATUS_LABEL[p.status] ?? STATUS_LABEL.active;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
    {
      key: "baseSalary",
      header: "الراتب الأساسي",
      render: (p) => formatCurrency(Number(p.baseSalary)),
    },
    {
      key: "commissionType",
      header: "نوع العمولة",
      render: (p) => TYPE_LABEL[p.commissionType] ?? p.commissionType,
    },
    {
      key: "tierCount",
      header: "عدد الشرائح",
      render: (p) => p.tierCount != null ? formatNumber(p.tierCount) : "—",
    },
    {
      key: "approvedAt",
      header: "تاريخ الاعتماد",
      render: (p) => p.approvedAt ? formatUmrahDate(p.approvedAt) : "—",
    },
    {
      key: "__actions",
      header: "إجراءات",
      render: (p) => (
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/umrah/commission-plans/${p.id}/edit`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <GuardedButton perm="umrah:write" size="sm" variant="ghost" asChild>
            <Link href={`/umrah/commission-plans/${p.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </GuardedButton>
          <GuardedButton
            perm="umrah:write"
            size="sm"
            variant="ghost"
            onClick={() => handleCalculate(p.id)}
            disabled={calculateMut.isPending}
            rateLimitAware
            title="احتساب العمولة للشهر الحالي"
          >
            <Calculator className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="خطط العمولة"
      subtitle="إدارة خطط عمولة موظفي العمرة والموافقة عليها"
      breadcrumbs={[{ label: "العمرة" }, { label: "خطط العمولة" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_umrah_commission_plans"
            entityId="list"
            size="icon"
            label="طباعة قائمة خطط العمولة"
            payload={() => ({
              entity: {
                title: "خطط العمولة لموظفي العمرة",
                total: counts.total,
                active: counts.active,
                suspended: counts.suspended,
                pending: counts.pending,
              },
              items: filtered.map((p: any) => ({
                "الموظف": p.employeeName ?? `#${p.employeeId}`,
                "اسم الخطة": p.planName || "—",
                "الموسم": p.seasonTitle ?? "—",
                "الراتب الأساسي": Number(p.baseSalary || 0),
                "نوع العمولة": (TYPE_LABEL as any)[p.commissionType] ?? p.commissionType ?? "—",
                "عدد الشرائح": p.tierCount ?? "—",
                "تاريخ الاعتماد": p.approvedAt ? formatUmrahDate(p.approvedAt) : "—",
                "الحالة": (STATUS_LABEL as any)[p.status]?.label ?? p.status ?? "—",
              })),
            })}
          />
          <Button asChild variant="outline" className="gap-2">
            <Link href="/umrah/commission-calculations">
              <Calculator className="h-4 w-4" />
              الحسابات المنفّذة
            </Link>
          </Button>
          <GuardedButton perm="umrah:write" asChild className="gap-2">
            <Link href="/umrah/commission-plans/new">
              <Plus className="h-4 w-4" />
              خطة جديدة
            </Link>
          </GuardedButton>
        </div>
      }
    >
      <UmrahTabsNav />

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-status-info-surface flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-status-info-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatNumber(counts.total)}</p>
            <p className="text-xs text-muted-foreground">إجمالي الخطط</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatNumber(calculationsCount)}</p>
            <p className="text-xs text-muted-foreground">احتسابات مسجَّلة</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-700">{formatNumber(counts.active)}</p>
            <p className="text-xs text-muted-foreground">مفعّلة</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-status-warning-surface flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-status-warning-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-status-warning-foreground">{formatNumber(counts.pending)}</p>
            <p className="text-xs text-muted-foreground">بانتظار الاعتماد</p>
          </div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث باسم الخطة أو الموظف...",
          statuses: Object.entries(STATUS_LABEL).map(([value, v]) => ({ value, label: v.label })),
          extraFilters: [
            { key: "employeeId", label: "الموظف", options: employees.map((e: any) => ({ value: String(e.id), label: e.fullName ?? e.name })) },
            { key: "seasonId", label: "الموسم", options: seasons.map((s: any) => ({ value: String(s.id), label: s.title })) },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <PageStateWrapper
        isLoading={plansQ.isLoading}
        error={plansQ.error}
        onRetry={() => plansQ.refetch()}
      >
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="لا توجد خطط عمولة مطابقة"
          pageSize={20}
          noToolbar
        />
      </PageStateWrapper>
    </PageShell>
  );
}
