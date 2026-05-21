/**
 * Runtime health model — liveness, readiness, and dependency probes.
 *
 * Two distinct questions an orchestrator (Kubernetes, blue/green, a load
 * balancer) needs answered, and they are NOT the same:
 *
 *   - Liveness  (`/livez`)  — "is this process alive?" If this fails the
 *                             orchestrator restarts the container. It must
 *                             never touch the database or any dependency:
 *                             a slow DB must not trigger a restart loop.
 *   - Readiness (`/readyz`) — "can this instance serve traffic right now?"
 *                             If this fails the instance is pulled from the
 *                             load-balancer rotation but NOT restarted.
 *
 * Design constraints (deliberate, enforced here):
 *   - Probes run only cheap queries — `SELECT 1`, a COUNT on the tiny
 *     `schema_migrations` table. No full schema audit, no business queries.
 *   - Every probe has a hard per-probe timeout (`HEALTH_PROBE_TIMEOUT_MS`)
 *     so a wedged dependency cannot hang the readiness check.
 *   - The readiness result is cached for `READYZ_CACHE_MS` and evaluated
 *     single-flight, so a burst of orchestrator probes cannot stampede the
 *     database.
 *   - Failures are classified, not collapsed into a boolean:
 *       · degraded           — serving, but an optional dependency is impaired
 *       · dependency-failed  — a specific probe could not complete
 *       · unavailable        — a REQUIRED dependency failed → 503, pull from LB
 */
import { pool } from "./rawdb.js";
import { getRedisRateLimitStatus } from "./rateLimitStore.js";
import { config, getEnvIssues } from "./config.js";

/** Per-probe outcome. */
export type ProbeState = "ok" | "degraded" | "dependency-failed" | "skipped";

/** Aggregate readiness verdict. */
export type ReadinessStatus = "ready" | "degraded" | "unavailable";

export interface ProbeResult {
  /** Stable probe identifier. */
  readonly name: string;
  /** When true, a failure of this probe makes the instance `unavailable`. */
  readonly required: boolean;
  readonly state: ProbeState;
  readonly durationMs: number;
  readonly detail?: string;
}

export interface ReadinessReport {
  readonly status: ReadinessStatus;
  readonly probes: readonly ProbeResult[];
  readonly checkedAt: string;
  /** True when this result was served from the short-lived cache. */
  readonly cached: boolean;
}

export interface LivenessReport {
  readonly status: "alive";
  readonly pid: number;
  readonly uptimeSec: number;
  readonly memory: { readonly rssMb: number; readonly heapUsedMb: number };
  readonly startedAt: string;
}

// ──────────────────────────── liveness ────────────────────────────────────

const startedAt = new Date();

/**
 * Liveness — process-local only, never touches a dependency. If the process
 * can run this function and respond, it is alive.
 */
export function getLiveness(): LivenessReport {
  const mem = process.memoryUsage();
  return {
    status: "alive",
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / 1048576),
      heapUsedMb: Math.round(mem.heapUsed / 1048576),
    },
    startedAt: startedAt.toISOString(),
  };
}

// ──────────────────────────── probes ──────────────────────────────────────

interface ProbeOutcome {
  state: ProbeState;
  detail?: string;
}

/**
 * Run a single probe with a hard timeout. A probe that throws or exceeds
 * the timeout is reported as `dependency-failed` — it never throws upward,
 * so the readiness evaluation always completes.
 */
async function runProbe(
  name: string,
  required: boolean,
  fn: () => Promise<ProbeOutcome>,
): Promise<ProbeResult> {
  const start = Date.now();
  const timeoutMs = config.ops.healthProbeTimeoutMs;
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`probe timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    const outcome = await Promise.race([fn(), timeout]);
    return {
      name,
      required,
      state: outcome.state,
      durationMs: Date.now() - start,
      ...(outcome.detail ? { detail: outcome.detail } : {}),
    };
  } catch (err) {
    return {
      name,
      required,
      state: "dependency-failed",
      durationMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Database — required. A simple `SELECT 1`, nothing more. */
async function probeDatabase(): Promise<ProbeOutcome> {
  await pool.query("SELECT 1");
  return { state: "ok" };
}

/**
 * Migrations — light signal only. A COUNT on the small `schema_migrations`
 * table tells us the schema-tracking table exists and has been populated.
 * This is NOT a full migration audit (that lives on `/health/schema`).
 */
async function probeMigrations(): Promise<ProbeOutcome> {
  const r = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM schema_migrations",
  );
  const n = Number(r.rows[0]?.n ?? 0);
  if (n === 0) {
    return { state: "degraded", detail: "schema_migrations is empty" };
  }
  return { state: "ok", detail: `${n} migrations applied` };
}

/**
 * Redis — optional. Reads the in-memory rate-limit store status; no network
 * round-trip. `disabled` (not configured) is `skipped`, not a failure.
 */
async function probeRedis(): Promise<ProbeOutcome> {
  const status = getRedisRateLimitStatus();
  if (status === "disabled") {
    return { state: "skipped", detail: "REDIS_URL not configured" };
  }
  if (status === "connected") {
    return { state: "ok" };
  }
  return {
    state: "degraded",
    detail: "Redis unreachable — rate limits using per-replica memory",
  };
}

/**
 * Object storage — optional, no I/O. Reports whether storage is configured;
 * a real reachability probe is deferred until the storage abstraction lands.
 */
async function probeStorage(): Promise<ProbeOutcome> {
  if (!config.objectStorage.configured) {
    return { state: "skipped", detail: "object storage not configured" };
  }
  return { state: "ok" };
}

/** Configuration — surfaces non-fatal environment warnings (fatal ones exit at boot). */
async function probeConfig(): Promise<ProbeOutcome> {
  const warnings = getEnvIssues().filter((i) => i.severity === "warn");
  if (warnings.length > 0) {
    return {
      state: "degraded",
      detail: `${warnings.length} environment warning(s) — see startup log`,
    };
  }
  return { state: "ok" };
}

// ─────────────────────── readiness (cached) ───────────────────────────────

function computeStatus(probes: readonly ProbeResult[]): ReadinessStatus {
  let degraded = false;
  for (const p of probes) {
    if (p.state === "dependency-failed") {
      if (p.required) return "unavailable";
      degraded = true;
    } else if (p.state === "degraded") {
      degraded = true;
    }
  }
  return degraded ? "degraded" : "ready";
}

async function evaluateReadiness(): Promise<ReadinessReport> {
  const probes = await Promise.all([
    runProbe("database", true, probeDatabase),
    runProbe("migrations", false, probeMigrations),
    runProbe("redis", false, probeRedis),
    runProbe("storage", false, probeStorage),
    runProbe("config", false, probeConfig),
  ]);
  return {
    status: computeStatus(probes),
    probes,
    checkedAt: new Date().toISOString(),
    cached: false,
  };
}

let cachedReport: ReadinessReport | null = null;
let cachedAt = 0;
let inFlight: Promise<ReadinessReport> | null = null;

/**
 * Readiness — cached for `READYZ_CACHE_MS` and evaluated single-flight, so a
 * storm of orchestrator probes never stampedes the database. Concurrent
 * callers during an evaluation share the one in-flight result.
 */
export async function getReadiness(): Promise<ReadinessReport> {
  const now = Date.now();
  if (cachedReport && now - cachedAt < config.ops.readyzCacheMs) {
    return { ...cachedReport, cached: true };
  }
  if (inFlight) {
    const shared = await inFlight;
    return { ...shared, cached: true };
  }
  inFlight = evaluateReadiness()
    .then((report) => {
      cachedReport = report;
      cachedAt = Date.now();
      return report;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
