import { useState } from "react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// Phase A — HR payroll list on unified primitives.
import { PageShell } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, DollarSign, Users, TrendingUp, FileText, Eye } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";

import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
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
        { key: "lateDeduction", header: "الخصومات", sortable: true, render: (v) => <span className="text-status-error-foreground">{formatCurrency(Number(v.lateDeduction))}</span> },
        { key: "netSalary", header: "الصافي", sortable: true, render: (v) => <span className="font-bold text-status-success-foreground">{formatCurrency(Number(v.netSalary))}</span> },
      ] as DataTableColumn<any>[]}
      data={lines}
      noToolbar
      emptyMessage="لا توجد تفاصيل"
      pageSize={50}
    />
  );
}

export default function PayrollPage() {
  const [, navigate] = useLocation();
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
    { label: "إجمالي المسيرات", value: items.length, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "إجمالي المبالغ", value: formatCurrency(totalNet), icon: DollarSign, color: "text-status-success-foreground bg-status-success-surface" },
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
      render: (p) => <span className="font-bold text-status-success-foreground">{formatCurrency(Number(p.totalAmount || p.totalNet || 0))}</span>,
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
      className: "text-muted-foreground",
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
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="مسيرات الرواتب"
      subtitle="إدارة دورات الرواتب الشهرية والسنوية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex gap-2">
          <ExportButton endpoint="/export/excel/payroll" filename="payroll.xlsx" type="excel" label="تصدير Excel" />
          <Link href="/hr/payroll/create">
            <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />تشغيل مسير رواتب</GuardedButton>
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
            { value: "pending_approval", label: "بانتظار الاعتماد" },
            { value: "completed", label: "معتمد" },
            { value: "posted", label: "مُرحَّل محاسبيًا" },
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
            onRowClick={(row) => navigate(`/hr/payroll/${row.id}`)}
          />
        </TabsContent>
        <TabsContent value="details">
          {selectedRun ? (
            <Card>
              <CardHeader><CardTitle className="text-base">تفاصيل المسير #{selectedRun}</CardTitle></CardHeader>
              <CardContent><PayrollLines runId={selectedRun} /></CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-8 text-center text-muted-foreground">اختر مسير رواتب لعرض التفاصيل</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
