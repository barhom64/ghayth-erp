# Production Hardening — Phase 0: Environment Validation

Scope: API server (`artifacts/api-server`) only. This phase adds a centralised,
fail-fast environment guard. It does **not** change business logic, migrations,
workers, the event bus, or packaging.

## What changed

- New module `artifacts/api-server/src/lib/env.ts` — the single place that
  reads, classifies and validates the server's runtime environment.
- `index.ts` imports `./lib/env.js` **first**, so the consolidated guard runs
  (and fails fast) before any other module's ad-hoc `process.env` check.
- Existing call sites are **not** migrated — `process.env` access is unchanged
  everywhere else. Incremental migration to `config` is Phase 1 work.

## Startup behavior — before vs after

| Aspect | Before | After |
| --- | --- | --- |
| Missing `DATABASE_URL` | Boots, then throws on first DB query (inside `runMigrations`) | Fails immediately at startup with a clear `[env]` error |
| Missing `JWT_SECRET` | `auth.ts` exits on import with a single `console.error` | Reported in the consolidated `[env]` guard before any module loads |
| Short `JWT_SECRET` (<32) | Exits via `auth.ts` | Reported by the guard with the actual length |
| Missing `FIELD_ENCRYPTION_KEY` in production | Boots, then throws lazily the first time PII is encrypted | Fails immediately at startup |
| Bad `PORT` | Throws in `index.ts` body | Same, plus validated up-front by the guard |
| Diagnostics | Scattered, per-module, partial | One redacted summary block: counts per class + present/missing lists |
| Secrets in logs | n/a | Never printed — presence + char count only |

The guard never weakens existing checks (`auth.ts`, `rawdb.ts`, `secrets.ts`,
`fieldEncryption.ts` keep their own guards as defence-in-depth). `/healthz`,
`/api/health` and `/health/schema` are untouched.

## Classification

| Class | Meaning |
| --- | --- |
| `required` | Server cannot boot without it, in any environment |
| `required-production` | Hard-required only when `NODE_ENV=production` |
| `optional` | Optional tuning / operational knob |
| `provider` | Provider-specific integration (ZATCA, Mudad, WhatsApp, push, AI, SIEM) — stays optional |
| `replit` | Injected by the Replit platform |
| `test` | Test / CI / dev-only |

## Required vs optional matrix (runtime — 50 variables)

### Required — boot fails without these

| Variable | Class | Secret | Validation |
| --- | --- | --- | --- |
| `DATABASE_URL` | required | yes | present |
| `JWT_SECRET` | required | yes | ≥ 32 chars |
| `PORT` | required | no | positive integer |
| `FIELD_ENCRYPTION_KEY` | required-production | yes | present (production only) |

Outside production, a missing `FIELD_ENCRYPTION_KEY` is a **warning** (it must
be set before deploying to production).

### Optional — server boots; feature degrades or uses a default/fallback

| Variable | Class | Secret | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | optional | no | defaults to `development` |
| `LOG_LEVEL` | optional | no | defaults to `info` |
| `PG_POOL_MAX` | optional | no | defaults to `20` |
| `HOSTNAME` | optional | no | diagnostics only |
| `SECRETS_ENCRYPTION_KEY` | optional | yes | ≥ 16 chars; **warns** in production if unset (DB-stored integration secrets) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional | email no / pw yes | default bootstrap account otherwise (`bootstrapAdmin.ts` already warns) |
| `FLEET_PASSWORD` | optional | yes | default fleet account otherwise |
| `INFRA_ADMIN_EMAILS` | optional | no | infra-admin allowlist |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` | optional | url yes | in-memory rate-limit fallback when unset |
| `CORS_ORIGINS` / `CORS_ORIGIN` | optional | no | **warns** in production if no origin source is set |
| `PERSIST_ALL_EVENTS` | optional | no | `index.ts` already warns when unset in non-dev |
| `IDEMPOTENCY_TTL_HOURS` | optional | no | retention knob |
| `FX_RATE_STALENESS_ALERT_DAYS` | optional | no | dashboard knob |
| `RBAC_EMERGENCY_MODE` | optional | no | emergency RBAC bypass flag |
| `EINVOICE_DEFAULT_PROVIDER` | optional | no | default provider id |
| `PUBLIC_OBJECT_SEARCH_PATHS` / `PRIVATE_OBJECT_DIR` | optional | no | object-storage paths |

### Provider-specific — optional integrations (server boots regardless)

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_ID`,
`ZATCA_FATOORA_PROD_URL`, `ZATCA_FATOORA_SANDBOX_URL`,
`ZATCA_CLEARANCE_TIMEOUT_MS`, `ZATCA_RETRY_BASE_DELAY_MS`,
`ZATCA_RETRY_BATCH_SIZE`, `ZATCA_RETRY_MAX_ATTEMPTS`, `ZATCA_ALLOW_CSR_GEN`,
`MUDAD_PROD_URL`, `MUDAD_SANDBOX_URL`, `MUDAD_REQUEST_TIMEOUT_MS`,
`ECB_FX_FEED_URL`, `ECB_FETCH_TIMEOUT_MS`, `RBAC_SIEM_WEBHOOK_URL`,
`RBAC_SIEM_AUTH_HEADER`.

