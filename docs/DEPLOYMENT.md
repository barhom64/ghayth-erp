# Deployment & Operations — Ghayth ERP

> **Audience**: someone bringing the system up in a non-development environment for the first time (staging, customer site, production).
>
> **Scope**: everything you need to go from a fresh server / cluster to a running, secure API. Excludes business onboarding (companies, branches, employees) — that's done via the running app once it's up.

## 0. TL;DR

```bash
# 1. Provision Postgres 16 + Redis (Redis optional for single-instance)
# 2. On the application host:
git clone <repo> && cd ghayth-erp
cp .env.example .env

# 3. Generate the three required secrets:
echo "JWT_SECRET=$(openssl rand -hex 32)"             >> .env
echo "FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32)"   >> .env
echo "SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# 4. Edit .env to set DATABASE_URL, CORS_ORIGINS, ADMIN_EMAIL/PASSWORD,
#    NODE_ENV=production, and any optional integrations.

# 5. Install + build + boot:
pnpm install --frozen-lockfile
pnpm typecheck                       # sanity check
pnpm --filter @workspace/api-server run build
cd artifacts/api-server && pnpm start
```

The API server runs migrations automatically on first boot; no separate migration step.

---

## 1. Provisioning

### Postgres 16

The API runs against PostgreSQL 16. Older versions are not tested. Newer versions (17+) may work but the dump-restore tooling (`db/dump-schema.sh`, the 2-pass schema load in CI) was tuned against pg_dump 17 / PG16.

| Knob | Recommendation |
| --- | --- |
| `max_connections` | ≥ `PG_POOL_MAX × app_instances` (default `PG_POOL_MAX=20`) |
| `shared_buffers` | 25% of RAM |
| `wal_level` | `replica` (default) |
| Backups | Daily pg_dump + WAL archiving; see §6 |

Create the database and the application role:

```sql
CREATE ROLE ghayth_erp WITH LOGIN PASSWORD '<strong-password>';
CREATE DATABASE ghayth_erp OWNER ghayth_erp;
```

The application user does **not** need superuser. Migrations run as the connecting user.

### Redis (optional for single-instance; required for multi-instance)

Single-instance deployments work without Redis — rate limits and RBAC cache fall back to in-process memory. Multi-instance deployments (load-balanced, multiple `pnpm start` processes) **must** share a Redis or rate-limit counters and RBAC permission caches diverge across replicas.

```bash
# Quickest: a managed Redis (Upstash, ElastiCache, etc.).
# Self-host: redis 7+, persistence enabled, AUTH password set.
```

### Node + pnpm

| Tool | Pinned version |
| --- | --- |
| Node | 22 LTS |
| pnpm | 10.33.0 (see `package.json#packageManager`) |

Use `corepack enable` then `corepack prepare pnpm@10.33.0 --activate`, or install pnpm directly.

---

## 2. Required environment variables

These must be set **before first boot** or the API will refuse to start.

| Variable | How to generate | Notes |
| --- | --- | --- |
| `DATABASE_URL` | from your DB host | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | `openssl rand -hex 32` | ≥32 chars enforced by `auth.ts`; shorter → fatal exit |
| `NODE_ENV` | literal `production` | unlocks production guards (CORS, fieldEncryption, ZATCA CSR lock) |

These are **also enforced in production** (the server throws on boot if missing):

| Variable | How to generate | If you lose this value |
| --- | --- | --- |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -hex 32` | every PII column encrypted with it becomes unrecoverable |
| `SECRETS_ENCRYPTION_KEY` | `openssl rand -hex 32` | the secrets vault (stored integrations / API tokens) cannot decrypt |

### CORS

```bash
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

Comma-separated, no trailing slash. In `NODE_ENV=development` the server adds `http://localhost:*` automatically; in production only the listed origins pass.

### First admin

```bash
ADMIN_EMAIL=ops@example.com
ADMIN_PASSWORD=<10+ chars, U+L+digit+special>
```

Set these and the first boot creates the account if no users exist yet. Without them the deterministic seed user `owner@local.test` / `Test1234!` is the only admin — that's a known credential and **must never reach production**.

### Postgres pool

```bash
PG_POOL_MAX=20    # default; raise for heavy traffic
```

The Postgres instance's `max_connections` must satisfy `PG_POOL_MAX × app_instances` plus headroom for backups / admin sessions.

---

## 3. Optional integrations

Set only the ones you actually use. Each is independent — leaving a section unset disables that feature gracefully.

