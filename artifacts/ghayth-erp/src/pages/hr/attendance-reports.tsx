import { useState } from "react";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
  exportToCSV,
} from "@workspace/ui-core";
import { Clock, Users, AlertTriangle, DollarSign } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
export default function AttendanceReportsPage() {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [filters, setFilters] = useFilters();
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useApiQuery<any>(["attendance-stats", month], `/hr/attendance-stats?month=${month}`);
  const { data: monthlyData, isLoading: monthlyLoading, isError: monthlyError } = useApiQuery<any>(["monthly-attendance", month], `/hr/monthly-attendance?month=${month}`);
  const { data: deductionsData } = useApiQuery<any>(["deductions", month], `/hr/deductions?month=${month}`);
  const stats = statsData || {};
  const monthly: any[] = monthlyData?.data || [];
  const deductions: any[] = deductionsData?.data || [];
  const isLoading = statsLoading || monthlyLoading;
  const isError = statsError || monthlyError;

  const filteredMonthly = applyFilters(monthly, filters, { searchFields: ["employeeName"] });
  const filteredDeductions = applyFilters(deductions, filters, { searchFields: ["employeeName"], statusField: "status" });

  // Ensure every row has a numeric id (monthly rows may rely on assignmentId)
  const monthlyRows = filteredMonthly.map((m: any, i: number) => ({
    ...m,
    id: Number(m.id ?? m.assignmentId ?? i + 1),
  }));
  const deductionsRows = filteredDeductions.map((d: any, i: number) => ({
    ...d,
    id: Number(d.id ?? i + 1),
  }));
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(monthlyRows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const kpis = [
    { label: "أيام الحضور", value: stats.present ?? 0, icon: Users, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "أيام الغياب", value: stats.absent ?? 0, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "حالات التأخير", value: stats.late ?? 0, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "إجمالي الخصومات", value: formatCurrency(deductions.reduce((s: number, d: any) => s + Number(d.amount || 0), 0)), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
  ];

  const monthlyColumns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (m) => <span className="font-medium">{m.employeeName}</span> },
    { key: "presentDays", header: "أيام الحضور", sortable: true, render: (m) => <span className="text-status-success-foreground">{m.presentDays || 0}</span> },
    { key: "absentDays", header: "أيام الغياب", sortable: true, render: (m) => <span className="text-status-error-foreground">{m.absentDays || 0}</span> },
    { key: "lateDays", header: "أيام التأخير", sortable: true, render: (m) => <span className="text-status-warning-foreground">{m.lateDays || 0}</span> },
    { key: "totalLateMinutes", header: "دقائق التأخير", sortable: true, render: (m) => m.totalLateMinutes || 0 },
    { key: "totalDeduction", header: "الخصومات", sortable: true, render: (m) => <span className="text-status-error-foreground">{formatCurrency(Number(m.totalDeduction || 0))}</span> },
  ];

  const deductionsColumns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (d) => <span className="font-medium">{d.employeeName}</span> },
    { key: "type", header: "النوع", sortable: true, render: (d) => d.type === "late" ? "تأخير" : d.type === "absence" ? "غياب" : d.type },
    { key: "minutes", header: "الدقائق", sortable: true, render: (d) => d.minutes || 0 },
    { key: "amount", header: "المبلغ", sortable: true, render: (d) => <span className="text-status-error-foreground font-medium">{formatCurrency(Number(d.amount || 0))}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (d) => (
      <PageStatusBadge status={d.status} />
    ) },
  ];

  return (
    <PageShell
      title="تقارير الحضور والانصراف"
      subtitle="تقارير شهرية وتفصيلية عن الحضور والتأخير"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تقارير الحضور والانصراف" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_attendance_summary"
            entityId={month}
            size="icon"
            payload={() => ({
              entity: {
                title: `تقرير الحضور والانصراف — ${month}`,
                month,
                totalDays: kpis?.[0]?.value ?? 0,
              },
              items: printRows.map((r: any) => ({
                "الموظف": r.employeeName || r.name || "—",
                "أيام الحضور": r.presentDays ?? r.totalPresent ?? 0,
                "أيام الغياب": r.absentDays ?? r.totalAbsent ?? 0,
                "التأخر (دقيقة)": r.lateMinutes ?? 0,
                "ساعات إضافية": r.overtimeHours ?? 0,
              })),
            })}
          />
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
          statuses: [
            { value: "pending_payroll", label: "معلق" },
            { value: "applied", label: "مطبق" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filteredMonthly || [],
            [
              { key: "employeeName", label: "الموظف" },
              { key: "period", label: "الفترة" },
              { key: "presentDays", label: "أيام الحضور" },
              { key: "absentDays", label: "أيام الغياب" },
              { key: "lateMinutes", label: "إجمالي دقائق التأخر" },
              { key: "overtimeMinutes", label: "دقائق العمل الإضافي" },
              { key: "totalDeduction", label: "إجمالي الخصم" },
              { key: "status", label: "الحالة" },
            ],
            "تقرير-الحضور-الشهري",
          )
        }
        resultCount={filteredMonthly.length}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">ملخص الحضور الشهري للموظفين</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={monthlyColumns}
            onSortedDataChange={setPrintRows}
            data={monthlyRows}
            noToolbar
            emptyMessage="لا توجد بيانات لهذا الشهر"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">تفاصيل الخصومات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={deductionsColumns}
            data={deductionsRows}
            noToolbar
            emptyMessage="لا توجد خصومات"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
