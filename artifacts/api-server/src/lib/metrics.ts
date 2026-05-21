/**
 * In-memory metrics registry — the lightweight, vendor-neutral counting
 * layer behind the observability facade (`lib/observability.ts`).
 *
 * Scope (deliberately small):
 *   - counters   monotonically increasing totals (requests, errors, jobs)
 *   - gauges     point-in-time values (pool size, queue depth)
 *   - histograms latency distributions over a bounded sample reservoir
 *
 * This is NOT a Prometheus client and pulls in no dependency. When ops
 * later adopts a real metrics backend, `snapshotMetrics()` is the single
 * seam to export from — the rest of the codebase only ever calls the
 * `incrementCounter` / `setGauge` / `recordHistogram` hooks.
 *
 * Memory is bounded: each histogram keeps at most `RESERVOIR_SIZE` recent
 * samples for percentile estimation; running count/sum/min/max are exact.
 */

const RESERVOIR_SIZE = 256;

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Bounded ring buffer of recent observations for percentile estimation. */
  samples: number[];
  cursor: number;
}

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const histograms = new Map<string, HistogramState>();

/** Add `by` (default 1) to a monotonic counter. */
export function incrementCounter(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/** Set a gauge to an absolute value. */
export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

/** Record one observation into a histogram (e.g. a request duration in ms). */
export function recordHistogram(name: string, value: number): void {
  if (!Number.isFinite(value)) return;
  let h = histograms.get(name);
  if (!h) {
    h = { count: 0, sum: 0, min: value, max: value, samples: [], cursor: 0 };
    histograms.set(name, h);
  }
  h.count += 1;
  h.sum += value;
  if (value < h.min) h.min = value;
  if (value > h.max) h.max = value;
  if (h.samples.length < RESERVOIR_SIZE) {
    h.samples.push(value);
  } else {
    h.samples[h.cursor] = value;
    h.cursor = (h.cursor + 1) % RESERVOIR_SIZE;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

export interface HistogramSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
  collectedAt: string;
  uptimeSec: number;
}

/** A JSON-safe, point-in-time copy of every registered metric. */
export function snapshotMetrics(): MetricsSnapshot {
  const histOut: Record<string, HistogramSummary> = {};
  for (const [name, h] of histograms) {
    const sorted = [...h.samples].sort((a, b) => a - b);
    histOut[name] = {
      count: h.count,
      sum: Math.round(h.sum),
      min: h.count ? Math.round(h.min) : 0,
      max: h.count ? Math.round(h.max) : 0,
      avg: h.count ? Math.round(h.sum / h.count) : 0,
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
      p99: Math.round(percentile(sorted, 99)),
    };
  }
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    histograms: histOut,
    collectedAt: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
  };
}

/** Clear every metric. Intended for tests only. */
export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
}
