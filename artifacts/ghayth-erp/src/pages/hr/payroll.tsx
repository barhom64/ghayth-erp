import { useState } from "react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useInlineActions,
  RowActions,
  InlineDeleteConfirm,
} from "@/components/inline-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// Phase A — HR payroll list on unified primitives.
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, DollarSign, Users, TrendingUp, FileText, Eye } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";

import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";


function PayrollLines({ runId }: { runId: number }) {
  const { data } = useApiQuery<any>(["payroll-lines", String(runId)], `/hr/payroll/${runId}/lines`, !!runId);
  const lines = data?.data || [];
  // أجر السائق بالساعة (الدفعة 3): تُعرض أعمدة القيادة/التوقف فقط حين يحمل
  // المسيّر أجر سائق — تبقى النظرة نظيفة لمسيّرات بلا سائقين ساعيين.
  const hasDriverWages = lines.some(
    (l: any) => Number(l.drivingHoursAmount) > 0 || Number(l.stopHoursAmount) > 0,
  );
  const driverCols: DataTableColumn<any>[] = hasDriverWages
    ? [
        { key: "drivingHoursAmount", header: "أجر القيادة", sortable: true, render: (v) => (
          <span>{formatCurrency(Number(v.drivingHoursAmount || 0))}
            <span className="block text-xs text-muted-foreground">{Number(v.drivingHours || 0).toFixed(2)} س</span>
          </span>
        ) },
        { key: "stopHoursAmount", header: "أجر التوقف", sortable: true, render: (v) => (
          <span>{formatCurrency(Number(v.stopHoursAmount || 0))}
            <span className="block text-xs text-muted-foreground">{Number(v.stopHours || 0).toFixed(2)} س</span>
          </span>
        ) },
      ]
    : [];
  return (
    <DataTable
      columns={[
        { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
        { key: "basic", header: "الأساسي", sortable: true, render: (v) => <span>{formatCurrency(Number(v.basic))}</span> },
        { key: "grossSalary", header: "الإجمالي", sortable: true, render: (v) => <span>{formatCurrency(Number(v.grossSalary))}</span> },
        ...driverCols,
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
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["payroll", scopeQueryString], `/hr/payroll${scopeSuffix}`);
  // GET /hr/payroll-summary — per-employee aggregation of the latest
  // payroll period (basic + gross + GOSI + net). Surfaced as a side-by-
  // side panel under the runs list.
  const { data: summaryResp } = useApiQuery<{ data: any[] }>(["payroll-summary", scopeQueryString], `/hr/payroll-summary${scopeSuffix}`);
  const summaryRows: any[] = summaryResp?.data ?? [];
  const items = data?.data || [];
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [filters, setFilters] = useFilters();

  // DELETE /hr/payroll/:id — soft-delete a draft payroll run. Backend
  // refuses once the run has been approved or paid, so the row action
  // only renders when status === "draft".
  const payrollActions = useInlineActions({
    endpoint: "/hr/payroll",
    queryKeys: [["payroll", scopeQueryString]],
    onSuccess: () => refetch(),
  });

  const filtered = applyFilters(items, filters, { searchFields: ["period"], statusField: "status", dateField: "createdAt" });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

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
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRun(p.id)}>
            <Eye className="h-4 w-4 me-1" />التفاصيل
          </Button>
          <RowActions
            onDelete={() => payrollActions.startDelete(p.id)}
            canEdit={false}
            canDelete={p.status === "draft"}
            deletePerm="hr:delete"
          />
        </div>
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
          <PrintButton
            entityType="report_hr_payroll"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "مسيرات الرواتب", total: printRows.length },
              items: printRows.map((p: any) => ({
                "رقم المسير": p.ref || p.id,
                "الفترة": p.period || "—",
                "عدد الموظفين": p.employeeCount ?? "—",
                "إجمالي الرواتب": p.totalNet ?? p.totalAmount ?? 0,
                "تاريخ الإصدار": p.createdAt || "—",
                "الحالة": p.status || "—",
              })),
            })}
          />
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
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "period", label: "الفترة" },
              { key: "month", label: "الشهر" },
              { key: "status", label: "الحالة" },
              { key: "employeeCount", label: "عدد الموظفين" },
              { key: "totalAmount", label: "إجمالي الصافي" },
              { key: "runByName", label: "أنشئ بواسطة" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ],
            "مسيرات-الرواتب",
          )
        }
        resultCount={filtered.length}
      />

      <Tabs defaultValue="runs" dir="rtl">
        <TabsList>
          <TabsTrigger value="runs">المسيرات</TabsTrigger>
          <TabsTrigger value="details">التفاصيل</TabsTrigger>
          <TabsTrigger value="summary">ملخص الفترة ({summaryRows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <DataTable
            columns={columns}
            onSortedDataChange={setPrintRows}
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
        <TabsContent value="summary">
          <Card>
            <CardHeader><CardTitle className="text-base">ملخص الرواتب للفترة الحالية</CardTitle></CardHeader>
            <CardContent>
              {summaryRows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد بيانات للفترة الحالية</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "employeeName", header: "الموظف", sortable: true },
                    { key: "empNumber", header: "الرقم الوظيفي", sortable: true, render: (r) => r.empNumber || "—" },
                    { key: "jobTitle", header: "المسمى", sortable: true, render: (r) => r.jobTitle || "—" },
                    { key: "branchName", header: "الفرع", sortable: true, render: (r) => r.branchName || "—" },
                    { key: "totalBasic", header: "الأساسي", sortable: true, render: (r) => formatCurrency(Number(r.totalBasic ?? 0)) },
                    { key: "totalGross", header: "الإجمالي", sortable: true, render: (r) => formatCurrency(Number(r.totalGross ?? 0)) },
                    { key: "totalGosi", header: "التأمينات (GOSI)", sortable: true, render: (r) => <span className="text-orange-600">{formatCurrency(Number(r.totalGosi ?? 0))}</span> },
                    { key: "totalNet", header: "الصافي", sortable: true, render: (r) => <span className="font-bold text-status-success-foreground">{formatCurrency(Number(r.totalNet ?? 0))}</span> },
                  ] as DataTableColumn<any>[]}
                  data={summaryRows}
                  noToolbar
                  pageSize={50}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {payrollActions.deletingId !== null && (
        <InlineDeleteConfirm
          onConfirm={() => payrollActions.handleDelete(payrollActions.deletingId!)}
          onCancel={payrollActions.cancelDelete}
          isPending={payrollActions.isPending}
        />
      )}
    </PageShell>
  );
}
