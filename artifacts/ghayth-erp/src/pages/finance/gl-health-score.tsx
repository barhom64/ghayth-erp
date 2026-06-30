import { useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import {
  Heart, CheckCircle2, AlertCircle, AlertTriangle, ChevronRight,
  Activity, Shield,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * GL Health Score — single 0-100 score summarizing finance module health
 *
 * Combines 6 weighted dimensions, each scored 0-100:
 *   1. Allocation Coverage (25 points)
 *   2. Integrity (no gaps, no failures) (20 points)
 *   3. Posting Discipline (no draft journals) (15 points)
 *   4. Period Discipline (no open old periods) (15 points)
 *   5. Manual Override Rate (10 points)
 *   6. Posting Failures Resolved (15 points)
 *
 * Each dimension shows: score, weight, status, and "إصلاح" deep-link.
 */

interface AllocationResult {
  resolutionStatus: string;
}

interface ListResp { data?: any[]; total?: number; totalGaps?: number }

interface Dimension {
  key: string;
  label: string;
  description: string;
  weight: number;        // points contribution to total
  rawScore: number;      // 0-100
  weightedScore: number; // rawScore * weight / 100
  status: "good" | "fair" | "poor";
  detail: string;        // human readable: "85% covered" / "3 gaps detected"
  fixHref: string;
  fixLabel: string;
}

function countOf(d: ListResp | undefined): number {
  if (!d) return 0;
  if (typeof d.total === "number") return d.total;
  if (typeof d.totalGaps === "number") return d.totalGaps;
  if (Array.isArray(d.data)) return d.data.length;
  return 0;
}

function scoreToStatus(score: number): "good" | "fair" | "poor" {
  if (score >= 80) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

const STATUS_COLORS = {
  good: { bg: "bg-emerald-50/30", border: "border-emerald-300", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-800", label: "ممتاز" },
  fair: { bg: "bg-amber-50/30",   border: "border-amber-300",   text: "text-amber-700",   chip: "bg-amber-100 text-amber-800",   label: "يحتاج تحسيناً" },
  poor: { bg: "bg-red-50/30",     border: "border-red-300",     text: "text-red-700",     chip: "bg-red-100 text-red-800",       label: "حرج" },
};

export default function GlHealthScorePage() {
  const qAlloc       = useApiQuery<{ data: AllocationResult[] }>(["health-alloc"], `/finance/allocation-results`);
  const qIntegrity   = useApiQuery<ListResp>(["health-integrity"], `/finance/reports/gl-integrity-gaps`);
  const qUnmapped    = useApiQuery<ListResp>(["health-unmapped"], `/finance/reports/unmapped-lines`);
  const qDraftJrnl   = useApiQuery<ListResp>(["health-draft"], `/finance/journal-manual?status=draft&limit=1`);
  const qPendingJrnl = useApiQuery<ListResp>(["health-pending"], `/finance/journal-manual?status=pending_review&limit=1`);
  const qFailures    = useApiQuery<ListResp>(["health-failures"], `/finance/posting-failures?status=unresolved&limit=1`);
  const qPeriods     = useApiQuery<{ data: Array<{ id: number; name: string; status: string; endDate: string }> }>(["health-periods"], `/finance/fiscal-periods-v2`);

  const loading = qAlloc.isLoading || qIntegrity.isLoading || qUnmapped.isLoading || qDraftJrnl.isLoading;

  const dimensions = useMemo<Dimension[]>(() => {
    const dims: Dimension[] = [];

    // 1. Allocation Coverage (25 pts)
    const allocRows = qAlloc.data?.data ?? [];
    const allocTotal = allocRows.length;
    const allocResolved = allocRows.filter((r) => r.resolutionStatus === "resolved").length;
    const allocCovPct = allocTotal > 0 ? (allocResolved / allocTotal) * 100 : 100;
    dims.push({
      key: "allocation",
      label: "تغطية التوجيه التلقائي",
      description: "نسبة بنود JE التي وُجِّهت تلقائياً بواسطة القواعد",
      weight: 25,
      rawScore: Math.round(allocCovPct),
      weightedScore: Math.round((allocCovPct * 25) / 100),
      status: scoreToStatus(allocCovPct),
      detail: `${allocResolved} / ${allocTotal} موجَّه (${allocCovPct.toFixed(1)}%)`,
      fixHref: "/finance/allocation-coverage",
      fixLabel: "تحليل التغطية",
    });

    // 2. GL Integrity — no gaps (20 pts). 0 gaps = 100, else penalty.
    const gaps = countOf(qIntegrity.data);
    const integrityScore = gaps === 0 ? 100 : Math.max(0, 100 - gaps * 10);
    dims.push({
      key: "integrity",
      label: "سلامة تسلسل القيود (GL Integrity)",
      description: "فجوات في تسلسل مراجع القيود — مؤشر على قيود محذوفة قسرياً",
      weight: 20,
      rawScore: integrityScore,
      weightedScore: Math.round((integrityScore * 20) / 100),
      status: scoreToStatus(integrityScore),
      detail: gaps === 0 ? "0 فجوات — مثالي" : `${gaps} فجوة مكتشفة`,
      fixHref: "/finance/gl-integrity-gaps",
      fixLabel: "فحص الفجوات",
    });

    // 3. Posting Discipline — no draft/pending manual journals (15 pts)
    const draftCount = countOf(qDraftJrnl.data) + countOf(qPendingJrnl.data);
    const disciplineScore = draftCount === 0 ? 100 : Math.max(0, 100 - draftCount * 15);
    dims.push({
      key: "discipline",
      label: "انضباط الترحيل",
      description: "قيود يدوية بحالة draft/pending — لم تُرحَّل بعد",
      weight: 15,
      rawScore: disciplineScore,
      weightedScore: Math.round((disciplineScore * 15) / 100),
      status: scoreToStatus(disciplineScore),
      detail: draftCount === 0 ? "0 قيد معلّق" : `${draftCount} قيد بانتظار الترحيل/المراجعة`,
      fixHref: "/finance/journal-manual",
      fixLabel: "إدارة القيود اليدوية",
    });

    // 4. Period Discipline — open periods older than 60 days (15 pts)
    const periods = qPeriods.data?.data ?? [];
    const today = new Date();
    const overdueOpen = periods.filter((p) => {
      if (p.status !== "open") return false;
      // utc-ok: simple "older than 60 days" check
      const end = new Date(p.endDate);
      const diff = (today.getTime() - end.getTime()) / 86400000;
      return diff > 60;
    }).length;
    const periodScore = overdueOpen === 0 ? 100 : Math.max(0, 100 - overdueOpen * 20);
    dims.push({
      key: "periods",
      label: "انضباط إقفال الفترات",
      description: "فترات مالية مفتوحة منذ أكثر من 60 يوم — يجب إقفالها",
      weight: 15,
      rawScore: periodScore,
      weightedScore: Math.round((periodScore * 15) / 100),
      status: scoreToStatus(periodScore),
      detail: overdueOpen === 0 ? "كل الفترات في موعدها" : `${overdueOpen} فترة متأخرة الإقفال`,
      fixHref: "/finance/period-close-preflight",
      fixLabel: "إقفال الفترة",
    });

    // 5. Manual Override Rate (10 pts)
    const overrideCount = allocRows.filter((r) => r.resolutionStatus === "manual_override").length;
    const overridePct = allocTotal > 0 ? (overrideCount / allocTotal) * 100 : 0;
    const overrideScore = overridePct === 0 ? 100
      : overridePct < 5 ? 95
      : overridePct < 10 ? 80
      : overridePct < 20 ? 60
      : overridePct < 30 ? 40
      : 20;
    dims.push({
      key: "override",
      label: "معدّل التجاوزات اليدوية",
      description: "كم نسبة البنود التي تطلب تعديلاً يدوياً — مؤشر على قواعد ناقصة",
      weight: 10,
      rawScore: overrideScore,
      weightedScore: Math.round((overrideScore * 10) / 100),
      status: scoreToStatus(overrideScore),
      detail: `${overrideCount} override (${overridePct.toFixed(1)}%)`,
      fixHref: "/finance/overrides-report",
      fixLabel: "مراجعة Overrides",
    });

    // 6. Posting Failures (15 pts)
    const failures = countOf(qFailures.data);
    const unmapped = countOf(qUnmapped.data);
    const failScore = (failures === 0 && unmapped === 0) ? 100
      : Math.max(0, 100 - failures * 25 - Math.min(unmapped, 5) * 5);
    dims.push({
      key: "failures",
      label: "فشل ترحيل + بنود غير موجَّهة",
      description: "حالات فشل الترحيل والبنود بدون قاعدة توجيه",
      weight: 15,
      rawScore: failScore,
      weightedScore: Math.round((failScore * 15) / 100),
      status: scoreToStatus(failScore),
      detail: (failures === 0 && unmapped === 0) ? "0 مشاكل" : `${failures} فشل + ${unmapped} بنود unmapped`,
      fixHref: "/admin/posting-failures",
      fixLabel: "حلّ المشاكل",
    });

    return dims;
  }, [qAlloc.data, qIntegrity.data, qUnmapped.data, qDraftJrnl.data, qPendingJrnl.data, qFailures.data, qPeriods.data]);

  if (loading) return <LoadingSpinner />;

  const overallScore = dimensions.reduce((s, d) => s + d.weightedScore, 0);
  const overallStatus = scoreToStatus(overallScore);
  const issuesNeedingFix = dimensions.filter((d) => d.status === "poor").length;
  const dimensionsNeedingImprovement = dimensions.filter((d) => d.status === "fair").length;
  const dimensionsHealthy = dimensions.filter((d) => d.status === "good").length;

  return (
    <PageShell
      title="مؤشر صحة النظام المالي"
      subtitle="نقطة واحدة من 0-100 تلخّص صحة النظام المالي الكلي مع تفصيل وإجراءات تحسين"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "صحة النظام" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/gl-anomaly-detector">
              <AlertTriangle className="h-3.5 w-3.5 ml-1" />
              كاشف الشذوذ
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/gl-integrity-gaps">
              <Shield className="h-3.5 w-3.5 ml-1" />
              فجوات السلامة
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/gl-posting-queue">
              <Activity className="h-3.5 w-3.5 ml-1" />
              قائمة الترحيل
            </Link></Button>
          <PrintButton
            entityType="report_finance_gl_health"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: `مؤشر صحة النظام المالي — ${Math.round(overallScore)}/100`, total: dimensions.length },
              items: dimensions.map((d) => ({
                "البعد": d.label,
                "الوصف": d.description,
                "الوزن": d.weight,
                "النتيجة": Math.round(d.rawScore),
                "الموزون": Math.round(d.weightedScore),
                "الحالة": STATUS_COLORS[d.status].label,
                "التفصيل": d.detail,
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Shield className="h-4 w-4" /> ماذا يقيس هذا المؤشر؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            6 أبعاد موزونة تقيس صحة النظام المالي:
            تغطية التوجيه (25) + سلامة GL (20) + انضباط الترحيل (15) + انضباط
            الفترات (15) + معدل الـ overrides (10) + فشل الترحيل (15) = 100.
            افتح الصفحة مرة شهرياً واستهدف ≥80 — تعني عدم وجود اختلالات بنيوية.
          </p>
        </CardContent>
      </Card>

      {/* ── Overall Score ──────────────────────────────────────── */}
      <Card className={`mb-4 border-2 ${STATUS_COLORS[overallStatus].border} ${STATUS_COLORS[overallStatus].bg}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Heart className={`h-3 w-3 ${STATUS_COLORS[overallStatus].text}`} /> النتيجة الكلية
              </p>
              <div className="flex items-baseline gap-3">
                <p className={`text-6xl font-bold font-mono ${STATUS_COLORS[overallStatus].text}`}>
                  {overallScore}
                </p>
                <p className="text-lg text-muted-foreground">/ 100</p>
              </div>
              <Badge className={`mt-2 ${STATUS_COLORS[overallStatus].chip}`}>
                {STATUS_COLORS[overallStatus].label}
              </Badge>
            </div>
            <div className="text-end">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold font-mono text-emerald-700">{dimensionsHealthy}</p>
                  <p className="text-[10px] text-muted-foreground">صحية</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-amber-700">{dimensionsNeedingImprovement}</p>
                  <p className="text-[10px] text-muted-foreground">تحسين</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-red-700">{issuesNeedingFix}</p>
                  <p className="text-[10px] text-muted-foreground">حرجة</p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual progress bar */}
          <div className="h-3 bg-white border rounded-full overflow-hidden">
            <div className={`h-full ${
              overallStatus === "good" ? "bg-emerald-500"
              : overallStatus === "fair" ? "bg-amber-500"
              : "bg-red-500"
            }`} style={{ width: `${overallScore}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>0</span>
            <span className="text-red-600">50</span>
            <span className="text-amber-600">80</span>
            <span>100</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Dimensions ─────────────────────────────────────────── */}
      <div className="space-y-3">
        {dimensions.map((d) => {
          const colors = STATUS_COLORS[d.status];
          const Icon = d.status === "good" ? CheckCircle2
            : d.status === "fair" ? AlertCircle
            : AlertTriangle;
          return (
            <Card key={d.key} className={`${colors.border} ${colors.bg}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 ${colors.text} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{d.label}</span>
                      <Badge className={`text-[10px] ${colors.chip}`}>{colors.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {d.weightedScore} / {d.weight} نقطة
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{d.description}</p>
                    <p className={`text-sm font-mono font-semibold ${colors.text}`}>{d.detail}</p>

                    {/* Per-dimension bar */}
                    <div className="mt-2 h-2 bg-white border rounded-full overflow-hidden">
                      <div className={`h-full ${
                        d.status === "good" ? "bg-emerald-500"
                        : d.status === "fair" ? "bg-amber-500"
                        : "bg-red-500"
                      }`} style={{ width: `${d.rawScore}%` }} />
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs whitespace-nowrap shrink-0"><Link href={d.fixHref}>
                      {d.fixLabel}
                      <ChevronRight className="h-3 w-3 ms-1" />
                    </Link></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-3 w-3" /> التفسير الإحصائي
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong className="text-emerald-700">≥80 (ممتاز)</strong>: النظام يعمل دون اختلالات بنيوية. شركة محاسبتها جاهزة للـ audit الخارجي.</li>
            <li><strong className="text-amber-700">50-79 (يحتاج تحسين)</strong>: في بعض الـ inefficiencies — اختر بُعداً ولاحقه شهرياً.</li>
            <li><strong className="text-red-700">&lt;50 (حرج)</strong>: هناك اختلالات بنيوية تحتاج تدخل CFO فوري قبل تفاقمها.</li>
          </ul>
          <p className="mt-2">يُحدَّث في الـ real-time من 7 endpoints مختلفة. افتحه مرة شهرياً للحفاظ على الصحة.</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
