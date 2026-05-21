/**
 * Runtime threshold-alerting layer.
 *
 * Business-domain alerting lives in lib/smartAlerts.ts (per-company KPIs).
 * This layer watches only the *runtime/system* health signals recorded in the
 * metrics registry (lib/metrics.ts) — event-loop lag, DB pool depth, CPU,
 * request latency — and emits a structured, deduplicated alert when a
 * declared threshold is crossed.
 *
 * The alert sink is a severity-tagged `[runtime-alert]` log line: structured,
 * dependency-free, and consumable by any log-based alerting pipeline or the
 * SIEM. Routing to PagerDuty/Slack/etc. is an integration concern (extra
 * dependencies + config) and is intentionally out of scope here.
 *
 * A rule whose metric is not yet recorded is silently skipped, so the layer
 * degrades gracefully regardless of which metric producers are deployed.
 */
import { snapshotMetrics, type MetricsSnapshot } from "./metrics.js";
import { logger } from "./logger.js";

type Op = "gt" | "gte" | "lt";

interface AlertRule {
  name: string;
  /** Gauge/counter key, or `"<histogram>:<field>"` (e.g. `http.request.duration.ms:p99`). */
  metric: string;
  op: Op;
  threshold: number;
  severity: "warning" | "critical";
  message: string;
}

const RULES: AlertRule[] = [
  { name: "eventloop_lag_high", metric: "eventloop.lag.mean_ms", op: "gt", threshold: 100, severity: "warning", message: "event-loop mean lag is high" },
  { name: "eventloop_lag_critical", metric: "eventloop.lag.mean_ms", op: "gt", threshold: 250, severity: "critical", message: "event-loop mean lag is critical" },
  { name: "db_pool_waiting", metric: "db.pool.waiting", op: "gt", threshold: 5, severity: "warning", message: "DB connection-pool requests are queueing" },
  { name: "cpu_high", metric: "process.cpu.percent", op: "gt", threshold: 90, severity: "warning", message: "process CPU usage is high" },
  { name: "http_latency_p99_high", metric: "http.request.duration.ms:p99", op: "gt", threshold: 2000, severity: "warning", message: "HTTP request p99 latency is high" },
];

const COOLDOWN_MS = 15 * 60 * 1000;
const EVAL_INTERVAL_MS = 60_000;
const lastFired = new Map<string, number>();
let timer: NodeJS.Timeout | null = null;

function metricValue(snap: MetricsSnapshot, metric: string): number | undefined {
  const sep = metric.indexOf(":");
  if (sep >= 0) {
    const hist = snap.histograms[metric.slice(0, sep)];
    if (!hist) return undefined;
    const v = (hist as unknown as Record<string, number>)[metric.slice(sep + 1)];
    return typeof v === "number" ? v : undefined;
  }
  if (metric in snap.gauges) return snap.gauges[metric];
  if (metric in snap.counters) return snap.counters[metric];
  return undefined;
}

function trips(value: number, op: Op, threshold: number): boolean {
  if (op === "gt") return value > threshold;
  if (op === "gte") return value >= threshold;
  return value < threshold;
}

/**
 * Evaluate every runtime threshold rule against the current metrics. Each
 * tripped rule emits one structured `[runtime-alert]` log line; a per-rule
 * 15-minute cooldown prevents re-firing every cycle. Returns the number of
 * rules that fired this pass.
 */
export function evaluateAlertRules(): number {
  const snap = snapshotMetrics();
  const now = Date.now();
  let fired = 0;
  for (const rule of RULES) {
    const value = metricValue(snap, rule.metric);
    if (value === undefined) continue;
    if (!trips(value, rule.op, rule.threshold)) continue;
    if (now - (lastFired.get(rule.name) ?? 0) < COOLDOWN_MS) continue;
    lastFired.set(rule.name, now);
    fired++;
    const payload = { alert: rule.name, metric: rule.metric, value, threshold: rule.threshold, severity: rule.severity };
    if (rule.severity === "critical") {
      logger.error(payload, `[runtime-alert] ${rule.message}`);
    } else {
      logger.warn(payload, `[runtime-alert] ${rule.message}`);
    }
  }
  return fired;
}

/** Begin periodic runtime threshold-rule evaluation. */
export function startAlertEvaluation(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      evaluateAlertRules();
    } catch (err) {
      logger.error(err, "alert rule evaluation failed");
    }
  }, EVAL_INTERVAL_MS);
  // Alert evaluation must never keep the process alive on its own.
  timer.unref();
}

/** Stop runtime threshold-rule evaluation — called during graceful shutdown. */
export function stopAlertEvaluation(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
