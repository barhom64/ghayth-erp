# Runtime Audit Runbook

**Harness:** `scripts/src/runtime-audit.cjs`
**Run command:** `pnpm run audit:runtime`
**Outputs:**
- `audit/runtime-audit-results.json` — raw per-route JSON
- `audit/screenshots/<route>.png` — screenshot of every FAIL row
- `FRONTEND_RUNTIME_AUDIT.md` — human-readable per-route table + totals

## What it does

A real headless-Chromium walk of every route exported from
`artifacts/ghayth-erp/src/routes/*.tsx`. For each route the harness:

1. Logs in as `$ADMIN_EMAIL` / `$ADMIN_PASSWORD` via an in-page `fetch`
   (workaround for HttpOnly cookies that Puppeteer can't read otherwise).
2. Seeds `localStorage.erp_assignments` with the admin role so RBAC menus
   render.
3. Resolves any `:id` placeholder by hitting the entity's list API and
   picking the first row (see `ID_RESOLVERS` in the harness for hand-coded
   exceptions).
4. Navigates directly to the resolved URL (`page.goto`, **not** SPA
   history.pushState — that hides redirect bugs).
5. Runs the 5-axis probe:

   | Axis | What it checks | PASS criterion |
   |------|----------------|----------------|
   | A1 — render          | Page mounts, no React error boundary, no Arabic 404 | DOM > 200 chars and no error markers |
   | A2 — data fetch      | At least one `/api/*` 2xx GET on list/detail pages, no 5xx | network event captured |
   | A3 — primary CTA     | Create/edit pages: a primary action button exists & is enabled | label matches `إضافة\|تعديل\|حفظ\|تسجيل\|نشر\|...` |
   | A4 — navigation      | Direct URL lands on the requested path family | `landedPath === expectedPath` (or starts-with) |
   | A5 — runtime smoke   | Create/edit: fill all writable fields then click save and watch for a `POST/PATCH/PUT` to `/api/*`; List: search/pagination/rows/empty-state present | write returns 2xx-4xx (5xx and timeout = FAIL) |

6. Screenshots every FAIL into `audit/screenshots/<route>.png`.
7. Writes incremental progress to `/tmp/runtime-audit/progress.json` and
   the final result to `audit/runtime-audit-results.json`.

## Running it

```bash
# Full run (all 373 routes, ~30-40 min)
pnpm run audit:runtime

# Single batch (debugging)
BATCH=0 BATCH_SIZE=20 node scripts/src/runtime-audit.cjs
```

If your local bash session keeps getting SIGKILL'd by the container,
register the harness as a Replit workflow instead — workflows survive
session lifecycle:

```javascript
await configureWorkflow({
  name: "Runtime Audit",
  command: "ALL=1 node scripts/src/runtime-audit.cjs",
  outputType: "console",
  autoStart: true,
});
```

The workflow finishes when the harness exits; check progress with:

```bash
jq -r '.done' /tmp/runtime-audit/progress.json
```

## After a run

```bash
# Regenerate the markdown report from the JSON
node scripts/src/runtime-audit-report.mjs   # if extracted; otherwise see FRONTEND_RUNTIME_AUDIT.md generation block in the task log

# Inspect a specific FAIL
jq '.results[] | select(.route=="/finance/invoices/create")' audit/runtime-audit-results.json
xdg-open audit/screenshots/finance_invoices_create.png   # or scp to look at it
```

## Honesty contract

- **Do not** silently reclassify FAIL → PASS without re-running the
  harness. Every PASS in `FRONTEND_RUNTIME_AUDIT.md` corresponds to a
  real Chromium navigation that succeeded against the criteria above.
- SKIP is not a soft PASS — it means the axis was not applicable to that
  route (e.g. A3 on a list page) **or** the harness could not reach the
  page at all (e.g. unresolved `:id`). SKIPs are listed in the report
  alongside their reason.
- The previous "1510/1510 (100%)" claim was source-review-only and has
  been retracted in `FRONTEND_TEST_MATRIX.md` and `replit.md`.

## Known limitations

- A5 fills `<input>`, `<textarea>` and `<select>` but does not yet
  interact with custom shadcn primitives (`<Combobox>`, `<DatePicker>`,
  `<RichEditor>`). Forms that depend exclusively on those will see "no
  fillable fields" and the save click may produce a 4xx — still reported
  truthfully as A5 PASS (server responded) or A5 FAIL (no response).
  Follow-up Task #186 hardens this.
- 71 routes SKIP because their list API returns 404 or empty. Follow-up
  Task #187 adds seed data / hand-coded ID resolvers.

## v2 update (2026-05-07)

- **Periodic re-login** every 25 routes (`RELOGIN_EVERY` constant). The 2026-05-07 v1 run had 85 routes bouncing to `/login` near the tail because the JWT in the HttpOnly cookie expired during the ~40-minute walk. With re-login in place the v2 run shows 0 A1 FAIL and 0 A5 FAIL — the only failure mode is A4 navigation, which is a real SPA bug.
- Run with `ALL=1 pnpm run audit:runtime` to walk all 373 routes in one pass; results are written to `/tmp/runtime-audit/all.json` and copied to `audit/runtime-audit-results.json`. Screenshots land in `audit/screenshots/`, one PNG per A4 FAIL.

## Phase 9 update (2026-05-19) — anti-saturation chromium relaunch + bounded relogin

After Phase 1–4 (PRs #694–#697) landed, long runs still wedged on `page.goto`
exceeding 25s in deterministic bursts — symptom of FD / IPC / DOM-worker
creep inside a single chromium process. Phase 9 adds three opt-in knobs and
one safety fix:

| Env var | Default | What it does |
|---|---|---|
| `BROWSER_RELAUNCH_EVERY` | `0` (off) | Close + relaunch the **entire chromium process** every N routes (anti-saturation). Distinct from `BROWSER_RECYCLE_EVERY` (Phase 1) which only recycles the Page. Recommended: `40`. |
| `INSTRUMENT_EVERY` | `0` (off) | Emit a one-line `[instr] idx=…/… rss=…MB heap=…MB api=ok relaunches=… crashes=… relogins=… last=…` every N routes so the operator can correlate slowdown in the live tail without waiting for `instrumentation.json`. Recommended: `25`. |
| `RECYCLE_LOGIN_MAX_ATTEMPTS` | `3` | Cap for the bounded post-relaunch login retry loop in `relaunchChromium()`. Previously a single silent failure left the harness unauthenticated and produced a phantom wave of auth-301 FAILs that looked like app defects. Now exhaustion **throws** to abort the run deterministically. |

Lock-step cookie refresh: `cookieHeader` (the Node-side cookie used by
`resolveParams()`) is now mutable and re-issued via a server-side `login()`
inside `relaunchChromium()` so it stays in sync with the new in-page session.

Recommended invocation for long runs:

```bash
BROWSER_RELAUNCH_EVERY=40 INSTRUMENT_EVERY=25 RECYCLE_LOGIN_MAX_ATTEMPTS=3 \
  ALL=1 node scripts/src/runtime-audit.cjs
```

Counters surfaced in `summary.json`: `browserRelaunches` joins the existing
`pageRecycles` / `chromiumCrashes` / `relogins` / `apiServerRestartsDetected`.
