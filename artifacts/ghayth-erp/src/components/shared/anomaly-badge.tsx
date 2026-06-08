import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

/**
 * Per-row anomaly badge for ranked lists. Given the current row's
 * metric value + the prior-period value, shows a delta percentage
 * with directional tone — flipped for "expense" (rising is bad).
 *
 * Threshold-gated: only shows when |delta| ≥ `threshold` (default 25%)
 * so the badge is a NOISE FILTER. Small movements stay quiet; only
 * significant year-over-year shifts surface as a badge.
 *
 * Returns `null` when:
 *   - prior is null (entity didn't exist in prior period)
 *   - both current and prior are zero
 *   - delta is below the threshold (noise filter)
 */

export interface AnomalyBadgeProps {
  current: number;
  prior: number | null;
  /** Which metric — controls the tone flip for "expense". */
  metric: "revenue" | "expense" | "net" | "entries";
  /**
   * Minimum |% change| to surface a badge. Defaults to 25 — keeps the
   * UI quiet for routine drift, flags real shifts.
   */
  threshold?: number;
  testidPrefix?: string;
}

const HIGHER_IS_BETTER: Record<AnomalyBadgeProps["metric"], boolean> = {
  revenue: true,
  expense: false, // rising expense = bad
  net:     true,
  entries: true,  // more activity ≈ healthier
};

export function AnomalyBadge({
  current,
  prior,
  metric,
  threshold = 25,
  testidPrefix = "anomaly",
}: AnomalyBadgeProps) {
  if (prior == null) return null;
  if (current === 0 && prior === 0) return null;

  // % change uses |prior| as the denominator (sign-agnostic). When
  // prior is 0 but current is non-zero, we surface as "new" rather
  // than divide-by-zero.
  if (prior === 0) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-0.5"
        data-testid={`${testidPrefix}-badge`}
        data-direction="new"
      >
        <AlertTriangle className="h-2.5 w-2.5 text-status-info-foreground" />
        جديد
      </Badge>
    );
  }

  const pctChange = ((current - prior) / Math.abs(prior)) * 100;
  const absPct = Math.abs(pctChange);
  if (absPct < threshold) return null;

  // Tone — improvement vs deterioration based on metric + sign.
  // higherIsBetter=true → positive % is good
  // higherIsBetter=false (expense) → positive % is bad
  const higherIsBetter = HIGHER_IS_BETTER[metric];
  const isImprovement = higherIsBetter ? pctChange > 0 : pctChange < 0;
  const toneClass = isImprovement
    ? "text-status-success-foreground border-status-success-surface/40"
    : "text-status-warning-foreground border-status-warning-surface/40";

  const Arrow = pctChange > 0 ? TrendingUp : TrendingDown;
  const sign = pctChange > 0 ? "+" : "";

  return (
    <Badge
      variant="outline"
      className={`text-[10px] gap-0.5 font-mono ${toneClass}`}
      data-testid={`${testidPrefix}-badge`}
      data-direction={isImprovement ? "improvement" : "deterioration"}
      title={`السابق: ${prior.toLocaleString("ar-SA")} · الحالي: ${current.toLocaleString("ar-SA")}`}
    >
      <Arrow className="h-2.5 w-2.5" />
      {sign}{pctChange.toFixed(0)}%
    </Badge>
  );
}
