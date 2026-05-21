/**
 * Observability facade — the single, vendor-neutral seam for the API
 * server's error capture, structured signals, and metrics.
 *
 * Companion to the frontend facade in
 * `artifacts/ghayth-erp/src/lib/observability.ts` and the design note in
 * `docs/OBSERVABILITY_DESIGN.md`. The audit flagged "no central error
 * tracking" as a top risk; rather than commit to a vendor at audit time,
 * every capture goes through this file. The day ops picks a backend
 * (Sentry / Datadog / Honeycomb / self-hosted), this file and `metrics.ts`
 * are the only places that change — the rest of the codebase only ever
 * calls these exported hooks.
 *
 * Deliberately in scope (foundation phase):
 *   - structured exception / message capture (delegates to the pino logger)
 *   - metrics hooks for HTTP requests, DB queries, and cron jobs
 *   - a slow-query monitor and a job-execution monitor
 *
 * Deliberately OUT of scope here: distributed tracing, OpenTelemetry,
 * Jaeger/Tempo, and any external alerting — those are a later phase.
 *
 * Safety: every recorder swallows its own errors. Observability must never
 * be able to break the request, query, or job it is observing.
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";
import { config } from "./config.js";
import {
  incrementCounter,
  recordHistogram,
  snapshotMetrics,
  type MetricsSnapshot,
} from "./metrics.js";

export type ObsLevel = "fatal" | "error" | "warning" | "info" | "debug";

export interface ObsContext {
  /** Low-cardinality labels (module, feature, …). */
  tags?: Record<string, string>;
  /** Arbitrary structured detail. Must not contain secrets or raw PII. */
  extra?: Record<string, unknown>;
}

function pinoLevel(level: ObsLevel): "fatal" | "error" | "warn" | "info" | "debug" {
  return level === "warning" ? "warn" : level;
}

/**
 * Capture an exception with structured context. Today it routes to the
 * pino logger; swapping in a vendor SDK is a change to this function only.
 */
export function captureException(err: unknown, ctx: ObsContext = {}): void {
  try {
    incrementCounter("obs.exceptions");
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error, tags: ctx.tags ?? {}, extra: ctx.extra ?? {} },
      "captured exception",
    );
  } catch {
    /* observability must never throw upward */
  }
}

/**
 * Capture a structured, non-exception signal (slow integration, expected-
 * but-notable condition) at the given level.
 */
export function captureMessage(
  message: string,
  level: ObsLevel = "info",
  ctx: ObsContext = {},
): void {
  try {
    incrementCounter(`obs.messages.${level}`);
    logger[pinoLevel(level)](
      { tags: ctx.tags ?? {}, extra: ctx.extra ?? {} },
      message,
    );
  } catch {
    /* observability must never throw upward */
  }
}

// ─────────────────────── slow-query monitor ───────────────────────────────

const SQL_PREVIEW_CHARS = 200;

/** Single-line, truncated SQL preview. Never includes bound parameters. */
function previewSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, SQL_PREVIEW_CHARS);
}

/**
 * Record one database query. Called from `rawdb.ts` around every
 * `rawQuery` / `rawExecute`. Queries slower than `SLOW_QUERY_MS` are
 * counted separately and logged with a truncated statement preview —
 * bound parameters are deliberately never logged (they may carry PII).
 */
export function recordQuery(sql: string, durationMs: number): void {
  try {
    incrementCounter("db.queries");
    recordHistogram("db.query.duration_ms", durationMs);
    if (durationMs >= config.ops.slowQueryMs) {
      incrementCounter("db.queries.slow");
      logger.warn(
        {
          durationMs,
          thresholdMs: config.ops.slowQueryMs,
          sql: previewSql(sql),
        },
        "slow query",
      );
    }
  } catch {
    /* observability must never break a query */
  }
}

// ─────────────────────── job-execution monitor ────────────────────────────

/**
 * Record one cron-job execution. Called from `cronScheduler.ts` around
 * every job handler.
 */
export function recordJobRun(
  jobName: string,
  status: "success" | "failed",
  durationMs: number,
): void {
  try {
    incrementCounter("cron.runs");
    if (status === "failed") incrementCounter("cron.failures");
    recordHistogram("cron.job.duration_ms", durationMs);
  } catch {
    /* observability must never break a job */
  }
}

// ─────────────────────── HTTP request metrics ─────────────────────────────

/** Record one HTTP response by status class. */
export function recordHttpRequest(
  _method: string,
  statusCode: number,
  durationMs: number,
): void {
  try {
    incrementCounter("http.requests");
    const cls =
      statusCode >= 500
        ? "5xx"
        : statusCode >= 400
          ? "4xx"
          : statusCode >= 300
            ? "3xx"
            : "2xx";
    incrementCounter(`http.responses.${cls}`);
    recordHistogram("http.request.duration_ms", durationMs);
  } catch {
    /* observability must never break a response */
  }
}

/**
 * Express middleware that times every request and feeds the HTTP metrics.
 * Mounted once in `app.ts`. It only attaches a `finish` listener — it does
 * not touch the request/response bodies and changes no behaviour.
 */
export function httpMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  res.on("finish", () => {
    recordHttpRequest(req.method, res.statusCode, Date.now() - start);
  });
  next();
}

// ───────────────────────────── snapshot ───────────────────────────────────

/** Point-in-time metrics snapshot — exposed via the operator health route. */
export function getObservabilitySnapshot(): MetricsSnapshot {
  return snapshotMetrics();
}
