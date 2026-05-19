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

### Phase 9 anti-saturation knobs (env vars)

The long-lived chromium renderer saturates after ~50-80 routes
(FD/IPC/GPU process accumulation) and starts to deterministically stall
on `page.goto:start` even though the API is healthy. Three knobs control
the mitigation; defaults are safe for the full 397-route walk on Replit.

| Env var | Default | Purpose |
|---|---:|---|
| `BROWSER_RECYCLE_EVERY` | `40` | Close + relaunch chromium every N routes BEFORE saturation. Lower if you see a4-FAIL clusters mid-run; raise for shorter runs to skip the recycle cost (~2-3s each). Setting it ≥ `routes.length` effectively disables recycling. |
| `INSTRUMENT_EVERY` | `25` | Emit a `[instr] idx=… rss=…MB heap=…MB api=…/…ms recycles=… crashes=… relogins=… last=…` line every N routes. Lets you confirm in `run.log` that memory is reclaimed by recycles and the API stayed healthy throughout the run, without attaching a profiler. |
| `RECYCLE_LOGIN_MAX_ATTEMPTS` | `3` | Bounded retries for the post-recycle login. If all attempts fail the harness aborts (fatal) rather than continuing unauthenticated and producing misleading FAIL rows. |

Empirical impact (run-20260519-154303, 397 routes, Replit):
**a4-FAIL 233 → 28 (-88%)**, duration **113 → 46 min**, 0 chromium crashes,
RSS stable at 109-237 MB across 9 recycles. The 28 remaining a4 failures
are real app-side stalls in `/finance/*` (deterministic, not harness noise).

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

## Legacy URL aliases (Task #378)

Some routes intentionally `<Redirect to=...>` to a canonical path on mount
(e.g. `/my-leave-request → /hr/leaves/create`). The harness does
`page.goto(<route>)` and then asserts `landedPath === expectedPath`, so
without help every alias would be reported as an A4 FAIL even though the
user lands on a working page.

The map lives at the top of `scripts/src/runtime-audit.cjs` as the
`ALIAS_REDIRECTS` const:

```js
const ALIAS_REDIRECTS = {
  "/my-leave-request": "/hr/leaves/create",
};
```

**When you add a new `<Redirect to=...>` route, add the
`from → to` pair to `ALIAS_REDIRECTS` in the same PR.** Otherwise the
next runtime audit will FAIL on it and the next engineer has to
rediscover the convention by reading the harness source.

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

## v3 update (2026-05-07, Task #186)

- **Smarter A5 form-field probe.** The probe now also counts `[role=combobox]`, `[role=textbox]`, `[contenteditable="true"]`, and `button[aria-haspopup]` (the Radix/shadcn primitives previous v2 missed). It pre-walks every candidate, focuses each one and sends Escape (700ms grace) to trigger lazy hydration, then reports separate counts as `fields=N(<native>n+<custom>c)`.
- **Phase-2 Radix fill.** After Phase 1 (native + contenteditable), A5 fill clicks the first 12 `button[role=combobox|aria-haspopup=listbox|menu]` triggers and selects the first `[role=option]/[role=menuitem]` for each.
- **Heartbeat noise filter.** Write detection now excludes `intelligence/activity|notifications/seen|telemetry|audit/log|behavioral` so the activity heartbeat POST no longer counts as a form submission. This unmasked 3 real A5 FAILs (`/employees/create`, `/finance/expenses/create`, `/finance/invoices/create`) that v2 falsely reported as PASS.
- **SPA-fallback navigation.** When direct `page.goto(<route>)` bounces to `/dashboard` (the Class N1 SPA bug), the probe now retries via `history.pushState + popstate` so wouter mounts the real page and A5 can still run. The A4 verdict is left untouched (still FAIL); the note is annotated with `spa-fallback` so it is obvious which A5 results came from the fallback path.
- **`CREATE_ONLY=1`** filters the route set to the 70 `/create`/`/edit` pages. **`ROUTES_INCLUDE=route1,route2,...`** runs an arbitrary subset (used to merge two passes when a chromium frame crash kills the browser mid-walk).
- **Goto timeout** raised from 25s → 60s. Even at 60s, 56 create pages still time out under audit load — filed as bug class N3 in `FRONTEND_BUGS.md`.
- **Result file** for the create/edit run is `audit/runtime-audit-create-edit.json` (separate from the full-route file `audit/runtime-audit-results.json` from #185 v2). Per-route table and totals: `FRONTEND_RUNTIME_AUDIT.md` Task #186 section.
