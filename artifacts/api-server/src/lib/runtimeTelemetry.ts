/**
 * Runtime telemetry sampler — periodically records process-level health
 * signals into the metrics registry (lib/metrics.ts) as gauges, so they
 * surface via /health/metrics and /api/metrics alongside the HTTP/DB metrics.
 *
 * Covers the runtime-visibility gaps the observability assessment flagged:
 * event-loop lag, DB connection-pool depth, and CPU usage. Read-only — it
 * samples existing process/pool state and changes no behaviour.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setGauge } from "./metrics.js";
import { pool } from "./rawdb.js";
import { logger } from "./logger.js";

const SAMPLE_INTERVAL_MS = 10_000;

let timer: NodeJS.Timeout | null = null;
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
let prevCpu = process.cpuUsage();
let prevAt = Date.now();

const round2 = (n: number): number => Math.round(n * 100) / 100;

function sample(): void {
  try {
    // Event-loop lag — mean/max delay since the last sample (ns -> ms).
    setGauge("eventloop.lag.mean_ms", round2(eventLoopDelay.mean / 1e6));
    setGauge("eventloop.lag.max_ms", round2(eventLoopDelay.max / 1e6));
    eventLoopDelay.reset();

    // Database connection pool depth.
    setGauge("db.pool.total", pool.totalCount ?? 0);
    setGauge("db.pool.idle", pool.idleCount ?? 0);
    setGauge("db.pool.waiting", pool.waitingCount ?? 0);

    // CPU utilisation over the sample interval (% of one core).
    const now = Date.now();
    const cpu = process.cpuUsage(prevCpu);
    const elapsedMs = now - prevAt;
    if (elapsedMs > 0) {
      setGauge("process.cpu.percent", round2(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100));
    }
    prevCpu = process.cpuUsage();
    prevAt = now;
  } catch (err) {
    logger.error(err, "runtime telemetry sample failed");
  }
}

/** Begin periodic sampling of event-loop lag, DB pool depth, and CPU. */
export function startRuntimeTelemetry(): void {
  if (timer) return;
  eventLoopDelay.enable();
  prevCpu = process.cpuUsage();
  prevAt = Date.now();
  timer = setInterval(sample, SAMPLE_INTERVAL_MS);
  // Telemetry must never keep the process alive on its own.
  timer.unref();
}

/** Stop sampling — called during graceful shutdown. */
export function stopRuntimeTelemetry(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  eventLoopDelay.disable();
}
