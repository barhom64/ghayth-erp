import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, LayoutDashboard, TrendingUp, FileBarChart, Plus, Users, Building2, CreditCard, Car, Headphones, FolderKanban, DollarSign, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

function useChartExport() {
  const { toast } = useToast();
  const exportChart = useCallback(async (element: HTMLElement | null, filename: string = "chart.png") => {
    if (!element) {
      toast({ title: "خطأ", description: "لم يتم العثور على الرسم البياني", variant: "destructive" });
      return;
    }
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(element, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
      toast({ title: "تم التصدير", description: `تم حفظ الرسم البياني كـ ${filename}` });
    } catch (err) {
      toast({ title: "فشل التصدير", description: "تعذر تصدير الرسم البياني", variant: "destructive" });
    }
  }, [toast]);
  return { exportChart };
}

function OverviewTab() {
  const { data } = useApiQuery<any>(["bi-overview"], "/bi/overview");
  const d = data || {};
  const chartRef = useRef<HTMLDivElement>(null);
  const { exportChart } = useChartExport();
  const stats = [
    { label: "الموظفين", value: d.employees || 0, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "العملاء", value: d.clients || 0, icon: Building2, color: "text-green-600 bg-green-50" },
    { label: "الفواتير", value: d.invoices || 0, icon: CreditCard, color: "text-purple-600 bg-purple-50" },
    { label: "المشاريع", value: d.projects || 0, icon: FolderKanban, color: "text-orange-600 bg-orange-50" },
    { label: "المركبات", value: d.vehicles || 0, icon: Car, color: "text-teal-600 bg-teal-50" },
    { label: "تذاكر مفتوحة", value: d.openTickets || 0, icon: Headphones, color: "text-red-600 bg-red-50" },
    { label: "الإيرادات", value: `${formatNumber(((d.totalRevenue || 0) / 1000))}K`, icon: DollarSign, color: "text-indigo-600 bg-indigo-50" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">نظرة عامة</h1>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportChart(chartRef.current, "dashboard-overview.png")}>
          <Download className="h-4 w-4" />
          تصدير كصورة
        </Button>
      </div>
      <div ref={chartRef} className="grid grid-cols-2 md:grid-cols-4 gap-4 p-2">
        {stats.map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.color.split(" ")[1])}>
                <s.icon className={cn("w-5 h-5", s.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DashboardsTab() {
  const { data: dashResp, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-dashboards"], "/bi/dashboards");
  const items = asList(dashResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(items, filters, {
    searchFields: ["title", "description"],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو الوصف...",
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "title", label: "العنوان" },
              { key: "description", label: "الوصف" },
              { key: "createdAt", label: "التاريخ" },
            ], "لوحات_المعلومات")}
            resultCount={filtered.length}
          />
        </div>
        {canWrite && <Link href="/bi/dashboards/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة لوحة</Button></Link>}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-6"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}
        </div>
      ) : isError ? (
        <Card><CardContent className="p-8 text-center text-rose-600">حدث خطأ أثناء تحميل لوحات المعلومات <Button variant="outline" size="sm" onClick={() => refetch()} className="ms-2">إعادة المحاولة</Button></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <LayoutDashboard className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-muted-foreground">لا توجد لوحات معلومات</p>
          {canWrite && <Link href="/bi/dashboards/create"><Button size="sm" className="mt-3">إضافة لوحة</Button></Link>}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item: any) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2"><CardTitle className="text-base">{item.title}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">{item.description || "بدون وصف"}</p>
                <p className="text-xs text-muted-foreground mt-2">{formatDateAr(item.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function KPIsTab() {
  const { data: kpisResp, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-kpis"], "/bi/kpis");
  const allItems = asList(kpisResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(allItems, filters, {
    searchFields: ["name", "module", "description"],
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالاسم أو الوحدة...",
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "name", label: "المؤشر" },
              { key: "module", label: "الوحدة" },
              { key: "target", label: "الهدف" },
              { key: "currentValue", label: "القيمة الحالية" },
            ], "مؤشرات_الأداء")}
            resultCount={filtered.length}
          />
        </div>
        {canWrite && <Link href="/bi/kpis/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مؤشر</Button></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>مؤشرات الأداء</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="name" label="المؤشر" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="module" label="الوحدة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="target" label="الهدف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="currentValue" label="القيمة الحالية" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={4} emptyMessage="لا توجد مؤشرات" emptyIcon={<TrendingUp className="h-6 w-6 text-slate-400" />}>
            {(sortedData || []).map((k: any) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="text-muted-foreground">{k.module || "-"}</TableCell>
                <TableCell>{formatNumber(k.target || 0)}</TableCell>
                <TableCell className="font-bold">{formatNumber(k.currentValue || 0)}</TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsTab() {
  const { data: reportsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-reports"], "/bi/reports");
  const allItems = asList(reportsResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(allItems, filters, {
    searchFields: ["title", "type", "description"],
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو النوع...",
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "title", label: "العنوان" },
              { key: "type", label: "النوع" },
              { key: "createdAt", label: "التاريخ" },
            ], "التقارير")}
            resultCount={filtered.length}
          />
        </div>
        {canWrite && <Link href="/bi/reports/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة تقرير</Button></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>التقارير</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="العنوان" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={3} emptyMessage="لا توجد تقارير" emptyIcon={<FileBarChart className="h-6 w-6 text-slate-400" />}>
            {(sortedData || []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell className="text-muted-foreground">{r.type || "-"}</TableCell>
                <TableCell>{formatDateAr(r.createdAt)}</TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BIPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="dashboards">لوحات المعلومات</TabsTrigger>
          <TabsTrigger value="kpis">مؤشرات الأداء</TabsTrigger>
          <TabsTrigger value="reports">التقارير</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="dashboards"><DashboardsTab /></TabsContent>
        <TabsContent value="kpis"><KPIsTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
