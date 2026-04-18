import { type ReactNode } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  KeyRound,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeftRight,
  User,
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * Custody detail — migrated in R.3 iter 3 to the unified template stack.
 *
 * Before: raw <h1> + local `statusMap` with literal tailwind classes,
 * no breadcrumbs, ad-hoc skeleton + error states, inline timeline
 * rendering with its own styling vocabulary.
 *
 * After:
 *   • PageShell with title/subtitle/breadcrumbs/backTo + loading/error
 *     handling routed through the shell's slots
 *   • PageStatusBadge with `custody` domain drives the header chip
 *   • ProcessStages strip visualising the **settlement lifecycle**:
 *     نشطة → مسوّاة جزئياً → مسوّاة (with rejected as a terminal branch
 *     and returned as a mid-cycle branch). This is the first finance
 *     detail page after journal-manual-detail to expose a visible
 *     lifecycle — custodies have a real progression (active → partial
 *     → settled) that was previously hidden behind a single status
 *     chip.
 *
 * The existing "تفاصيل العهدة" + "سجل التسويات" + "المسار الزمني"
 * sections are preserved as-is; only the chrome changed.
 */

const timelineIcons: Record<string, any> = {
  created: KeyRound,
  approved: CheckCircle,
  rejected: XCircle,
  returned: ArrowRight,
  settlement: ArrowLeftRight,
};

const LIFECYCLE_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "active",  label: "نشطة"          },
  { key: "partial", label: "مسوّاة جزئياً" },
  { key: "settled", label: "مسوّاة"        },
];

/**
 * Map the seven possible custody statuses to the three-step lifecycle
 * strip. `pending` is a pre-activation state, so it reads as all
 * three steps pending. `rejected` reads as a terminal rejected branch
 * off the first step. `returned` reads like `active` (the custody is
 * back in the employee's hands, waiting to be re-settled). `overdue`
 * is a visual overlay on `active` (same lifecycle position, different
 * urgency) handled via the card banner below.
 */