### Redis (rate limits + distributed RBAC cache)

```bash
REDIS_URL=redis://default:<password>@host:6379
# or, if your provider gives host/port separately:
# REDIS_HOST=host
# REDIS_PORT=6379
```

### Object storage (document uploads)

```bash
PUBLIC_OBJECT_SEARCH_PATHS=/bucket/public
PRIVATE_OBJECT_DIR=/bucket/private
```

Replit Object Storage is auto-configured; for other providers, point these to S3-compatible paths.

### ZATCA Fatoora (Saudi e-invoicing)

```bash
ZATCA_FATOORA_PROD_URL=https://gw-fatoora.zatca.gov.sa/e-invoicing/core
ZATCA_FATOORA_SANDBOX_URL=https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal
ZATCA_CLEARANCE_TIMEOUT_MS=30000
ZATCA_RETRY_BASE_DELAY_MS=60000
ZATCA_RETRY_BATCH_SIZE=20
ZATCA_RETRY_MAX_ATTEMPTS=5
# Set to "true" to allow generating CSRs from the operator UI.
# Production should rotate via the offline tooling instead — keep false.
ZATCA_ALLOW_CSR_GEN=false
```

### Mudad (Saudi labour ministry payroll)

```bash
MUDAD_PROD_URL=<from Mudad portal>
MUDAD_SANDBOX_URL=<from Mudad portal>
MUDAD_REQUEST_TIMEOUT_MS=30000
```

### Push notifications

```bash
# Generate once: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=BL…
VAPID_PRIVATE_KEY=mQ…
VAPID_SUBJECT=mailto:ops@example.com
```

### WhatsApp Business

```bash
WHATSAPP_VERIFY_TOKEN=<your-verify-token>
WHATSAPP_ACCESS_TOKEN=<from Meta>
WHATSAPP_PHONE_ID=<from Meta>
```

### AI / behavioural intelligence

```bash
AI_INTEGRATIONS_ANTHROPIC_API_KEY=sk-ant-…
# Optional override for proxies / regional endpoints:
# AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com
```

### FX feed (multi-currency)

```bash
# Default uses ECB; only override for restricted environments.
# ECB_FX_FEED_URL=https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
# ECB_FETCH_TIMEOUT_MS=15000
# FX_RATE_STALENESS_ALERT_DAYS=3
```

### SIEM forwarding (RBAC denials + emergency-mode)

```bash
# When unset, denials are only logged locally.
RBAC_SIEM_WEBHOOK_URL=https://siem.example.com/services/collector/event
RBAC_SIEM_AUTH_HEADER=Splunk\ <hec-token>
```

### Event-log persistence

```bash
# By default only events marked critical:true in the event catalog persist to
# event_logs. Set to "true" to persist EVERY event (full audit trail; ~10×
# growth on event_logs — plan disk + index maintenance accordingly).
# PERSIST_ALL_EVENTS=false
```

---

## 4. First boot

The API server's `index.ts` auto-runs every migration in `artifacts/api-server/src/migrations/` on startup and stamps them in `schema_migrations`. The first boot from an empty database does the following:

1. Apply every migration (creates all tables, indexes, constraints).
2. Seed reference data (companies/branches/permissions/roles/chart-of-accounts/currencies/system_settings/module_dashboards) — only if the tables are empty.
3. Create the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if set, otherwise create the deterministic dev admin (`owner@local.test` / `Test1234!`).
4. Start listening on `PORT` (default 5000).

Logs to look for:

```
INFO  Running 147 migrations…
INFO  Seeded reference data
INFO  Server listening on http://0.0.0.0:5000
```

If the migration runner errors, the server exits — fix the migration locally and re-deploy. **Do not** edit `schema_migrations` to skip a failing migration.

---

## 5. Verification after deploy

Run these from a workstation against the live API to confirm the deployment is healthy:

```bash
# 1. Liveness — should return 200 with build info
curl -sf https://api.example.com/api/health

# 2. Schema-drift probe — confirms migrations applied
curl -sf https://api.example.com/api/health/schema-drift | jq .

# 3. Login as the first admin — should return a JWT
curl -sf -X POST https://api.example.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ops@example.com","password":"<your-password>"}' | jq .accessToken

# 4. RBAC catalog — confirms feature catalog loaded
curl -sf -H "Authorization: Bearer <token>" \
  https://api.example.com/api/admin/rbac/features | jq '.data | length'
```

