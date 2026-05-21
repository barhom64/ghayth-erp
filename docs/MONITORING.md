# Monitoring & operational health

> What to watch on a running Ghayth ERP install, what each signal means, and what to do when it lights up.
>
> The system doesn't ship with a metrics stack — connect Prometheus / Datadog / CloudWatch / your in-house dashboards to the endpoints and tables listed below.

## Health endpoints (poll these)

| Endpoint | What it tells you | Polling cadence | Source |
| --- | --- | --- | --- |
| `GET /api/livez` | **Liveness probe** — process-local only; never touches the DB or any dependency, so a slow/unreachable dependency can't trigger a restart loop. `200` whenever the process is up. A non-200 means the orchestrator should **restart** the container. | 10 s | `artifacts/api-server/src/routes/health.ts` |
| `GET /api/readyz` | **Readiness probe** — cached, timeout-bounded dependency probes. `ready`/`degraded` → `200`; `unavailable` → `503`. A `503` means the orchestrator should **pull the instance from the load-balancer rotation** but **not** restart it. | 10 s | `artifacts/api-server/src/routes/health.ts` |
| `GET /api/healthz` | Lightweight liveness (no DB touch). Validates a fixed `HealthCheckResponse` schema; also exposes `redisRateLimit` status so monitors notice when caps silently degrade to per-replica memory. | 10 s | `artifacts/api-server/src/routes/health.ts` |
| `GET /api/health` | Process is alive + DB pool answers `SELECT 1`. Returns `{status,db,timestamp}`; `503` if the pool is disconnected. | 30 s | `artifacts/api-server/src/app.ts` |
| `GET /api/health/schema` | Tables present vs `CRITICAL_TABLES` + per-module `MODULE_TABLES`, plus last applied migration. Returns `503` when status=`critical` (missing critical table); `200` for `ok`/`degraded`. | Hourly | `artifacts/api-server/src/routes/health.ts` |
| `GET /api/health/metrics` | In-memory counters, gauges, and latency histograms (observability snapshot). **Requires an authenticated session with `settings:read`** (owner bypasses) — an operator diagnostic, not a public probe. | on demand | `artifacts/api-server/src/routes/health.ts` |
| `GET /api/health/config` | Resolved, validated configuration snapshot with secret values masked. **Requires an authenticated session with `settings:read`** (owner bypasses) — an operator diagnostic, not a public probe. | on demand | `artifacts/api-server/src/routes/health.ts` |

Wire each to your uptime monitor; **non-2xx for ≥3 consecutive polls is a page-out condition**. For an orchestrator (Kubernetes, Replit autoscale, …) use `/api/livez` as the **liveness** probe and `/api/readyz` as the **readiness** probe — they carry the correct restart-vs-rotate semantics described above. Use `/api/healthz` for a lightweight uptime ping, and `/api/health/schema` for drift detection (matches the runtime audit the guard suite runs in CI — `pnpm run check:schema-drift`). `/api/health/metrics` and `/api/health/config` are authenticated operator diagnostics — do not point an anonymous probe at them.

> **Removed in this revision:** `/api/health/schema-drift`, `/api/health/cron`, `/api/health/rbac` — those endpoints were documented but never implemented (verified against `routes/health.ts` and `app.ts`). Hitting them returns the central `/api/*` 404 (`{"error":"المسار غير موجود",…}`). Replacements:
> - schema-drift → `/api/health/schema` (live) + `pnpm run check:schema-drift` (build-time guard).
> - cron last-run → Prometheus `cron_runs_total` / `cron_duration_seconds` via `GET /metrics` (basic-auth via `METRICS_USER` / `METRICS_PASS`).
> - rbac cache → not exposed today; rely on `cron_runs_total{job="rbac_cache_refresh"}` + structured logs (`code: "RBAC_*"`).

## Logs to alert on

The app writes structured JSON logs via `pino`. Route these into your log aggregator and configure alerts for:

| Pattern | Severity | Why |
| --- | --- | --- |
| `level >= 50` (FATAL) | Page immediately | Server is about to / has crashed |
| `code: "RBAC_EMERGENCY_MODE"` | Page immediately | Someone bypassed RBAC — review the request and revert |
| `msg ~= "FIELD_ENCRYPTION_KEY"` | Page immediately | Encryption key is missing or mismatched |
| `level >= 40` (ERROR) ≥ 10/min | Page | App is failing requests at a sustained rate |
| `code: "RBAC_DENY"` ≥ 100/min from one user | Investigate | Possible credential probe / privilege test |
| `event: "auth.login.failed"` ≥ 30/min from one IP | Investigate | Brute force attempt; rate limiter handles it but flag for review |
| `event: "zatca.clearance.failed"` ≥ 5 in 1h | Investigate | ZATCA submission backlog growing |

## Database metrics

Watch the Postgres side via your DB host's standard monitoring (RDS CloudWatch, Cloud SQL, Datadog DB integration, pg_exporter for Prometheus). Specific gauges:

