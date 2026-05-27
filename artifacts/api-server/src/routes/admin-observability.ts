/**
 * Observability operator pane — unified system observability surface.
 *
 * Issue #1139 §5 lists six observability concerns: queue monitoring,
 * provider health, worker health, AI costs, SLA breaches, anomaly
 * detection. This router aggregates all six into a single read-only
 * endpoint so an operator can see the system state on one screen
 * without polling six separate routes.
 *
 * Backing tables:
 *   - event_logs           → eventBus throughput, SLA-flagged events
 *   - event_dlq            → dead-letter queue depth + recent failures
 *   - integration_logs     → per-channel provider health
 *   - cron_logs            → per-job worker health
 *   - ai_request_logs      → per-call AI usage + cost (migration 213)
 *
 * Anomaly detection is rule-based and pure-function over the same
 * window. The rules live with the response so the UI never has to
 * re-derive them — and adding a new rule is a single block here, not
 * a new table.
 *
 * RBAC: mounted under /admin which already requires module=admin +
 * minLevel=90 (owner / admin / GM). Each route also calls authorize()
 * with feature=admin, action=list, matching the rest of admin.ts.
 */
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { logger } from "../lib/logger.js";

const router = Router();

const WINDOW_HOURS = 24;

// ─────────────────────── shape helpers ────────────────────────────────────

interface QueueSection {
  eventBus: {
    eventsLastHour: number;
    eventsLast24h: number;
    topByAction: Array<{ action: string; count: number }>;
    dlq: {
      unresolved: number;
      resolvedLast24h: number;
      topByType: Array<{
        type: string;
        eventName: string | null;
        count: number;
        latestError: string;
        latestAt: string;
      }>;
    };
  };
}

interface ProviderRow {
  channel: string;
  totalLast24h: number;
  success: number;
  failed: number;
  retrying: number;
  successRate: number;
  lastFailureAt: string | null;
  lastFailureError: string | null;
}