The frontend bundle (built from `artifacts/ghayth-erp/`) is served separately — typically via a CDN or static host. Point its `VITE_API_BASE_URL` to the API origin and it will use the JWT from the login response above.

---

## 6. Backup & restore

### Schedule

Daily at minimum. PII-heavy installs should run hourly incrementals + daily full.

```bash
# Full snapshot
pg_dump --format=custom --no-owner --compress=9 \
  "$DATABASE_URL" > "ghayth_erp-$(date +%F).dump"
```

### Restore drill (test quarterly)

```bash
createdb ghayth_erp_restore
pg_restore --no-owner --jobs=4 -d ghayth_erp_restore ghayth_erp-2026-05-11.dump
psql ghayth_erp_restore -c "SELECT count(*) FROM companies;"  # smoke check
```

### Critical files to also back up

- `.env` (especially `FIELD_ENCRYPTION_KEY` and `SECRETS_ENCRYPTION_KEY`) — **lose these and encrypted data is gone**. Store in a secret manager separate from the DB backup; the two together are the keys to your data.
- ZATCA private keys (under `secrets_vault` table — encrypted by `SECRETS_ENCRYPTION_KEY`).

---

## 7. Multi-instance deployment

To run more than one app process behind a load balancer:

1. Set `REDIS_URL` to a shared Redis (rate-limit counters + RBAC permission cache need to be coherent across replicas).
2. Match `JWT_SECRET` across all replicas (tokens signed by one must verify on any).
3. Match `FIELD_ENCRYPTION_KEY` across all replicas (a row encrypted on replica A must decrypt on replica B).
4. The Postgres `max_connections` must satisfy `PG_POOL_MAX × number_of_replicas` + slack for admin sessions and backup tools.
5. Use sticky sessions for **only** the WebSocket / SSE endpoints if you use them; everything else is fine on round-robin.

---

## 8. Upgrade procedure

```bash
# 1. Fetch new code
git pull origin main

# 2. Install deps (pnpm catches lockfile drift; if it errors, regen the
#    lockfile with `pnpm install` not --frozen-lockfile)
pnpm install --frozen-lockfile

# 3. Typecheck
pnpm typecheck

# 4. Restart — new migrations run automatically on boot
systemctl restart ghayth-api
# OR: pm2 restart ghayth-api
# OR: kubectl rollout restart deployment/ghayth-api
```

If the new release adds new env vars, the changelog will call them out. Compare `.env.example` against your `.env` before restarting:

```bash
diff <(grep -oE '^[A-Z_]+=' .env.example | sort -u) \
     <(grep -oE '^[A-Z_]+=' .env | sort -u)
```

---

## 9. Common production-readiness mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `NODE_ENV=development` left as the default | CORS is wide open; ZATCA CSR generation is allowed from the UI; the dev seed admin is created | Set `NODE_ENV=production` |
| `JWT_SECRET` < 32 chars or unchanged from example | Server exits at boot with `FATAL: JWT_SECRET must be at least 32 characters` | `openssl rand -hex 32` |
| `FIELD_ENCRYPTION_KEY` not set in prod | Server throws on first encrypted-field write | Set before boot |
| `FIELD_ENCRYPTION_KEY` rotated in place | Old encrypted data unreadable | Use the documented re-encryption procedure (`docs/SECRETS_ROTATION.md`) — never overwrite |
| `CORS_ORIGINS` missing the frontend origin | Browser blocks every API call with a CORS error | Add the production frontend's scheme+host |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` unset | The default `owner@local.test` / `Test1234!` is provisioned in production | Set both before first boot |
| Single `JWT_SECRET` across dev/staging/prod | A leaked dev token validates in production | Use a separate value per environment |
| `.env` committed to git | Secrets exposed forever | Add to `.gitignore`, rotate every secret, force-push to remove history (and assume compromise anyway) |

---

## 10. Operational dashboards

The frontend includes operator dashboards under `/admin` for:

- **RBAC audit** — every denial, every grant, every emergency-mode use.
- **Schema drift** — live comparison of running schema vs `db/schema.sql`.
- **Event log** — every business event the catalog declares `critical:true`.
- **GL posting queue** — pending journal entries from FX revaluation, cycle counts, lot writeoffs.
- **Cron scheduler** — last run / next run / last error per scheduled job.
- **System governor** — recent admin actions, JIT elevations, emergency-mode toggles.

Watch the cron-scheduler dashboard the first week after deploy — failing jobs there are the most common silent-failure mode.
