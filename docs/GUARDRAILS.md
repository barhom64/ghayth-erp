# Guardrails — defensive checks that prevent production bugs

**Status:** ✅ Active on `main`
**Entry point:** `pnpm guard` (or `bash scripts/guard.sh`)

This document explains the four-layer guard stack we run on every
commit and every PR. It exists because we keep re-discovering the
same three classes of bugs, and none of them are bugs you can catch
by reading the diff.

---

## 1. The bugs we kept shipping

Between the early HR work and the April 2026 sync merge we hit the
same three classes of production-visible bugs multiple times. Every
one of them would have been caught by a mechanical check run at the
right time:

| # | Bug class | Real example |
| - | --------- | ------------ |
| 1 | **Broken imports** — a page calls a function that no longer exists in the shared file | `pages/hr/*` calling `buildErrorToast` before it existed in `lib/api.ts` |
| 2 | **Orphan pages** — a page file exists under `src/pages/` but nobody imports it, so it's dead code or a hidden feature | `pages/hr/official-letters.tsx` built but never registered in `hrRoutes.tsx` — user got a 404 on `/hr/official-letters` |
| 3 | **Schema drift** — raw SQL references a column name that no longer exists in the schema | `cronScheduler.ts` querying `official_letters."branchId"` after the column was dropped — silent 500s |

None of these are "env var" problems. They're all cases where the
compiler can't save us because the information lives in multiple
files that aren't directly linked by types.

---

## 2. The four guards

Each guard targets one of the bug classes above. They are ordered
fastest-feedback first inside `scripts/guard.sh`:

| # | Guard | Catches | Tool | How |
| - | ----- | ------- | ---- | --- |
| 1 | **Typecheck** | broken imports, wrong signatures, missing exports | `pnpm typecheck` | `tsc --noEmit` on every workspace package |
| 2 | **Pattern lint** | banned legacy patterns (`validationError(res)`, `"حدث خطأ"` toasts, local `requireRole`) | `pnpm lint:patterns` | `scripts/src/lint-patterns.mjs` |
| 3 | **Routes audit** | orphan pages, unreferenced `.tsx` files under `src/pages/` | `pnpm audit:routes` | `scripts/src/audit-routes.mjs` |
| 4 | **Schema drift audit** | quoted SQL identifiers that don't match any column in `db/schema.sql` | `pnpm audit:schema` | `scripts/src/audit-schema-drift.mjs` |

Run the whole stack:

```bash
pnpm guard
```

Typical green run is ~60s on a cold workspace (typecheck dominates).

---

## 3. Where each guard runs

The **same script** runs at three places. If any layer is red, the
code cannot land:

```
Developer types `git commit`
        │
        ▼
┌────────────────────────┐
│ .githooks/pre-commit   │ ← local guard, fast feedback (~60s)
└───────────┬────────────┘
            ▼
      git commit OK
            │
            ▼
     git push origin …
            │
            ▼
┌────────────────────────┐
│ .github/workflows/     │ ← remote guard, cannot be bypassed
│   guard.yml            │
└───────────┬────────────┘
            ▼
     PR is mergeable
```

Both layers call `bash scripts/guard.sh`, so they execute the
identical checks. The CI job exists because `--no-verify` can skip
the pre-commit hook; CI cannot be skipped.

---

## 4. Enabling the local hook

The hook enables itself via `package.json` → `postinstall`, which
runs `scripts/install-hooks.sh` and sets:

```
git config core.hooksPath .githooks
```

If you clone fresh and skip `pnpm install`, enable it manually:

```bash
bash scripts/install-hooks.sh
```

To verify:

```bash
git config --get core.hooksPath
# → .githooks
```

To bypass in a genuine emergency (not for laziness):

```bash
git commit --no-verify
```

Every `--no-verify` commit must be followed by a ship-blocking fix
before the next push.

---

## 5. How each audit script actually works

### 5.1 audit-routes.mjs

**Rule:** every `.tsx` file under `artifacts/ghayth-erp/src/pages/`
must be imported somewhere in the ERP tree (a route file, another
page, a component). If nothing imports it, it's an orphan.

**Algorithm:**

1. Walk all `.ts`/`.tsx` files under `src/`.
2. For every import specifier (`from "@/…"`, `from "./…"`, dynamic
   `import("…")`), resolve it to an absolute filesystem path.
3. Build `Set<absolutePath>` of resolved targets.
4. Every page file must be in that set — or in `ALLOWLIST` inside
   the script.

