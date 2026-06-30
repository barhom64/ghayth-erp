# Multi-Tenant Website CMS (الموقع الإلكتروني)

Ghayth core hosts a website for **every** company. Content is edited from the
Ghayth admin module **"الموقع الإلكتروني"** and served dynamically — no duplicate
backend per company (مبدأ: موائمة بدون تكرار).

## Data model (api-server)

Per-company, `companyId`-scoped, soft-deletable (`deletedAt`):

- `site_config` — one row per company: `enabled`, `template` (`managed` | `standard`),
  `slug` (UNIQUE), `customDomain` (UNIQUE), brand/contact/socials, hero, about, SEO.
- `site_packages`, `site_services`, `site_hotels`, `site_posts` — catalog + blog.

Migrations: `448_site_cms.sql` (schema), `449_seed_wafd_site.sql` (company 4 seed).

## Admin (authenticated, RBAC feature `website`)

`src/routes/site.ts` — `GET|PUT /api/site/config` + CRUD for
`/packages /services /hotels /posts`. All `scopedQuery` (company-scoped), CSRF +
`zodParse`. Frontend: `artifacts/ghayth-erp/src/pages/website/*`.

## Public read (anonymous)

`src/routes/publicData.ts` — tenant is **always resolved server-side**, never
trusted from the client. Resolution is **split by column** so a `slug`/`customDomain`
collision across tenants can never cause ambiguous (cross-tenant) resolution:

- `GET /api/public/site/:slug` — resolve by `slug` **only** (`resolveSiteBySlug`).
- `GET /api/public/site/by-host` — resolve from the incoming `Host` header
  (port stripped, lowercased) by `customDomain` **only** (`resolveSiteByHost`).
  Used by the standard template deployed on a custom domain. Registered
  **before** `/site/:slug` to avoid route shadowing.
- `GET /api/public/site/:slug/posts` — published posts (by `slug`).

Only `enabled = true` sites and `isActive = true`, non-deleted rows are returned.
Unknown host/slug returns a uniform `404` (no tenant enumeration).

`slug` and `customDomain` are each independently UNIQUE. Migration `450` adds a
trigger (`site_config_key_collision`) that also forbids one tenant's `slug` from
equalling another tenant's `customDomain` (and vice versa) — a defense-in-depth
guard surfaced as `409` on the admin config write.

## Templates

- **managed** — bespoke front-end consuming the public API. First vertical:
  `artifacts/wafd-site` (company 4). It fetches `/api/public/site/wafd` once via
  `SiteDataContext` and renders packages/services/hotels from the DB, falling
  back to its built-in i18n content only if the API is unreachable (تدهور لطيف).
- **standard** — any company gets a site by setting `template = 'standard'` +
  `slug`/`customDomain`. A standard-template front-end resolves its tenant via
  `GET /api/public/site/by-host`, so the same deployed app serves every standard
  site with no per-company code.

## Custom-domain linking — ops boundary (TLS / nginx)

Linking a custom domain has two halves:

1. **In-app (self-service, done in Ghayth):** set `customDomain` in
   إعدادات الموقع. The API immediately resolves that host to the company.
2. **Infrastructure (ops, manual on the VPS):** the self-hosted nginx must
   terminate TLS for the new domain and route it to the standard-template app.
   This is **outside** the application and must be performed by an operator:
   - Point the customer's DNS `A`/`CNAME` at the VPS.
   - Add an nginx `server { server_name <domain>; ... }` vhost proxying to the
     standard-template service, forwarding the real `Host` header
     (`proxy_set_header Host $host;`) so `/api/public/site/by-host` resolves.
   - Issue a TLS certificate for the domain (e.g. certbot / Let's Encrypt).

The application never provisions DNS, vhosts, or certificates — that remains an
operator responsibility on `erp.door.sa`.
