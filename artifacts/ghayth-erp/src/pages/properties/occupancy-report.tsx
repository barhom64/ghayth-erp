import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Home, Wrench, TrendingUp, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  rented: { label: "مؤجرة", color: "text-green-600", bg: "bg-green-100" },
  available: { label: "متاحة", color: "text-blue-600", bg: "bg-blue-100" },
  maintenance: { label: "صيانة", color: "text-orange-600", bg: "bg-orange-100" },
  reserved: { label: "محجوزة", color: "text-yellow-600", bg: "bg-yellow-100" },
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#9ca3af"];

export default function OccupancyReportPage() {
  const { data, isLoading } = useApiQuery<any>(["occupancy-report"], "/properties/occupancy-report");

  if (isLoading) return <div className="p-6 text-center text-gray-400">جاري التحميل...</div>;

  const units = asList(data?.units || []);
  const pieData = [
    { name: "مؤجرة", value: data?.occupied || 0 },
    { name: "متاحة", value: data?.available || 0 },
    { name: "صيانة", value: data?.maintenance || 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">تقرير الإشغال العقاري</h1>
          <p className="text-sm text-gray-500">نظرة شاملة على حالة الوحدات العقارية</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-primary">{data?.occupancyRate || 0}%</div>
            <div className="text-xs text-gray-500 mt-1">معدل الإشغال</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold">{data?.total || 0}</div>
            <div className="text-xs text-gray-500">إجمالي الوحدات</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-green-600">{data?.occupied || 0}</div>
            <div className="text-xs text-gray-500">مؤجرة</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-blue-600">{data?.available || 0}</div>
            <div className="text-xs text-gray-500">متاحة</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold">{(data?.totalMonthlyRent || 0).toLocaleString()}</div>
            <div className="text-xs text-gray-500">إيجار شهري (ر.س)</div>
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
                      <span className="text-gray-500">{b.occupied}/{b.total} ({rate}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
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
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-start">الوحدة</th>
                  <th className="px-3 py-2 text-start">المبنى</th>
                  <th className="px-3 py-2 text-start">الحالة</th>
                  <th className="px-3 py-2 text-start">المستأجر</th>
                  <th className="px-3 py-2 text-start">الإيجار الشهري</th>
                  <th className="px-3 py-2 text-start">انتهاء العقد</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {units.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{u.unitNumber}</td>
                    <td className="px-3 py-2 text-gray-500">{u.buildingName}</td>
                    <td className="px-3 py-2">
                      <Badge className={`${STATUS_LABELS[u.status]?.bg || "bg-gray-100"} ${STATUS_LABELS[u.status]?.color || "text-gray-600"} text-xs`}>
                        {STATUS_LABELS[u.status]?.label || u.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{u.tenantName || "—"}</td>
                    <td className="px-3 py-2">{u.monthlyRent ? `${Number(u.monthlyRent).toLocaleString()} ر.س` : "—"}</td>
                    <td className="px-3 py-2 text-gray-500">{u.contractEnd?.split("T")[0] || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
