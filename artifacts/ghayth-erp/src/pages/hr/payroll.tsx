import { useState } from "react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Phase A — HR payroll list on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, DollarSign, Users, TrendingUp, FileText, Eye } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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

  const filtered = applyFilters(items, filters, { searchFields: ["period"], statusField: "status", dateField: "createdAt" });

  const totalNet = items.reduce((s: number, r: any) => s + Number(r.totalAmount || r.totalNet || 0), 0);
  const totalEmps = items.reduce((s: number, r: any) => s + Number(r.employeeCount || 0), 0);

  const kpis = [
    { label: "إجمالي المسيرات", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي المبالغ", value: formatCurrency(totalNet), icon: DollarSign, color: "text-green-600 bg-green-50" },
    { label: "إجمالي الموظفين", value: totalEmps, icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "متوسط الراتب", value: totalEmps > 0 ? formatCurrency(Math.round(totalNet / totalEmps)) : "0", icon: TrendingUp, color: "text-orange-600 bg-orange-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      render: (p) => <span className="font-medium">{p.period || `${p.month}`}</span>,
    },
    {
      key: "employeeCount",
      header: "الموظفين",
      sortable: true,
      render: (p) => p.employeeCount || 0,
    },
    {
      key: "totalAmount",
      header: "الصافي الإجمالي",
      sortable: true,
      render: (p) => <span className="font-bold text-green-700">{formatCurrency(Number(p.totalAmount || p.totalNet || 0))}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status} />,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      className: "text-gray-500",
      render: (p) => p.createdAt ? formatDateAr(p.createdAt) : "-",
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (p) => (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedRun(p.id); }}>
          <Eye className="h-4 w-4 me-1" />التفاصيل
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="مسيرات الرواتب"
      subtitle="إدارة دورات الرواتب الشهرية والسنوية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex gap-2">
          <ExportButton endpoint="/export/excel/payroll" filename="payroll.xlsx" type="excel" label="تصدير Excel" />
          <Link href="/hr/payroll/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />تشغيل مسير رواتب</Button>
          </Link>
        </div>
      }
    >
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
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <Tabs defaultValue="runs" dir="rtl">
        <TabsList>
          <TabsTrigger value="runs">المسيرات</TabsTrigger>
          <TabsTrigger value="details">التفاصيل</TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <DataTable
            columns={columns}
            data={filtered}
            noToolbar
            emptyMessage="لا توجد مسيرات رواتب"
            pageSize={20}
          />
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
    </PageShell>
  );
}
