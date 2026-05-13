import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { Building2, Home, Wrench, TrendingUp, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PageShell } from "@/components/page-shell";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  rented: { label: "مؤجرة", color: "text-status-success-foreground", bg: "bg-status-success-surface" },
  available: { label: "متاحة", color: "text-status-info-foreground", bg: "bg-status-info-surface" },
  maintenance: { label: "صيانة", color: "text-orange-600", bg: "bg-orange-100" },
  under_maintenance: { label: "تحت الصيانة", color: "text-orange-600", bg: "bg-orange-100" },
  out_of_service: { label: "خارج الخدمة", color: "text-status-error-foreground", bg: "bg-status-error-surface" },
  reserved: { label: "محجوزة", color: "text-status-warning-foreground", bg: "bg-status-warning-surface" },
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#9ca3af"];

export default function OccupancyReportPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["occupancy-report"], "/properties/occupancy-report");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const units = asList(data?.units || []);
  const pieData = [
    { name: "مؤجرة", value: data?.occupied || 0 },
    { name: "متاحة", value: data?.available || 0 },
    { name: "صيانة", value: data?.maintenance || 0 },
  ].filter((d) => d.value > 0);

  const unitColumns: DataTableColumn<any>[] = [
    {
      key: "unitNumber",
      header: "الوحدة",
      render: (u) => <span className="font-medium">{u.unitNumber}</span>,
    },
    {
      key: "buildingName",
      header: "المبنى",
      render: (u) => <span className="text-muted-foreground">{u.buildingName}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      render: (u) => (
        <Badge className={`${STATUS_LABELS[u.status]?.bg || "bg-surface-subtle"} ${STATUS_LABELS[u.status]?.color || "text-muted-foreground"} text-xs`}>
          {STATUS_LABELS[u.status]?.label || u.status}
        </Badge>
      ),
    },
    {
      key: "tenantName",
      header: "المستأجر",
      render: (u) => u.tenantName || "—",
    },
    {
      key: "monthlyRent",
      header: "الإيجار الشهري",
      render: (u) => u.monthlyRent ? formatCurrency(Number(u.monthlyRent)) : "—",
    },
    {
      key: "contractEnd",
      header: "انتهاء العقد",
      render: (u) => <span className="text-muted-foreground">{u.contractEnd?.split("T")[0] || "—"}</span>,
    },
  ];

  return (
    <PageShell
      title="تقرير الإشغال العقاري"
      subtitle="نظرة شاملة على حالة الوحدات العقارية"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "تقرير الإشغال العقاري" }]}
      loading={isLoading}
    >
      <PropertyTabsNav />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-primary">{data?.occupancyRate || 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">معدل الإشغال</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold">{data?.total || 0}</div>
            <div className="text-xs text-muted-foreground">إجمالي الوحدات</div>
          </CardContent>
        </Card>
        <Card className="border-status-success-surface bg-status-success-surface">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-status-success-foreground">{data?.occupied || 0}</div>
            <div className="text-xs text-muted-foreground">مؤجرة</div>
          </CardContent>
        </Card>
        <Card className="border-status-info-surface bg-status-info-surface">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-status-info-foreground">{data?.available || 0}</div>
            <div className="text-xs text-muted-foreground">متاحة</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold">{formatCurrency(data?.totalMonthlyRent || 0)}</div>
            <div className="text-xs text-muted-foreground">إيجار شهري</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">توزيع حالة الوحدات</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 flex-1">
                {pieData.map((d, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-sm">{d.name}</span>
                    </div>
                    <span className="font-bold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {(data?.byBuilding || []).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">الإشغال حسب المبنى</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data?.byBuilding || []).map((b: any, i: number) => {
                const rate = b.total > 0 ? Math.round((b.occupied / b.total) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{b.name}</span>
                      <span className="text-muted-foreground">{b.occupied}/{b.total} ({rate}%)</span>
                    </div>
                    <div className="w-full bg-surface-subtle rounded-full h-2">
                      <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">قائمة الوحدات ({units.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={unitColumns}
            data={units}
            searchPlaceholder={null}
            noToolbar
            pageSize={20}
            emptyMessage="لا توجد وحدات"
            emptyIcon={<Home className="h-10 w-10 text-gray-300" />}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
