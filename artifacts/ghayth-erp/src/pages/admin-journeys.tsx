import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshAction } from "@/components/page-actions";
import { CheckCircle2, Circle, GitBranch } from "lucide-react";

/**
 * Admin / Journey tracking (#1604, under #1594).
 *
 * Live view of journeyEngine's journey_instances: which operational journeys
 * (finance invoice, etc.) are in progress vs completed, and how far each has
 * advanced — a real progress bar driven by the bus events the journey tracker
 * consumes. Read-only window onto a previously head-less engine.
 *
 * Endpoint: GET /events/journeys?status=  → { data: JourneyInstance[] }
 */

interface JourneyStep {
  key: string;
  label: string;
  done: boolean;
}
interface JourneyInstance {
  id: number;
  journeyType: string;
  journeyLabel: string;
  domain: string;
  entityType: string | null;
  entityId: number | null;
  label: string;
  status: string;
  completedCount: number;
  totalSteps: number;
  progress: number;
  steps: JourneyStep[];
  updatedAt: string;
}

const STATUS_FILTERS = [
  { value: "", label: "الكل" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "completed", label: "مكتملة" },
];

export default function AdminJourneys() {
  const [status, setStatus] = useState("");
  const { data, isLoading, error, refetch } = useApiQuery<{ data: JourneyInstance[] }>(
    ["admin-journeys", status],
    `/events/journeys${status ? `?status=${status}` : ""}`,
  );
  const rows = data?.data ?? [];
  const inProgress = rows.filter((r) => r.status === "in_progress").length;
  const completed = rows.filter((r) => r.status === "completed").length;

  return (
    <PageShell
      title="تتبّع الرحلات الحيّة"
      subtitle="الرحلات التشغيلية الجارية (journey_instances) وتقدّم كل منها خطوةً بخطوة، مدفوعةً بأحداث الناقل"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "تتبّع الرحلات" },
      ]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={status === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <RefreshAction onRefresh={refetch} />
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-status-warning-foreground">{Number(inProgress).toLocaleString("ar-SA")}</p>
            <p className="text-xs text-muted-foreground">قيد التنفيذ</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-status-success-foreground">{Number(completed).toLocaleString("ar-SA")}</p>
            <p className="text-xs text-muted-foreground">مكتملة</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-status-info-foreground">{Number(rows.length).toLocaleString("ar-SA")}</p>
            <p className="text-xs text-muted-foreground">الإجمالي</p>
          </CardContent></Card>
        </div>

        {rows.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            لا توجد رحلات مُتتبَّعة بعد — تُنشأ تلقائياً عند بثّ أحداث العمليات (مثل إنشاء/ترحيل فاتورة) على الناقل.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {rows.map((j) => (
              <Card key={j.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-status-info-foreground" />
                      {j.journeyLabel}
                      <span className="text-xs text-muted-foreground font-normal">{j.label}</span>
                    </span>
                    <Badge variant={j.status === "completed" ? "default" : "secondary"}>
                      {j.status === "completed" ? "مكتملة" : "قيد التنفيذ"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-surface-subtle rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${j.status === "completed" ? "bg-status-success-foreground" : "bg-status-info-foreground"}`}
                        style={{ width: `${Math.round((j.progress || 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {Number(j.completedCount).toLocaleString("ar-SA")} / {Number(j.totalSteps).toLocaleString("ar-SA")}
                    </span>
                  </div>
                  {/* Step chips */}
                  <div className="flex flex-wrap gap-2">
                    {j.steps.map((s) => (
                      <span
                        key={s.key}
                        className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border ${
                          s.done
                            ? "text-status-success-foreground border-status-success-surface bg-status-success-surface"
                            : "text-muted-foreground border-border"
                        }`}
                      >
                        {s.done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                        {s.label}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageStateWrapper>
    </PageShell>
  );
}
