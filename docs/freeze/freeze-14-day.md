# Freeze Plan — 14 Days to Production Go/No-Go

> **Branch**: `claude/tenant-isolation-tests-plltB`
> **Started**: 2026-05-09
> **Decision date**: 2026-05-23
> **Rule**: No new features during freeze. Only close gaps.

## Reality Check (verified 2026-05-09)

| Claim                         | Verified Status                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `buildScopedWhere()` helper   | ✅ exists at `artifacts/api-server/src/lib/scopedQuery.ts`                                       |
| Routes with companyId scoping | ✅ 77 / 81 route files reference `scope.companyId` / `allowedCompanies` / `buildScopedWhere`     |
| Routes intentionally unscoped | ✅ 4 (`careersPortal`, `health`, `index`, `publicData`) — public/health endpoints                |
| `check:ghost-rows` static gate| ✅ in `package.json` — `node scripts/src/check-ghost-rows.mjs`                                   |
| `check:schema-drift` gate     | ✅ in `package.json` — `node scripts/src/check-schema-drift.mjs`                                 |
| CI guard workflow             | ✅ `.github/workflows/guard.yml` runs full `scripts/guard.sh` suite                              |
| `scripts/backup.sh` + restore | ✅ both exist                                                                                    |
| Financial period guard        | ✅ in `routes/finance-journal.ts`                                                                |
| Vitest + supertest            | ✅ vitest 4.1.4 + supertest 7.2.2 in `artifacts/api-server` devDeps                              |
| Existing test suites          | ✅ 80 unit tests under `artifacts/api-server/tests/unit/` (static analysis pattern)              |
| RBAC v2 migration coverage    | ⚠️ ~102/1024 endpoints mention `authorize()` (≈10%)                                              |
| `tests/integration/` dir      | ❌ does not exist                                                                                |
| Tenant-isolation test         | ❌ no test asserts company A cannot read company B's rows                                        |
| Cross-tenant runtime test     | ❌ no supertest harness with two-company seeded DB                                               |
| `docs/KNOWN_ISSUES.md`        | ✅ exists, 149 lines, last updated 2 May 2026 — needs new P0 entries from Day 2 findings        |
| `docs/RBAC_V2.md`             | ✅ exists, 231 lines — design doc complete; route-level migration progress table is the gap     |

## Day-by-Day

### Day 1-2 — Tenant-isolation tests (P0)

- Static test: `tests/integration/tenantIsolation.test.ts`
  - For every `routes/*.ts` (excluding 4 public files), scan `rawQuery`/`rawExecute` calls
  - Each query that references a tenant-scoped table MUST also reference one of:
    `scope.companyId`, `scope.allowedCompanies`, `buildScopedWhere`, or be inside a clearly
    public/admin context
  - Fail loudly with file:line for every violation
- Sketch dynamic harness: `tests/integration/tenantIsolation.dynamic.test.ts.skip`
  - Documented but skipped until DB-in-CI lands (Day 12)
- **Exit criteria**: static test green, full inventory of any false positives in
  `.local/tasks/freeze-day-2-findings.md`

### Day 3-5 — Fix every static-test leak

- Walk `freeze-day-2-findings.md` top to bottom
- Each finding: either fix the query, suppress with explicit allowlist + reason,
  or document as accepted residual risk in `KNOWN_ISSUES.md`
- **Exit criteria**: 0 unjustified violations

### Day 6-7 — Migrate hand-written `WHERE companyId = $X` to `buildScopedWhere`

- Inventory every route still using the manual pattern
- Migrate top-50 hottest routes (clients, projects, invoices, employees, journal,
  vendors, opportunities, support_tickets, etc.)
- Leave low-traffic routes for post-freeze
- **Exit criteria**: top-50 migrated; rest tracked in KNOWN_ISSUES.md

### Day 8-9 — Update `docs/KNOWN_ISSUES.md` with new P0 entries

- Existing file has Phases 2-8 already tracked (audit-driven backlog).
- Append a new "Phase 9 — Tenant-isolation freeze" section with the 18
  candidates from `docs/freeze/freeze-day-2-findings.md` as numbered
  issue rows; each row links to the route file:line and gets a status
  symbol from the `[ ] / [~] / [x]` legend already in the file.
- Cross-link from `README.md`'s "current sprint" pointer.
- **Exit criteria**: every Day 2 candidate has an issue row + verdict
  (fix shipped / allowlisted / deferred to KNOWN_ISSUES residual).

### Day 10-11 — Add route-migration table to `docs/RBAC_V2.md` + migrate 100 endpoints

- Existing `docs/RBAC_V2.md` documents the 5-layer model + SoD design.
- Add a new section: route × permission grid using `audit:routes` output
  to enumerate all routes; mark ✅ for ones using `authorize()` and ❌ for
  ones still on `requirePermission()` / nothing.
- Migrate the 100 highest-risk unmigrated endpoints (focus: finance
  writes, HR PII reads, admin actions).
- **Exit criteria**: route grid lands in `docs/RBAC_V2.md`; +100 endpoints
  on `authorize()`; remainder enumerated.

### Day 12-13 — Real-PG integration tests

- `tests/integration/postgres/` with docker-compose-driven Postgres
- Seed two companies, three users per company, basic chart of accounts
- Write 30 scenarios across finance / Umrah / HR golden paths
- Each scenario asserts: success path 200 + cross-tenant fetch 404
- Wire into `guard.yml` as a separate job (only on `main` and labeled PRs to
  keep fast PR feedback)
- **Exit criteria**: 30 passing scenarios, 0 cross-tenant leaks

### Day 14 — Freeze final report + go/no-go

- Tally: tests added, leaks fixed, queries migrated, endpoints migrated
- Decision matrix:
  - GO: 0 P0 open, ≤ 5 P1 open, all tenant tests green
  - DELAY: any open P0, or > 10 P1
- Publish `.local/tasks/freeze-final-report.md`
- **Exit criteria**: signed go/no-go decision

## Daily logs

Each day commits to `.local/tasks/freeze-day-N-log.md` with:
- What shipped
- What blocked
- Tomorrow's plan
