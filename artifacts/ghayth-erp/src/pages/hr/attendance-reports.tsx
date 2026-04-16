import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, AlertTriangle, DollarSign } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";

export default function AttendanceReportsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filters, setFilters] = useFilters();
  const { data: statsData } = useApiQuery<any>(["attendance-stats", month], `/hr/attendance-stats?month=${month}`);
  const { data: monthlyData } = useApiQuery<any>(["monthly-attendance", month], `/hr/monthly-attendance?month=${month}`);
  const { data: deductionsData } = useApiQuery<any>(["deductions", month], `/hr/deductions?month=${month}`);
  const stats = statsData || {};
  const monthly: any[] = monthlyData?.data || [];
  const deductions: any[] = deductionsData?.data || [];
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

  const kpis = [
    { label: "أيام الحضور", value: stats.present ?? 0, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "أيام الغياب", value: stats.absent ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "حالات التأخير", value: stats.late ?? 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي الخصومات", value: formatCurrency(deductions.reduce((s: number, d: any) => s + Number(d.amount || 0), 0)), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
  ];

  const monthlyColumns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (m) => <span className="font-medium">{m.employeeName}</span> },
    { key: "presentDays", header: "أيام الحضور", sortable: true, render: (m) => <span className="text-green-600">{m.presentDays || 0}</span> },
    { key: "absentDays", header: "أيام الغياب", sortable: true, render: (m) => <span className="text-red-600">{m.absentDays || 0}</span> },
    { key: "lateDays", header: "أيام التأخير", sortable: true, render: (m) => <span className="text-yellow-600">{m.lateDays || 0}</span> },
    { key: "totalLateMinutes", header: "دقائق التأخير", sortable: true, render: (m) => m.totalLateMinutes || 0 },
    { key: "totalDeduction", header: "الخصومات", sortable: true, render: (m) => <span className="text-red-600">{formatCurrency(Number(m.totalDeduction || 0))}</span> },
  ];

  const deductionsColumns: DataTableColumn<any>[] = [
    { key: "employeeName", header: "الموظف", sortable: true, render: (d) => <span className="font-medium">{d.employeeName}</span> },
    { key: "type", header: "النوع", sortable: true, render: (d) => d.type === "late" ? "تأخير" : d.type === "absence" ? "غياب" : d.type },
    { key: "minutes", header: "الدقائق", sortable: true, render: (d) => d.minutes || 0 },
    { key: "amount", header: "المبلغ", sortable: true, render: (d) => <span className="text-red-600 font-medium">{formatCurrency(Number(d.amount || 0))}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (d) => (
      <Badge className={d.status === "pending_payroll" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}>
        {d.status === "pending_payroll" ? "معلق" : "مطبق"}
      </Badge>
    ) },
  ];

  return (
    <PageShell
      title="تقارير الحضور والانصراف"
      subtitle="تقارير شهرية وتفصيلية عن الحضور والتأخير"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تقارير الحضور والانصراف" }]}
      actions={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />}
    >
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
        resultCount={filteredMonthly.length}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">ملخص الحضور الشهري للموظفين</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={monthlyColumns}
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
