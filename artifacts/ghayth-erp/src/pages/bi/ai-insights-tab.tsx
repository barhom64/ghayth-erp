import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Brain, CheckCircle2, ArrowUpRight, Lightbulb, ShieldAlert, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

export function AIInsightsTab() {
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["bi-ai-insights"], "/bi/ai-insights");
  const alerts = (data?.alerts || []) as any[];
  const counts = data?.counts || {};
  const proactive = (data?.proactiveActions || []) as any[];

  const handleDismiss = async (id: number) => {
    setDismissingId(id);
    try {
      await apiFetch(`/bi/ai-insights/${id}/dismiss`, { method: "PATCH" });
      toast({ title: "تم الإغلاق" });
      refetch();
    } catch {
      toast({ title: "خطأ", variant: "destructive" });
    }
    setDismissingId(null);
  };

  const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
    critical: { label: "عاجل", color: "text-status-error-foreground", bg: "bg-status-error-surface border-status-error-surface" },
    warning: { label: "مهم", color: "text-status-warning-foreground", bg: "bg-status-warning-surface border-status-warning-surface" },
    info: { label: "معلوماتي", color: "text-status-info-foreground", bg: "bg-status-info-surface border-status-info-surface" },
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Brain className="h-6 w-6 text-purple-600" />رؤى الذكاء الاصطناعي</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "عاجل", count: counts.critical || 0, color: "text-status-error-foreground", bg: "bg-status-error-surface" },
          { label: "مهم", count: counts.warning || 0, color: "text-status-warning-foreground", bg: "bg-status-warning-surface" },
          { label: "معلوماتي", count: counts.info || 0, color: "text-status-info-foreground", bg: "bg-status-info-surface" },
        ].map((s) => (
          <Card key={s.label} className={cn("border-0 shadow-sm", s.bg)}>
            <CardContent className="p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-12 bg-surface-subtle rounded animate-pulse" /></CardContent></Card>)}</div>}

      {!isLoading && alerts.length === 0 && (
        <Card><CardContent className="p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-muted-foreground">لا توجد تنبيهات نشطة</p>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {alerts.map((alert: any) => {
          const cfg = severityConfig[alert.severity] || severityConfig["info"]!;
          return (
            <Card key={alert.id} className={cn("border shadow-sm", cfg.bg)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <Lightbulb className={cn("h-5 w-5 mt-0.5 shrink-0", cfg.color)} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn("text-xs", cfg.color, cfg.bg)}>{cfg.label}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDateAr(alert.createdAt)}</span>
                      </div>
                      <p className="font-medium text-status-neutral-foreground">{alert.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      {alert.suggestedAction && (
                        <p className="text-xs text-status-info-foreground mt-1 flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" />الإجراء المقترح: {alert.suggestedAction}
                        </p>
                      )}
                    </div>
                  </div>
                  <GuardedButton
                    perm="bi:create"
                    size="sm" variant="ghost"
                    onClick={() => handleDismiss(alert.id)}
                    disabled={dismissingId === alert.id}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </GuardedButton>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {proactive.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-status-neutral-foreground flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-purple-500" />إجراءات الأتمتة الأخيرة</h3>
          <DataTable
            data={proactive.slice(0, 10)}
            rowKey={(p) => p.id}
            searchPlaceholder="بحث..."
            emptyMessage="لا توجد إجراءات"
            columns={[
              { key: "automationType", header: "النوع", sortable: true, searchable: true, className: "text-xs font-medium", render: (p) => p.automationType },
              { key: "triggerReason", header: "السبب", searchable: true, className: "text-xs text-muted-foreground", render: (p) => p.triggerReason },
              { key: "actionTaken", header: "الإجراء المتخذ", className: "text-xs", render: (p) => p.actionTaken },
              { key: "status", header: "الحالة", sortable: true, render: (p) => <Badge variant={p.status === "success" ? "default" : "destructive"} className="text-xs">{p.status === "success" ? "نجاح" : "فشل"}</Badge> },
              { key: "createdAt", header: "التاريخ", sortable: true, className: "text-xs text-muted-foreground", render: (p) => formatDateAr(p.createdAt) },
            ]}
          />
        </div>
      )}
    </div>
  );
}
