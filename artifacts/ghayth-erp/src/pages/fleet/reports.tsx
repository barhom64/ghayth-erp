import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Car, Fuel, Wrench, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/api";
import { ExportButton, MultiExportButton } from "@/components/shared/export-buttons";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

export default function FleetReports() {
  const { data: stats, isLoading, isError } = useApiQuery<any>(["fleet-stats"], "/fleet/stats");
  const s = stats || {};

  const statCards = [
    { label: "إجمالي المركبات", value: s.totalVehicles ?? 0, icon: Car, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "سجلات الوقود", value: s.totalFuelLogs ?? 0, icon: Fuel, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "طلبات الصيانة", value: s.totalMaintenance ?? 0, icon: Wrench, color: "text-orange-600 bg-orange-50" },
    { label: "المركبات النشطة", value: s.activeVehicles ?? 0, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="تقارير الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "تقارير الأسطول" }]}
      actions={
        <MultiExportButton
          exports={[
            { endpoint: "/export/excel/fleet", filename: "fleet-report.xlsx", type: "excel", label: "تصدير إكسل" },
            { endpoint: "/export/pdf/fleet-trips", filename: "fleet-trips.pdf", type: "pdf", label: "تصدير ملف طباعي للرحلات" },
          ]}
        />
      }
    >
      <FleetTabsNav />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> ملخص الأسطول</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-status-info-surface rounded-lg">
              <p className="text-sm text-muted-foreground">إجمالي الرحلات</p>
              <p className="text-2xl font-bold text-status-info-foreground">{s.totalTrips ?? 0}</p>
            </div>
            <div className="p-4 bg-status-success-surface rounded-lg">
              <p className="text-sm text-muted-foreground">السائقين</p>
              <p className="text-2xl font-bold text-status-success-foreground">{s.totalDrivers ?? 0}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-muted-foreground">تنبيهات نشطة</p>
              <p className="text-2xl font-bold text-orange-700">{s.activeAlerts ?? 0}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-muted-foreground">وثائق التأمين</p>
              <p className="text-2xl font-bold text-purple-700">{s.totalInsurance ?? 0}</p>
            </div>
          </div>
          {Object.keys(s).length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا توجد بيانات كافية لإنشاء التقارير</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
