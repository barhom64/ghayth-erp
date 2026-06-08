import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

/**
 * Pareto (80-20) marker — visual signal for ranked lists. Given a
 * row's `cumulativePct` (its running share of the metric so far),
 * surfaces:
 *  - "x% من المجموع" badge with the cumulative %
 *  - a Crown icon + highlight tone on the FIRST row that crosses 80%
 *    — "this row onwards is the long tail" insight for the operator
 *
 * Pure presentational. Computation of `cumulativePct` happens at the
 * call site (cheap reduce over the sorted list).
 */

export interface ParetoMarkerProps {
  cumulativePct: number; // 0 → 100
  /**
   * Whether this row is the FIRST one whose cumulative crosses the
   * threshold. Used to draw the "you're here" line.
   */
  isThresholdRow?: boolean;
  /**
   * The threshold to highlight (default 80 — classic Pareto).
   * Some reports use 50 (median).
   */
  threshold?: number;
  testidPrefix?: string;
}

export function ParetoMarker({
  cumulativePct,
  isThresholdRow,
  threshold = 80,
  testidPrefix = "pareto",
}: ParetoMarkerProps) {
  // Show different tone depending on which side of the threshold the
  // row sits. Below the threshold = "head" (long-tail driver) → highlight.
  // Past the threshold = "tail" (rest) → muted.
  const isTail = cumulativePct > threshold;
  const toneVariant = isTail ? "outline" : "secondary";
  const pct = Math.min(100, Math.max(0, Math.round(cumulativePct * 10) / 10));

  return (
    <div
      className="flex items-center gap-1"
      data-testid={`${testidPrefix}-marker`}
      data-cumulative-pct={pct.toFixed(1)}
      data-is-threshold={isThresholdRow ? "true" : undefined}
    >
      <Badge variant={toneVariant} className="text-[10px] font-mono">
        {pct.toFixed(1)}%
      </Badge>
      {isThresholdRow && (
        <Crown
          className="h-3.5 w-3.5 text-amber-500"
          data-testid={`${testidPrefix}-threshold-crown`}
        />
      )}
    </div>
  );
}

/**
 * Helper: given a sorted list of `value` numbers (descending — top
 * first), returns a parallel array of cumulative percentages plus a
 * `thresholdIdx` marking the first row that crosses the threshold.
 *
 * Used by both ranking pages so the math is identical.
 */
export function computeParetoCumulative(
  values: number[],
  threshold = 80,
): { cumulativePcts: number[]; thresholdIdx: number } {
  const total = values.reduce((s, v) => s + Math.abs(v), 0);
  if (total === 0) {
    return { cumulativePcts: values.map(() => 0), thresholdIdx: -1 };
  }
  const cumulativePcts: number[] = [];
  let running = 0;
  let thresholdIdx = -1;
  for (let i = 0; i < values.length; i++) {
    running += Math.abs(values[i]);
    const pct = (running / total) * 100;
    cumulativePcts.push(pct);
    if (thresholdIdx === -1 && pct >= threshold) {
      thresholdIdx = i;
    }
  }
  return { cumulativePcts, thresholdIdx };
}
