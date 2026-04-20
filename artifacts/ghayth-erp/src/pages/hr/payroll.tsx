import { useState } from "react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
// Phase A — HR payroll list on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, DollarSign, Users, TrendingUp, FileText, Eye } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";


function PayrollLines({ runId }: { runId: number }) {
  const { data } = useApiQuery<any>(["payroll-lines", String(runId)], `/hr/payroll/${runId}/lines`, !!runId);
  const lines = data?.data || [];
  return (
    <DataTable
      columns={[
        { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
        { key: "basic", header: "الأساسي", sortable: true, render: (v) => <span>{formatCurrency(Number(v.basic))}</span> },
        { key: "grossSalary", header: "الإجمالي", sortable: true, render: (v) => <span>{formatCurrency(Number(v.grossSalary))}</span> },
        { key: "gosi", header: "التأمينات", sortable: true, render: (v) => <span className="text-orange-600">{formatCurrency(Number(v.gosi))}</span> },
        { key: "lateDeduction", header: "الخصومات", sortable: true, render: (v) => <span className="text-red-600">{formatCurrency(Number(v.lateDeduction))}</span> },
        { key: "netSalary", header: "الصافي", sortable: true, render: (v) => <span className="font-bold text-green-700">{formatCurrency(Number(v.netSalary))}</span> },
      ] as DataTableColumn<any>[]}
      data={lines}
      noToolbar
      emptyMessage="لا توجد تفاصيل"
      pageSize={50}
    />
  );
}

export default function PayrollPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError } = useApiQuery<any>(["payroll", scopeQueryString], `/hr/payroll${scopeSuffix}`);
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

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

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
      <HrTabsNav />
      <KpiGrid items={kpis} />

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
              <CardContent><PayrollLines runId={selectedRun} /></CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-8 text-center text-gray-400">اختر مسير رواتب لعرض التفاصيل</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
