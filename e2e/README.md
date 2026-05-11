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

Wired up in `.github/workflows/e2e.yml`. The workflow:

1. Boots a postgres:16 service container
2. Loads `db/schema.sql` into it
3. Builds api-server + frontend
4. Installs Playwright Chromium
5. Starts api-server (port 8080) + frontend (port 5173)
6. Waits for both healthchecks to pass
7. Runs `pnpm --filter @workspace/e2e test`
8. Uploads HTML report + server logs on failure

Triggers:
- **`push: main`** — always
- **`workflow_dispatch`** — manual via Actions tab
- **`pull_request` with `e2e` label** — opt-in to keep default PR latency low

Promote to `if: true` (every PR) once the suite stabilises and runtime
stays under ~5 minutes.
