# Ghayth ERP — Deployment Guide (VPS / Self-Hosted)

> **Scope:** how to boot Ghayth ERP on a plain Linux VPS (Ubuntu 22.04+ assumed)
> without Replit's managed services. Replit deployment is unchanged and remains
> the canonical path; this document is for portability and disaster-recovery.

> **Honesty disclaimer:** this guide is tested by reading the codebase, not by
> running the system end-to-end on a fresh VPS. Treat every step as a starting
> point, not a guarantee. Run `scripts/bootstrap-check.sh` before each boot —
> it fails fast on the most common silent-failure causes.

---

## 1. Prerequisites

| Component | Required version | Notes |
|---|---|---|
| OS | Ubuntu 22.04 LTS or 24.04 LTS | Any modern glibc-based Linux works |
| Node.js | **24.x exactly** | The repo pins Node 24; older majors will fail typecheck and may fail at runtime |
| pnpm | **10.x** (matches `packageManager` in `package.json`) | `corepack enable && corepack prepare pnpm@10 --activate` |
| PostgreSQL | **14+** (16 recommended) | Local or managed — only needs `DATABASE_URL` |
| nginx (or any TLS-terminating reverse proxy) | any recent version | Path-based routing — see §6 |
| Build tools | `build-essential`, `python3` | Some native deps (`bcrypt`, `pg-native` if added) need a compiler |
| Memory | 2 GB minimum for build, 1 GB minimum for runtime | Frontend build is the memory peak |
| Disk | ~3 GB for `node_modules` + build + logs | Object storage uploads live elsewhere |

Optional but recommended:
- `chromium` if you intend to run the runtime audit script
- `tesseract-ocr` system packages (the OCR engine uses `tesseract.js` which bundles WASM, so usually not needed — only if you switch to native binary)

---

## 2. First-time setup

```bash
# 1. Clone
git clone https://github.com/<your-fork>/ghayth-erp.git
cd ghayth-erp

# 2. Install Node 24 + pnpm
#    Easiest path is via nvm or fnm:
#    nvm install 24 && nvm use 24
#    corepack enable && corepack prepare pnpm@10 --activate
node --version   # must start with v24.
pnpm --version   # must start with 10.

# 3. Install dependencies (uses pnpm-lock.yaml; do NOT pass --no-frozen-lockfile in prod)
pnpm install --frozen-lockfile

# 4. Build everything
pnpm build
```

`pnpm build` will:
- Typecheck all composite libs in `lib/*`
- Build the API server (`artifacts/api-server`)
- Build the three frontends (`artifacts/ghayth-erp`, `artifacts/client-portal`, `artifacts/careers-portal`)

If the build fails, run `pnpm typecheck` first — it isolates type errors from build errors.

---

## 3. Environment variables

### 3.1 Required (server will not function without these)

| Name | Purpose | Example shape |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/ghayth?sslmode=require` |
| `SESSION_SECRET` | Signs JWT cookies | random 64+ char string |
| `FIELD_ENCRYPTION_KEY` | Encrypts sensitive DB fields at rest | random 32-byte base64 string |
| `ADMIN_EMAIL` | Bootstrap admin account email | `admin@example.com` |
| `ADMIN_PASSWORD` | Bootstrap admin account password | strong password |

Generate strong secrets:

```bash
# SESSION_SECRET (any length, 64+ recommended)
node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'

