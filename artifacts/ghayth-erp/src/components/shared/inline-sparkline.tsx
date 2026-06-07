/**
 * Tiny inline sparkline — hand-rolled SVG with no charting dep, sized
 * to live INSIDE a metric label cell (≈ 80×24px). Renders a single
 * polyline + optional end-of-series dot so the operator gets a
 * trend-at-a-glance next to each headline number.
 *
 * Conventions:
 *   - Treats absolute values, so a series that swings positive/
 *     negative still renders sensibly (uses min/max of the actual
 *     values, not |values|, so polarity is preserved when both signs
 *     appear).
 *   - 'tone' picks the stroke colour: success / warning / muted.
 *   - When all values are 0 or the array is empty, renders nothing
 *     (no flat-line noise).
 */

export interface InlineSparklineProps {
  values: number[];
  /** Visual tone class — picks the stroke colour. */
  tone?: "success" | "warning" | "muted" | "neutral";
  width?: number;
  height?: number;
  testid?: string;
}

const STROKE_BY_TONE: Record<NonNullable<InlineSparklineProps["tone"]>, string> = {
  success: "stroke-status-success-foreground",
  warning: "stroke-status-warning-foreground",
  muted:   "stroke-muted-foreground",
  neutral: "stroke-foreground",
};

export function InlineSparkline({
  values,
  tone = "neutral",
  width = 80,
  height = 24,
  testid,
}: InlineSparklineProps) {
  // Drop the sparkline entirely on edge cases — empty/single-point
  // arrays don't produce a useful chart, and all-zeros is pure noise.
  if (!values || values.length < 2) return null;
  const allZero = values.every((v) => v === 0);
  if (allZero) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // avoid div-by-zero on a flat non-zero series

  // Padding so the stroke doesn't get clipped at the edges (the
  // polyline's joins extend ~1px beyond the geometric points).
  const padX = 2;
  const padY = 2;
  const usableW = width - 2 * padX;
  const usableH = height - 2 * padY;

  // Map index → x linearly, value → y inverted (SVG y-axis grows down).
  const points = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * usableW;
    const y = padY + ((max - v) / range) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastX = padX + usableW;
  const lastY = padY + ((max - values[values.length - 1]) / range) * usableH;

  const strokeClass = STROKE_BY_TONE[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      data-testid={testid}
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={strokeClass}
        opacity={0.85}
      />
      {/* End-of-series dot — operator's "you are here" mark. */}
      <circle
        cx={lastX}
        cy={lastY}
        r={2}
        className={`fill-current ${STROKE_BY_TONE[tone].replace("stroke-", "text-")}`}
      />
    </svg>
  );
}
