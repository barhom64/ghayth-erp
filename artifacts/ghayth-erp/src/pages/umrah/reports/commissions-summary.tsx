/**
 * Commissions Summary Report — §11 partial → full (#1870)
 *
 * Payroll-style rollup over employee_commission_calculations.
 * Same pattern as /umrah/reports/violations-summary: 5 KPIs + 3
 * breakdown tabs (status / month / employee) + recent 100 rows
 * with drill-through. The existing /umrah/commission-calculations
 * page stays as the list/edit screen.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp } from "lucide-react";

interface SummaryResp {
  kpis: {
    total: number;
    calculatedAmount: number;
    paidAmount: number;
    pendingAmount: number;
    employeesCount: number;
  };
  byStatus:   Array<{ status: string; count: number; total: number }>;
  byMonth:    Array<{ year: number; month: number; count: number; total: number }>;
  byEmployee: Array<{ employeeId: number; employeeName: string | null; count: number; total: number }>;
  recent: Array<{
    id: number;
    planId: number;
    planName: string | null;
    employeeId: number;
    employeeName: string | null;
    month: number;
    year: number;
    status: string;
    finalAmount: string | number;
    commissionAmount: string | number;
    totalMutamers: number;
    conditionMet: boolean;
    createdAt: string;
  }>;
}

interface SeasonOpt { id: number; title: string }
interface EmployeeOpt { id: number; fullName: string }

const STATUS_LABEL_AR: Record<string, string> = {
  calculated: "محتسبة",
  paid:       "مدفوعة",
  posted:     "مرحَّلة",
  approved:   "معتمدة",
  pending:    "بانتظار الاعتماد",
  cancelled:  "ملغاة",
};

const STATUS_TONE: Record<string, string> = {
  calculated: "bg-sky-100 text-sky-700 border-sky-300",
  paid:       "bg-emerald-100 text-emerald-700 border-emerald-300",
  posted:     "bg-indigo-100 text-indigo-700 border-indigo-300",
  approved:   "bg-emerald-100 text-emerald-700 border-emerald-300",
  pending:    "bg-amber-100 text-amber-700 border-amber-300",
  cancelled:  "bg-slate-100 text-slate-600 border-slate-300",
};

const MONTH_NAMES_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export default function CommissionsSummaryReport() {
  const [seasonFilter, setSeasonFilter]     = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [yearFilter, setYearFilter]         = useState("");

  const qsParts: string[] = [];
  if (seasonFilter !== "all")    qsParts.push(`seasonId=${seasonFilter}`);
  if (employeeFilter !== "all")  qsParts.push(`employeeId=${employeeFilter}`);
  if (statusFilter !== "all")    qsParts.push(`status=${statusFilter}`);
  if (yearFilter)                qsParts.push(`year=${yearFilter}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<SummaryResp>(
    ["umrah-commissions-summary", seasonFilter, employeeFilter, statusFilter, yearFilter],
    `/umrah/reports/commissions-summary${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const { data: employeesResp } = useApiQuery<{ data: EmployeeOpt[] }>(
    ["employees-select"],
    "/employees",
  );
  const seasons = seasonsResp?.data ?? [];
  const employees = employeesResp?.data ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const k = data?.kpis;

  return (
    <PageShell
      title="تقرير العمولات (ملخص)"
      subtitle="مؤشرات إجمالية + تفصيل حسب الحالة / الشهر / الموظف + آخر 100 احتساب"
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { href: "/umrah/reports", label: "التقارير" },
        { label: "ملخص العمولات" },
      ]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="commissions-filters">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الموسم</Label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger data-testid="commissions-filter-season"><SelectValue placeholder="كل المواسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الموظف</Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger data-testid="commissions-filter-employee"><SelectValue placeholder="كل الموظفين" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الحالة</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="commissions-filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABEL_AR).map(([k2, v]) => (
                  <SelectItem key={k2} value={k2}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">السنة</Label>
            <Input
              type="number"
              placeholder="مثال: 2026"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              data-testid="commissions-filter-year"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="عدد الاحتسابات" value={k?.total ?? 0} testid="commissions-kpi-total" />
        <KpiCard label="عدد الموظفين" value={k?.employeesCount ?? 0} testid="commissions-kpi-employees" />
        <KpiCard
          label="إجمالي المحتسب"
          value={k?.calculatedAmount ?? 0}
          testid="commissions-kpi-calculated"
          asCurrency
        />
        <KpiCard
          label="المدفوع"
          value={k?.paidAmount ?? 0}
          testid="commissions-kpi-paid"
          tone="success"
          asCurrency
        />
        <KpiCard
          label="غير المدفوع"
          value={k?.pendingAmount ?? 0}
          testid="commissions-kpi-pending"
          tone="error"
          asCurrency
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <Tabs defaultValue="status">
            <TabsList data-testid="commissions-breakdown-tabs">
              <TabsTrigger value="status"   data-testid="commissions-tab-status">حسب الحالة</TabsTrigger>
              <TabsTrigger value="month"    data-testid="commissions-tab-month">حسب الشهر</TabsTrigger>
              <TabsTrigger value="employee" data-testid="commissions-tab-employee">حسب الموظف</TabsTrigger>
            </TabsList>

            <TabsContent value="status">
              <BreakdownRows
                rows={(data?.byStatus ?? []).map((r) => ({
                  label: STATUS_LABEL_AR[r.status] ?? r.status,
                  tone: STATUS_TONE[r.status],
                  count: r.count,
                  total: r.total,
                  key: r.status,
                }))}
                testid="commissions-breakdown-status"
              />
            </TabsContent>
            <TabsContent value="month">
              <BreakdownRows
                rows={(data?.byMonth ?? []).map((r) => ({
                  label: `${MONTH_NAMES_AR[r.month - 1] ?? r.month} ${r.year}`,
                  count: r.count,
                  total: r.total,
                  key: `${r.year}-${r.month}`,
                }))}
                testid="commissions-breakdown-month"
              />
            </TabsContent>
            <TabsContent value="employee">
              <BreakdownRows
                rows={(data?.byEmployee ?? []).map((r) => ({
                  label: r.employeeName ?? `#${r.employeeId}`,
                  href: `/employees/${r.employeeId}`,
                  count: r.count,
                  total: r.total,
                  key: String(r.employeeId),
                }))}
                testid="commissions-breakdown-employee"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              آخر 100 احتساب
            </p>
          </div>
          {(data?.recent ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="commissions-recent-empty">
              لا احتسابات تطابق الفلاتر.
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="commissions-recent-table">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">الموظف</th>
                  <th className="p-2 text-start">الخطة</th>
                  <th className="p-2 text-start">الشهر</th>
                  <th className="p-2 text-start">الحالة</th>
                  <th className="p-2 text-end">عدد المعتمرين</th>
                  <th className="p-2 text-end">المحتسبة</th>
                  <th className="p-2 text-end">النهائية</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).map((r) => {
                  const tone = STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-700 border-slate-300";
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/20" data-testid={`commissions-recent-row-${r.id}`}>
                      <td className="p-2 font-mono text-xs">#{r.id}</td>
                      <td className="p-2 text-xs">
                        <Link href={`/employees/${r.employeeId}`} className="text-blue-600 hover:underline">
                          {r.employeeName ?? `#${r.employeeId}`}
                        </Link>
                      </td>
                      <td className="p-2 text-xs">
                        <Link href={`/umrah/commission-plans/${r.planId}/edit`} className="text-blue-600 hover:underline">
                          {r.planName ?? `#${r.planId}`}
                        </Link>
                      </td>
                      <td className="p-2 text-xs">
                        {MONTH_NAMES_AR[r.month - 1] ?? r.month} {r.year}
                      </td>
                      <td className="p-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${tone}`}>
                          {STATUS_LABEL_AR[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="p-2 text-end font-mono">{r.totalMutamers}</td>
                      <td className="p-2 text-end font-mono">{formatCurrency(Number(r.commissionAmount) || 0)}</td>
                      <td className="p-2 text-end font-mono font-bold">
                        {formatCurrency(Number(r.finalAmount) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function KpiCard({
  label, value, testid, asCurrency, tone,
}: {
  label: string;
  value: number;
  testid: string;
  asCurrency?: boolean;
  tone?: "error" | "success";
}) {
  const cls = tone === "error" ? "text-status-error-foreground"
            : tone === "success" ? "text-status-success-foreground"
            : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${cls}`} data-testid={`${testid}-value`}>
          {asCurrency ? formatCurrency(value) : value}
        </p>
      </CardContent>
    </Card>
  );
}

function BreakdownRows({
  rows, testid,
}: {
  rows: Array<{ key: string; label: string; tone?: string; href?: string; count: number; total: number }>;
  testid: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">لا بيانات.</p>;
  }
  const totalCount = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <table className="w-full text-sm mt-2" data-testid={testid}>
      <thead className="bg-muted/40">
        <tr>
          <th className="p-2 text-start">العنصر</th>
          <th className="p-2 text-end">العدد</th>
          <th className="p-2 text-end">إجمالي العمولة</th>
          <th className="p-2 text-end">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = totalCount > 0 ? Math.round((r.count / totalCount) * 100) : 0;
          return (
            <tr key={r.key} className="border-t" data-testid={`${testid}-row-${r.key}`}>
              <td className="p-2">
                {r.href ? (
                  <Link href={r.href} className="text-blue-600 hover:underline">{r.label}</Link>
                ) : r.tone ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${r.tone}`}>{r.label}</span>
                ) : r.label}
              </td>
              <td className="p-2 text-end font-mono">{r.count}</td>
              <td className="p-2 text-end font-mono">{formatCurrency(r.total)}</td>
              <td className="p-2 text-end font-mono">{pct}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}