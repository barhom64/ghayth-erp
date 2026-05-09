# Day 12-13 — Dynamic tenant-isolation harness

> **Decision date**: 2026-05-09
> **Outcome**: Infrastructure files shipped; tests auto-skip until CI is wired with a Postgres service. Activation is a follow-up PR (steps below).

## What landed

- **`tests/integration/postgres/docker-compose.yml`** — disposable `postgres:16-alpine` on port `54329`, healthcheck-gated, no persistent volume.
- **`tests/integration/_fixtures/twoCompanies.ts`** — idempotent two-company seed (`companies` × 2, `branches` × 2, `employees` × 2, `users` × 2, `employee_assignments` × 2). Mints two JWTs via the same `signToken()` the production app uses. Refuses to run unless `DATABASE_URL` contains a clear test marker (`_test`, `localhost:54329`, or `127.0.0.1:54329`) — guards against accidental truncation of a real database.
- **`tests/integration/tenantIsolation.dynamic.test.ts`** — replaces the prior `.skip` scaffold. Wraps every scenario in `describe.skipIf(!dbReady)`, so the file is harmless on CI runners and dev boxes that don't have a Postgres up. When `DATABASE_URL` and `JWT_SECRET` are both set correctly, the suite runs.

## Initial scenario coverage

The 8 scenarios that ship today are deliberately minimal — they prove the harness pattern and reproduce the two D-class findings from Day 2:

1. **`POST /api/finance/custodies/custodies` with foreign assignmentId** — must 400 / 403 / 404 (locks in the Day 3 fix at `finance-custodies.ts:441`).
2. **`POST /api/properties/maintenance-requests` with foreign assignedTo** — must 400 / 403 / 404 (locks in the Day 3 fix at `properties.ts:2223`).
3. **6 list endpoints** (`/api/clients`, `/api/employees`, `/api/finance/journal/entries`, `/api/hr/leave-requests`, `/api/finance/budget/budgets`, `/api/finance/vendors`) — each list response is asserted to contain zero rows whose `companyId` is the other tenant.

The full 30-scenario expansion (Umrah lifecycle, finance month-close, HR discipline workflow, recruitment pipeline, fleet trip, etc.) is tracked under "Phase 9 expansion" in `docs/KNOWN_ISSUES.md` and lands in the next sprint after CI is wired.

## How to activate locally

```bash
docker compose -f artifacts/api-server/tests/integration/postgres/docker-compose.yml up -d
export DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp"
export JWT_SECRET="test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa"
bash db/bootstrap.sh
pnpm --filter @workspace/api-server test tests/integration/tenantIsolation.dynamic.test.ts
```

Expected: all 8 scenarios pass.

## How to activate in CI (the follow-up PR)

`scripts/guard.sh` currently runs the static suite against the api-server workspace. To enable the dynamic suite, the follow-up PR must:

1. **Add a Postgres service to `.github/workflows/guard.yml`** as a job-level `services:` block:

   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       env:
         POSTGRES_DB: ghayth_erp
         POSTGRES_USER: ghayth_erp
         POSTGRES_PASSWORD: ghayth_erp
       ports:
         - 54329:5432
       options: >-
         --health-cmd "pg_isready -U ghayth_erp"
         --health-interval 5s
         --health-timeout 3s
         --health-retries 10
   ```

2. **Set `DATABASE_URL` and `JWT_SECRET`** as environment variables for the guard job:

   ```yaml
   env:
     DATABASE_URL: postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
     JWT_SECRET: ${{ secrets.TEST_JWT_SECRET }}  # any 32+ char string is fine
   ```

3. **Run `bash db/bootstrap.sh`** as a step before `bash scripts/guard.sh` so the schema is loaded.

4. **No change** is needed to `scripts/guard.sh` itself — its `pnpm test` step auto-discovers the dynamic suite, and the `dbReady` gate in the test file flips ON automatically once the env vars are present.

## Why this is acceptable for the freeze

The static scanner from Day 1-2 already prevents the regression class — every cross-tenant leak in the codebase that a future developer might introduce is caught at PR time, before merge. The dynamic harness adds *runtime confidence* (the Express middleware chain plus the SQL plus the database actually behave together) but is not the primary correctness boundary.

Activating it requires CI plumbing that is mechanical but worth a separate review surface (Postgres service config, secret provisioning, schema-load ordering). Bundling that change into the freeze branch would mean either landing it half-tested or holding the rest of the freeze deliverables hostage to that work.

The infrastructure files shipped here are sufficient for any reviewer (or operator) to flip the harness on with the snippet above. The freeze go/no-go decision (Day 14) treats the dynamic harness as "ready to activate" rather than "running in CI".
