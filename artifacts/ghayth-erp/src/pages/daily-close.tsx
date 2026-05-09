import { PageShell } from "@/components/page-shell";
import { todayLocal } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Link } from "wouter";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, Lock,
  ArrowRight, Loader2, ChevronLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function DailyClose() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["daily-close-checklist", scopeQueryString],
    `/operations-center/daily-close/checklist${scopeSuffix}`
  );

  const items = data?.items || [];
  const allPassed = data?.allPassed || false;
  const closedToday = data?.closedToday || false;
  const closeDate = data?.date || todayLocal();

  const passedCount = items.filter((i: any) => i.passed).length;
  const failedCount = items.filter((i: any) => !i.passed).length;

  const closeMut = useApiMutation<any, { notes: string; force: boolean }>(
    () => `/operations-center/daily-close/execute${scopeSuffix}`,
    "POST",
    [["daily-close-checklist"]],
    { successMessage: "تم إقفال اليوم بنجاح" }
  );
  const isClosing = closeMut.isPending;

  const handleClose = (force = false) => {
    const msg = force
      ? "ستقوم بالتجاوز القسري وإقفال اليوم رغم وجود بنود غير مكتملة. هل أنت متأكد؟"
      : "هل أنت متأكد من إقفال اليوم؟ لا يمكن التراجع عن هذا الإجراء.";
    if (!confirm(msg)) return;
    closeMut.mutate({ notes: "", force });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الإقفال اليومي"
      subtitle={`تحقق من اكتمال جميع العمليات قبل إغلاق اليوم — ${closeDate}`}
      loading={isLoading}
      actions={
        <Link href="/operations-center">
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            مركز العمليات <ChevronLeft className="w-3 h-3" />
          </Button>
        </Link>
      }
    >
      {closedToday && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border-2 border-green-200">
          <Lock className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-semibold text-green-800">تم إقفال هذا اليوم</p>
            <p className="text-sm text-green-600">تم إقفال يوم {closeDate} بنجاح</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 border-2 border-gray-100 bg-white text-center">
          <p className="text-2xl font-black text-gray-900">{items.length}</p>
          <p className="text-sm text-gray-500">إجمالي البنود</p>
        </div>
        <div className={cn("rounded-xl p-4 border-2 text-center", passedCount === items.length ? "border-green-200 bg-green-50" : "border-gray-100 bg-white")}>
          <p className="text-2xl font-black text-green-700">{passedCount}</p>
          <p className="text-sm text-gray-500">ناجح</p>
        </div>
        <div className={cn("rounded-xl p-4 border-2 text-center", failedCount > 0 ? "border-red-200 bg-red-50" : "border-gray-100 bg-white")}>
          <p className="text-2xl font-black text-red-700">{failedCount}</p>
          <p className="text-sm text-gray-500">يحتاج مراجعة</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">قائمة التحقق</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.key} className={cn(
                "flex items-center gap-4 p-4 rounded-xl border-2 transition-colors",
                item.passed ? "border-green-100 bg-green-50/50" : "border-red-100 bg-red-50/50"
              )}>
                <div className="shrink-0">
                  {item.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                </div>
                <Badge variant={item.passed ? "secondary" : "destructive"} className="text-xs shrink-0">
                  {item.value}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!closedToday && (
        <div className="flex flex-col items-center gap-3">
          {allPassed ? (
            <Button
              size="lg"
              className="gap-2 px-8"
              disabled={isClosing}
              onClick={() => handleClose(false)}
            >
              {isClosing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الإقفال...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  إقفال اليوم
                </>
              )}
            </Button>
          ) : (
            <>
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                توجد بنود لم تكتمل — يمكن للمالك أو المدير العام أو المدير التنفيذي التجاوز القسري
              </p>
              <Button
                size="lg"
                variant="destructive"
                className="gap-2 px-8"
                disabled={isClosing}
                onClick={() => handleClose(true)}
              >
                {isClosing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الإقفال...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    تجاوز وإقفال اليوم (قسري)
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
