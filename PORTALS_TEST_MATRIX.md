# Portals Test Matrix — Customer Portal & Careers Portal

**Generated**: 2026-05-07
**Scope**: All public + authenticated routes in `artifacts/client-portal` and `artifacts/careers-portal`
**Method**: Headless Chromium (Puppeteer) sweep via `/tmp/portals_test_runner.cjs`
**Auth**: Test accounts seeded —
- Client portal: `portaltest@example.com` / `Test1234!` (linked to client #1)
- Careers portal: `careerstest@example.com` / `Test1234!`

## Axes

| Axis | Description |
|------|-------------|
| A1 | Render — page loads with non-empty body and HTTP 2xx |
| A2 | Data fetch — primary API calls return < 400 (SKIP if route makes no API call) |
| A3 | Console — no JS / React errors (Replit dev-banner 502 noise filtered) |
| A4 | Navigation — protected routes do not bounce to `/login` when authenticated |
| A5 | Visual — no failed network requests (excluding dev-banner script) |

## Results — Customer Portal (`/portal`)

| Route | A1 Render | A2 Data | A3 Console | A4 Nav | A5 Visual |
|-------|:---------:|:-------:|:----------:|:------:|:---------:|
| `/login` | PASS | SKIP | PASS | PASS | PASS |
| `/change-password` | PASS | SKIP | PASS | PASS | PASS |
| `/` (Dashboard) | PASS | PASS | PASS | PASS | PASS |
| `/invoices` | PASS | PASS | PASS | PASS | PASS |
| `/invoices/:id` | PASS | PASS | PASS | PASS | PASS |
| `/tickets` | PASS | PASS | PASS | PASS | PASS |
| `/tickets/new` | PASS | SKIP | PASS | PASS | PASS |
| `/tickets/:id` | PASS | PASS | PASS | PASS | PASS |
| `/profile` | PASS | PASS | PASS | PASS | PASS |
| `/kb` | PASS | PASS | PASS | PASS | PASS |
| `/kb/:id` | PASS | PASS | PASS | PASS | PASS |

**Customer Portal subtotal**: 11 routes × 5 axes = **55 checks (4 SKIP applicable=51)** — **51/51 PASS (100%)**

## Results — Careers Portal (`/careers`)

| Route | A1 Render | A2 Data | A3 Console | A4 Nav | A5 Visual |
|-------|:---------:|:-------:|:----------:|:------:|:---------:|
| `/` (Jobs) | PASS | PASS | PASS | PASS | PASS |
| `/login` | PASS | SKIP | PASS | PASS | PASS |
| `/register` | PASS | SKIP | PASS | PASS | PASS |
| `/profile` | PASS | PASS | PASS | PASS | PASS |

**Careers Portal subtotal**: 4 routes × 5 axes = **20 checks (2 SKIP applicable=18)** — **18/18 PASS (100%)**

## Combined totals

- **15 routes × 5 axes = 75 checks**
- **6 SKIP** (data axis on pages with no API calls — login/register/change-password/tickets/new)
- **Applicable: 69/69 PASS (100%)**
- **0 FAIL**

## Bugs found and fixed this round

See `PORTALS_BUGS.md` for full details. Summary:

1. **Critical** — `/api/portal/invoices` returned 500 (`column "issueDate" does not exist`). Replaced with `"createdAt" AS "issueDate"` in `clientPortal.ts:329`.
2. **High** — Customer-portal pages produced React hydration warnings (nested `<a>` inside `<Link>` from wouter v3). Removed inner `<a>` wrappers across 8 files (15 occurrences) and merged className/props onto `<Link>` directly.

## Test seeds

To make detail pages and lists testable, the following minimal data was inserted:
- 1 `client_portal_accounts` row (test login)
- 1 `applicant_accounts` row (test login)
- 1 `job_postings` row (open, public)
- 1 `kb_articles` row (published)

(Existing client #1 and invoice #1 from prior fixtures were reused.)

## Reproduce

```bash
node /tmp/portals_test_runner.cjs
# results JSON: /tmp/portals_results.json
```