function buildLifecycleSteps(status: string | undefined): StageStep[] {
  const s = status ?? "active";
  if (s === "rejected") {
    return [{ label: "مرفوضة", status: "rejected" }];
  }
  if (s === "pending") {
    return LIFECYCLE_ORDER.map((step) => ({ label: step.label, status: "pending" }));
  }
  // active / partial / settled / returned / overdue → progression
  const effective = s === "returned" || s === "overdue" ? "active" : s;
  const currentIdx = LIFECYCLE_ORDER.findIndex((x) => x.key === effective);
  return LIFECYCLE_ORDER.map((step, i): StageStep => {
    if (currentIdx === -1) return { label: step.label, status: "pending" };
    if (i < currentIdx)    return { label: step.label, status: "completed" };
    if (i === currentIdx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

export default function CustodyDetailPage() {
  const [, params] = useRoute("/finance/custodies/:id");
  const id = params?.id;
  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["custody-detail", id || ""],
    id ? `/finance/custodies/${id}` : null,
    !!id,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError && (!data || data.error)) return <ErrorState onRetry={() => window.location.reload()} />;

  const notFound = !isLoading && (!data || data.error);

  const progressPercent =
    data?.amount > 0 ? Math.min(100, Math.round((data.settledAmount / data.amount) * 100)) : 0;
  const lifecycleSteps = buildLifecycleSteps(data?.status);

  return (
    <PageShell
      title={data?.ref ? `عهدة ${data.ref}` : notFound ? "العهدة غير موجودة" : "..."}
      subtitle={data?.description || data?.purpose || undefined}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/custodies", label: "العهد" },
        { label: data?.ref || "التفاصيل" },
      ]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          {data?.status && <PageStatusBadge status={data.status} domain="custody" />}
          <Link href="/finance/custodies">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة للعهد
            </Button>
          </Link>
        </div>
      }
    >
      {notFound && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>العهدة غير موجودة</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      )}

      {isError && !notFound && (
        <Card>
          <CardContent className="p-8 text-center text-red-600">
            تعذر تحميل بيانات العهدة
            <Button variant="outline" className="mt-3 block mx-auto" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      )}

      {data && !notFound && (
        <>
          {/* Lifecycle strip — first detail page to expose a visible
              settlement lifecycle for custodies. */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                دورة تسوية العهدة
              </p>
              <ProcessStages steps={lifecycleSteps} />
              {data.daysOverdue > 0 && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ متأخرة بـ {data.daysOverdue} يوم عن تاريخ الإرجاع المتوقع
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-50 border border-blue-100">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المبلغ الأصلي</p>
                  <p className="text-xl font-bold">{formatCurrency(data.amount)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المسوّى</p>
                  <p className="text-xl font-bold text-emerald-700">
                    {formatCurrency(data.settledAmount)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المتبقي</p>
                  <p className="text-xl font-bold text-amber-700">
                    {formatCurrency(data.remainingAmount)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-100">
                  <User className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الموظف</p>
                  <p className="text-lg font-bold">{data.employeeName || "-"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">تفاصيل العهدة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoLine label="المرجع" value={<span className="font-mono">{data.ref}</span>} />
                <InfoLine label="الوصف" value={data.description || "-"} />
                {data.purpose && <InfoLine label="الغرض" value={data.purpose} />}
                <InfoLine
                  label="تاريخ الإنشاء"
                  value={data.date ? formatDateAr(data.date) : "-"}
                />
                {data.expectedReturnDate && (
                  <InfoLine
                    label="تاريخ الإرجاع المتوقع"
                    value={
                      <span className={data.daysOverdue > 0 ? "text-red-600 font-semibold" : ""}>
                        {formatDateAr(data.expectedReturnDate)}
                        {data.daysOverdue > 0 && ` (متأخر ${data.daysOverdue} يوم)`}
                      </span>
                    }
                  />
                )}
                <div className="pt-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">نسبة التسوية</span>
                    <span className="font-semibold">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        progressPercent >= 100
                          ? "bg-emerald-500"
                          : progressPercent > 0
                            ? "bg-amber-500"
                            : "bg-gray-300"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">سجل التسويات</CardTitle>
              </CardHeader>
              <CardContent>
                {!data.settlements || data.settlements.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لا توجد تسويات بعد</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.settlements.map((s: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                      >
                        <div>
                          <p className="font-mono text-xs text-blue-600">{s.ref}</p>
                          <p className="text-sm text-muted-foreground">
                            {s.date ? formatDateAr(s.date) : ""}
                          </p>
                          {s.settledByName && (
                            <p className="text-xs text-muted-foreground">
                              بواسطة: {s.settledByName}
                            </p>
                          )}
                        </div>
                        <p className="font-semibold text-emerald-600">
                          {formatCurrency(Number(s.amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {data.timeline && data.timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">المسار الزمني</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute top-0 bottom-0 start-4 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {data.timeline.map((event: any, i: number) => {
                      const Icon = timelineIcons[event.action] || Clock;
                      return (
                        <div key={i} className="relative flex gap-4 items-start">
                          <div
                            className={`relative z-10 flex-shrink-0 p-1.5 rounded-full border-2 bg-white ${
                              event.action === "created"
                                ? "border-blue-400"
                                : event.action === "approved"
                                  ? "border-emerald-400"
                                  : event.action === "rejected"
                                    ? "border-red-400"
                                    : event.action === "settlement"
                                      ? "border-amber-400"
                                      : "border-gray-300"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{event.label}</p>
                              {event.amount && (
                                <Badge variant="outline" className="text-xs">
                                  {formatCurrency(event.amount)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {event.date
                                ? `${formatDateAr(event.date)} ${new Date(
                                    event.date,
                                  ).toLocaleTimeString("ar-SA", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : ""}
                            </p>
                            {event.actionBy && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                بواسطة: {event.actionBy}
                              </p>
                            )}
                            {event.settledBy && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                بواسطة: {event.settledBy}
                              </p>
                            )}
                            {event.notes && (
                              <p className="text-xs text-muted-foreground mt-1 bg-gray-50 p-2 rounded">
                                {event.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex justify-between py-2 border-b">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
