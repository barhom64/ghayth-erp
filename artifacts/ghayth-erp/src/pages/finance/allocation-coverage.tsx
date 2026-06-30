import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/formatters";
import {
  Workflow, CheckCircle2, AlertCircle, Pencil, Activity,
  ChevronRight, Target, TrendingUp,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { AllocationTabsNav } from "@/components/shared/allocation-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Allocation Coverage Audit
 *
 * Diagnostic for the allocation engine maturity:
 *  - What % of recent JE lines got resolved by a rule?
 *  - What % stayed unmapped?
 *  - What % were manually overridden?
 *  - Which source tables have the worst coverage?
 *
 * Answers: "هل محرك التوجيه يعمل أم نلجأ للـ override طوال الوقت؟"
 *
 * Uses /finance/allocation-results endpoint.
 */

interface AllocationResult {
  id: number;
  sourceTable: string;
  sourceLineId: number;
  resolutionStatus: "resolved" | "unmapped" | "manual_override" | "partial" | string;
  ruleId?: number | null;
  resolvedAccountCode?: string | null;
  costCenterId?: number | null;
  resolvedAt: string;
  manualOverrideReason?: string | null;
  warnings?: any;
}

interface StatusBucket {
  status: string;
  label: string;
  color: string;
  count: number;
  pct: number;
}

interface SourceBucket {
  sourceTable: string;
  label: string;
  total: number;
  resolved: number;
  unmapped: number;
  override: number;
  partial: number;
  coveragePct: number;
}

const SOURCE_LABEL: Record<string, string> = {
  invoice_lines:        "بنود فواتير المبيعات",
  purchase_order_items: "بنود أوامر الشراء",
  purchase_request_items: "بنود طلبات الشراء",
  expense_items:        "بنود المصروفات",
  journal_lines:        "بنود قيود يدوية",
  voucher_lines:        "بنود السندات",
  grn_items:            "بنود الاستلام (GRN)",
};

const STATUS_INFO: Record<string, { label: string; color: string; icon: any }> = {
  resolved:        { label: "موجَّه تلقائياً", color: "emerald", icon: CheckCircle2 },
  manual_override: { label: "تعديل يدوي",     color: "purple",  icon: Pencil },
  unmapped:        { label: "غير موجَّه",     color: "red",     icon: AlertCircle },
  partial:         { label: "توجيه جزئي",     color: "amber",   icon: AlertCircle },
};

const TONES: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-800",
  purple:  "bg-purple-100 text-purple-800",
  red:     "bg-red-100 text-red-800",
  amber:   "bg-amber-100 text-amber-800",
};

const BARS: Record<string, string> = {
  emerald: "bg-emerald-500",
  purple:  "bg-purple-500",
  red:     "bg-red-500",
  amber:   "bg-amber-500",
};

