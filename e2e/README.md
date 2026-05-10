# Ghayth ERP — End-to-End Tests

Playwright-based browser + API E2E tests. Complement the unit/integration
tests under `artifacts/api-server/tests/` — those cover code, this covers
the user-visible surface (UI + REST contracts).

## Setup

```bash
# 1. Install workspace deps (from repo root)
pnpm install

# 2. Install Chromium + system deps (one-time)
pnpm --filter @workspace/e2e install-browsers
```

## Running

The tests need both API and frontend running:

```bash
# Terminal 1 — API
pnpm --filter @workspace/api-server dev

# Terminal 2 — Frontend (must be reachable at E2E_BASE_URL)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/ghayth-erp dev

# Terminal 3 — tests
pnpm --filter @workspace/e2e test                # headless
pnpm --filter @workspace/e2e test:ui             # interactive runner
pnpm --filter @workspace/e2e test:headed         # see the browser
```

Reports land in `e2e/playwright-report/`. Open with:

```bash
pnpm --filter @workspace/e2e report
```

## Configuration

| Env var              | Default                 | Notes                                |
| -------------------- | ----------------------- | ------------------------------------ |
| `E2E_BASE_URL`       | `http://localhost:5173` | Frontend URL                         |
| `E2E_API_URL`        | `http://localhost:8080` | API URL                              |
| `E2E_USER_EMAIL`     | `owner@local.test`      | Seed admin from `seedDemoData.ts`    |
| `E2E_USER_PASSWORD`  | `Test1234!`             | Same                                 |

## Current coverage

| Spec                  | What it asserts                                  |
| --------------------- | ------------------------------------------------ |
| `auth.spec.ts`        | Login → dashboard → logout, plus invalid-cred error path |
| `dashboard.spec.ts`   | KPI cards render, no console errors, navigates HR list |
| `import.spec.ts`      | New `/api/import/*` endpoints respond correctly  |

## Adding tests

1. Drop a `.spec.ts` file under `tests/`.
2. Use the `auth.spec.ts` login helper as a template — most flows need it.
3. Tag mobile-only tests with `@mobile` in the title; the `chromium-mobile`
   project picks them up via `grep`.

## CI

Not wired into `pnpm build` on purpose — E2E needs a full stack
(Postgres + api-server + frontend) which the default CI lane doesn't
provide. Add a separate job that:

1. Starts Postgres
2. Runs migrations
3. Boots api-server + frontend
4. Runs `pnpm --filter @workspace/e2e test`
