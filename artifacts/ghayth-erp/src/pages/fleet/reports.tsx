import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Car, Fuel, Wrench, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/api";
import { ExportButton, MultiExportButton } from "@/components/shared/export-buttons";
import { PageShell } from "@/components/page-shell";

export default function FleetReports() {
  const { data: stats } = useApiQuery<any>(["fleet-stats"], "/fleet/stats");
  const s = stats || {};

  const statCards = [
    { label: "إجمالي المركبات", value: s.totalVehicles ?? 0, icon: Car, color: "text-blue-600 bg-blue-50" },
    { label: "سجلات الوقود", value: s.totalFuelLogs ?? 0, icon: Fuel, color: "text-green-600 bg-green-50" },
    { label: "طلبات الصيانة", value: s.totalMaintenance ?? 0, icon: Wrench, color: "text-orange-600 bg-orange-50" },
    { label: "المركبات النشطة", value: s.activeVehicles ?? 0, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
  ];

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> ملخص الأسطول</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">إجمالي الرحلات</p>
              <p className="text-2xl font-bold text-blue-700">{s.totalTrips ?? 0}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">السائقين</p>
              <p className="text-2xl font-bold text-green-700">{s.totalDrivers ?? 0}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-600">تنبيهات نشطة</p>
              <p className="text-2xl font-bold text-orange-700">{s.activeAlerts ?? 0}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">وثائق التأمين</p>
              <p className="text-2xl font-bold text-purple-700">{s.totalInsurance ?? 0}</p>
            </div>
          </div>
          {Object.keys(s).length === 0 && (
            <p className="text-center text-gray-400 py-8">لا توجد بيانات كافية لإنشاء التقارير</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
