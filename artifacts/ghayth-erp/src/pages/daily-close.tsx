import { useState } from "react";
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
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

  // Two confirmation paths: regular close vs force-close (overrides
  // incomplete items). Native confirm() blocked the event loop and
  // gave the operator no visual cue about the force path's danger.
  const [closeMode, setCloseMode] = useState<null | "normal" | "force">(null);
  const handleClose = (force = false) => {
    setCloseMode(force ? "force" : "normal");
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
        <div className="flex items-center gap-3 p-4 rounded-xl bg-status-success-surface border-2 border-status-success-surface">
          <Lock className="w-6 h-6 text-status-success-foreground" />
          <div>
            <p className="font-semibold text-status-success-foreground">تم إقفال هذا اليوم</p>
            <p className="text-sm text-status-success-foreground">تم إقفال يوم {closeDate} بنجاح</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 border-2 border-border bg-white text-center">
          <p className="text-2xl font-black text-gray-900">{items.length}</p>
          <p className="text-sm text-muted-foreground">إجمالي البنود</p>
        </div>
        <div className={cn("rounded-xl p-4 border-2 text-center", passedCount === items.length ? "border-status-success-surface bg-status-success-surface" : "border-border bg-white")}>
          <p className="text-2xl font-black text-status-success-foreground">{passedCount}</p>
          <p className="text-sm text-muted-foreground">ناجح</p>
        </div>
        <div className={cn("rounded-xl p-4 border-2 text-center", failedCount > 0 ? "border-status-error-surface bg-status-error-surface" : "border-border bg-white")}>
          <p className="text-2xl font-black text-status-error-foreground">{failedCount}</p>
          <p className="text-sm text-muted-foreground">يحتاج مراجعة</p>
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
                item.passed ? "border-status-success-surface bg-status-success-surface" : "border-status-error-surface bg-status-error-surface"
              )}>
                <div className="shrink-0">
                  {item.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-status-success" />
                  ) : (
                    <XCircle className="w-6 h-6 text-status-error" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-status-neutral-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
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
            <GuardedButton
              perm="finance:approve"
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
            </GuardedButton>
          ) : (
            <>
              <p className="text-sm text-status-warning-foreground flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                توجد بنود لم تكتمل — يمكن للمالك أو المدير العام أو المدير التنفيذي التجاوز القسري
              </p>
              <GuardedButton
                perm="finance:approve"
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
              </GuardedButton>
            </>
          )}
        </div>
      )}

      <AlertDialog
        open={closeMode !== null}
        onOpenChange={(next) => { if (!next) setCloseMode(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {closeMode === "force" ? "تجاوز قسري — إقفال اليوم" : "إقفال اليوم"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {closeMode === "force"
                ? "ستقوم بالتجاوز القسري وإقفال اليوم رغم وجود بنود غير مكتملة. لا يمكن التراجع عن هذا الإجراء."
                : "هل أنت متأكد من إقفال اليوم؟ لا يمكن التراجع عن هذا الإجراء."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCloseMode(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const force = closeMode === "force";
                setCloseMode(null);
                closeMut.mutate({ notes: "", force });
              }}
            >
              {closeMode === "force" ? "تجاوز وإقفال" : "إقفال اليوم"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
