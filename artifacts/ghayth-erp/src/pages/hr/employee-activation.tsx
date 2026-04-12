import { formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCheck, UserX, Users, ToggleLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

export default function EmployeeActivationPage() {
  const [filters, setFilters] = useFilters();
  const { data } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const employees = data?.data || [];

  const filtered = applyFilters(employees, filters, { searchFields: ["name", "empNumber"], statusField: "status" });

  const active = employees.filter((e: any) => e.status === "active").length;
  const inactive = employees.filter((e: any) => e.status !== "active").length;

  const kpis = [
    { label: "إجمالي الموظفين", value: employees.length, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "نشطين", value: active, icon: UserCheck, color: "text-green-600 bg-green-50" },
    { label: "غير نشطين", value: inactive, icon: UserX, color: "text-red-600 bg-red-50" },
    { label: "معلقين", value: employees.filter((e: any) => e.status === "suspended").length, icon: ToggleLeft, color: "text-yellow-600 bg-yellow-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الموظف",
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", e.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
            {(e.name || "؟").charAt(0)}
          </div>
          <span className="font-medium">{e.name}</span>
        </div>
      ),
    },
    {
      key: "empNumber",
      header: "الرقم الوظيفي",
      sortable: true,
      className: "text-gray-500 font-mono",
      render: (e) => e.empNumber || "-",
    },
    {
      key: "jobTitle",
      header: "المنصب",
      sortable: true,
      render: (e) => e.jobTitle || "-",
    },
    {
      key: "branchName",
      header: "الفرع",
      sortable: true,
      className: "text-gray-500",
      render: (e) => e.branchName || "-",
    },
    {
      key: "salary",
      header: "الراتب",
      sortable: true,
      render: (e) => formatCurrency(Number(e.salary || 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (e) => (
        <Badge className={e.status === "active" ? "bg-green-100 text-green-700" : e.status === "terminated" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
          {e.status === "active" ? "نشط" : e.status === "terminated" ? "منتهي" : e.status || "غير محدد"}
        </Badge>
      ),
    },
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
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا يوجد موظفين"
        pageSize={20}
      />
    </div>
  );
}
