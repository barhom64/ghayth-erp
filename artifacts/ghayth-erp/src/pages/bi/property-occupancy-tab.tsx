import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Building } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export function PropertyOccupancyTab() {
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
      <DataTable
        data={rows}
        isLoading={isLoading}
        isError={isError}
        rowKey={(r) => r.buildingId}
        searchPlaceholder="بحث باسم المبنى..."
        emptyMessage="لا توجد مبانٍ"
        emptyIcon={<Building className="h-10 w-10 opacity-30" />}
        columns={[
          { key: "buildingName", header: "المبنى", sortable: true, searchable: true, className: "font-medium", render: (r) => r.buildingName },
          { key: "totalUnits", header: "إجمالي الوحدات", sortable: true, render: (r) => r.totalUnits },
          { key: "occupiedUnits", header: "مؤجرة", sortable: true, className: "text-emerald-600", render: (r) => r.occupiedUnits },
          { key: "vacantUnits", header: "شاغرة", sortable: true, className: "text-red-600", render: (r) => r.vacantUnits },
          {
            key: "occupancyRate",
            header: "نسبة الإشغال",
            sortable: true,
            render: (r) => (
              <div className="flex items-center gap-2">
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div className={cn("h-2 rounded-full", r.occupancyRate >= 80 ? "bg-emerald-500" : r.occupancyRate >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${r.occupancyRate}%` }} />
                </div>
                <span className="text-sm font-medium">{r.occupancyRate}%</span>
              </div>
            ),
          },
          { key: "avgMonthlyRent", header: "متوسط الإيجار", sortable: true, render: (r) => formatNumber(r.avgMonthlyRent) },
          { key: "totalMonthlyRevenue", header: "الإيرادات الشهرية", sortable: true, className: "text-blue-600 font-medium", render: (r) => formatNumber(r.totalMonthlyRevenue) },
          { key: "annualRevenue", header: "الإيرادات السنوية", sortable: true, className: "text-indigo-600 font-medium", render: (r) => formatNumber(r.annualRevenue) },
        ]}
      />
    </div>
  );
}