export default function AllocationCoveragePage() {
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const qs = sourceFilter ? `?sourceTable=${encodeURIComponent(sourceFilter)}` : "";
  const { data, isLoading, isError } = useApiQuery<{ data: AllocationResult[]; total: number }>(
    ["allocation-coverage", sourceFilter],
    `/finance/allocation-results${qs}`,
  );

  const rows: AllocationResult[] = data?.data ?? [];

  // ── Status distribution
  const statusBuckets: StatusBucket[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.resolutionStatus, (counts.get(r.resolutionStatus) ?? 0) + 1);
    }
    const total = rows.length;
    const order = ["resolved", "manual_override", "partial", "unmapped"];
    return order.map((status) => {
      const c = counts.get(status) ?? 0;
      const info = STATUS_INFO[status] ?? { label: status, color: "muted", icon: Activity };
      return {
        status,
        label: info.label,
        color: info.color,
        count: c,
        pct: total > 0 ? (c / total) * 100 : 0,
      };
    });
  }, [rows]);

  // ── Per-source breakdown
  const sourceBuckets: SourceBucket[] = useMemo(() => {
    const m = new Map<string, SourceBucket>();
    for (const r of rows) {
      const src = r.sourceTable ?? "(غير محدد)";
      const cur = m.get(src) ?? {
        sourceTable: src,
        label: SOURCE_LABEL[src] ?? src,
        total: 0, resolved: 0, unmapped: 0, override: 0, partial: 0,
        coveragePct: 0,
      };
      cur.total += 1;
      if (r.resolutionStatus === "resolved")        cur.resolved += 1;
      else if (r.resolutionStatus === "unmapped")   cur.unmapped += 1;
      else if (r.resolutionStatus === "manual_override") cur.override += 1;
      else if (r.resolutionStatus === "partial")    cur.partial += 1;
      m.set(src, cur);
    }
    return Array.from(m.values())
      .map((s) => ({ ...s, coveragePct: s.total > 0 ? (s.resolved / s.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  // ── Top rules used
  const ruleUsage = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) {
      if (r.ruleId == null) continue;
      m.set(r.ruleId, (m.get(r.ruleId) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const total = rows.length;
  const overallCoverage = statusBuckets.find((s) => s.status === "resolved")?.pct ?? 0;
  const overallHealth: "good" | "fair" | "poor" =
    overallCoverage >= 80 ? "good"
    : overallCoverage >= 50 ? "fair"
    : "poor";

  const healthColors = {
    good: { card: "border-emerald-400 bg-emerald-50/30", text: "text-emerald-700", label: "جيد جداً" },
    fair: { card: "border-amber-300 bg-amber-50/30",      text: "text-amber-700",   label: "يحتاج تحسيناً" },
    poor: { card: "border-red-400 bg-red-50/30",          text: "text-red-700",     label: "ضعيف — يحتاج عمل" },
  };

  return (
    <PageShell
      title="تشخيص محرك التوجيه"
      subtitle="كم % من البنود يحصل توجيه تلقائي؟ وكم بندًا غير مُوجَّه؟ — لتقييم نضج النظام"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/allocation-rules", label: "قواعد التوجيه" },
        { label: "التشخيص" },
      ]}
      actions={
        <PrintButton
          entityType="report_finance_allocation_coverage"
          entityId="list"
          size="icon"
          payload={{
            entity: { title: `تشخيص محرك التوجيه — تغطية ${overallCoverage.toFixed(1)}%`, total: sourceBuckets.length },
            items: sourceBuckets.map((s) => ({
              "المصدر": s.label,
              "الإجمالي": s.total,
              "موجّه تلقائياً": s.resolved,
              "غير موجّه": s.unmapped,
              "تعديل يدوي": s.override,
              "جزئي": s.partial,
              "% التغطية": s.coveragePct.toFixed(1),
            })),
          }}
        />
      }
    >
      <FinanceTabsNav />
      <AllocationTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Target className="h-4 w-4" /> هل محرك التوجيه يعمل فعلاً؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            الفكرة من نظام allocation rules هي أن المحاسب ما يحتاج يدوياً
            يحدد حساب ومركز تكلفة لكل بند — القواعد تفعل ذلك تلقائياً. لكن
            لو معظم البنود تخرج "unmapped" أو "manual_override" فهذا مؤشر
            أن القواعد ناقصة أو غير دقيقة. هذي الصفحة تكشف الحقيقة.
          </p>
        </CardContent>
      </Card>

      {/* ── Overall Coverage Score ────────────────────────────── */}
      <Card className={`mb-4 ${healthColors[overallHealth].card}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">نسبة التغطية التلقائية الكلية</p>
              <p className={`text-4xl font-bold font-mono ${healthColors[overallHealth].text}`}>
                {overallCoverage.toFixed(1)}%
              </p>
              <Badge className={`mt-2 ${
                overallHealth === "good" ? "bg-emerald-100 text-emerald-800"
                : overallHealth === "fair" ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-800"
              }`}>
                {healthColors[overallHealth].label}
              </Badge>
            </div>
            <Workflow className={`h-16 w-16 ${healthColors[overallHealth].text} opacity-40`} />
          </div>
          <div className="h-4 bg-white border rounded-full overflow-hidden flex">
            {statusBuckets.map((b) => b.pct > 0 && (
              <div
                key={b.status}
                className={`h-full ${BARS[b.color] ?? "bg-gray-400"}`}
                style={{ width: `${b.pct}%` }}
                title={`${b.label}: ${b.pct.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
            {statusBuckets.map((b) => (
              <div key={b.status} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${BARS[b.color] ?? "bg-gray-400"}`} />
                <span className="text-muted-foreground">{b.label}:</span>
                <span className="font-mono font-semibold">{b.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Status Buckets ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {statusBuckets.map((b) => {
          const Icon = STATUS_INFO[b.status]?.icon ?? Activity;
          return (
            <Card key={b.status}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Icon className="h-3 w-3" /> {b.label}
                </p>
                <p className={`text-lg font-bold font-mono mt-1`}>
                  {formatNumber(b.count)}
                </p>
                <p className="text-[10px] text-muted-foreground">{b.pct.toFixed(1)}%</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Source Breakdown ──────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">التغطية حسب المصدر</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {sourceBuckets.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              لا توجد بيانات allocation_results
            </p>
          ) : sourceBuckets.map((s) => {
            const cov = s.coveragePct;
            const tone = cov >= 80 ? "emerald" : cov >= 50 ? "amber" : "red";
            return (
              <div key={s.sourceTable} className={`p-3 rounded border ${
                cov >= 80 ? "border-emerald-200 bg-emerald-50/20"
                : cov >= 50 ? "border-amber-200 bg-amber-50/20"
                : "border-red-200 bg-red-50/20"
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{s.sourceTable}</Badge>
                  </div>
                  <span className={`font-mono text-sm font-bold ${
                    tone === "emerald" ? "text-emerald-700"
                    : tone === "amber" ? "text-amber-700"
                    : "text-red-700"
                  }`}>
                    {cov.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-white border rounded-full overflow-hidden flex mb-2">
                  {s.resolved > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${(s.resolved / s.total) * 100}%` }} />
                  )}
                  {s.override > 0 && (
                    <div className="h-full bg-purple-500" style={{ width: `${(s.override / s.total) * 100}%` }} />
                  )}
                  {s.partial > 0 && (
                    <div className="h-full bg-amber-500" style={{ width: `${(s.partial / s.total) * 100}%` }} />
                  )}
                  {s.unmapped > 0 && (
                    <div className="h-full bg-red-500" style={{ width: `${(s.unmapped / s.total) * 100}%` }} />
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span>إجمالي: <span className="font-mono font-semibold text-foreground">{s.total}</span></span>
                  <span>✓ موجَّه: <span className="font-mono text-emerald-700">{s.resolved}</span></span>
                  {s.override > 0 && <span>✎ يدوي: <span className="font-mono text-purple-700">{s.override}</span></span>}
                  {s.partial > 0 && <span>≈ جزئي: <span className="font-mono text-amber-700">{s.partial}</span></span>}
                  {s.unmapped > 0 && (
                    <span>
                      ⚠ غير موجَّه: <span className="font-mono text-red-700 font-bold">{s.unmapped}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Top Rules + Quick Links ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> أكثر القواعد استخداماً
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1">
            {ruleUsage.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                لا توجد قواعد مستخدمة في الفترة
              </p>
            ) : ruleUsage.map((r) => (
              <Link key={r.ruleId} href={`/finance/allocation-rules/${r.ruleId}/edit`}>
                <div className="flex items-center justify-between p-2 rounded hover:bg-muted/40 cursor-pointer">
                  <span className="text-xs font-mono">قاعدة #{r.ruleId}</span>
                  <Badge variant="outline" className="text-[10px]">{r.count} استخدام</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">إجراءات لتحسين التغطية</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full justify-between"><Link href="/finance/reports/unmapped-lines">
                <span className="text-xs">معالجة البنود غير الموجَّهة</span>
                <ChevronRight className="h-3 w-3" />
              </Link></Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-between"><Link href="/finance/allocation-rules">
                <span className="text-xs">إدارة قواعد التوجيه</span>
                <ChevronRight className="h-3 w-3" />
              </Link></Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-between"><Link href="/finance/product-catalog">
                <span className="text-xs">إعدادات المنتجات الافتراضية</span>
                <ChevronRight className="h-3 w-3" />
              </Link></Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-between"><Link href="/finance/overrides-report">
                <span className="text-xs">مراجعة الـ manual overrides</span>
                <ChevronRight className="h-3 w-3" />
              </Link></Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-between"><Link href="/finance/allocation-results">
                <span className="text-xs">سجل القرارات الكامل</span>
                <ChevronRight className="h-3 w-3" />
              </Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">دلالة الأرقام:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong className="text-emerald-700">≥80% تغطية تلقائية</strong>: ممتاز — القواعد ناضجة</li>
            <li><strong className="text-amber-700">50-79%</strong>: جيد لكن في مجال للتحسين — أضف قواعد للأنماط المتكررة في unmapped</li>
            <li><strong className="text-red-700">&lt;50%</strong>: ضعيف — معظم البنود تحتاج تدخل يدوي. راجع نظامك الجذري</li>
            <li><strong className="text-purple-700">manual_override &gt; 20%</strong>: تنبيه — القواعد موجودة لكن غير دقيقة</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
