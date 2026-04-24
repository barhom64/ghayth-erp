import { type ReactNode } from "react";
import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  User,
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";

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

function buildLifecycleSteps(status: string | undefined): StageStep[] {
  const s = status ?? "active";
  if (s === "rejected") {
    return [{ label: "مرفوضة", status: "rejected" }];
  }
  if (s === "pending") {
    return LIFECYCLE_ORDER.map((step) => ({ label: step.label, status: "pending" }));
  }
  const effective = s === "returned" || s === "overdue" ? "active" : s;
  const currentIdx = LIFECYCLE_ORDER.findIndex((x) => x.key === effective);
  return LIFECYCLE_ORDER.map((step, i): StageStep => {
    if (currentIdx === -1) return { label: step.label, status: "pending" };
    if (i < currentIdx)    return { label: step.label, status: "completed" };
    if (i === currentIdx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

const STATUS_TONE: Record<string, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  active: "info",
  partial: "warning",
  settled: "success",
  pending: "muted",
  rejected: "destructive",
  returned: "warning",
  overdue: "destructive",
};

export default function CustodyDetailPage() {
  const [, params] = useRoute("/finance/custodies/:id");
  const id = params?.id;
  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["custody-detail", id || ""],
    id ? `/finance/custodies/${id}` : null,
    !!id,
  );

  const progressPercent =
    data?.amount > 0 ? Math.min(100, Math.round((data.settledAmount / data.amount) * 100)) : 0;
  const lifecycleSteps = buildLifecycleSteps(data?.status);

  const overview = (
    <>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            دورة تسوية العهدة
          </p>
          <ProcessStages steps={lifecycleSteps} />
          {data?.daysOverdue > 0 && (
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
              <p className="text-xl font-bold">{formatCurrency(data?.amount)}</p>
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
                {formatCurrency(data?.settledAmount)}
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
                {formatCurrency(data?.remainingAmount)}
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
              <p className="text-lg font-bold">{data?.employeeName || "-"}</p>
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
            <InfoLine label="المرجع" value={<span className="font-mono">{data?.ref}</span>} />
            <InfoLine label="الوصف" value={data?.description || "-"} />
            {data?.purpose && <InfoLine label="الغرض" value={data.purpose} />}
            <InfoLine
              label="تاريخ الإنشاء"
              value={data?.date ? formatDateAr(data.date) : "-"}
            />
            {data?.expectedReturnDate && (
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
            {!data?.settlements || data.settlements.length === 0 ? (
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

      {data?.timeline && data.timeline.length > 0 && (
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
  );

  return (
    <DetailPageLayout
      title={data?.ref ? `عهدة ${data.ref}` : "العهدة"}
      subtitle={data?.description || data?.purpose || undefined}
      backPath="/finance/custodies"
      backLabel="العودة للعهد"
      status={data?.status ? { label: data.status, tone: STATUS_TONE[data.status] ?? "default" } : undefined}
      refNumber={data?.ref}
      createdAt={data?.date || data?.createdAt}
      updatedAt={data?.updatedAt}
      entityType="finance_custody"
      entityId={id || ""}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      overview={overview}
    />
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