interface WorkerRow {
  jobName: string;
  totalLast24h: number;
  failed: number;
  avgDurationMs: number;
  maxDurationMs: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface AiCostByDim {
  key: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  errors: number;
}

interface AiCostSection {
  available: true;
  totals: {
    callsLast24h: number;
    callsLast7d: number;
    errorsLast24h: number;
    promptTokensLast24h: number;
    completionTokensLast24h: number;
    costUsdLast24h: number;
    costUsdLast7d: number;
  };
  byModel: AiCostByDim[];
  byFeature: AiCostByDim[];
}

interface Anomaly {
  severity: "critical" | "warning" | "info";
  rule: string;
  message: string;
  metric: string | null;
  value: number | string;
  threshold: number | string;
}

/**
 * Round to 1 decimal place. Used for success-rate percentages so the
 * operator UI doesn't have to format on the way out.
 */
function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

// ─────────────────────── overview endpoint ────────────────────────────────

/**
 * GET /api/admin/observability/overview
 *
 * One round-trip operator pane. Aggregates queue / provider / worker /
 * SLA / anomaly state over the last 24 hours, scoped to the caller's
 * company. System-wide rows (companyId IS NULL — typical for cron jobs)
 * are included so the operator still sees infra health that isn't
 * tenant-owned.
 *
 * Response shape is documented inline by the TS interfaces above; the
 * payload is masked through maskFields() so field-level policies still
 * apply on top of feature-level authorize().
 */
router.get(
  "/overview",
  authorize({ feature: "admin", action: "list" }),
  async (req, res) => {
    try {
      const cid = req.scope!.companyId;

      const [
        eventsLastHourRow,
        eventsLast24hRow,
        topActionsRows,
        dlqUnresolvedRow,
        dlqResolvedRow,
        dlqTopRows,
        providerRows,
        workerRows,
        slaLast24hRow,
        slaLast7dRow,
        slaByEntityRows,
        aiTotalsRow,
        aiByModelRows,
        aiByFeatureRows,
      ] = await Promise.all([
        // Event throughput — last hour. NULL companyId = system event,
        // surfaced to every tenant operator. The same pattern is used
        // throughout admin.ts.
        rawQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM event_logs
            WHERE "createdAt" > NOW() - INTERVAL '1 hour'
              AND ("companyId" = $1 OR "companyId" IS NULL)`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: events/hour query failed");
          return [{ count: "0" }];
        }),

        // Event throughput — last 24h.
        rawQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM event_logs
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: events/24h query failed");
          return [{ count: "0" }];
        }),

        // Top 10 actions by count in the last 24h — gives the operator
        // a sense of "what is this system actually doing right now".
        rawQuery<{ action: string; count: string }>(
          `SELECT action, COUNT(*)::text AS count FROM event_logs
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)
            GROUP BY action
            ORDER BY COUNT(*) DESC
            LIMIT 10`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: top actions query failed");
          return [];
        }),

        // DLQ — unresolved depth across all time. This is the "you have
        // mail" number that pages the on-call.
        rawQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM event_dlq
            WHERE "resolvedAt" IS NULL
              AND ("companyId" = $1 OR "companyId" IS NULL)`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: DLQ unresolved query failed");
          return [{ count: "0" }];
        }),

        // DLQ resolved in the last 24h — proves the on-call is draining
        // the queue, not just letting it grow.
        rawQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM event_dlq
            WHERE "resolvedAt" IS NOT NULL
              AND "resolvedAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: DLQ resolved query failed");
          return [{ count: "0" }];
        }),

        // DLQ — top failing types with the latest error preview, so the
        // operator can triage without expanding individual rows.
        rawQuery<{
          type: string;
          eventName: string | null;
          count: string;
          latestError: string;
          latestAt: string;
        }>(
          `SELECT type,
                  "eventName",
                  COUNT(*)::text AS count,
                  (ARRAY_AGG(error ORDER BY "createdAt" DESC))[1] AS "latestError",
                  MAX("createdAt") AS "latestAt"
             FROM event_dlq
            WHERE "resolvedAt" IS NULL
              AND ("companyId" = $1 OR "companyId" IS NULL)
            GROUP BY type, "eventName"
            ORDER BY COUNT(*) DESC
            LIMIT 10`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: DLQ top types query failed");
          return [];
        }),

        // Provider health — bucketed by channel. integration_logs
        // already carries the status enum (pending / sent / delivered /
        // failed / retrying) so the success rate is exact, not estimated.
        rawQuery<{
          channel: string;
          total: string;
          success: string;
          failed: string;
          retrying: string;
          lastFailureAt: string | null;
          lastFailureError: string | null;
        }>(
          `SELECT channel,
                  COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::text AS success,
                  COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
                  COUNT(*) FILTER (WHERE status = 'retrying')::text AS retrying,
                  MAX("createdAt") FILTER (WHERE status = 'failed') AS "lastFailureAt",
                  (ARRAY_AGG("errorMessage" ORDER BY "createdAt" DESC)
                     FILTER (WHERE status = 'failed' AND "errorMessage" IS NOT NULL))[1]
                    AS "lastFailureError"
             FROM integration_logs
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)
            GROUP BY channel
            ORDER BY COUNT(*) DESC`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: provider health query failed");
          return [];
        }),

        // Worker health — bucketed by job name. Most jobs are system-wide
        // (companyId NULL), so we don't restrict by company; the operator
        // is owner/admin and would want to see all of them.
        rawQuery<{
          jobName: string;
          total: string;
          failed: string;
          avg: string | null;
          max: string | null;
          lastRunAt: string;
          lastStatus: string;
          lastError: string | null;
        }>(
          `SELECT "jobName",
                  COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
                  AVG(duration)::text AS avg,
                  MAX(duration)::text AS max,
                  MAX("createdAt") AS "lastRunAt",
                  (ARRAY_AGG(status ORDER BY "createdAt" DESC))[1] AS "lastStatus",
                  (ARRAY_AGG(error ORDER BY "createdAt" DESC)
                     FILTER (WHERE error IS NOT NULL))[1] AS "lastError"
             FROM cron_logs
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
              AND "jobName" IS NOT NULL
            GROUP BY "jobName"
            ORDER BY COUNT(*) FILTER (WHERE status = 'failed') DESC, MAX("createdAt") DESC
            LIMIT 50`,
        ).catch((e) => {
          logger.warn(e, "observability: worker health query failed");
          return [];
        }),

        // SLA — last 24h. The workflow engine emits workflow.sla_warning
        // and workflow.escalated when an approval breaches its target
        // (see eventCatalog.ts). Counting them here gives the operator a
        // single SLA-health number without bringing in the workflow UI.
        rawQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM event_logs
            WHERE action IN ('workflow.sla_warning','workflow.escalated')
              AND "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: SLA 24h query failed");
          return [{ count: "0" }];
        }),

        // SLA — last 7 days. Provides context: is "12 breaches today"
        // typical (≈100/week) or a spike?
        rawQuery<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM event_logs
            WHERE action IN ('workflow.sla_warning','workflow.escalated')
              AND "createdAt" > NOW() - INTERVAL '7 days'
              AND ("companyId" = $1 OR "companyId" IS NULL)`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: SLA 7d query failed");
          return [{ count: "0" }];
        }),

        // SLA — by entity. Lets the operator jump straight to the
        // hotspot (e.g. "all 18 breaches today are leave_request" →
        // approval chain is too slow).
        rawQuery<{ entity: string; count: string; latest: string }>(
          `SELECT entity, COUNT(*)::text AS count, MAX("createdAt") AS latest
             FROM event_logs
            WHERE action IN ('workflow.sla_warning','workflow.escalated')
              AND "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)
              AND entity IS NOT NULL
            GROUP BY entity
            ORDER BY COUNT(*) DESC
            LIMIT 10`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: SLA by entity query failed");
          return [];
        }),

        // AI usage totals — one row with both 24h and 7d aggregates so
        // we only hit ai_request_logs once for the headline numbers.
        rawQuery<{
          calls24h: string;
          calls7d: string;
          errors24h: string;
          promptTokens24h: string;
          completionTokens24h: string;
          costUsd24h: string;
          costUsd7d: string;
        }>(
          `SELECT
             COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours')::text AS calls24h,
             COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days')::text AS calls7d,
             COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours' AND status = 'error')::text AS errors24h,
             COALESCE(SUM("promptTokens")     FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours'), 0)::text AS "promptTokens24h",
             COALESCE(SUM("completionTokens") FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours'), 0)::text AS "completionTokens24h",
             COALESCE(SUM("costUsd")          FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours'), 0)::text AS "costUsd24h",
             COALESCE(SUM("costUsd")          FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days'),  0)::text AS "costUsd7d"
           FROM ai_request_logs
          WHERE "companyId" = $1 OR "companyId" IS NULL`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: AI totals query failed");
          return [{
            calls24h: "0", calls7d: "0", errors24h: "0",
            promptTokens24h: "0", completionTokens24h: "0",
            costUsd24h: "0", costUsd7d: "0",
          }];
        }),

        // AI cost by model — answers "is Sonnet costing us more than
        // Haiku?". Window is 24h so the operator sees recent state, not
        // historical accumulation.
        rawQuery<{
          model: string;
          calls: string;
          promptTokens: string;
          completionTokens: string;
          totalTokens: string;
          costUsd: string;
          errors: string;
        }>(
          `SELECT model,
                  COUNT(*)::text AS calls,
                  COALESCE(SUM("promptTokens"),     0)::text AS "promptTokens",
                  COALESCE(SUM("completionTokens"), 0)::text AS "completionTokens",
                  COALESCE(SUM("totalTokens"),      0)::text AS "totalTokens",
                  COALESCE(SUM("costUsd"),          0)::text AS "costUsd",
                  COUNT(*) FILTER (WHERE status = 'error')::text AS errors
             FROM ai_request_logs
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)
            GROUP BY model
            ORDER BY SUM("costUsd") DESC NULLS LAST
            LIMIT 20`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: AI by-model query failed");
          return [];
        }),

        // AI cost by feature — same shape as by-model, answers "which
        // feature is the budget hog?".
        rawQuery<{
          feature: string;
          calls: string;
          promptTokens: string;
          completionTokens: string;
          totalTokens: string;
          costUsd: string;
          errors: string;
        }>(
          `SELECT feature,
                  COUNT(*)::text AS calls,
                  COALESCE(SUM("promptTokens"),     0)::text AS "promptTokens",
                  COALESCE(SUM("completionTokens"), 0)::text AS "completionTokens",
                  COALESCE(SUM("totalTokens"),      0)::text AS "totalTokens",
                  COALESCE(SUM("costUsd"),          0)::text AS "costUsd",
                  COUNT(*) FILTER (WHERE status = 'error')::text AS errors
             FROM ai_request_logs
            WHERE "createdAt" > NOW() - INTERVAL '24 hours'
              AND ("companyId" = $1 OR "companyId" IS NULL)
            GROUP BY feature
            ORDER BY SUM("costUsd") DESC NULLS LAST
            LIMIT 20`,
          [cid],
        ).catch((e) => {
          logger.warn(e, "observability: AI by-feature query failed");
          return [];
        }),
      ]);

      // Normalise — Postgres COUNT() comes back as text to dodge bigint
      // overflow on the JS side. The operator UI wants real numbers.
      const queues: QueueSection = {
        eventBus: {
          eventsLastHour: Number(eventsLastHourRow[0]?.count ?? 0),
          eventsLast24h: Number(eventsLast24hRow[0]?.count ?? 0),
          topByAction: topActionsRows.map((r) => ({
            action: r.action,
            count: Number(r.count),
          })),
          dlq: {
            unresolved: Number(dlqUnresolvedRow[0]?.count ?? 0),
            resolvedLast24h: Number(dlqResolvedRow[0]?.count ?? 0),
            topByType: dlqTopRows.map((r) => ({
              type: r.type,
              eventName: r.eventName,
              count: Number(r.count),
              latestError: r.latestError,
              latestAt: r.latestAt,
            })),
          },
        },
      };

      const providers: ProviderRow[] = providerRows.map((r) => {
        const total = Number(r.total);
        const success = Number(r.success);
        return {
          channel: r.channel,
          totalLast24h: total,
          success,
          failed: Number(r.failed),
          retrying: Number(r.retrying),
          successRate: pct(success, total),
          lastFailureAt: r.lastFailureAt,
          lastFailureError: r.lastFailureError,
        };
      });

      const workers: WorkerRow[] = workerRows.map((r) => ({
        jobName: r.jobName,
        totalLast24h: Number(r.total),
        failed: Number(r.failed),
        avgDurationMs: Math.round(Number(r.avg ?? 0)),
        maxDurationMs: Math.round(Number(r.max ?? 0)),
        lastRunAt: r.lastRunAt,
        lastStatus: r.lastStatus,
        lastError: r.lastError,
      }));

      const slaBreaches = {
        last24h: Number(slaLast24hRow[0]?.count ?? 0),
        last7d: Number(slaLast7dRow[0]?.count ?? 0),
        byEntity: slaByEntityRows.map((r) => ({
          entity: r.entity,
          count: Number(r.count),
          latest: r.latest,
        })),
      };

      // AI cost — fed by ai_request_logs (migration 213). Round currency
      // to 4 decimals so the UI doesn't have to format on the way out;
      // any micro-cents below that are accounting noise at this scale.
      const aiTotals = aiTotalsRow[0] ?? {
        calls24h: "0", calls7d: "0", errors24h: "0",
        promptTokens24h: "0", completionTokens24h: "0",
        costUsd24h: "0", costUsd7d: "0",
      };
      const aiCosts: AiCostSection = {
        available: true,
        totals: {
          callsLast24h:            Number(aiTotals.calls24h),
          callsLast7d:             Number(aiTotals.calls7d),
          errorsLast24h:           Number(aiTotals.errors24h),
          promptTokensLast24h:     Number(aiTotals.promptTokens24h),
          completionTokensLast24h: Number(aiTotals.completionTokens24h),
          costUsdLast24h: Math.round(Number(aiTotals.costUsd24h) * 10000) / 10000,
          costUsdLast7d:  Math.round(Number(aiTotals.costUsd7d)  * 10000) / 10000,
        },
        byModel: aiByModelRows.map((r) => ({
          key: r.model,
          calls: Number(r.calls),
          promptTokens: Number(r.promptTokens),
          completionTokens: Number(r.completionTokens),
          totalTokens: Number(r.totalTokens),
          costUsd: Math.round(Number(r.costUsd) * 10000) / 10000,
          errors: Number(r.errors),
        })),
        byFeature: aiByFeatureRows.map((r) => ({
          key: r.feature,
          calls: Number(r.calls),
          promptTokens: Number(r.promptTokens),
          completionTokens: Number(r.completionTokens),
          totalTokens: Number(r.totalTokens),
          costUsd: Math.round(Number(r.costUsd) * 10000) / 10000,
          errors: Number(r.errors),
        })),
      };

      // ─────────────── anomaly rules (derived) ────────────────
      //
      // Rules are evaluated against the same window we just queried, so
      // they're always consistent with the operator-visible numbers. New
      // rules go here; they are pure functions, no extra DB calls.
      const anomalies: Anomaly[] = [];

      if (queues.eventBus.dlq.unresolved > 100) {
        anomalies.push({
          severity: "critical",
          rule: "dlq.depth.critical",
          message: "Dead-letter queue is dangerously deep — events are failing faster than they're being resolved.",
          metric: "event_dlq.unresolved",
          value: queues.eventBus.dlq.unresolved,
          threshold: 100,
        });
      } else if (queues.eventBus.dlq.unresolved > 20) {
        anomalies.push({
          severity: "warning",
          rule: "dlq.depth.high",
          message: "Dead-letter queue has accumulated more than 20 unresolved entries.",
          metric: "event_dlq.unresolved",
          value: queues.eventBus.dlq.unresolved,
          threshold: 20,
        });
      }

      for (const w of workers) {
        if (w.totalLast24h >= 5) {
          const successRate = pct(w.totalLast24h - w.failed, w.totalLast24h);
          if (successRate < 50) {
            anomalies.push({
              severity: "critical",
              rule: "worker.success_rate.critical",
              message: `Cron job "${w.jobName}" success rate is ${successRate}% over the last 24h.`,
              metric: `cron_logs.${w.jobName}.success_rate`,
              value: successRate,
              threshold: 50,
            });
          } else if (w.maxDurationMs > 60_000) {
            anomalies.push({
              severity: "warning",
              rule: "worker.duration.high",
              message: `Cron job "${w.jobName}" exceeded 60s on its slowest run (max ${w.maxDurationMs}ms).`,
              metric: `cron_logs.${w.jobName}.max_duration_ms`,
              value: w.maxDurationMs,
              threshold: 60_000,
            });
          }
        }
      }

      for (const p of providers) {
        if (p.totalLast24h >= 20 && p.successRate < 80) {
          anomalies.push({
            severity: "critical",
            rule: "provider.success_rate.critical",
            message: `Integration channel "${p.channel}" success rate is ${p.successRate}% over the last 24h.`,
            metric: `integration_logs.${p.channel}.success_rate`,
            value: p.successRate,
            threshold: 80,
          });
        }
      }

      if (slaBreaches.last24h > 10) {
        anomalies.push({
          severity: "warning",
          rule: "sla.breaches.high",
          message: `${slaBreaches.last24h} SLA breaches recorded in the last 24 hours.`,
          metric: "event_logs.sla_breaches.last24h",
          value: slaBreaches.last24h,
          threshold: 10,
        });
      }

      // AI cost rules. Daily run-rate is 7-day average / 7; a spike is
      // 24h being > 2× that. Error-rate rule is independent: if a
      // feature stops working, the bill keeps growing but the value
      // doesn't.
      const aiDailyAvg7d = aiCosts.totals.costUsdLast7d / 7;
      if (aiDailyAvg7d > 0 && aiCosts.totals.costUsdLast24h > aiDailyAvg7d * 2) {
        anomalies.push({
          severity: "warning",
          rule: "ai.cost.spike",
          message: `AI cost in the last 24h ($${aiCosts.totals.costUsdLast24h}) is more than 2× the 7-day daily average ($${aiDailyAvg7d.toFixed(4)}).`,
          metric: "ai_request_logs.cost_usd_last_24h",
          value: aiCosts.totals.costUsdLast24h,
          threshold: Math.round(aiDailyAvg7d * 2 * 10000) / 10000,
        });
      }
      if (aiCosts.totals.callsLast24h >= 20) {
        const errRate = pct(aiCosts.totals.errorsLast24h, aiCosts.totals.callsLast24h);
        if (errRate > 25) {
          anomalies.push({
            severity: "critical",
            rule: "ai.error_rate.critical",
            message: `AI request error rate is ${errRate}% over the last 24h.`,
            metric: "ai_request_logs.error_rate",
            value: errRate,
            threshold: 25,
          });
        }
      }

      if (queues.eventBus.eventsLastHour === 0 && queues.eventBus.eventsLast24h > 0) {
        anomalies.push({
          severity: "warning",
          rule: "eventbus.silent",
          message: "No events emitted in the last hour. Subsystem may be stalled.",
          metric: "event_logs.events_last_hour",
          value: 0,
          threshold: 1,
        });
      }

      // Order: critical first, then warning, then info. Stable ordering
      // matters because the UI top-clips the list when many fire at
      // once — operator should always see the highest severity first.
      const severityRank: Record<Anomaly["severity"], number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      anomalies.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

      res.json(
        maskFields(req, {
          collectedAt: new Date().toISOString(),
          windowHours: WINDOW_HOURS,
          queues,
          providers,
          workers,
          slaBreaches,
          aiCosts,
          anomalies,
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "admin/observability/overview");
    }
  },
);

export default router;
