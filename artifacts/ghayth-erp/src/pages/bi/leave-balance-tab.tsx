import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function LeaveBalanceTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-dept-leave"], "/bi/reports/department-leave-balance");
  const rows = (data?.data || []) as any[];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">رصيد إجازات الأقسام — {data?.year || new Date().getFullYear()}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && [...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-6"><div className="h-24 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}
        {!isLoading && rows.map((r: any) => (
          <Card key={r.department} className={cn("border-0 shadow-sm", r.warning ? "ring-2 ring-red-300 bg-red-50" : "")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800">{r.department}</h3>
                {r.warning && <Badge className="bg-red-100 text-red-700 text-xs"><AlertTriangle className="h-3 w-3 me-1" />تحذير</Badge>}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">إجمالي الموظفين:</span><span className="font-medium">{r.totalEmployees}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">في إجازة الآن:</span><span className={cn("font-medium", r.warning ? "text-red-600" : "")}>{r.onLeaveNow} ({r.onLeavePct}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">متوسط الرصيد المتبقي:</span><span className="font-medium text-blue-600">{r.avgRemainingBalance} يوم</span></div>
                <div className="flex justify-between"><span className="text-gray-500">إجمالي الأيام المستهلكة:</span><span className="font-medium">{r.totalUsedDays}</span></div>
              </div>
              {r.warning && <p className="text-xs text-red-500 mt-2">تحذير: أكثر من 30% من القسم في إجازة</p>}
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 && (
          <Card className="col-span-full"><CardContent className="p-8 text-center text-gray-400">لا توجد أقسام</CardContent></Card>
        )}
      </div>
    </div>
  );
}
