import { useState } from "react";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserCheck, UserX, Users, Search, ToggleLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function EmployeeActivationPage() {
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const employees = data?.data || [];
  const { toast } = useToast();

  const filtered = applyFilters(employees, filters, { searchFields: ["name", "empNumber"], statusField: "status" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const active = employees.filter((e: any) => e.status === "active").length;
  const inactive = employees.filter((e: any) => e.status !== "active").length;

  const kpis = [
    { label: "إجمالي الموظفين", value: employees.length, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "نشطين", value: active, icon: UserCheck, color: "text-green-600 bg-green-50" },
    { label: "غير نشطين", value: inactive, icon: UserX, color: "text-red-600 bg-red-50" },
    { label: "معلقين", value: employees.filter((e: any) => e.status === "suspended").length, icon: ToggleLeft, color: "text-yellow-600 bg-yellow-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">تفعيل / تعليق الموظفين</h1>
        <p className="text-sm text-muted-foreground mt-0.5">إدارة حالة الموظفين النشطين والمعلقين</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
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
          searchPlaceholder: "بحث بالاسم أو الرقم الوظيفي...",
          statuses: [
            { value: "active", label: "نشط" },
            { value: "suspended", label: "معلق" },
            { value: "terminated", label: "منتهي" },
          ],
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="name" label="الموظف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="empNumber" label="الرقم الوظيفي" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="jobTitle" label="المنصب" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="branchName" label="الفرع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="salary" label="الراتب" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {(paginatedData || []).map((e: any) => (
              <tr key={e.id} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", e.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                      {(e.name || "؟").charAt(0)}
                    </div>
                    <span className="font-medium">{e.name}</span>
                  </div>
                </td>
                <td className="p-3 text-gray-500 font-mono">{e.empNumber || "-"}</td>
                <td className="p-3">{e.jobTitle || "-"}</td>
                <td className="p-3 text-gray-500">{e.branchName || "-"}</td>
                <td className="p-3">{formatCurrency(Number(e.salary || 0))}</td>
                <td className="p-3">
                  <Badge className={e.status === "active" ? "bg-green-100 text-green-700" : e.status === "terminated" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                    {e.status === "active" ? "نشط" : e.status === "terminated" ? "منتهي" : e.status || "غير محدد"}
                  </Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا يوجد موظفين</td></tr>}
          </TableBody>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div></div>
    </div>
  );
}
