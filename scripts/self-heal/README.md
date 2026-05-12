# Self-Heal Loop

Autonomous Claude-powered fixer for table/schema-related runtime errors.

## What it does

A long-running loop that:
1. **Detects** errors via collectors (currently: `check:schema-drift`).
2. **Gathers context** (route file, Drizzle schema slice, live DB columns, recent migrations).
3. **Asks Claude** (via Replit AI Integrations — no API key needed) for a minimal patch.
4. **Validates** the patch against allow-list (paths) + block-list (paths + dangerous SQL) + rate limits.
5. **Applies** in one of two modes:
   - **dry-run** (default): writes the proposal to `.agent-state/proposed/<ts>_<key>.json` for human review.
   - **live**: writes files locally → runs `pnpm typecheck:libs` → writes `_pr_push` state file → the existing
     `PR Push merge_all` workflow opens the PR; `Merge All PRs --watch` then auto-merges if `guard` passes.

## Files

```
scripts/
├── _self_heal_loop.mjs            ← orchestrator (workflow entry point)
└── self-heal/
    ├── config.json                ← tunable: model, intervals, allow/block lists, rate limits
    ├── README.md                  ← this file
    ├── lib/
    │   ├── anthropic.mjs          ← thin REST client for AI Integrations Anthropic proxy
    │   └── state.mjs              ← cooldown/rate-limit state, fix log, proposed/ writer
    ├── collectors/
    │   └── schemaDrift.mjs        ← runs `pnpm run check:schema-drift`, parses FAIL output
    ├── gatherContext.mjs          ← reads route + schema + live columns + recent migrations
    ├── safetyChecks.mjs           ← validateProposal()
    └── applyFix.mjs               ← dryRunApply() / liveApply()
```

State (gitignored, on disk only):
```
.agent-state/
├── cooldowns.json     ← per-error attempt counts + lastAttemptAt
├── fixes-log.jsonl    ← audit trail of every action (dry-run, validation-failed, pr-opened, etc.)
└── proposed/          ← dry-run proposals, one JSON per attempt
```

## Run modes

```bash
# Single pass, dry-run (default — never edits files, never opens PRs):
node scripts/_self_heal_loop.mjs --once

# Continuous loop, dry-run (recommended for first 1-2 weeks):
node scripts/_self_heal_loop.mjs --watch

# Live mode (writes files + opens PRs via _pr_push):
node scripts/_self_heal_loop.mjs --watch --live
```

The recommended Replit workflow is `Self-Heal Loop` with command:
```
node scripts/_self_heal_loop.mjs --watch
```
…starting in dry-run. Switch to `--watch --live` only after reviewing 5–10 dry-run proposals.

## Safety layers

1. **Path allow-list** — model can only write to:
   - `artifacts/api-server/src/routes/<name>.ts`
   - `artifacts/api-server/src/migrations/<NNNN>_<slug>.sql`
   - `lib/db/src/schema/index.ts`
2. **Path block-list** — refuses anything matching `package.json`, `pnpm-lock.yaml`, `.github/workflows/`, `.replit`, or `scripts/self-heal/` (no self-modification).
3. **Content block-list** — refuses patches containing `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, `DELETE FROM ... ;` (no WHERE), `DROP SCHEMA`, `ALTER SYSTEM`.
4. **Rate limits** — max 10 fixes/24h, max 3 fixes/1h (per `config.json`).
5. **Cooldown** — per-error: max 2 retries, ≥6 h between attempts.
6. **`riskLevel: "high"` proposals are ALWAYS rejected** — model is instructed to set high when uncertain.
7. **Local typecheck gate** before writing PR state — broken patches never reach the PR queue.
8. **Guard CI** is the final gate — `Merge All PRs --watch` only merges PRs whose `guard` check is green.

## Adding a new collector

1. Create `scripts/self-heal/collectors/<name>.mjs` exporting `collect(): Finding[]`.
2. A `Finding` is `{ collector, file, id, kind, table?, key }` (use `crypto.createHash('sha1')...slice(0,16)` for `key`).
3. Wire it in `_self_heal_loop.mjs` `runOnce()` and add a flag in `config.json` `collectors`.
4. Update the `SYSTEM_PROMPT` in `_self_heal_loop.mjs` if the new error class needs different fix strategies.

## Observability

```bash
tail -f .agent-state/fixes-log.jsonl | jq .
ls -lt .agent-state/proposed/
cat .agent-state/cooldowns.json | jq .
```

## Tuning

Edit `scripts/self-heal/config.json` — no code change needed for:
- `model` — switch to `claude-opus-4-7` for hardest cases (slower, more expensive).
- `intervalMs` — tighter for active dev (60s), looser overnight (600s).
- `rateLimit` — relax once you trust the loop.
- `allowList.filePathPatterns` — broaden to other safe areas.