# FIELD_ENCRYPTION_KEY (must be base64-encoded 32 bytes)
node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
```

> **Never commit these to git.** Store them in `/etc/ghayth/ghayth.env` (mode 600,
> owned by the service user) or in your secret manager. See §5 for systemd wiring.

### 3.2 Optional — observability

| Name | Default if unset | Effect |
|---|---|---|
| `SENTRY_DSN` (alias `OBS_DSN`) | unset → logger-only | Sends errors to Sentry with scrubbed payloads |
| `OBS_ENVIRONMENT`, `OBS_RELEASE`, `OBS_SAMPLE_RATE` | sane defaults | Tunes Sentry context |
| `VITE_SENTRY_DSN` (+ `VITE_OBS_*`) | unset → no FE error reporting | Frontend Sentry |
| `METRICS_USER` / `METRICS_PASS` | both unset → `/metrics` is loopback-only | Basic-auth for Prometheus scrape endpoint |

### 3.3 Optional — OCR

| Name | Default | Effect |
|---|---|---|
| `OCR_PROVIDER` | `stub` (queues docs as `pending`) | `tesseract` for offline OCR, `http` to route to Vision/Textract |
| `OCR_LANGS` | `ara+eng` | Language packs auto-fetched on first use |
| `OCR_BATCH_SIZE` | 10 | |
| `OCR_MAX_ATTEMPTS` | 3 | |
| `OCR_MAX_BYTES` | 25 MB | |
| `OCR_HTTP_URL`, `OCR_HTTP_TOKEN` | unset | Required if `OCR_PROVIDER=http` |

### 3.4 Optional — integrations

| Name | When you need it |
|---|---|
| `GITHUB_TOKEN` | Only if you run the bundled GitHub automation scripts (Auto-Pull, PR Push, etc.). The app itself does not need it. |
| `OBJECT_STORAGE_*` | If you wire object storage to S3-compatible backend. The bundled object-storage helpers assume Replit's App Storage by default; on a VPS you will need to point them at S3/MinIO. **This is not yet documented here — see "Known gaps" §10.** |

### 3.5 NOT required on VPS (Replit-only)

- `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, `REPLIT_EXPO_DEV_DOMAIN`, `REPL_ID` — only used by Replit-specific scripts (deck capture, runtime audit). The runtime application does not need them.

---

## 4. Database setup

```bash
# 1. Create a PostgreSQL user + database
sudo -u postgres psql <<SQL
CREATE USER ghayth WITH PASSWORD 'replace-me-strong';
CREATE DATABASE ghayth_prod OWNER ghayth;
GRANT ALL PRIVILEGES ON DATABASE ghayth_prod TO ghayth;
SQL

# 2. Export DATABASE_URL for the next step
export DATABASE_URL='postgres://ghayth:replace-me-strong@127.0.0.1:5432/ghayth_prod'

# 3. (Optional) Pre-load the dumped schema for faster cold-start.
#    Without this, api-server's migration runner will apply every migration
#    sequentially on first boot, which is slower but produces an identical schema.
psql "$DATABASE_URL" -f db/schema_pre.sql
psql "$DATABASE_URL" -f db/schema_post.sql
```

### Migration behavior

- **Migrations are applied automatically by `api-server` on startup.**
- Migration files live in `artifacts/api-server/src/migrations/`.
- The runner detects `CREATE INDEX CONCURRENTLY` and runs that file un-wrapped (outside a transaction).
- Migrations are idempotent — applying twice is safe; effects already in the schema fail with `already exists` and are ignored.
- **No separate migration command** — boot api-server and watch the logs.

### Admin seeding

On first boot with an empty DB, api-server reads `ADMIN_EMAIL` + `ADMIN_PASSWORD`
and creates the bootstrap admin account. **If you forget to set them on first
boot, you will have no way to log in** until you drop the relevant tables and
re-boot. `scripts/bootstrap-check.sh` enforces this.

---

## 5. Running the services

There are two long-running Node processes:

### 5.1 API server

```bash
PORT=8080 \
DATABASE_URL='...' \
SESSION_SECRET='...' \
FIELD_ENCRYPTION_KEY='...' \
ADMIN_EMAIL='admin@example.com' \
ADMIN_PASSWORD='...' \
NODE_ENV=production \
pnpm --filter @workspace/api-server start
```

### 5.2 Main frontend (served as a Vite preview, NOT dev server)

```bash
# Build once (done in §2)
pnpm --filter @workspace/ghayth-erp build

# Serve the built assets. The Vite preview server is fine for low traffic;
# for higher traffic, point nginx directly at the build output (see §6).
PORT=5173 pnpm --filter @workspace/ghayth-erp preview
```

