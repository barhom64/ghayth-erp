# غيث ERP — Ghayth ERP

نظام ERP عربي متكامل لمجموعة الدور، مبني كـ **pnpm workspace monorepo** يغطي أكثر من 28 وحدة أعمال (موارد بشرية، مالية، أسطول، مستودعات، عقارات، قانوني، مشاريع، CRM، دعم، حوكمة، BI، عمرة، ...).

> Arabic-first ERP system for Al Door Group. React + Vite frontend with an Express 5 + PostgreSQL API, organised as a pnpm monorepo.

---

## 1. البنية العامة — Monorepo layout

```
ghayth-erp/
├── artifacts/
│   ├── api-server/          # Express 5 + TypeScript REST API (main backend)
│   ├── ghayth-erp/          # React + Vite frontend (staff ERP)
│   ├── client-portal/       # Client self-service portal (separate auth)
│   ├── careers-portal/      # Public jobs / applicants portal
│   └── mockup-sandbox/      # UI sandbox for prototyping
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval codegen
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas
│   ├── db/                  # Drizzle ORM schema + PG pool
│   └── object-storage-web/  # Shared object storage helpers
├── docs/                    # Delivery documentation (see §6)
├── scripts/                 # Dev and maintenance scripts
└── pnpm-workspace.yaml
```

Runtime data access in `api-server` is **raw SQL via `pg` pool** (see `artifacts/api-server/src/lib/rawdb.ts`). Drizzle is used for the shared schema in `lib/db` and for type generation only.

---

## 2. المتطلبات — Prerequisites

| Tool           | Version        |
| -------------- | -------------- |
| Node.js        | **24.x**       |
| pnpm           | **9.x or 10.x** |
| PostgreSQL     | **14+** (tested on 15/16) |
| TypeScript     | 5.9 (bundled)  |

Optional:
- **Object storage** (Replit Object Storage / GCS) — only needed for uploaded documents.
- **VAPID keys** — only needed for Web Push notifications.
- **Anthropic API key** — only needed for the AI/behavioural-intelligence features.

---

## 3. الإقلاع السريع — Quick start

```bash
# 1. Clone and install
git clone <repo> ghayth-erp && cd ghayth-erp
pnpm install

# 2. Configure environment (see §4)
cp .env.example .env
#   → set DATABASE_URL, JWT_SECRET at minimum

# 3. Typecheck everything
pnpm run typecheck

# 4. Build + run API server (migrations run automatically on boot)
pnpm --filter @workspace/api-server run dev
#   → http://localhost:5000

# 5. In another terminal, run the frontend
pnpm --filter @workspace/ghayth-erp run dev
#   → http://localhost:5173
```

**First login:** the server seeds a default company and owner user on first boot (see `artifacts/api-server/src/lib/companyBootstrap.ts`). Check server logs for the bootstrap credentials, or set `SEED_DEMO_DATA=true` to load demo data.

---

## 4. المتغيرات البيئية — Environment variables

All variables are read by `artifacts/api-server` unless noted. See `.env.example` for the complete list with defaults. Required ones are marked ⚠.

### Core (API server)

| Variable                 | Required | Description                                                                 |
| ------------------------ | -------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`           | ⚠        | PostgreSQL connection string. `rawdb.ts` throws at boot if missing.         |
| `JWT_SECRET`             | ⚠        | Symmetric key for signing access/refresh tokens (also used by careers/client portals). |
| `NODE_ENV`               |          | `development` (default) or `production`. Affects CORS, seeding, logging.    |
| `PORT`                   |          | HTTP port. Defaults to `5000`.                                              |
| `LOG_LEVEL`              |          | Pino level — `trace`/`debug`/`info`/`warn`/`error`. Default `info`.         |
| `HOSTNAME`               |          | Owner id for cron advisory locks. Defaults to `api-server`.                 |

### CORS

| Variable                 | Description |
| ------------------------ | ----------- |
| `CORS_ORIGINS`           | Comma-separated list of allowed origins (preferred). |
| `CORS_ORIGIN`            | Legacy alias; also comma-separated. |
| `REPLIT_DEV_DOMAIN`      | Auto-added as `https://$REPLIT_DEV_DOMAIN`. |
| `REPLIT_DEPLOYMENT_URL`  | Auto-added to the allow-list. |

In development with no origins configured, CORS is left open.

### Secrets vault

| Variable                   | Description |
| -------------------------- | ----------- |
| `SECRETS_ENCRYPTION_KEY`   | Master key for `secrets.ts` (used to encrypt third-party API keys stored in the DB). Hex-encoded 32 bytes. |

### Push notifications (optional)

