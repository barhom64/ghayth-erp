import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Calendar,
  Loader2, TrendingUp, DollarSign, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

const statusConfig: Record<string, { label: string; color: string }> = {
  present: { label: "حاضر", color: "text-green-600 bg-green-50" },
  present_out_of_range: { label: "خارج النطاق", color: "text-orange-600 bg-orange-50" },
  present_off_day: { label: "حضور يوم عطلة", color: "text-purple-600 bg-purple-50" },
  absent: { label: "غائب", color: "text-red-600 bg-red-50" },
  late: { label: "متأخر", color: "text-orange-600 bg-orange-50" },
  leave: { label: "إجازة", color: "text-blue-600 bg-blue-50" },
  holiday: { label: "عطلة", color: "text-purple-600 bg-purple-50" },
};

const severityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "منخفض", color: "bg-yellow-100 text-yellow-700" },
  medium: { label: "متوسط", color: "bg-orange-100 text-orange-700" },
  high: { label: "مرتفع", color: "bg-red-100 text-red-700" },
  critical: { label: "حرج", color: "bg-red-200 text-red-800" },
};

export default function MyAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.toISOString().slice(0, 7));

  const { data, isLoading } = useApiQuery<any>(
    ["my-attendance", month],
    `/my-space/attendance?month=${month}`
  );

  const records: any[] = data?.data ?? [];
  const monthly = data?.monthly;

  const presentDays = monthly?.presentDays ?? records.filter((r: any) => r.status === "present" || r.checkIn).length;
  const absentDays = records.filter((r: any) => r.status === "absent").length;
  const lateDays = monthly?.lateDays ?? records.filter((r: any) => r.lateMinutes > 0).length;
  const totalLateMinutes = monthly?.totalLateMinutes ?? records.reduce((sum: number, r: any) => sum + (Number(r.lateMinutes) || 0), 0);
  const totalDeduction = monthly?.totalDeduction ?? records.reduce((sum: number, r: any) => sum + (Number(r.totalDeductions) || 0), 0);
  const totalOvertimeMinutes = monthly?.overtimeMinutes ?? records.reduce((sum: number, r: any) => sum + (Number(r.overtimeMinutes) || 0), 0);

  return (
    <PageShell title="حضوري وانصرافي" subtitle="سجل الحضور والانصراف الشهري">
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-700">الشهر:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "أيام الحضور", value: presentDays, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "أيام الغياب", value: absentDays, icon: XCircle, color: "text-red-600 bg-red-50" },
          { label: "أيام التأخير", value: lateDays, icon: AlertCircle, color: "text-orange-600 bg-orange-50" },
          { label: "دقائق التأخير", value: totalLateMinutes, icon: Clock, color: "text-blue-600 bg-blue-50" },
          { label: "الوقت الإضافي (د)", value: totalOvertimeMinutes, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
          { label: "إجمالي الخصومات", value: `${Number(totalDeduction).toFixed(2)} ر.س`, icon: DollarSign, color: "text-red-600 bg-red-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-2", stat.color)}>
                  <Icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Calendar size={36} className="mx-auto mb-3 opacity-40" />
            <p>لا توجد سجلات حضور لهذا الشهر</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">تفاصيل الحضور</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-right px-4 py-3 font-medium text-gray-600">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الحضور</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الانصراف</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">التأخير</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">وقت إضافي</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">خصم</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec: any, i: number) => {
                    const cfg = statusConfig[rec.status] ?? { label: rec.status, color: "text-gray-600 bg-gray-50" };
                    const sev = rec.violationSeverity && rec.violationCount > 0 ? severityConfig[rec.violationSeverity] : null;
                    return (
                      <tr key={rec.id ?? i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-700">{formatDateAr(rec.date)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatTime(rec.checkIn)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatTime(rec.checkOut)}</td>
                        <td className="px-4 py-3">
                          {rec.lateMinutes > 0 ? (
                            <span className="text-orange-600 font-medium">{rec.lateMinutes} د</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {rec.overtimeMinutes > 0 ? (
                            <span className="text-emerald-600 font-medium">{rec.overtimeMinutes} د</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {Number(rec.totalDeductions) > 0 ? (
                            <div className="flex items-center gap-1">
                              <span className="text-red-600 font-medium">{Number(rec.totalDeductions).toFixed(2)} ر.س</span>
                              {sev && (
                                <Badge className={cn("text-[10px] px-1 py-0", sev.color)}>
                                  <AlertTriangle className="w-2.5 h-2.5 me-0.5 inline" />
                                  {sev.label}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", cfg.color)}>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
