import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  Building2, Home, Users2, FileText, Banknote, Wrench,
  TrendingUp, AlertTriangle, Clock, Plus, Calendar, Trophy, TrendingDown
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function PropertiesDashboard() {
  const { scopeQueryString } = useAppContext();
  const { data: stats, isLoading, isError } = useApiQuery(
    ["properties-stats", scopeQueryString],
    `/properties/stats?${scopeQueryString || ""}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const s = stats as any || {};
  const occupancyRate = s.occupancyRate || 0;
  const totalUnits = s.totalUnits || 0;
  const rented = s.rented || 0;
  const available = s.available || 0;
  const overdueAmount = s.overdueAmount || 0;
  const openMaintenanceTickets = s.openMaintenanceTickets || 0;
  const buildingPerf: any[] = s.buildingPerformance || [];

  const buildingPerfColumns: DataTableColumn<any>[] = [
    {
      key: "rank",
      header: "#",
      render: (b) => {
        const idx = buildingPerf.indexOf(b);
        const isTop = idx === 0 && buildingPerf.length > 1;
        const isBottom = idx === buildingPerf.length - 1 && buildingPerf.length > 1;
        return (
          <span className="text-xs text-gray-400 font-mono">
            {isTop ? <Trophy className="h-3.5 w-3.5 text-amber-500 inline" /> : isBottom ? <TrendingDown className="h-3.5 w-3.5 text-red-400 inline" /> : idx + 1}
          </span>
        );
      },
    },
    {
      key: "name",
      header: "المبنى",
      render: (b) => (
        <Link href={`/properties/buildings/${b.id}`} className="font-medium hover:text-blue-600 hover:underline">{b.name}</Link>
      ),
    },
    {
      key: "totalUnits",
      header: "الوحدات",
      render: (b) => <span className="font-mono text-sm">{b.totalUnits || 0}</span>,
    },
    {
      key: "rentedUnits",
      header: "مؤجرة",
      render: (b) => <span className="font-mono text-sm text-blue-600">{b.rentedUnits || 0}</span>,
    },
    {
      key: "occupancyRate",
      header: "الإشغال",
      render: (b) => (
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", b.occupancyRate >= 80 ? "bg-emerald-500" : b.occupancyRate >= 50 ? "bg-amber-500" : "bg-red-400")} style={{ width: `${b.occupancyRate || 0}%` }} />
          </div>
          <span className="text-xs font-medium">{b.occupancyRate || 0}%</span>
        </div>
      ),
    },
    {
      key: "totalRevenue",
      header: "الإيرادات",
      render: (b) => <span className="font-bold text-emerald-600">{formatCurrency(b.totalRevenue || 0)}</span>,
    },
    {
      key: "performance",
      header: "الأداء",
      render: (b) => {
        const idx = buildingPerf.indexOf(b);
        const isTop = idx === 0 && buildingPerf.length > 1;
        const isBottom = idx === buildingPerf.length - 1 && buildingPerf.length > 1;
        return (
          <>
            {isTop && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">الأفضل</span>}
            {isBottom && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">الأدنى</span>}
          </>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">لوحة تحكم الأملاك</h1>
          <p className="text-gray-500 text-sm mt-1">نظرة شاملة على أداء المحفظة العقارية</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/properties/buildings/create">
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> مبنى جديد
            </Button>
          </Link>
          <Link href="/properties/create">
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> وحدة جديدة
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-blue-100 text-sm font-medium">إجمالي الوحدات</p>
              <Home className="h-5 w-5 text-blue-200" />
            </div>
            <p className="text-3xl font-bold">{totalUnits}</p>
            <p className="text-blue-200 text-xs mt-1">{buildingPerf.length} مبنى / مجمع</p>
          </CardContent>
        </Card>

        <Card className={cn("border-0 text-white", occupancyRate >= 80 ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : occupancyRate >= 50 ? "bg-gradient-to-br from-amber-500 to-amber-600" : "bg-gradient-to-br from-red-500 to-red-600")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/80 text-sm font-medium">نسبة الإشغال</p>
              <TrendingUp className="h-5 w-5 text-white/70" />
            </div>
            <p className="text-3xl font-bold">{occupancyRate}%</p>
            <p className="text-white/70 text-xs mt-1">{rented} مؤجرة · {available} شاغرة</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-600 to-violet-700 text-white border-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-violet-100 text-sm font-medium">تحصيل الشهر الحالي</p>
              <Banknote className="h-5 w-5 text-violet-200" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(s.monthlyCollected || 0)}</p>
            <p className="text-violet-200 text-xs mt-1">من {formatCurrency(s.monthlyExpected || 0)}</p>
          </CardContent>
        </Card>

        <Card className={cn("border-0 text-white", overdueAmount > 0 ? "bg-gradient-to-br from-red-500 to-red-600" : "bg-gradient-to-br from-gray-500 to-gray-600")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/80 text-sm font-medium">المتأخرات</p>
              <AlertTriangle className="h-5 w-5 text-white/70" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(overdueAmount)}</p>
            <p className="text-white/70 text-xs mt-1">{s.overduePayments || 0} دفعة متأخرة</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" /> الإيرادات السنوية ({new Date().getFullYear()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-indigo-50 rounded-lg">
                <p className="text-lg font-bold text-indigo-700">{formatCurrency(s.annualCollected || 0)}</p>
                <p className="text-[10px] text-gray-500">محصل</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-700">{formatCurrency(s.annualExpected || 0)}</p>
                <p className="text-[10px] text-gray-500">متوقع</p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded-lg">
                <p className="text-lg font-bold text-red-600">{formatCurrency((s.annualExpected || 0) - (s.annualCollected || 0))}</p>
                <p className="text-[10px] text-gray-500">متبقي</p>
              </div>
            </div>
            {(s.annualExpected || 0) > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>نسبة التحصيل السنوي</span>
                  <span className="font-bold">{Math.round(((s.annualCollected || 0) / (s.annualExpected || 1)) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(Math.round(((s.annualCollected||0)/(s.annualExpected||1))*100), 100)}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" /> عقود تنتهي قريباً
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                <p className="text-2xl font-bold text-red-600">{s.expiring30 || 0}</p>
                <p className="text-[10px] text-gray-500">خلال 30 يوم</p>
              </div>
              <div className="text-center p-2 bg-orange-50 rounded-lg border border-orange-100">
                <p className="text-2xl font-bold text-orange-600">{s.expiring60 || 0}</p>
                <p className="text-[10px] text-gray-500">خلال 60 يوم</p>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-2xl font-bold text-amber-600">{s.expiring90 || 0}</p>
                <p className="text-[10px] text-gray-500">خلال 90 يوم</p>
              </div>
            </div>
            <Link href="/properties/contracts">
              <Button variant="outline" size="sm" className="w-full mt-3 gap-1 text-xs">
                <FileText className="h-3 w-3" /> عرض العقود
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-500" /> طلبات الصيانة
              </p>
              <Link href="/properties/maintenance">
                <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-6">عرض الكل</Button>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-amber-600">{openMaintenanceTickets}</div>
              <div>
                <p className="text-xs text-gray-500">طلب مفتوح</p>
                {s.criticalMaintenanceTickets > 0 && (
                  <p className="text-xs text-red-500 font-medium">{s.criticalMaintenanceTickets} حرج</p>
                )}
              </div>
            </div>
            <Link href="/properties/maintenance/create">
              <Button variant="outline" size="sm" className="w-full mt-3 gap-1 text-xs">
                <Plus className="h-3 w-3" /> طلب صيانة جديد
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm flex items-center gap-2">
                <Banknote className="h-4 w-4 text-violet-500" /> إجمالي التحصيل
              </p>
            </div>
            <p className="text-2xl font-bold text-violet-700">{formatCurrency(s.totalCollected || 0)}</p>
            <p className="text-xs text-gray-500 mt-1">من {formatCurrency(s.totalExpected || 0)} إجمالي</p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>نسبة التحصيل الكلية</span>
                <span className="font-bold">{s.collectionRate || 0}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", (s.collectionRate || 0) >= 80 ? "bg-emerald-500" : (s.collectionRate || 0) >= 50 ? "bg-amber-500" : "bg-red-500")}
                  style={{ width: `${Math.min(s.collectionRate || 0, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm flex items-center gap-2">
                <Users2 className="h-4 w-4 text-blue-500" /> روابط سريعة
              </p>
            </div>
            <div className="space-y-1.5">
              {[
                { href: "/properties/tenants/create", label: "إضافة مستأجر جديد", icon: Users2 },
                { href: "/properties/contracts/create", label: "إنشاء عقد إيجار", icon: FileText },
                { href: "/properties/payments", label: "تسجيل دفعة", icon: Banknote },
              ].map(item => (
                <Link key={item.href} href={item.href}>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs h-8">
                    <item.icon className="h-3.5 w-3.5" /> {item.label}
                  </Button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {buildingPerf.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> أداء المباني (مرتبة حسب الإيراد)
              </CardTitle>
              <Link href="/properties/buildings">
                <Button variant="ghost" size="sm" className="text-xs text-blue-600">عرض الكل</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable<any>
              columns={buildingPerfColumns}
              data={buildingPerf}
              searchPlaceholder={null}
              noToolbar
              pageSize={0}
              rowClassName={(b) => {
                const idx = buildingPerf.indexOf(b);
                const isTop = idx === 0 && buildingPerf.length > 1;
                const isBottom = idx === buildingPerf.length - 1 && buildingPerf.length > 1;
                return cn(isTop && "bg-amber-50/30", isBottom && "bg-red-50/20");
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/properties/buildings", icon: Building2, label: "المباني والمجمعات", color: "text-blue-600 bg-blue-50" },
          { href: "/properties", icon: Home, label: "الوحدات العقارية", color: "text-emerald-600 bg-emerald-50" },
          { href: "/properties/tenants", icon: Users2, label: "المستأجرون", color: "text-violet-600 bg-violet-50" },
          { href: "/properties/contracts", icon: FileText, label: "عقود الإيجار", color: "text-amber-600 bg-amber-50" },
          { href: "/properties/payments", icon: Banknote, label: "المدفوعات", color: "text-indigo-600 bg-indigo-50" },
          { href: "/properties/maintenance", icon: Wrench, label: "طلبات الصيانة", color: "text-orange-600 bg-orange-50" },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", item.color)}>
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium group-hover:text-blue-600 transition-colors">{item.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
