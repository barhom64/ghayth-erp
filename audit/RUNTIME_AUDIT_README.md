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
