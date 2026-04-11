import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Star, Target, TrendingUp, Users, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";


export default function PerformancePage() {
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data } = useApiQuery<any>(["performance"], "/hr/performance");
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const avgScore = items.length > 0
    ? (items.reduce((s: number, p: any) => s + Number(p.overallScore || 0), 0) / items.length).toFixed(1)
    : "0";

  const kpis = [
    { label: "إجمالي التقييمات", value: items.length, icon: Target, color: "text-blue-600 bg-blue-50" },
    { label: "متوسط الأداء", value: avgScore + "/5", icon: TrendingUp, color: "text-green-600 bg-green-50" },
    { label: "مكتملة", value: items.filter((i: any) => i.status === "completed").length, icon: Award, color: "text-purple-600 bg-purple-50" },
    { label: "قيد التقييم", value: items.filter((i: any) => i.status === "draft" || i.status === "in_progress").length, icon: Users, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">تقييمات الأداء</h1>
          <p className="text-sm text-muted-foreground mt-0.5">متابعة تقييمات أداء الموظفين ونتائجهم</p>
        </div>
        <Link href="/hr/performance/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />تقييم جديد</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
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
            { value: "draft", label: "مسودة" },
            { value: "in_progress", label: "قيد التقييم" },
            { value: "completed", label: "مكتمل" },
            { value: "reviewed", label: "تمت المراجعة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="period" label="الفترة" sortState={sortState} onSort={handleSort} />
              <th className="p-3 text-start font-medium">التقييم</th>
              <SortableTableHead column="overallScore" label="الدرجة" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(paginatedData || []).map((p: any) => {
              const score = Number(p.overallScore || 0);
              return (
                <tr key={p.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 text-xs font-bold">
                        {(p.employeeName || "؟").charAt(0)}
                      </div>
                      <div>
                        <span className="font-medium block">{p.employeeName}</span>
                        {p.empNumber && <span className="text-xs text-gray-400">{p.empNumber}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-gray-500">{p.period || "-"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("w-4 h-4", i < score ? "text-yellow-400 fill-yellow-400" : "text-gray-200")} />
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={cn("font-bold", score >= 4 ? "text-green-600" : score >= 3 ? "text-yellow-600" : "text-red-600")}>
                      {score.toFixed(1)}
                    </span>
                  </td>
                  <td className="p-3"><StatusBadge status={p.status || "draft"} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد تقييمات</td></tr>}
          </TableBody>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div></div>
    </div>
  );
}