| Variable              | Description |
| --------------------- | ----------- |
| `VAPID_PUBLIC_KEY`    | Web-push public key. |
| `VAPID_PRIVATE_KEY`   | Web-push private key. |
| `VAPID_SUBJECT`       | Contact URL / mailto. Default `mailto:admin@ghayth.app`. |

### AI / behavioural intelligence (optional)

| Variable                                | Description |
| --------------------------------------- | ----------- |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY`     | Anthropic API key. |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`    | Optional override for the Anthropic endpoint. |

### Object storage (optional — document uploads)

| Variable                     | Description |
| ---------------------------- | ----------- |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Colon-separated public object directories. |
| `PRIVATE_OBJECT_DIR`         | Private object directory for uploaded files. |

### WhatsApp Business (optional)

| Variable                    | Description |
| --------------------------- | ----------- |
| `WHATSAPP_VERIFY_TOKEN`     | Verification token for the WhatsApp webhook. |
| `WHATSAPP_ACCESS_TOKEN`     | Meta Graph API access token. |
| `WHATSAPP_PHONE_ID`         | Business phone id. |

### Seed / bootstrap

| Variable           | Description |
| ------------------ | ----------- |
| `SEED_DEMO_DATA`   | Set to `true` to load demo data (dev only). |

### Frontend (`artifacts/ghayth-erp`)

The frontend talks to the API via relative paths (`/api/...`) using Vite's dev proxy. The only `import.meta.env` value it reads is `BASE_URL`, which Vite provides automatically based on `base` in `vite.config.ts`. No additional `.env` file is required for local development.

---

## 5. السكربتات الجذرية — Root scripts

| Command                     | What it does |
| --------------------------- | ------------ |
| `pnpm install`              | Installs all workspace packages (pnpm is enforced by a preinstall guard). |
| `pnpm run typecheck`        | Typechecks `lib/*` then all `artifacts/*` and `scripts`. |
| `pnpm run build`            | Typechecks then runs `build` in every workspace that defines one. |
| `pnpm --filter @workspace/api-server run dev` | Build + start the API (migrations run on startup). |
| `pnpm --filter @workspace/ghayth-erp run dev` | Vite dev server for the ERP frontend. |
| `pnpm --filter @workspace/api-server run typecheck` | Typecheck the API only (fast inner loop). |
| `pnpm run db:bootstrap`     | Drop + recreate the local DB from `db/schema.sql` + `db/seed*.sql`. |
| `pnpm run audit:routes`     | Catch orphan page files (defined but never imported). |
| `pnpm run audit:schema`     | Catch SQL referencing columns/tables not in `db/schema.sql`. |
| `pnpm run lint:patterns`    | Repo-wide forbidden-pattern guard. |

### Backup / restore (DR)

| Command                                      | What it does |
| -------------------------------------------- | ------------ |
| `bash scripts/backup.sh`                     | Create a gzipped logical backup at `backups/ghayth-erp-<UTC>.sql.gz`. |
| `bash scripts/backup.sh --out /mnt/snapshot` | Same, but write to a custom destination (offsite snapshot). |
| `bash scripts/restore.sh <file>.sql.gz --yes`| Restore a backup. Refuses prod-looking targets without `--i-know-what-im-doing`. |

Recommended cadence: hourly during business hours + nightly retained 30 days + weekly retained 1 year offsite.

---

## 6. التوثيق التسليمي — Delivery documentation

Deep-dive docs live under `docs/`:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layered architecture, runtime request flow, data-scoping model.
- [`docs/RBAC_V2.md`](docs/RBAC_V2.md) — layered RBAC v2 (5 layers + approval limits + SoD + ABAC conditions).
- [`docs/RBAC_USAGE_GUIDE.md`](docs/RBAC_USAGE_GUIDE.md) — RBAC v2 hands-on usage guide (Arabic, with API examples).
- [`docs/RBAC_COMPARISON.md`](docs/RBAC_COMPARISON.md) — RBAC v2 vs SAP S/4HANA, Oracle NetSuite, Odoo Enterprise, MS Dynamics 365.
- [`docs/CATALOG_RULES.md`](docs/CATALOG_RULES.md) — pnpm catalog discipline + library bans (toast / router / icons / charts / forms).
- [`docs/MODULES.md`](docs/MODULES.md) — map of every business module to its backend route file and frontend pages.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — day-to-day workflow: migrations, seeding, adding routes/pages, conventions.
- [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) — open operational gaps and technical debt tracked against the system audit.
- [`docs/AI_GUARDIAN_SETUP.md`](docs/AI_GUARDIAN_SETUP.md) — legacy AI guardian setup (pre-existing).

---

## 7. الترخيص — License

MIT. See workspace `package.json`.
