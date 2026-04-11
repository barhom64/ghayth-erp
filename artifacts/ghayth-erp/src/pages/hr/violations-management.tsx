import { useState } from "react";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Scale, DollarSign, Search, Shield, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

const severityMap: Record<string, { label: string; color: string }> = {
  low: { label: "منخفض", color: "bg-green-100 text-green-700" },
  medium: { label: "متوسط", color: "bg-yellow-100 text-yellow-700" },
  high: { label: "مرتفع", color: "bg-orange-100 text-orange-700" },
  critical: { label: "حرج", color: "bg-red-100 text-red-700" },
};

export default function ViolationsManagementPage() {
  const [search, setSearch] = useState("");
  const { data } = useApiQuery<any>(["violations"], "/hr/violations");
  const { data: stats } = useApiQuery<any>(["violations-stats"], "/hr/violations-stats");
  const items = data?.data || [];
  const { toast } = useToast();
  const qc = useQueryClient();
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const updateViolation = async (id: number, updates: Record<string, string>) => {
    setResolvingId(id);
    try {
      await apiFetch(`/hr/violations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      toast({ title: "تم التحديث" });
      qc.invalidateQueries({ queryKey: ["violations"] });
      qc.invalidateQueries({ queryKey: ["violations-stats"] });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    } finally {
      setResolvingId(null);
    }
  };

  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const byType = items.reduce((acc: Record<string, number>, v: any) => {
    const t = v.type || "أخرى";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">إدارة المخالفات المتقدمة</h1>
        <p className="text-sm text-muted-foreground mt-0.5">تحليل وإدارة المخالفات مع التصعيد التلقائي</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المخالفات", value: stats?.total ?? items.length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
          { label: "نشطة", value: stats?.active ?? 0, icon: Scale, color: "text-yellow-600 bg-yellow-50" },
          { label: "إجمالي الخصومات", value: formatCurrency(stats?.totalDeductions ?? 0), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
          { label: "أنواع المخالفات", value: Object.keys(byType).length, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="list" dir="rtl">
        <TabsList>
          <TabsTrigger value="list">القائمة</TabsTrigger>
          <TabsTrigger value="analysis">التحليل</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <div className="mb-4">
            <AdvancedFilters
              config={{
                searchPlaceholder: "بحث بالاسم...",
                statuses: Object.entries(severityMap).map(([k, v]) => ({ value: k, label: v.label })),
                showDateRange: true,
              }}
              values={filters}
              onChange={(v) => { setFilters(v); setPage(1); }}
              resultCount={filtered.length}
            />
          </div>
          <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="severity" label="الشدة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="deduction" label="الخصم" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                <th className="p-3 text-start">إجراء</th>
              </TableRow></TableHeader>
              <TableBody>
                {(paginatedData || []).map((v: any) => (
                  <tr key={v.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{v.employeeName}</td>
                    <td className="p-3">{v.type}</td>
                    <td className="p-3 text-gray-500 max-w-48 truncate">{v.description}</td>
                    <td className="p-3"><Badge className={severityMap[v.severity]?.color || ""}>{severityMap[v.severity]?.label || v.severity}</Badge></td>
                    <td className="p-3 text-red-600 font-medium">{formatCurrency(Number(v.deduction || 0))}</td>
                    <td className="p-3"><Badge className={v.status === "active" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>{v.status === "active" ? "نشط" : v.status}</Badge></td>
                    <td className="p-3">
                      {v.status === "active" && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => updateViolation(v.id, { status: "resolved" })} disabled={resolvingId === v.id}>
                          <Shield className="h-3 w-3 me-1" />{resolvingId === v.id ? "..." : "حل"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا توجد مخالفات</td></tr>}
              </TableBody>
            </Table>
            <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
          </div></div>
        </TabsContent>
        <TabsContent value="analysis">
          <Card>
            <CardHeader><CardTitle className="text-base">توزيع المخالفات حسب النوع</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(byType).sort(([,a], [,b]) => (b as number) - (a as number)).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-sm w-40 truncate">{type}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${(count as number / items.length) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium w-8">{count as number}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
