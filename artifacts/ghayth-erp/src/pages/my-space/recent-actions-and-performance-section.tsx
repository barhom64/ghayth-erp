import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Target, Star, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeAgo, statusLabels } from "./shared";

interface RecentActionsAndPerformanceSectionProps {
  recentActions: any[];
  performanceReviews: any[];
}

export function RecentActionsAndPerformanceSection({ recentActions, performanceReviews }: RecentActionsAndPerformanceSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-500" />
            آخر إجراءاتي
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActions.length === 0 ? (
            <div className="text-center py-4">
              <Activity className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">لا توجد إجراءات حديثة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActions.map((a: any) => {
                const actionLabels: Record<string, string> = {
                  create: "إنشاء",
                  update: "تعديل",
                  delete: "حذف",
                  approve: "اعتماد",
                  reject: "رفض",
                };
                return (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {actionLabels[a.action] || a.action} — {a.entityType}
                      </p>
                      {a.description && (
                        <p className="text-xs text-gray-500 truncate">{a.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {a.createdAt ? formatTimeAgo(a.createdAt) : ""}
                    </span>
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
            <Target className="w-5 h-5 text-amber-500" />
            تقييمات الأداء
          </CardTitle>
          <Link href="/hr/performance">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              عرض الكل <ChevronLeft className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {performanceReviews.length === 0 ? (
            <div className="text-center py-4">
              <Target className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">لا توجد تقييمات أداء</p>
            </div>
          ) : (
            <div className="space-y-2">
              {performanceReviews.map((r: any) => {
                const score = Number(r.overallScore) || 0;
                const scoreColor = score >= 4 ? "text-green-600" : score >= 3 ? "text-yellow-600" : "text-red-600";
                const scoreBg = score >= 4 ? "bg-green-50" : score >= 3 ? "bg-yellow-50" : "bg-red-50";
                return (
                  <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{r.period || "تقييم"}</p>
                      <p className="text-xs text-gray-500">
                        {r.reviewerName ? `بواسطة: ${r.reviewerName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", scoreBg, scoreColor)}>
                        <Star className="w-3 h-3" />
                        {score.toFixed(1)}/5
                      </div>
                      <Badge className={cn("text-[10px]", statusLabels[r.status]?.color || "bg-gray-100 text-gray-700")}>
                        {statusLabels[r.status]?.label || r.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
