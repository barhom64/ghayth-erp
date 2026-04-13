import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, Calendar, DollarSign, LogIn, LogOut as LogOutIcon, Timer, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "./shared";

interface SummaryCardsProps {
  attendance: any;
  monthlyStats: any;
  currentShift: any;
  lastPayslip: any;
}

export function SummaryCards({ attendance, monthlyStats, currentShift, lastPayslip }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            حضوري اليوم
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attendance ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600">الحضور</span>
                </div>
                <span className="text-sm font-medium">{formatTime(attendance.checkIn)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogOutIcon className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-gray-600">الانصراف</span>
                </div>
                <span className="text-sm font-medium">{formatTime(attendance.checkOut)}</span>
              </div>
              {attendance.lateMinutes > 0 && (
                <div className="flex items-center gap-2 text-orange-600 text-sm">
                  <Timer className="w-4 h-4" />
                  تأخر {attendance.lateMinutes} دقيقة
                </div>
              )}
              <Badge className={cn("text-xs",
                attendance.status === "present" ? "bg-green-100 text-green-700" :
                attendance.status === "present_out_of_range" ? "bg-orange-100 text-orange-700" :
                attendance.status === "present_off_day" ? "bg-purple-100 text-purple-700" :
                "bg-yellow-100 text-yellow-700"
              )}>
                {attendance.status === "present" ? "حاضر" :
                 attendance.status === "present_out_of_range" ? "خارج النطاق" :
                 attendance.status === "present_off_day" ? "حاضر (يوم عطلة)" :
                 attendance.status}
              </Badge>
            </div>
          ) : (
            <div className="text-center py-4">
              <XCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">لم يتم تسجيل الحضور بعد</p>
              <Link href="/hr/attendance">
                <Button size="sm" variant="outline" className="mt-2 gap-1">
                  <LogIn className="w-3 h-3" />
                  تسجيل حضور
                </Button>
              </Link>
            </div>
          )}
          {monthlyStats && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <p className="text-xs font-medium text-gray-600">تقدم الشهر الحالي</p>
              {(() => {
                const now = new Date();
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const dayOfMonth = now.getDate();
                const monthPct = Math.round((dayOfMonth / daysInMonth) * 100);
                const attendPct = monthlyStats.workingDays > 0
                  ? Math.round((monthlyStats.presentDays / monthlyStats.workingDays) * 100)
                  : 0;
                return (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>أيام الحضور: {monthlyStats.presentDays || 0} / {monthlyStats.workingDays || 0}</span>
                        <span className={cn("font-medium", attendPct >= 90 ? "text-emerald-600" : attendPct >= 75 ? "text-amber-600" : "text-red-600")}>{attendPct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", attendPct >= 90 ? "bg-emerald-500" : attendPct >= 75 ? "bg-amber-400" : "bg-red-500")}
                          style={{ width: `${attendPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>تقدم الشهر</span>
                        <span>اليوم {dayOfMonth} / {daysInMonth}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${monthPct}%` }} />
                      </div>
                    </div>
                    {monthlyStats.lateMinutes > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600">
                        <Timer className="w-3 h-3" />
                        إجمالي التأخر هذا الشهر: {monthlyStats.lateMinutes} دقيقة
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-500" />
            جدول العمل
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentShift ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-800">{currentShift.name || "الوردية الحالية"}</p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>من {currentShift.startTime}</span>
                <span>إلى {currentShift.endTime}</span>
              </div>
              {currentShift.days && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {String(currentShift.days).split(",").map((d: string) => {
                    const dayNames: Record<string, string> = { "0": "أحد", "1": "إثن", "2": "ثلا", "3": "أرب", "4": "خمي", "5": "جمع", "6": "سبت" };
                    return (
                      <Badge key={d} variant="outline" className="text-[10px]">
                        {dayNames[d.trim()] || d}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">لا توجد وردية مسندة</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            تعريف الراتب
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastPayslip ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">الفترة</span>
                <span className="font-medium">{lastPayslip.period}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">الراتب الأساسي</span>
                <span className="font-medium">{Number(lastPayslip.basicSalary).toLocaleString("ar-SA")} ر.س</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">البدلات</span>
                <span className="font-medium text-green-600">+{Number(lastPayslip.totalAllowances).toLocaleString("ar-SA")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">الخصومات</span>
                <span className="font-medium text-red-600">-{Number(lastPayslip.totalDeductions).toLocaleString("ar-SA")}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-bold">
                <span>صافي الراتب</span>
                <span className="text-primary">{Number(lastPayslip.netSalary).toLocaleString("ar-SA")} ر.س</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">لا يوجد مسير رواتب سابق</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