| Metric | Alert threshold | Action |
| --- | --- | --- |
| Connection count | `> PG_POOL_MAX × replicas × 0.8` | Raise `max_connections` or add a connection pooler (pgBouncer) |
| Replication lag (if you have a replica) | `> 30 s` | Investigate the standby; failover candidate |
| Disk free | `< 20 %` | Add storage; check `audit_logs` / `event_logs` for runaway growth |
| `audit_logs` row count growth | `> 1 M/day` | Tighten the audit logger or rotate older rows |
| Slow query log | `> 1 s` | Profile + index the offending route |
| Long-running transaction (`pg_stat_activity` `state_change > 5 min`) | Immediate | Kill it; investigate the calling route for a missing `COMMIT` |

## Application-level signals

These come from the app's own data, not OS / DB metrics:

### Cron scheduler

The admin dashboard at `/admin/cron-scheduler` shows every scheduled job's last run / next run / last error. Watch:

- Jobs with `lastRunStatus = 'error'` for more than one cycle → investigate.
- Jobs whose `nextRunAt` is in the past by ≥2 cycles → the scheduler is wedged; restart the API.
- New deployments: confirm `cron_jobs` got reseeded for any newly-added jobs.

### GL posting queue

`/admin/gl-posting-queue` lists journal entries pending GL posting (FX revaluation, cycle counts, lot writeoffs, Mudad settlements). Steady-state should be near-empty. Alert when:

- Backlog > 50 entries → the posting helper is failing on some entries.
- An entry stays in the queue > 24 h → manual review needed.

### Schema drift

`/admin/schema-drift` (and the CI guard `check:schema-drift`) compares the live DB columns against `db/schema.sql`. Drift means someone ran an `ALTER TABLE` outside the migration system. Investigate every drift finding; the fix is usually:

- Re-run `db/dump-schema.sh` on the source-of-truth DB (Replit) and commit the new dump, OR
- Add a migration that matches the manual change.

### RBAC denials

`/admin/rbac-audit` aggregates `audit_logs` filtered to RBAC events. Watch the daily totals:

- Sustained increase in denies for an existing user → their permissions changed unexpectedly; check the diff.
- New "emergency-mode" entries → someone toggled `RBAC_EMERGENCY_MODE=true`; this should be rare and always preceded by an incident ticket.
- New user-grant entries outside business hours → review for credential theft.

### Tenant isolation

Every PR runs the dynamic harness (`tests/integration/tenantIsolation.dynamic.test.ts`) — 27 scenarios that verify no cross-tenant read/write leaks. CI is the gate; treat any CI failure on this file as a critical regression.

## SIEM forwarding

Set `RBAC_SIEM_WEBHOOK_URL` to forward all RBAC denials + emergency-mode events to your SIEM (Splunk HEC, Datadog logs intake, Sumo collector, etc.). The webhook receives:

```jsonc
{
  "event": "rbac.deny" | "rbac.emergency_mode",
  "timestamp": "2026-05-11T03:30:00Z",
  "userId": 42,
  "userEmail": "...",
  "companyId": 1,
  "feature": "finance.journal",
  "action": "create",
  "reason": "missing permission",
  "ip": "1.2.3.4",
  "userAgent": "..."
}
```

Build SIEM correlation rules for: same-user denial bursts, off-hours denials, post-promotion grant followed by sensitive-feature use.

## Suggested dashboard layout

A reasonable single-pane operational dashboard:

```
┌─────────────────────────────────────────────────────────────────┐
│ Liveness ────────── DB pool ───── Replication lag               │
│ /health: 200   used 8/20    lag 0.2s                            │
├─────────────────────────────────────────────────────────────────┤
│ Request rate ─────── Error rate ─── p95 latency                 │
│ 240 req/min      0.3%               320 ms                      │
├─────────────────────────────────────────────────────────────────┤
│ Cron jobs ───────── GL queue ────── Schema drift                │
│ 23 OK / 1 stale  3 pending          0 drift                     │
├─────────────────────────────────────────────────────────────────┤
│ RBAC denies (1h) ── Emergency mode ── ZATCA submission rate     │
│ 12 (baseline 10)    OFF              98 / 99 clearances OK      │
└─────────────────────────────────────────────────────────────────┘
```

## What "healthy" looks like (24 h)

| Signal | Healthy range | Investigate above |
| --- | --- | --- |
| Error rate | < 1% | 2% sustained |
| p95 latency | < 500 ms | 1 s sustained |
| Failed logins per IP | < 10/h | 30/h triggers rate limit |
| RBAC denies per user | < 5/h | 100/h |
| Cron jobs in error | 0 | 1 for > 2 cycles |
| GL posting queue depth | < 5 | 50+ |
| Schema drift findings | 0 | any |
| Daily DB growth | < 100 MB | 1 GB/day → audit log churn |
