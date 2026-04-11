import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, LayoutDashboard, TrendingUp, FileBarChart, Plus, Users, Building2,
  CreditCard, Car, Headphones, FolderKanban, DollarSign, Download, Brain,
  BellOff, TrendingDown, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight,
  Minus, BarChart3, Lightbulb, ShieldAlert, X, Eye, Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

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

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <Badge variant="outline" className="text-gray-500 gap-1"><Minus className="h-3 w-3" />0%</Badge>;
  if (value > 0) return <Badge className="bg-emerald-100 text-emerald-700 gap-1"><ArrowUpRight className="h-3 w-3" />+{value}%</Badge>;
  return <Badge className="bg-red-100 text-red-700 gap-1"><ArrowDownRight className="h-3 w-3" />{value}%</Badge>;
}

function CEODashboardTab() {
  const { data, isLoading } = useApiQuery<any>(["ceo-dashboard"], "/bi/ceo-dashboard");
  const d = data || {};
  const fin = d.financial || {};
  const hr = d.hr || {};
  const ops = d.operations || {};
  const risks = d.risks || {};

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-6"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">لوحة المالك / CEO — صحة المنشأة</h1>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2"><DollarSign className="h-5 w-5 text-green-600" />الملخص المالي</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">إيرادات هذا الشهر</p>
              <p className="text-xl font-bold text-gray-900">{formatNumber(fin.revenueThisMonth || 0)}</p>
              <div className="mt-1"><TrendBadge value={fin.revenueTrend || 0} /></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">مصروفات هذا الشهر</p>
              <p className="text-xl font-bold text-gray-900">{formatNumber(fin.expensesThisMonth || 0)}</p>
              <div className="mt-1"><TrendBadge value={-(fin.expensesTrend || 0)} /></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">صافي الربح</p>
              <p className={cn("text-xl font-bold", fin.netProfitThisMonth >= 0 ? "text-emerald-600" : "text-red-600")}>{formatNumber(fin.netProfitThisMonth || 0)}</p>
              <div className="mt-1"><TrendBadge value={fin.netProfitTrend || 0} /></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-red-50">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">فواتير متأخرة</p>
              <p className="text-xl font-bold text-red-600">{formatNumber(fin.overdueAmount || 0)}</p>
              <p className="text-xs text-red-500 mt-1">{fin.overdueInvoices || 0} فاتورة</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" />حالة الموارد البشرية</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">إجمالي الموظفين</p>
              <p className="text-xl font-bold">{hr.totalEmployees || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">نسبة الحضور اليوم</p>
              <p className="text-xl font-bold text-blue-600">{hr.attendanceRate || 0}%</p>
              <p className="text-xs text-gray-400">{hr.presentToday || 0} / {hr.totalToday || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">طلبات إجازة معلقة</p>
              <p className={cn("text-xl font-bold", (hr.pendingLeaveRequests || 0) > 5 ? "text-amber-600" : "text-gray-900")}>{hr.pendingLeaveRequests || 0}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2"><FolderKanban className="h-5 w-5 text-purple-600" />حالة التشغيل</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={cn("border-0 shadow-sm", (ops.overdueProjects || 0) > 0 ? "bg-amber-50" : "")}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">مشاريع متأخرة</p>
              <p className={cn("text-xl font-bold", (ops.overdueProjects || 0) > 0 ? "text-amber-600" : "text-gray-900")}>{ops.overdueProjects || 0}</p>
              <p className="text-xs text-gray-400">من {ops.totalProjects || 0} مشروع</p>
            </CardContent>
          </Card>
          <Card className={cn("border-0 shadow-sm", (ops.openTickets || 0) > 10 ? "bg-red-50" : "")}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">تذاكر دعم مفتوحة</p>
              <p className={cn("text-xl font-bold", (ops.openTickets || 0) > 10 ? "text-red-600" : "text-gray-900")}>{ops.openTickets || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">صيانات معلقة</p>
              <p className="text-xl font-bold">{ops.pendingMaintenance || 0}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />المخاطر العاجلة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(risks.expiringContracts30 || 0) > 0 && (
            <Card className="border-0 shadow-sm bg-red-50">
              <CardContent className="p-4">
                <p className="text-xs text-red-500 mb-1">عقود تنتهي (30 يوم)</p>
                <p className="text-xl font-bold text-red-600">{risks.expiringContracts30}</p>
              </CardContent>
            </Card>
          )}
          {(risks.expiringDocs || 0) > 0 && (
            <Card className="border-0 shadow-sm bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs text-amber-600 mb-1">وثائق منتهية قريباً</p>
                <p className="text-xl font-bold text-amber-600">{risks.expiringDocs}</p>
              </CardContent>
            </Card>
          )}
          {(risks.overdueInvoices || 0) > 0 && (
            <Card className="border-0 shadow-sm bg-orange-50">
              <CardContent className="p-4">
                <p className="text-xs text-orange-600 mb-1">فواتير متأخرة</p>
                <p className="text-xl font-bold text-orange-600">{risks.overdueInvoices}</p>
              </CardContent>
            </Card>
          )}
          {(risks.expiringContracts30 || 0) === 0 && (risks.expiringDocs || 0) === 0 && (risks.overdueInvoices || 0) === 0 && (
            <Card className="border-0 shadow-sm bg-emerald-50">
              <CardContent className="p-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm text-emerald-700 font-medium">لا توجد مخاطر عاجلة</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchPerformanceTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-branch-perf"], "/bi/reports/branch-performance");
  const rows = (data?.data || []) as any[];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">مقارنة أداء الفروع</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell className="font-semibold">الترتيب</TableCell>
                <TableCell className="font-semibold">الفرع</TableCell>
                <TableCell className="font-semibold">الإيرادات</TableCell>
                <TableCell className="font-semibold">المصروفات</TableCell>
                <TableCell className="font-semibold">صافي الربح</TableCell>
                <TableCell className="font-semibold">الموظفون</TableCell>
                <TableCell className="font-semibold">نسبة الحضور</TableCell>
                <TableCell className="font-semibold">تذاكر مفتوحة</TableCell>
                <TableCell className="font-semibold">رضا العملاء</TableCell>
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} data={rows} colCount={9} emptyMessage="لا توجد فروع" emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}>
              {rows.map((r: any) => (
                <TableRow key={r.branchId}>
                  <TableCell><Badge variant={r.rank === 1 ? "default" : "outline"}>{r.rank}</Badge></TableCell>
                  <TableCell className="font-medium">{r.branchName}</TableCell>
                  <TableCell className="text-emerald-600 font-medium">{formatNumber(r.revenue)}</TableCell>
                  <TableCell className="text-red-600">{formatNumber(r.expenses)}</TableCell>
                  <TableCell className={cn("font-bold", r.netProfit >= 0 ? "text-emerald-700" : "text-red-700")}>{formatNumber(r.netProfit)}</TableCell>
                  <TableCell>{r.employees}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${r.attendanceRate}%` }} />
                      </div>
                      <span className="text-xs">{r.attendanceRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={r.openTickets > 10 ? "destructive" : "outline"}>{r.openTickets}</Badge></TableCell>
                  <TableCell>{r.clientSatisfaction > 0 ? `${r.clientSatisfaction}/5` : "-"}</TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>مقارنة الإيرادات بالفروع</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rows} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="branchName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => [formatNumber(Number(v)), ""]} />
                <Bar dataKey="revenue" name="الإيرادات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VendorPerformanceTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-vendor-perf"], "/bi/reports/vendor-performance");
  const rows = (data?.data || []) as any[];
  const { sortedData, sortState, handleSort } = useSortedData(rows);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">أداء الموردين</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="vendorName" label="المورد" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="totalOrders" label="عدد الطلبات" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="totalSpend" label="إجمالي المشتريات" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="avgOrderValue" label="متوسط الطلب" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="onTimeDeliveryRate" label="معدل الالتزام بالمواعيد" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="returnRate" label="معدل الإرجاع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="qualityScore" label="نقاط الجودة" sortState={sortState} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} data={rows} colCount={7} emptyMessage="لا توجد بيانات موردين" emptyIcon={<BarChart3 className="h-6 w-6 text-slate-400" />}>
              {(sortedData || []).map((r: any) => (
                <TableRow key={r.vendorId}>
                  <TableCell className="font-medium">{r.vendorName}</TableCell>
                  <TableCell>{r.totalOrders}</TableCell>
                  <TableCell className="text-blue-600">{formatNumber(r.totalSpend)}</TableCell>
                  <TableCell>{formatNumber(r.avgOrderValue)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${r.onTimeDeliveryRate}%` }} />
                      </div>
                      <span className="text-xs">{r.onTimeDeliveryRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={r.returnRate > 10 ? "destructive" : "outline"}>{r.returnRate}%</Badge></TableCell>
                  <TableCell>
                    <Badge className={cn(
                      r.qualityScore >= 90 ? "bg-emerald-100 text-emerald-700" :
                      r.qualityScore >= 70 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    )}>{r.qualityScore}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FleetTCOTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-fleet-tco"], "/bi/reports/fleet-tco");
  const rows = (data?.data || []) as any[];
  const { sortedData, sortState, handleSort } = useSortedData(rows);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">تكلفة الأسطول الإجمالية (TCO)</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="plateNumber" label="رقم اللوحة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="make" label="النوع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="year" label="السنة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="purchasePrice" label="سعر الشراء" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="maintenanceCost" label="تكلفة الصيانة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="fuelCost" label="تكلفة الوقود" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="insuranceCost" label="التأمين" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="depreciation" label="الإهلاك" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="tco" label="التكلفة الإجمالية" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="costPerKm" label="تكلفة/كم" sortState={sortState} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} data={rows} colCount={10} emptyMessage="لا توجد مركبات" emptyIcon={<Car className="h-6 w-6 text-slate-400" />}>
              {(sortedData || []).map((r: any) => (
                <TableRow key={r.vehicleId}>
                  <TableCell className="font-medium">{r.plateNumber}</TableCell>
                  <TableCell>{r.make} {r.model}</TableCell>
                  <TableCell>{r.year || "-"}</TableCell>
                  <TableCell>{formatNumber(r.purchasePrice)}</TableCell>
                  <TableCell className="text-orange-600">{formatNumber(r.maintenanceCost)}</TableCell>
                  <TableCell className="text-amber-600">{formatNumber(r.fuelCost)}</TableCell>
                  <TableCell>{formatNumber(r.insuranceCost)}</TableCell>
                  <TableCell>{formatNumber(r.depreciation)}</TableCell>
                  <TableCell className="font-bold text-blue-600">{formatNumber(r.tco)}</TableCell>
                  <TableCell className="text-sm">{r.costPerKm > 0 ? `${r.costPerKm} ر/كم` : "-"}</TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LeaveBalanceTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-dept-leave"], "/bi/reports/department-leave-balance");
  const rows = (data?.data || []) as any[];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">رصيد إجازات الأقسام — {data?.year || new Date().getFullYear()}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && [...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-6"><div className="h-24 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}
        {!isLoading && rows.map((r: any) => (
          <Card key={r.department} className={cn("border-0 shadow-sm", r.warning ? "ring-2 ring-red-300 bg-red-50" : "")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800">{r.department}</h3>
                {r.warning && <Badge className="bg-red-100 text-red-700 text-xs"><AlertTriangle className="h-3 w-3 me-1" />تحذير</Badge>}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">إجمالي الموظفين:</span><span className="font-medium">{r.totalEmployees}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">في إجازة الآن:</span><span className={cn("font-medium", r.warning ? "text-red-600" : "")}>{r.onLeaveNow} ({r.onLeavePct}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">متوسط الرصيد المتبقي:</span><span className="font-medium text-blue-600">{r.avgRemainingBalance} يوم</span></div>
                <div className="flex justify-between"><span className="text-gray-500">إجمالي الأيام المستهلكة:</span><span className="font-medium">{r.totalUsedDays}</span></div>
              </div>
              {r.warning && <p className="text-xs text-red-500 mt-2">تحذير: أكثر من 30% من القسم في إجازة</p>}
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 && (
          <Card className="col-span-full"><CardContent className="p-8 text-center text-gray-400">لا توجد أقسام</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function PropertyOccupancyTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-property-occ"], "/bi/reports/property-occupancy");
  const rows = (data?.data || []) as any[];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">نسبة الإشغال العقاري</h2>
      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>نسبة الإشغال بالمباني</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rows} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="buildingName" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => [`${v}%`, "نسبة الإشغال"]} />
                <Bar dataKey="occupancyRate" name="نسبة الإشغال" radius={[4, 4, 0, 0]}>
                  {rows.map((entry: any, index: number) => (
                    <Cell key={index} fill={entry.occupancyRate >= 80 ? "#10b981" : entry.occupancyRate >= 50 ? "#f59e0b" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell className="font-semibold">المبنى</TableCell>
                <TableCell className="font-semibold">إجمالي الوحدات</TableCell>
                <TableCell className="font-semibold">مؤجرة</TableCell>
                <TableCell className="font-semibold">شاغرة</TableCell>
                <TableCell className="font-semibold">نسبة الإشغال</TableCell>
                <TableCell className="font-semibold">متوسط الإيجار</TableCell>
                <TableCell className="font-semibold">الإيرادات الشهرية</TableCell>
                <TableCell className="font-semibold">الإيرادات السنوية</TableCell>
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} data={rows} colCount={8} emptyMessage="لا توجد مبانٍ" emptyIcon={<Building className="h-6 w-6 text-slate-400" />}>
              {rows.map((r: any) => (
                <TableRow key={r.buildingId}>
                  <TableCell className="font-medium">{r.buildingName}</TableCell>
                  <TableCell>{r.totalUnits}</TableCell>
                  <TableCell className="text-emerald-600">{r.occupiedUnits}</TableCell>
                  <TableCell className="text-red-600">{r.vacantUnits}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div className={cn("h-2 rounded-full", r.occupancyRate >= 80 ? "bg-emerald-500" : r.occupancyRate >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${r.occupancyRate}%` }} />
                      </div>
                      <span className="text-sm font-medium">{r.occupancyRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatNumber(r.avgMonthlyRent)}</TableCell>
                  <TableCell className="text-blue-600 font-medium">{formatNumber(r.totalMonthlyRevenue)}</TableCell>
                  <TableCell className="text-indigo-600 font-medium">{formatNumber(r.annualRevenue)}</TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingROITab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-training-roi"], "/bi/reports/training-roi");
  const summary = data?.summary || {};
  const programs = (data?.byProgram || []) as any[];
  const { sortedData, sortState, handleSort } = useSortedData(programs);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">عائد الاستثمار في التدريب (ROI)</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "موظفون مدربون", value: summary.trainedEmployees || 0 },
          { label: "ساعات التدريب", value: summary.totalHours || 0 },
          { label: "التكلفة الإجمالية", value: formatNumber(summary.totalCost || 0) },
          { label: "تكلفة للموظف", value: formatNumber(summary.costPerEmployee || 0) },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            {isLoading ? <CardContent className="p-6"><div className="h-12 bg-gray-100 rounded animate-pulse" /></CardContent> : (
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>البرامج التدريبية</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="programName" label="البرنامج" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="participants" label="المشاركون" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="totalHours" label="الساعات" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="cost" label="التكلفة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="costPerParticipant" label="تكلفة/مشارك" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="avgScore" label="متوسط الدرجات" sortState={sortState} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} data={programs} colCount={6} emptyMessage="لا توجد بيانات تدريب" emptyIcon={<TrendingUp className="h-6 w-6 text-slate-400" />}>
              {(sortedData || []).map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.programName}</TableCell>
                  <TableCell>{r.participants}</TableCell>
                  <TableCell>{r.totalHours}</TableCell>
                  <TableCell>{formatNumber(r.cost)}</TableCell>
                  <TableCell>{formatNumber(r.costPerParticipant)}</TableCell>
                  <TableCell>{r.avgScore > 0 ? `${r.avgScore}%` : "-"}</TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AIInsightsTab() {
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<any>(["bi-ai-insights"], "/bi/ai-insights");
  const alerts = (data?.alerts || []) as any[];
  const counts = data?.counts || {};
  const proactive = (data?.proactiveActions || []) as any[];

  const handleDismiss = async (id: number) => {
    setDismissingId(id);
    try {
      await apiFetch(`/bi/ai-insights/${id}/dismiss`, { method: "PATCH" });
      toast({ title: "تم الإغلاق" });
      refetch();
    } catch {
      toast({ title: "خطأ", variant: "destructive" });
    }
    setDismissingId(null);
  };

  const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
    critical: { label: "عاجل", color: "text-red-700", bg: "bg-red-50 border-red-200" },
    warning: { label: "مهم", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    info: { label: "معلوماتي", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Brain className="h-6 w-6 text-purple-600" />رؤى الذكاء الاصطناعي</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "عاجل", count: counts.critical || 0, color: "text-red-600", bg: "bg-red-50" },
          { label: "مهم", count: counts.warning || 0, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "معلوماتي", count: counts.info || 0, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((s) => (
          <Card key={s.label} className={cn("border-0 shadow-sm", s.bg)}>
            <CardContent className="p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.count}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-12 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}</div>}

      {!isLoading && alerts.length === 0 && (
        <Card><CardContent className="p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-gray-500">لا توجد تنبيهات نشطة</p>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {alerts.map((alert: any) => {
          const cfg = severityConfig[alert.severity] || severityConfig["info"]!;
          return (
            <Card key={alert.id} className={cn("border shadow-sm", cfg.bg)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <Lightbulb className={cn("h-5 w-5 mt-0.5 shrink-0", cfg.color)} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn("text-xs", cfg.color, cfg.bg)}>{cfg.label}</Badge>
                        <span className="text-xs text-gray-400">{formatDateAr(alert.createdAt)}</span>
                      </div>
                      <p className="font-medium text-gray-800">{alert.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                      {alert.suggestedAction && (
                        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" />الإجراء المقترح: {alert.suggestedAction}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleDismiss(alert.id)}
                    disabled={dismissingId === alert.id}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {proactive.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-purple-500" />إجراءات الأتمتة الأخيرة</h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell className="font-semibold">النوع</TableCell>
                    <TableCell className="font-semibold">السبب</TableCell>
                    <TableCell className="font-semibold">الإجراء المتخذ</TableCell>
                    <TableCell className="font-semibold">الحالة</TableCell>
                    <TableCell className="font-semibold">التاريخ</TableCell>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {proactive.slice(0, 10).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-medium">{p.automationType}</TableCell>
                      <TableCell className="text-xs text-gray-600">{p.triggerReason}</TableCell>
                      <TableCell className="text-xs">{p.actionTaken}</TableCell>
                      <TableCell><Badge variant={p.status === "success" ? "default" : "destructive"} className="text-xs">{p.status === "success" ? "نجاح" : "فشل"}</Badge></TableCell>
                      <TableCell className="text-xs text-gray-400">{formatDateAr(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AlertFatigueTab() {
  const { data: dcData } = useApiQuery<any>(["alert-daily-count"], "/bi/alert-fatigue/daily-count");
  const { data: settingsData } = useApiQuery<any>(["alert-fatigue-settings"], "/bi/alert-fatigue/settings");
  const { toast } = useToast();
  const [muteType, setMuteType] = useState("");
  const [muteHours, setMuteHours] = useState("24");
  const [loading, setLoading] = useState(false);

  const handleMute = async () => {
    if (!muteType.trim()) { toast({ title: "أدخل نوع التنبيه", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const muteUntil = new Date(Date.now() + Number(muteHours) * 3600000).toISOString();
      await apiFetch("/bi/alert-fatigue/mute", { method: "POST", body: JSON.stringify({ alertType: muteType, muteUntil }) });
      toast({ title: "تم كتم التنبيهات", description: `سيتم كتم "${muteType}" لمدة ${muteHours} ساعة` });
      setMuteType("");
    } catch {
      toast({ title: "خطأ", variant: "destructive" });
    }
    setLoading(false);
  };

  const dc = dcData || {};
  const settings = (settingsData?.data || []) as any[];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2"><BellOff className="h-6 w-6 text-gray-600" />إدارة التنبيهات — منع الإرهاق</h2>

      <div className="grid grid-cols-3 gap-4">
        <Card className={cn("border-0 shadow-sm", dc.isOverLimit ? "bg-red-50" : "bg-emerald-50")}>
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", dc.isOverLimit ? "text-red-600" : "text-emerald-600")}>{dc.todayCount || 0}</p>
            <p className="text-xs text-gray-500">تنبيهات اليوم</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{dc.dailyLimit || 50}</p>
            <p className="text-xs text-gray-500">الحد اليومي</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", dc.isOverLimit ? "text-red-600" : "text-emerald-600")}>
              {dc.isOverLimit ? "تجاوز الحد" : "ضمن الحد"}
            </p>
            <p className="text-xs text-gray-500">الحالة</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>كتم نوع تنبيه مؤقتاً</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <input
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              placeholder="نوع التنبيه (مثال: invoice_overdue)"
              value={muteType}
              onChange={(e) => setMuteType(e.target.value)}
              dir="ltr"
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={muteHours}
              onChange={(e) => setMuteHours(e.target.value)}
            >
              <option value="1">ساعة واحدة</option>
              <option value="4">4 ساعات</option>
              <option value="8">8 ساعات</option>
              <option value="24">يوم كامل</option>
              <option value="72">3 أيام</option>
            </select>
            <Button onClick={handleMute} disabled={loading}>
              <BellOff className="h-4 w-4 me-2" />كتم
            </Button>
          </div>
        </CardContent>
      </Card>

      {settings.length > 0 && (
        <Card>
          <CardHeader><CardTitle>قواعد الكتم النشطة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell className="font-semibold">نوع التنبيه</TableCell>
                  <TableCell className="font-semibold">مكتوم حتى</TableCell>
                  <TableCell className="font-semibold">السبب</TableCell>
                </TableRow>
              </TableHeader>
              <tbody>
                {settings.map((s: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{s.alertType}</TableCell>
                    <TableCell className="text-sm">{s.muteUntil ? formatDateAr(s.muteUntil) : "دائم"}</TableCell>
                    <TableCell className="text-sm text-gray-500">{s.reason || "-"}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="bg-blue-50 border-blue-100">
        <CardContent className="p-4">
          <h3 className="font-semibold text-blue-800 mb-2">كيف يعمل نظام منع إرهاق التنبيهات؟</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>تجميع التنبيهات المتكررة من نفس النوع في تنبيه واحد</li>
            <li>الحد الأقصى للتنبيهات اليومية: {dc.dailyLimit || 50} تنبيه</li>
            <li>إمكانية كتم نوع معين من التنبيهات مؤقتاً</li>
            <li>الأولوية للتنبيهات العاجلة والحرجة دائماً</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
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
      <Tabs defaultValue="ceo" dir="rtl">
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10 gap-1 h-auto flex-wrap">
          <TabsTrigger value="ceo" className="text-xs">لوحة CEO</TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">نظرة عامة</TabsTrigger>
          <TabsTrigger value="branches" className="text-xs">الفروع</TabsTrigger>
          <TabsTrigger value="vendors" className="text-xs">الموردون</TabsTrigger>
          <TabsTrigger value="fleet-tco" className="text-xs">تكلفة الأسطول</TabsTrigger>
          <TabsTrigger value="leave-balance" className="text-xs">رصيد الإجازات</TabsTrigger>
          <TabsTrigger value="property" className="text-xs">الإشغال العقاري</TabsTrigger>
          <TabsTrigger value="training" className="text-xs">عائد التدريب</TabsTrigger>
          <TabsTrigger value="ai-insights" className="text-xs">رؤى AI</TabsTrigger>
          <TabsTrigger value="alert-fatigue" className="text-xs">إدارة التنبيهات</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="ceo"><CEODashboardTab /></TabsContent>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="branches"><BranchPerformanceTab /></TabsContent>
          <TabsContent value="vendors"><VendorPerformanceTab /></TabsContent>
          <TabsContent value="fleet-tco"><FleetTCOTab /></TabsContent>
          <TabsContent value="leave-balance"><LeaveBalanceTab /></TabsContent>
          <TabsContent value="property"><PropertyOccupancyTab /></TabsContent>
          <TabsContent value="training"><TrainingROITab /></TabsContent>
          <TabsContent value="ai-insights"><AIInsightsTab /></TabsContent>
          <TabsContent value="alert-fatigue"><AlertFatigueTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
