import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, FolderKanban, DollarSign,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { TrendBadge } from "./shared";

export function CEODashboardTab() {
  const { data, isLoading } = useApiQuery<any>(["ceo-dashboard"], "/bi/ceo-dashboard");
  const d = data || {};
  const fin = d.financial || {};
  const hr = d.hr || {};
  const ops = d.operations || {};
  const risks = d.risks || {};

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-6"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">لوحة المالك / الرئيس التنفيذي — صحة المنشأة</h1>

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