### Replit platform

`REPLIT_DEV_DOMAIN`, `REPLIT_DEPLOYMENT_URL` — injected by the host, used for
CORS allowlisting.

### Test / dev

`SEED_DEMO_DATA` — seeds demo + e2e bench data on boot.

## Non-runtime variables (out of scope)

The repository-wide scan also found `process.env` usage in tooling that the
server process never runs — benchmarks, e2e, audit/self-heal scripts and the
deck build. These are intentionally **not** in the runtime registry:

`CHROMIUM_PATH`, `OUT_DIR`, `BUILD_DIR`, `BASE_URL`, `BASE_PATH`, `API_BASE`,
`API_BASE_URL`, `TEST_BASE`, `E2E_BASE_URL`, `E2E_API_URL`, `E2E_USER_EMAIL`,
`E2E_USER_PASSWORD`, `BENCH_*`, `SHOT_*`, `SHOTS_*`, `WF_*`, `RUN_ID`, `CI`,
`ALL`, `ONLY`, `MODULE`, `DIAG`, `DUMPIO`, `APPEND`, `BATCH`, `BATCH_SIZE`,
`REVERSE_ORDER`, `RETRY_*`, `SAMPLE_*`, `INSTRUMENT_EVERY`, `SLOWEST_N`,
`ROUTES_INCLUDE`, `FAIL_ON*`, `CREATE_ONLY`, `ALLOW_EMPTY`, `BRANCH`,
`PR_PUSH_*`, `GH_CLIENT_PRIORITY`, `NO_TARBALL`, `SOT2_LOCAL_FILE`,
`DECK_BASE_URL`, `LH_PAGES`, `QUERY_*`, `BROWSER_*`, `RECYCLE_LOGIN_MAX_ATTEMPTS`,
`REPL_ID`, `TZ`, `FRONTEND_URL`, `AUDIT_HEALTH_TIMEOUT`.

## Guard output

Healthy boot (development):

```
INFO  [env] startup environment guard
  nodeEnv: "development"
  byClass: { required: {set:3,total:3}, required-production: {set:0,total:1}, ... }
  present: ["DATABASE_URL","JWT_SECRET","PORT", ...]
  missing: ["FIELD_ENCRYPTION_KEY", ...]
INFO  [env] environment validation passed (50 variables checked)
```

Failed boot (missing required vars) — process exits with code 1:

```
INFO   [env] startup environment guard ...
WARN   [env] FIELD_ENCRYPTION_KEY is unset — required before deploying to production ...
ERROR  [env] DATABASE_URL is required but not set — Postgres connection string
ERROR  [env] JWT_SECRET is required but not set — JWT signing secret (>=32 chars)
ERROR  [env] PORT is required but not set — HTTP listen port
ERROR  [env] environment validation failed with 3 error(s) — refusing to start
```

Secrets are never printed — the guard reports presence and a character count
only, never a value.

## Next phases (not in this PR)

- Phase 1: `/livez` + `/readyz`, dependency health checks, `config`
  centralization (migrate `process.env` call sites onto `config`), a light
  observability foundation, and migration-policy docs.
