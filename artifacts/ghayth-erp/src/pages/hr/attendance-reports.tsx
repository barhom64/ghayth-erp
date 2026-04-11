import { useState } from "react";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, Users, AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function AttendanceReportsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: statsData } = useApiQuery<any>(["attendance-stats", month], `/hr/attendance-stats?month=${month}`);
  const { data: monthlyData } = useApiQuery<any>(["monthly-attendance", month], `/hr/monthly-attendance?month=${month}`);
  const { data: deductionsData } = useApiQuery<any>(["deductions", month], `/hr/deductions?month=${month}`);
  const stats = statsData || {};
  const monthly = monthlyData?.data || [];
  const deductions = deductionsData?.data || [];
  const filteredMonthly = applyFilters(monthly, filters, { searchFields: ["employeeName"] });
  const { sortedData: sortedMonthly, sortState: monthlySortState, handleSort: handleMonthlySort } = useSortedData(filteredMonthly);
  const paginatedMonthly = sortedMonthly?.slice((page - 1) * pageSize, page * pageSize);
  const filteredDeductions = applyFilters(deductions, filters, { searchFields: ["employeeName"], statusField: "status" });
  const { sortedData: sortedDeductions, sortState: dedSortState, handleSort: handleDedSort } = useSortedData(filteredDeductions);

  const kpis = [
    { label: "أيام الحضور", value: stats.present ?? 0, icon: Users, color: "text-green-600 bg-green-50" },
    { label: "أيام الغياب", value: stats.absent ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "حالات التأخير", value: stats.late ?? 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي الخصومات", value: formatCurrency(deductions.reduce((s: number, d: any) => s + Number(d.amount || 0), 0)), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">تقارير الحضور والانصراف</h1>
          <p className="text-sm text-muted-foreground mt-0.5">تقارير شهرية وتفصيلية عن الحضور والتأخير</p>
        </div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
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
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filteredMonthly.length}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">ملخص الحضور الشهري للموظفين</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <SortableTableHead column="employeeName" label="الموظف" sortState={monthlySortState} onSort={handleMonthlySort} />
              <SortableTableHead column="presentDays" label="أيام الحضور" sortState={monthlySortState} onSort={handleMonthlySort} />
              <SortableTableHead column="absentDays" label="أيام الغياب" sortState={monthlySortState} onSort={handleMonthlySort} />
              <SortableTableHead column="lateDays" label="أيام التأخير" sortState={monthlySortState} onSort={handleMonthlySort} />
              <SortableTableHead column="totalLateMinutes" label="دقائق التأخير" sortState={monthlySortState} onSort={handleMonthlySort} />
              <SortableTableHead column="totalDeduction" label="الخصومات" sortState={monthlySortState} onSort={handleMonthlySort} />
            </TableRow></TableHeader>
            <TableBody>
              {(paginatedMonthly || []).map((m: any) => (
                <tr key={m.id || m.assignmentId} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{m.employeeName}</td>
                  <td className="p-3 text-green-600">{m.presentDays || 0}</td>
                  <td className="p-3 text-red-600">{m.absentDays || 0}</td>
                  <td className="p-3 text-yellow-600">{m.lateDays || 0}</td>
                  <td className="p-3">{m.totalLateMinutes || 0}</td>
                  <td className="p-3 text-red-600">{formatCurrency(Number(m.totalDeduction || 0))}</td>
                </tr>
              ))}
              {filteredMonthly.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد بيانات لهذا الشهر</td></tr>}
            </TableBody>
          </Table>
          <PaginationBar page={page} pageSize={pageSize} total={filteredMonthly.length} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">تفاصيل الخصومات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <SortableTableHead column="employeeName" label="الموظف" sortState={dedSortState} onSort={handleDedSort} />
              <SortableTableHead column="type" label="النوع" sortState={dedSortState} onSort={handleDedSort} />
              <SortableTableHead column="minutes" label="الدقائق" sortState={dedSortState} onSort={handleDedSort} />
              <SortableTableHead column="amount" label="المبلغ" sortState={dedSortState} onSort={handleDedSort} />
              <SortableTableHead column="status" label="الحالة" sortState={dedSortState} onSort={handleDedSort} />
            </TableRow></TableHeader>
            <TableBody>
              {(sortedDeductions || []).map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{d.employeeName}</td>
                  <td className="p-3">{d.type === "late" ? "تأخير" : d.type === "absence" ? "غياب" : d.type}</td>
                  <td className="p-3">{d.minutes || 0}</td>
                  <td className="p-3 text-red-600 font-medium">{formatCurrency(Number(d.amount || 0))}</td>
                  <td className="p-3"><Badge className={d.status === "pending_payroll" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}>{d.status === "pending_payroll" ? "معلق" : "مطبق"}</Badge></td>
                </tr>
              ))}
              {deductions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد خصومات</td></tr>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
