import { useState } from "react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, DollarSign, Users, TrendingUp, FileText, Eye } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";


function PayrollLines({ runId }: { runId: number }) {
  const { data } = useApiQuery<any>(["payroll-lines", String(runId)], `/hr/payroll/${runId}/lines`, !!runId);
  const lines = data?.data || [];
  if (lines.length === 0) return <p className="text-center text-gray-400 py-4">لا توجد تفاصيل</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-gray-50">
          <th className="p-2 text-start">الموظف</th>
          <th className="p-2 text-start">الأساسي</th>
          <th className="p-2 text-start">الإجمالي</th>
          <th className="p-2 text-start">التأمينات</th>
          <th className="p-2 text-start">الخصومات</th>
          <th className="p-2 text-start">الصافي</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l: any) => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className="p-2 font-medium">{l.employeeName}</td>
            <td className="p-2">{Number(l.basic).toLocaleString("ar-SA")}</td>
            <td className="p-2">{Number(l.grossSalary).toLocaleString("ar-SA")}</td>
            <td className="p-2 text-orange-600">{Number(l.gosi).toLocaleString("ar-SA")}</td>
            <td className="p-2 text-red-600">{Number(l.lateDeduction).toLocaleString("ar-SA")}</td>
            <td className="p-2 font-bold text-green-700">{Number(l.netSalary).toLocaleString("ar-SA")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PayrollPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data } = useApiQuery<any>(["payroll", scopeQueryString], `/hr/payroll${scopeSuffix}`);
  const items = data?.data || [];
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = applyFilters(items, filters, { searchFields: ["period"], statusField: "status", dateField: "createdAt" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const totalNet = items.reduce((s: number, r: any) => s + Number(r.totalAmount || r.totalNet || 0), 0);
  const totalEmps = items.reduce((s: number, r: any) => s + Number(r.employeeCount || 0), 0);

  const kpis = [
    { label: "إجمالي المسيرات", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي المبالغ", value: formatCurrency(totalNet), icon: DollarSign, color: "text-green-600 bg-green-50" },
    { label: "إجمالي الموظفين", value: totalEmps, icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "متوسط الراتب", value: totalEmps > 0 ? formatCurrency(Math.round(totalNet / totalEmps)) : "0", icon: TrendingUp, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">مسيرات الرواتب</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة دورات الرواتب الشهرية والسنوية</p>
        </div>
        <div className="flex gap-2">
          <ExportButton endpoint="/export/excel/payroll" filename="payroll.xlsx" type="excel" label="تصدير Excel" />
          <Link href="/hr/payroll/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />تشغيل مسير رواتب</Button>
          </Link>
        </div>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالفترة...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "completed", label: "مكتمل" },
            { value: "approved", label: "معتمد" },
            { value: "paid", label: "مدفوع" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <Tabs defaultValue="runs" dir="rtl">
        <TabsList>
          <TabsTrigger value="runs">المسيرات</TabsTrigger>
          <TabsTrigger value="details">التفاصيل</TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead column="period" label="الفترة" sortState={sortState} onSort={handleSort} />
                    <SortableTableHead column="employeeCount" label="الموظفين" sortState={sortState} onSort={handleSort} />
                    <SortableTableHead column="totalAmount" label="الصافي الإجمالي" sortState={sortState} onSort={handleSort} />
                    <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                    <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <DataTableWrapper
                  isLoading={false}
                  data={paginatedData}
                  colCount={6}
                  emptyMessage="لا توجد مسيرات رواتب"
                >
                  {(paginatedData || []).map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="font-medium">{p.period || `${p.month}`}</TableCell>
                      <TableCell>{p.employeeCount || 0}</TableCell>
                      <TableCell className="font-bold text-green-700">{formatCurrency(Number(p.totalAmount || p.totalNet || 0))}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-gray-500">{p.createdAt ? formatDateAr(p.createdAt) : "-"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedRun(p.id)}>
                          <Eye className="h-4 w-4 me-1" />التفاصيل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTableWrapper>
              </Table>
            </div>
            <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
          </div>
        </TabsContent>
        <TabsContent value="details">
          {selectedRun ? (
            <Card>
              <CardHeader><CardTitle className="text-base">تفاصيل المسير #{selectedRun}</CardTitle></CardHeader>
              <CardContent className="p-0"><PayrollLines runId={selectedRun} /></CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-8 text-center text-gray-400">اختر مسير رواتب لعرض التفاصيل</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
