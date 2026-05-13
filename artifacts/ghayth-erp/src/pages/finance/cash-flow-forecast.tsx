import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import { TrendingUp, TrendingDown, DollarSign, Calendar, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/page-shell";

function ForecastCard({ label, days, data }: { label: string; days: string; data: any }) {
  const net = data?.net ?? 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="text-sm text-muted-foreground">{days}</div>
          </div>
          <Calendar className="h-5 w-5 text-gray-300" />
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-status-success-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> تدفقات داخلة</span>
            <span className="font-semibold text-status-success-foreground">{formatCurrency(data?.inflow ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-status-error flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5" /> تدفقات خارجة</span>
            <span className="font-semibold text-status-error-foreground">{formatCurrency(data?.outflow ?? 0)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="text-muted-foreground">صافي التدفق</span>
            <span className={`font-bold text-base ${net >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(net)}</span>
          </div>
          <div className="flex justify-between bg-surface-subtle rounded-lg px-3 py-2 -mx-3">
            <span className="text-muted-foreground text-xs">الرصيد المتوقع</span>
            <span className={`font-bold text-sm ${(data?.projected ?? 0) >= 0 ? "text-status-info-foreground" : "text-status-error-foreground"}`}>{formatCurrency(data?.projected ?? 0)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CashFlowForecastPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError } = useApiQuery<any>(
    ["cash-flow-forecast"],
    `/finance/cash-flow-forecast${scopeSuffix}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const forecast = data?.forecast ?? {};
  const inflows = data?.inflows ?? {};
  const outflows = data?.outflows ?? {};
  const currentBalance = data?.currentBalance ?? 0;

  const projected90 = forecast.days90?.projected ?? 0;
  const isWarning = projected90 < 0;

  return (
    <PageShell
      title="توقعات التدفق النقدي"
      subtitle="تحليل التدفقات النقدية المتوقعة خلال 30 و60 و90 يوم القادمة بناءً على الفواتير والمستحقات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "توقعات التدفق النقدي" }]}
      loading={isLoading}
    >
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جاري تحميل البيانات...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">الرصيد الحالي</div>
                <div className={`text-2xl font-bold mt-2 ${currentBalance >= 0 ? "text-status-info-foreground" : "text-status-error-foreground"}`}>{formatCurrency(currentBalance)}</div>
                <DollarSign className="h-4 w-4 text-gray-300 mt-1" />
              </CardContent>
            </Card>
            <ForecastCard label="توقعات 30 يوم" days="الشهر القادم" data={forecast.days30} />
            <ForecastCard label="توقعات 60 يوم" days="شهران" data={forecast.days60} />
            <ForecastCard label="توقعات 90 يوم" days="ربع سنة" data={forecast.days90} />
          </div>

          {isWarning && (
            <div className="rounded-xl border border-status-error-surface bg-status-error-surface p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-status-error shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-status-error-foreground">تحذير: عجز نقدي متوقع خلال 90 يوماً</div>
                <div className="text-sm text-status-error-foreground mt-0.5">الرصيد المتوقع بعد 90 يوم: <strong>{formatCurrency(projected90)}</strong> — يُنصح بمراجعة التزامات السداد أو تأمين تمويل إضافي.</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b bg-status-success-surface flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-status-success-foreground" />
                <span className="font-semibold text-status-success-foreground">التدفقات الداخلة المتوقعة (90 يوم)</span>
              </div>
              <div className="divide-y">
                {[
                  { label: "التدفقات خلال 30 يوم", items: inflows.next30 ?? [] },
                  { label: "التدفقات بين 31-60 يوم", items: inflows.next60 ?? [] },
                  { label: "التدفقات بين 61-90 يوم", items: inflows.next90 ?? [] },
                ].map(group => (
                  group.items.length > 0 && (
                    <div key={group.label}>
                      <div className="px-5 py-2 text-xs font-medium text-muted-foreground bg-surface-subtle">{group.label}</div>
                      {group.items.slice(0, 5).map((item: any, i: number) => (
                        <div key={i} className="px-5 py-2.5 flex items-center justify-between text-sm hover:bg-surface-subtle">
                          <div>
                            <div className="font-medium">{item.clientName ?? "عميل"}</div>
                            <div className="text-xs text-muted-foreground">{item.ref} · استحقاق {formatDate(item.dueDate)}</div>
                          </div>
                          <div className="font-semibold text-status-success-foreground">{formatCurrency(item.expected)}</div>
                        </div>
                      ))}
                      {group.items.length > 5 && (
                        <div className="px-5 py-2 text-xs text-muted-foreground">+ {group.items.length - 5} عنصر آخر</div>
                      )}
                    </div>
                  )
                ))}
                {(inflows.next30?.length ?? 0) === 0 && (inflows.next60?.length ?? 0) === 0 && (inflows.next90?.length ?? 0) === 0 && (
                  <div className="px-5 py-8 text-center text-muted-foreground text-sm">لا توجد تدفقات داخلة متوقعة</div>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b bg-status-error-surface flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-status-error" />
                <span className="font-semibold text-status-error-foreground">التدفقات الخارجة المتوقعة (30 يوم)</span>
              </div>
              <div className="divide-y">
                {(outflows.next30 ?? []).map((item: any, i: number) => (
                  <div key={i} className="px-5 py-2.5 flex items-center justify-between text-sm hover:bg-surface-subtle">
                    <div>
                      <div className="font-medium">{item.supplierName ?? "مورد"}</div>
                      <div className="text-xs text-muted-foreground">{item.ref} · {formatDate(item.dueDate)}</div>
                    </div>
                    <div className="font-semibold text-status-error-foreground">{formatCurrency(item.expected)}</div>
                  </div>
                ))}
                {(outflows.next30?.length ?? 0) === 0 && (
                  <div className="px-5 py-8 text-center text-muted-foreground text-sm">لا توجد التزامات مسجلة خلال 30 يوم</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
