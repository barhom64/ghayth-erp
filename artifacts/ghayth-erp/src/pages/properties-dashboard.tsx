import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, Home, Users2, FileText, Banknote, Wrench,
  TrendingUp, AlertTriangle, Clock, Plus, Calendar, Trophy, TrendingDown
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/loading-error-states";

interface OperationsDashboard {
  unitStats?: { total: number; available: number; rented: number; maintenance: number };
  expiringContracts?: Array<{ id: number; tenantName: string; endDate: string; unitNumber: string; buildingName: string }>;
  overduePayments?: Array<{ id: number; amount: number; paidAmount: number; dueDate: string; tenantName: string; unitNumber: string }>;
  openMaintenance?: Array<{ id: number; category: string; description: string; priority: string; status: string; createdAt: string; unitNumber: string; buildingName: string; tenantName: string }>;
  collectionSummary?: { expected: number; collected: number };
}

export default function PropertiesDashboard() {
  const { scopeQueryString } = useAppContext();
  const { data: stats, isLoading, isError } = useApiQuery(
    ["properties-stats", scopeQueryString],
    `/properties/stats?${scopeQueryString || ""}`
  );

  // Richer drill-down: GET /properties/operations-dashboard returns
  // expiring contracts (next 30d), overdue payments, open maintenance
  // requests, and a separate collection summary. Renders below the
  // headline stats so the operator sees what needs attention without
  // bouncing through 4 list pages.
  const { data: ops } = useApiQuery<OperationsDashboard>(
    ["properties-ops-dashboard"],
    "/properties/operations-dashboard",
  );

  if (isError) return <ErrorState />;
  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  const s = stats as any || {};
  const occupancyRate = s.occupancyRate || 0;
  const totalUnits = s.totalUnits || 0;
  const rented = s.rented || 0;
  const available = s.available || 0;
  const overdueAmount = s.overdueAmount || 0;
  const openMaintenanceTickets = s.openMaintenanceTickets || 0;
  const buildingPerf: any[] = s.buildingPerformance || [];

  const kpiItems = [
    {
      label: `${buildingPerf.length} مبنى / مجمع`,
      value: totalUnits,
      icon: Home,
      color: "text-status-info-foreground bg-status-info-surface",
      trend: "إجمالي الوحدات",
    },
    {
      label: `${rented} مؤجرة · ${available} شاغرة`,
      value: `${occupancyRate}%`,
      icon: TrendingUp,
      color: occupancyRate >= 80
        ? "text-emerald-600 bg-emerald-50"
        : occupancyRate >= 50
          ? "text-status-warning-foreground bg-status-warning-surface"
          : "text-status-error-foreground bg-status-error-surface",
      trend: "نسبة الإشغال",
    },
    {
      label: `من ${formatCurrency(s.monthlyExpected || 0)}`,
      value: formatCurrency(s.monthlyCollected || 0),
      icon: Banknote,
      color: "text-violet-600 bg-violet-50",
      trend: "تحصيل الشهر الحالي",
    },
    {
      label: `${s.overduePayments || 0} دفعة متأخرة`,
      value: formatCurrency(overdueAmount),
      icon: AlertTriangle,
      color: overdueAmount > 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-muted-foreground bg-surface-subtle",
      trend: "المتأخرات",
    },
  ];

  const buildingColumns: DataTableColumn<any>[] = [
    {
      key: "rank",
      header: "#",
      width: "60px",
      render: (row: any, index: number) => {
        const isTop = index === 0 && buildingPerf.length > 1;
        const isBottom = index === buildingPerf.length - 1 && buildingPerf.length > 1;
        if (isTop) return <Trophy className="h-3.5 w-3.5 text-status-warning inline" />;
        if (isBottom) return <TrendingDown className="h-3.5 w-3.5 text-red-400 inline" />;
        return <span className="text-muted-foreground font-mono">{index + 1}</span>;
      },
    },
    {
      key: "name",
      header: "المبنى",
      searchable: true,
      render: (row: any) => (
        <Link href={`/properties/buildings/${row.id}`} className="font-medium hover:text-status-info-foreground hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      key: "totalUnits",
      header: "الوحدات",
      sortable: true,
      render: (row: any) => <span className="font-mono text-sm">{row.totalUnits || 0}</span>,
    },
    {
      key: "rentedUnits",
      header: "مؤجرة",
      sortable: true,
      render: (row: any) => <span className="font-mono text-sm text-status-info-foreground">{row.rentedUnits || 0}</span>,
    },
    {
      key: "occupancyRate",
      header: "الإشغال",
      sortable: true,
      render: (row: any) => (
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 bg-surface-subtle rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                row.occupancyRate >= 80 ? "bg-emerald-500" : row.occupancyRate >= 50 ? "bg-status-warning-surface0" : "bg-red-400"
              )}
              style={{ width: `${row.occupancyRate || 0}%` }}
            />
          </div>
          <span className="text-xs font-medium">{row.occupancyRate || 0}%</span>
        </div>
      ),
    },
    {
      key: "totalRevenue",
      header: "الإيرادات",
      sortable: true,
      render: (row: any) => <span className="font-bold text-emerald-600">{formatCurrency(row.totalRevenue || 0)}</span>,
    },
    {
      key: "performance",
      header: "الأداء",
      render: (row: any, index: number) => {
        const isTop = index === 0 && buildingPerf.length > 1;
        const isBottom = index === buildingPerf.length - 1 && buildingPerf.length > 1;
        if (isTop) return <Badge className="bg-status-warning-surface text-status-warning-foreground hover:bg-status-warning-surface border-0">الأفضل</Badge>;
        if (isBottom) return <Badge className="bg-status-error-surface text-status-error-foreground hover:bg-status-error-surface border-0">الأدنى</Badge>;
        return null;
      },
    },
  ];

  const actions = (
    <>
      <Link href="/properties/buildings/create">
        <GuardedButton perm="properties:create" variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> مبنى جديد
        </GuardedButton>
      </Link>
      <Link href="/properties/create">
        <GuardedButton perm="properties:create" size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> وحدة جديدة
        </GuardedButton>
      </Link>
    </>
  );

  return (
    <PageShell
      title="لوحة تحكم الأملاك"
      subtitle="نظرة شاملة على أداء المحفظة العقارية"
      breadcrumbs={[{ href: "/properties", label: "إدارة الأملاك" }]}
      actions={actions}
      contentClassName="space-y-6"
    >
      <KpiGrid items={kpiItems} />

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
                <p className="text-[10px] text-muted-foreground">محصل</p>
              </div>
              <div className="text-center p-2 bg-surface-subtle rounded-lg">
                <p className="text-lg font-bold text-status-neutral-foreground">{formatCurrency(s.annualExpected || 0)}</p>
                <p className="text-[10px] text-muted-foreground">متوقع</p>
              </div>
              <div className="text-center p-2 bg-status-error-surface rounded-lg">
                <p className="text-lg font-bold text-status-error-foreground">{formatCurrency((s.annualExpected || 0) - (s.annualCollected || 0))}</p>
                <p className="text-[10px] text-muted-foreground">متبقي</p>
              </div>
            </div>
            {(s.annualExpected || 0) > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>نسبة التحصيل السنوي</span>
                  <span className="font-bold">{Math.round(((s.annualCollected || 0) / (s.annualExpected || 1)) * 100)}%</span>
                </div>
                <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
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
              <div className="text-center p-2 bg-status-error-surface rounded-lg border border-status-error-surface">
                <p className="text-2xl font-bold text-status-error-foreground">{s.expiring30 || 0}</p>
                <p className="text-[10px] text-muted-foreground">خلال 30 يوم</p>
              </div>
              <div className="text-center p-2 bg-orange-50 rounded-lg border border-orange-100">
                <p className="text-2xl font-bold text-orange-600">{s.expiring60 || 0}</p>
                <p className="text-[10px] text-muted-foreground">خلال 60 يوم</p>
              </div>
              <div className="text-center p-2 bg-status-warning-surface rounded-lg border border-status-warning-surface">
                <p className="text-2xl font-bold text-status-warning-foreground">{s.expiring90 || 0}</p>
                <p className="text-[10px] text-muted-foreground">خلال 90 يوم</p>
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
                <Wrench className="h-4 w-4 text-status-warning" /> طلبات الصيانة
              </p>
              <Link href="/properties/maintenance">
                <Button variant="ghost" size="sm" className="text-xs text-status-info-foreground h-6">عرض الكل</Button>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-status-warning-foreground">{openMaintenanceTickets}</div>
              <div>
                <p className="text-xs text-muted-foreground">طلب مفتوح</p>
                {s.criticalMaintenanceTickets > 0 && (
                  <Badge className="bg-status-error-surface text-status-error-foreground hover:bg-status-error-surface border-0 text-xs">
                    {s.criticalMaintenanceTickets} حرج
                  </Badge>
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
            <p className="text-xs text-muted-foreground mt-1">من {formatCurrency(s.totalExpected || 0)} إجمالي</p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>نسبة التحصيل الكلية</span>
                <span className="font-bold">{s.collectionRate || 0}%</span>
              </div>
              <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", (s.collectionRate || 0) >= 80 ? "bg-emerald-500" : (s.collectionRate || 0) >= 50 ? "bg-status-warning-surface0" : "bg-status-error-surface0")}
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
                <Users2 className="h-4 w-4 text-status-info" /> روابط سريعة
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
                <Trophy className="h-4 w-4 text-status-warning" /> أداء المباني (مرتبة حسب الإيراد)
              </CardTitle>
              <Link href="/properties/buildings">
                <Button variant="ghost" size="sm" className="text-xs text-status-info-foreground">عرض الكل</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={buildingColumns}
              data={buildingPerf}
              pageSize={0}
              noToolbar
              searchPlaceholder={null}
              rowClassName={(row: any) => {
                const idx = buildingPerf.indexOf(row);
                const isTop = idx === 0 && buildingPerf.length > 1;
                const isBottom = idx === buildingPerf.length - 1 && buildingPerf.length > 1;
                return cn(
                  isTop && "bg-status-warning-surface/30",
                  isBottom && "bg-status-error-surface"
                );
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/properties/buildings", icon: Building2, label: "المباني والمجمعات", color: "text-status-info-foreground bg-status-info-surface" },
          { href: "/properties", icon: Home, label: "الوحدات العقارية", color: "text-emerald-600 bg-emerald-50" },
          { href: "/properties/tenants", icon: Users2, label: "المستأجرون", color: "text-violet-600 bg-violet-50" },
          { href: "/properties/contracts", icon: FileText, label: "عقود الإيجار", color: "text-status-warning-foreground bg-status-warning-surface" },
          { href: "/properties/payments", icon: Banknote, label: "المدفوعات", color: "text-indigo-600 bg-indigo-50" },
          { href: "/properties/maintenance", icon: Wrench, label: "طلبات الصيانة", color: "text-orange-600 bg-orange-50" },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", item.color)}>
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium group-hover:text-status-info-foreground transition-colors">{item.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Operations drill-downs from /properties/operations-dashboard.
          Each card appears only when there's at least one row so a
          clean environment renders nothing here. */}
      {ops?.expiringContracts && ops.expiringContracts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-status-warning-foreground" />
              عقود تنتهي خلال 30 يوماً ({ops.expiringContracts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "tenantName", header: "المستأجر", render: (r) => <span className="text-xs font-medium">{r.tenantName}</span> },
                { key: "unitNumber", header: "الوحدة", render: (r) => <span className="text-xs">{r.unitNumber || "—"}</span> },
                { key: "buildingName", header: "المبنى", render: (r) => <span className="text-xs text-muted-foreground">{r.buildingName || "—"}</span> },
                { key: "endDate", header: "تاريخ الانتهاء", render: (r) => (
                  <Badge variant="outline" className="text-xs">{r.endDate}</Badge>
                )},
              ] as DataTableColumn<any>[]}
              data={ops.expiringContracts}
              noToolbar
              pageSize={5}
            />
          </CardContent>
        </Card>
      )}

      {ops?.overduePayments && ops.overduePayments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-status-error-foreground" />
              دفعات إيجار متأخرة ({ops.overduePayments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "tenantName", header: "المستأجر", render: (r) => <span className="text-xs font-medium">{r.tenantName}</span> },
                { key: "unitNumber", header: "الوحدة", render: (r) => <span className="text-xs">{r.unitNumber || "—"}</span> },
                { key: "amount", header: "المستحق", render: (r) => (
                  <span className="font-mono text-xs">{formatCurrency(Number(r.amount) - Number(r.paidAmount || 0))}</span>
                )},
                { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => (
                  <span className="text-xs text-status-error-foreground">{r.dueDate}</span>
                )},
              ] as DataTableColumn<any>[]}
              data={ops.overduePayments}
              noToolbar
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}

      {ops?.openMaintenance && ops.openMaintenance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-5 h-5 text-status-info-foreground" />
              طلبات صيانة مفتوحة ({ops.openMaintenance.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "category", header: "الفئة", render: (r) => <Badge variant="outline" className="text-xs">{r.category}</Badge> },
                { key: "description", header: "الوصف", render: (r) => (
                  <span className="text-xs max-w-[300px] truncate block" title={r.description}>{r.description}</span>
                )},
                { key: "unitNumber", header: "الوحدة", render: (r) => <span className="text-xs">{r.unitNumber || "—"}</span> },
                { key: "tenantName", header: "المستأجر", render: (r) => <span className="text-xs text-muted-foreground">{r.tenantName || "—"}</span> },
                { key: "priority", header: "الأولوية", render: (r) => (
                  <Badge variant={r.priority === "high" || r.priority === "urgent" ? "destructive" : "secondary"} className="text-xs">{r.priority}</Badge>
                )},
              ] as DataTableColumn<any>[]}
              data={ops.openMaintenance}
              noToolbar
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
