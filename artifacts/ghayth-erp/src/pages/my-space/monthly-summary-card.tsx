import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

interface MonthlySummaryCardProps {
  monthlyStats: any;
}

export function MonthlySummaryCard({ monthlyStats }: MonthlySummaryCardProps) {
  if (!monthlyStats) return null;
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-l from-blue-50/50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-status-info" />
          ملخص الأداء الشهري
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-status-success-surface rounded-xl border border-status-success-surface">
            <p className="text-2xl font-bold text-status-success-foreground">{monthlyStats.presentDays || 0}</p>
            <p className="text-xs text-status-success-foreground font-medium">أيام حضور</p>
          </div>
          <div className="text-center p-3 bg-status-error-surface rounded-xl border border-status-error-surface">
            <p className="text-2xl font-bold text-status-error-foreground">{monthlyStats.absentDays || 0}</p>
            <p className="text-xs text-status-error-foreground font-medium">أيام غياب</p>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-xl border border-orange-100">
            <p className="text-2xl font-bold text-orange-700">{monthlyStats.lateDays || 0}</p>
            <p className="text-xs text-orange-600 font-medium">أيام تأخر</p>
          </div>
          <div className="text-center p-3 bg-status-info-surface rounded-xl border border-status-info-surface">
            <p className="text-2xl font-bold text-status-info-foreground">{monthlyStats.totalLateMinutes || 0}</p>
            <p className="text-xs text-status-info-foreground font-medium">دقائق تأخر</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-xl border border-purple-100">
            <p className="text-2xl font-bold text-purple-700">
              {monthlyStats.presentDays
                ? Math.round((monthlyStats.presentDays / (monthlyStats.presentDays + (monthlyStats.absentDays || 0))) * 100)
                : 0}%
            </p>
            <p className="text-xs text-purple-600 font-medium">نسبة الالتزام</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
