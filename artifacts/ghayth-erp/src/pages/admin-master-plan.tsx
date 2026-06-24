/**
 * Admin → Master Plan Dashboard (#1139 §6).
 *
 * Live status of the #1139 master execution plan. Reads from
 * /api/admin/master-plan/status — which derives implementation
 * status from real schema + route presence — and renders the
 * eight sections as expandable cards with per-item evidence and
 * deep links into the relevant admin surfaces.
 *
 * This page IS the plan's UI artifact. The strategic document
 * gets a single pane any operator can open to see where the
 * system stands against it, instead of reading the GitHub issue
 * and guessing.
 */
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import {
  CheckCircle2, AlertTriangle, XCircle, ExternalLink,
  Layers, ArrowRight, Target, Lock, Sparkles, Radio, Activity, Workflow,
  AlertOctagon,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

interface PlanItem {
  key: string;
  label: string;
  status: "implemented" | "partial" | "missing" | "external";
  evidence: string;
  linkPath?: string;
  externalBlocker?: string;
}

interface PlanSection {
  number: number;
  title: string;
  items: PlanItem[];
  coverage: number;
}

interface PlanStatus {
  masterPlanIssue: number;
  collectedAt: string;
  sections: PlanSection[];
  overallCoverage: number;
}

const SECTION_ICON: Record<number, typeof Layers> = {
  1: Layers,
  2: Workflow,
  3: Radio,
  4: Sparkles,
  5: Activity,
  6: Target,
  7: ArrowRight,
  8: Lock,
};

function statusBadge(s: PlanItem["status"]) {
  if (s === "implemented") return { Icon: CheckCircle2, color: "text-status-success-foreground", bg: "bg-status-success-surface", label: "منفّذ" };
  if (s === "partial") return { Icon: AlertTriangle, color: "text-status-warning-foreground", bg: "bg-status-warning-surface/60", label: "جزئي" };
  if (s === "external") return { Icon: AlertOctagon, color: "text-status-info-foreground", bg: "bg-status-info-surface", label: "يحتاج مزوّداً" };
  return { Icon: XCircle, color: "text-status-error-foreground", bg: "bg-status-error-surface", label: "ناقص" };
}

function coverageBarColor(pct: number): string {
  if (pct >= 90) return "bg-status-success-foreground";
  if (pct >= 70) return "bg-status-info-foreground";
  if (pct >= 50) return "bg-status-warning-foreground";
  return "bg-status-error-foreground";
}

export default function AdminMasterPlan() {
  const { data, isLoading, error, refetch } = useApiQuery<PlanStatus>(
    ["admin-master-plan-status"],
    "/admin/master-plan/status",
  );

  const sections = data?.sections ?? [];
  const overall = data?.overallCoverage ?? 0;

  // Aggregate counters across the whole plan for the top KPI strip.
  const allItems = sections.flatMap((s) => s.items);
  const implementedCount = allItems.filter((i) => i.status === "implemented").length;
  const partialCount = allItems.filter((i) => i.status === "partial").length;
  const externalCount = allItems.filter((i) => i.status === "external").length;
  const missingCount = allItems.filter((i) => i.status === "missing").length;

  return (
    <PageShell
      title="خارطة #1139 — حالة التنفيذ الحيّة"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "خارطة #1139 — حالة التنفيذ الحيّة" },
      ]}
      subtitle="تتبّع حيّ لخطة Ghaith Enterprise Operating System عبر القنوات الفعلية للنظام"
      loading={isLoading}
      actions={
        <RefreshAction onRefresh={() => refetch()} />
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">

          {/* ── Overall coverage banner ───────────────────────────── */}
          <Card className={cn(
            "border-0 shadow-sm",
            overall >= 90 ? "bg-status-success-surface" :
            overall >= 70 ? "bg-status-info-surface" :
            "bg-status-warning-surface/60",
          )}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">المرجع: #{data?.masterPlanIssue ?? 1139}</p>
                  <h2 className="text-2xl font-semibold">التغطية الكليّة: {overall}%</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {implementedCount} منفّذ · {partialCount} جزئي · {externalCount} يحتاج مزوّداً · {missingCount} ناقص
                  </p>
                </div>
                <div className="flex-1 min-w-[200px] max-w-md">
                  <div className="h-3 bg-surface-subtle rounded overflow-hidden">
                    <div
                      className={cn("h-full transition-all", coverageBarColor(overall))}
                      style={{ width: `${overall}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Per-section breakdown ─────────────────────────────── */}
          <div className="space-y-4">
            {sections.map((s) => {
              const Icon = SECTION_ICON[s.number] ?? Layers;
              return (
                <Card key={s.number}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-3">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-mono">§{s.number}</span>
                        <span>{s.title}</span>
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{s.items.length} بنود</span>
                        <Badge variant="outline" className={cn(
                          "font-mono",
                          s.coverage >= 90 ? "text-status-success-foreground" :
                          s.coverage >= 70 ? "text-status-info-foreground" :
                          s.coverage >= 50 ? "text-status-warning-foreground" :
                          "text-status-error-foreground",
                        )}>
                          {s.coverage}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-1.5 bg-surface-subtle rounded overflow-hidden mt-2">
                      <div
                        className={cn("h-full transition-all", coverageBarColor(s.coverage))}
                        style={{ width: `${s.coverage}%` }}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {s.items.map((i) => {
                        const sb = statusBadge(i.status);
                        const Icon = sb.Icon;
                        return (
                          <div key={i.key} className={cn("rounded p-3 border border-transparent", sb.bg)}>
                            <div className="flex items-start gap-2">
                              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", sb.color)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <p className="text-sm font-medium">{i.label}</p>
                                  <Badge variant="outline" className={cn("text-[10px]", sb.color)}>{sb.label}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{i.evidence}</p>
                                {i.externalBlocker && (
                                  <p className="text-[11px] text-status-info-foreground mt-1">
                                    <Lock className="w-3 h-3 inline me-1" />
                                    حاجز خارجي: {i.externalBlocker}
                                  </p>
                                )}
                                {i.linkPath && (
                                  <Button asChild variant="link" size="sm" className="h-auto p-0 mt-1 text-[11px]"><Link href={i.linkPath}>
                                      افتح <ExternalLink className="w-3 h-3 ms-1" />
                                    </Link></Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {data?.collectedAt && (
            <p className="text-xs text-muted-foreground text-end">
              آخر تحديث: {formatDateAr(data.collectedAt)}
            </p>
          )}
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
