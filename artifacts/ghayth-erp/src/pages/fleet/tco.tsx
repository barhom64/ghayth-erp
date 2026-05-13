import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart3, Car, TrendingUp, DollarSign, Fuel, Wrench, Shield, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { formatCurrency, formatNumber } from "@/lib/formatters";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899"];

export default function TCOPage() {
  const [vehicleId, setVehicleId] = useState("");

  const { data: vehicles, isLoading: isVehiclesLoading, isError: isVehiclesError } = useApiQuery<any>(["fleet-vehicles"], "/fleet/vehicles?limit=200");
  const vehicleList = asList(vehicles?.data || vehicles);

  const { data: tco, isLoading } = useApiQuery<any>(
    ["tco", vehicleId],
    `/fleet/vehicles/${vehicleId}/tco`,
    { enabled: !!vehicleId }
  );

  const pieData = tco ? [
    { name: "سعر الشراء", value: tco.purchasePrice, icon: <Car /> },
    { name: "الوقود", value: tco.fuelCost, icon: <Fuel /> },
    { name: "الصيانة", value: tco.maintenanceCost, icon: <Wrench /> },
    { name: "التأمين", value: tco.insuranceCost, icon: <Shield /> },
    { name: "المخالفات", value: tco.trafficFines, icon: <AlertTriangle /> },
  ].filter((d) => d.value > 0) : [];

  if (isVehiclesLoading) return <LoadingSpinner />;
  if (isVehiclesError) return <ErrorState />;

  return (
    <PageShell
      title="تحليل التكلفة الكلية للمركبة"
      subtitle="تكلفة التملك الإجمالية"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "تحليل التكلفة الكلية للمركبة" }]}
      loading={isLoading}
    >
      <FleetTabsNav />
      <div className="flex items-center gap-2">
        <Label>اختر مركبة:</Label>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="اختر مركبة للتحليل" />
          </SelectTrigger>
          <SelectContent>
            {vehicleList.map((v: any) => (
              <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} — {v.make} {v.model} {v.year || ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!vehicleId && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">اختر مركبة لعرض تحليل التكلفة الكلية</CardContent></Card>
      )}

      {vehicleId && isLoading && (
        <div className="text-center py-8 text-muted-foreground">جاري التحليل...</div>
      )}

      {tco && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-2 border-primary/20">
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-primary">{formatCurrency(tco.totalCost)}</div>
                <div className="text-xs text-muted-foreground mt-1">إجمالي تكلفة التملك</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-xl font-bold">{formatCurrency(tco.costPerKm)}</div>
                <div className="text-xs text-muted-foreground">التكلفة لكل كيلومتر</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-xl font-bold">{formatNumber(tco.totalKm)}</div>
                <div className="text-xs text-muted-foreground">إجمالي الكيلومترات</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-xl font-bold">{tco.yearsSincePurchase} سنة</div>
                <div className="text-xs text-muted-foreground">عمر المركبة</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">توزيع التكاليف</CardTitle></CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                          {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [formatCurrency(v)]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {pieData.map((d, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span>{d.name}</span>
                          </div>
                          <span className="font-medium">{formatCurrency(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <div className="text-center py-4 text-muted-foreground text-sm">لا توجد بيانات</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">تفاصيل التكاليف</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "سعر الشراء", value: tco.purchasePrice, icon: Car, color: "text-purple-500" },
                  { label: "الوقود", value: tco.fuelCost, icon: Fuel, color: "text-status-info" },
                  { label: "الصيانة", value: tco.maintenanceCost, icon: Wrench, color: "text-orange-500" },
                  { label: "التأمين", value: tco.insuranceCost, icon: Shield, color: "text-status-success" },
                  { label: "الاستهلاك", value: tco.totalDepreciation, icon: TrendingUp, color: "text-status-error" },
                  { label: "المخالفات", value: tco.trafficFines, icon: AlertTriangle, color: "text-red-400" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <span className="font-medium text-sm">{formatCurrency(item.value || 0)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 border-t-2 font-bold">
                  <span>الإجمالي</span>
                  <span className="text-primary">{formatCurrency(tco.totalCost)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-surface-subtle">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="font-medium">المركبة:</span> {tco.make} {tco.model} {tco.year || ""}</div>
                <div><span className="font-medium">رقم اللوحة:</span> {tco.plateNumber}</div>
                <div><span className="font-medium">إجمالي الرحلات:</span> {tco.totalTrips}</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