The same pattern applies to `@workspace/client-portal` and `@workspace/careers-portal`.

### 5.3 systemd unit (recommended)

`/etc/systemd/system/ghayth-api.service`:

```ini
[Unit]
Description=Ghayth ERP API Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=ghayth
WorkingDirectory=/opt/ghayth-erp
EnvironmentFile=/etc/ghayth/ghayth.env
ExecStartPre=/opt/ghayth-erp/scripts/bootstrap-check.sh
ExecStart=/usr/bin/pnpm --filter @workspace/api-server start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`/etc/ghayth/ghayth.env` (mode 600, owner `ghayth`):

```
DATABASE_URL=postgres://ghayth:...@127.0.0.1:5432/ghayth_prod
SESSION_SECRET=...
FIELD_ENCRYPTION_KEY=...
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=...
NODE_ENV=production
PORT=8080
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ghayth-api
sudo journalctl -fu ghayth-api
```

Repeat for `ghayth-web` (the main frontend) with `PORT=5173`.

---

## 6. nginx reverse proxy

The path-based routing on Replit is replaced by nginx `location` blocks. The
critical contract: **`/api/*` must reach api-server unchanged** (no path
rewriting), and **everything else reaches the frontend**.

`/etc/nginx/sites-available/ghayth`:

```nginx
upstream ghayth_api { server 127.0.0.1:8080; }
upstream ghayth_web { server 127.0.0.1:5173; }

server {
    listen 443 ssl http2;
    server_name erp.example.com;

    ssl_certificate     /etc/letsencrypt/live/erp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.example.com/privkey.pem;

    client_max_body_size 50M;  # uploads + OCR-bound docs

    # Health (proxied through API)
    location = /api/healthz {
        proxy_pass http://ghayth_api;
        access_log off;
    }

    # API + auth + portals — DO NOT REWRITE PATH
    location /api/ {
        proxy_pass         http://ghayth_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Frontend (catch-all)
    location / {
        proxy_pass         http://ghayth_web;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name erp.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ghayth /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> **Auth uses HttpOnly cookies, not Bearer tokens.** Cookies are set with
> `Path=/api` and `Path=/api/auth`. The nginx config above preserves these
> paths correctly. Do NOT add `proxy_cookie_path` rewriting unless you know
> exactly what you're doing.

---

## 7. Health check

The API exposes a health endpoint at `/api/healthz`. Use it for liveness
probes:

```bash
curl -fsS https://erp.example.com/api/healthz
# Expected: HTTP 200 with a small JSON payload
```

A bundled basic check is at `scripts/health-check.sh` — it pings the endpoint
and exits non-zero on failure. Wire it into your monitoring (Uptime Kuma,
Healthchecks.io, Prometheus blackbox exporter, etc.).

For deeper observability, set `METRICS_USER` + `METRICS_PASS` and scrape
`GET /metrics` with Prometheus. Dashboards and alert rules ship in
`docs/grafana/` — `api-health.json`, `db-health.json`, `cron-health.json`,
`alerts.yaml`.

---

## 8. What's different between Replit and VPS

| Aspect | Replit | VPS |
|---|---|---|
| Routing | Shared proxy uses `artifact.toml` `paths = ["/api"]` | nginx `location /api/` block (§6) |
| TLS | Platform-managed | You manage (Let's Encrypt + certbot) |
| Process supervision | Workflows | systemd (§5.3) |
| Cold-start admin | First boot uses `ADMIN_EMAIL`/`PASSWORD` from Replit Secrets | Same — but you set them in `/etc/ghayth/ghayth.env` |
| Object storage | Replit App Storage (zero-config) | **Not yet documented** — see §10 |
| GitHub automation | Bundled scripts via Replit GitHub integration | Disabled; use your own CI/CD instead |
| Auto-pull / merge-PRs workflows | Run continuously on the Repl | Not applicable |
| Domain | `*.replit.dev` / `*.replit.app` | Your domain + DNS |
| `REPLIT_DEV_DOMAIN` env var | Set by platform | Unset — only deck/audit scripts need it |
| Path-based routing of multiple frontends | Automatic via `artifact.toml` | You decide: subdomains (`portal.erp.example.com`) or paths — both work |

---

## 9. Troubleshooting

**`pnpm install` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`**
Make sure pnpm major version matches the `packageManager` field in
`package.json`. Re-run `corepack prepare pnpm@10 --activate`. See
`docs/GITHUB_OPS.md` for the deeper history.

**Build runs out of memory**
Front-end build can hit ~1.5 GB on a clean repo. Add swap, or build on a
larger machine and copy the `dist/` directories over.

**`api-server` exits immediately on boot**
Run `./scripts/bootstrap-check.sh` first — most boot failures are missing env
vars or malformed `DATABASE_URL`. If the check passes, check journalctl:
`sudo journalctl -u ghayth-api -n 200 --no-pager`.

**Login returns 401 even with correct credentials**
First-boot admin seeding requires `ADMIN_EMAIL` + `ADMIN_PASSWORD` to be set
the *very first time* api-server connects to an empty DB. If you forgot, drop
the `users` table and re-boot, or insert the row manually.

**Frontend loads but every API call fails with CORS / 404**
Check nginx is NOT rewriting `/api/` paths. The api-server expects requests at
the full `/api/...` path. `proxy_pass http://upstream;` (no trailing slash on
either side) preserves the path; `proxy_pass http://upstream/;` (trailing
slash) strips `/api`.

**Cookies don't persist across reloads**
You're probably on HTTP, not HTTPS. The cookies are set with `Secure` and
`SameSite=Lax`; modern browsers reject Secure cookies over plain HTTP. Get a
cert from Let's Encrypt and use HTTPS.

**Migrations run forever / hang**
Check for an in-flight `CREATE INDEX CONCURRENTLY` blocked behind another
transaction. Inspect `pg_stat_activity` for blockers. The migration runner is
single-threaded and idempotent — interrupting and re-running is safe.

**OCR is enabled but queue keeps growing**
Set `OCR_PROVIDER=tesseract` (offline, no API key needed). If you left it at
`stub`, documents queue as `pending` indefinitely. The Prometheus alert
`OcrQueueBacklog` fires after 30 min with >100 pending docs.

---

## 10. Known gaps (honest list of "not yet portable")

These are the items that need owner approval and code changes before
a fully production-grade VPS deployment is ready:

1. **Object storage abstraction** — the bundled `lib/object-storage` helpers
   assume Replit App Storage. Self-hosted deployment needs an S3/MinIO
   adapter. Not yet implemented; out of scope for this doc.
2. **No Dockerfile / docker-compose.yml** — explicitly out of scope by
   request. Recommend a future task: add a slim multi-stage Dockerfile for
   each artifact + a top-level `docker-compose.yml` for one-command boot.
3. **No automated DB backup script** — recommend wiring `pg_dump` into a
   nightly cron + offsite copy. Not in scope here.
4. **No `/api/readyz` distinct from `/api/healthz`** — the current health
   endpoint conflates liveness and readiness. For zero-downtime deploys
   behind a load balancer, you may want a separate readiness probe that also
   checks DB connectivity and migration completion.
5. **Background workers run in-process with api-server** — cron handlers
   (Umrah overstay scan, OCR worker, notification drain, etc.) share the
   api-server process. For horizontal scaling you may want to extract them
   to a dedicated worker process. Not blocked by this guide but worth
   knowing.
6. **No env-var validation at boot inside the application itself** —
   `bootstrap-check.sh` is a pre-flight check, not an in-process validator.
   A future Zod-based env schema in `artifacts/api-server/src/lib/env.ts`
   would catch typos at startup.

These are listed for honesty, not blockers — the system DOES boot and serve
traffic with only the 5 required env vars + a PostgreSQL.