**Known allowlist (as of this doc being written):**

| Page | Reason |
| ---- | ------ |
| `pages/bi/dashboards-tab.tsx` | pre-existing: built but never wired into `pages/bi.tsx` |
| `pages/bi/kpis-tab.tsx` | same |
| `pages/bi/reports-tab.tsx` | same |
| `pages/communications/letters.tsx` | pre-existing: full feature with no route entry |
| `pages/create/communications/letters-create.tsx` | same |
| `pages/finance.tsx` | pre-existing: redirect stub to `/finance/accounts`, not in any routes file — visiting `/finance` 404s today |

Every line above is a real follow-up task. When a line is removed
from the allowlist, the fix for that page must ship in the same
commit.

### 5.2 audit-schema-drift.mjs

**Rule:** every double-quoted identifier (`"foo"`) inside a
`rawQuery(\`…\`)` template must be either

- the name of a real column in `db/schema.sql`, or
- the name of a real table, or
- a `AS "alias"` (skipped by design), or
- in the tiny `BUILTIN_IDENTIFIERS` list.

**What it catches:**

- typos: `"empoyeeId"` instead of `"employeeId"`
- columns dropped from the ENTIRE schema
- new identifiers introduced by a refactor that forgot to update
  `db/schema.sql`

**What it does NOT catch (accepted weakness):**

- a stale reference to a column that still exists in SOME other
  table. Example: if `branchId` is removed from `official_letters`
  but still exists on `employees`, this script will pass. The full
  per-table analysis would require a real SQL parser tracking JOIN
  aliases, which is a project in itself.

The trade-off is deliberate: **weak check, zero false positives**.
Nobody ignores a green build because the one test was noisy.

### 5.3 Refreshing `db/schema.sql`

When you legitimately add or rename a column, the script will red-
flag you until `db/schema.sql` is refreshed. Do:

```bash
pnpm db:dump-schema
```

and commit the updated dump along with the code change.

---

## 6. When a guard is wrong

Guards aren't holy. If a rule produces a real false positive in a
real codebase, the right response is to improve the rule, not to
disable the guard. Paths for each tool:

| Guard | Where to fix |
| ----- | ------------ |
| typecheck | the offending type / import |
| lint:patterns | `scripts/src/lint-patterns.mjs` — add a rule, don't silence the error |
| audit:routes | `ALLOWLIST` in `scripts/src/audit-routes.mjs`, with a one-line reason |
| audit:schema | `BUILTIN_IDENTIFIERS` in `scripts/src/audit-schema-drift.mjs`, with a one-line reason |

Never `--no-verify` without opening a follow-up task the same day.

---

## 7. How to add a new guard

Rules of thumb before writing a new audit:

1. **It must catch a real bug we shipped.** If you can't name a
   specific incident, the rule is speculative.
2. **It must have zero false positives on `main`.** Land an
   allowlist if needed; never land a noisy rule.
3. **It must run in under 5 seconds on a warm cache.** Typecheck is
   the slow one; everything else should be instant.
4. **It must fail clearly** — the error message must say _what_
   failed, _where_, and _how to fix it_.

Add the script to `scripts/src/`, add a `pnpm …` entry in root
`package.json`, add a `run_step …` line in `scripts/guard.sh`, and
this document needs a new row in §2.

---

## 8. Relationship to `scripts/health-check.sh`

`scripts/health-check.sh` is a **runtime** smoke-test script that
hits the live dev environment:

- live PostgreSQL (`psql "$DATABASE_URL"`) to probe column existence
- live HTTP endpoints (`curl http://localhost:8080/api/...`) to probe
  API health
- live dev-server ports for the four Node processes

It answers the question "is the running system healthy _right now_?"
and must be run after `pnpm dev` with a database attached.

`scripts/guard.sh` (this document) is a **static** check that needs
nothing but the source tree and the schema dump. It answers the
question "is the code that the developer just wrote structurally
sound?" and is what runs at pre-commit / CI time.

Use both:

```bash
# Before every commit — fast, offline:
pnpm guard

# After starting the dev stack — runtime sanity:
bash scripts/health-check.sh
```

---

## 9. History

- **2026-04-16** Initial stack (typecheck + lint:patterns +
  audit:routes + audit:schema) landed on `main` along with the
  `.githooks/pre-commit` wrapper and `guard.yml` CI workflow.
  Discovered 6 pre-existing orphan pages (allowlisted) and 13
  `AS "alias"` false positives that were folded into the detector.
