import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ClipboardList, ChevronLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeAgo, statusLabels, requestTypeLabels } from "./shared";

interface LeavesAndRequestsSectionProps {
  leaveBalances: any[];
  openRequests: any[];
}

export function LeavesAndRequestsSection({ leaveBalances, openRequests }: LeavesAndRequestsSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-500" />
            رصيد الإجازات
          </CardTitle>
          <Link href="/hr/leaves">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              طلب إجازة <ChevronLeft className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {leaveBalances.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">لا توجد أنواع إجازات</p>
          ) : (
            <div className="space-y-4">
              {leaveBalances.map((b: any) => {
                const total = (b.used || 0) + (b.remaining || 0);
                const usedPct = total > 0 ? Math.min(100, Math.round(((b.used || 0) / total) * 100)) : 0;
                const isLow = b.remaining <= 3;
                const isOut = b.remaining <= 0;
                return (
                  <div key={b.leaveTypeId} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{b.name}</span>
                      <span className={cn("text-xs font-semibold", isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600")}>
                        {b.remaining} / {total} يوم
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", isOut ? "bg-red-500" : isLow ? "bg-amber-400" : "bg-emerald-500")}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>مستخدم: {b.used || 0} يوم</span>
                      <span>{usedPct}% مستخدم</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-orange-500" />
            طلباتي المفتوحة
            {openRequests.length > 0 && <Badge className="text-xs bg-orange-100 text-orange-700">{openRequests.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openRequests.length === 0 ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">لا توجد طلبات مفتوحة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openRequests.slice(0, 6).map((r: any) => (
                <div key={`${r.type}-${r.id}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {requestTypeLabels[r.type] || r.type}: {r.title}
                    </p>
                    <p className="text-xs text-gray-400">{r.createdAt ? formatTimeAgo(r.createdAt) : ""}</p>
                  </div>
                  <Badge className={cn("text-[10px] shrink-0", statusLabels[r.status]?.color || "bg-gray-100 text-gray-700")}>
                    {statusLabels[r.status]?.label || r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
