#!/usr/bin/env node
// Self-Heal Loop — autonomous error-fix orchestrator.
//
// Loop:
//   1. Run enabled collectors (currently: schema-drift).
//   2. For each finding:
//      - Skip if in cooldown or already fixed in this session.
//      - Gather context (route file, drizzle schema, live DB columns, recent migrations).
//      - Ask Claude for a structured patch proposal { rootCause, summary, riskLevel, files[], prTitle }.
//      - Validate against allow/block lists + rate limits.
//      - In dry-run mode → save proposal to .agent-state/proposed/ and log.
//      - In live mode → write files, typecheck, write _pr_push state file.
//        (A separate `PR Push merge_all` workflow consumes that state file.)
//   3. Sleep config.intervalMs and repeat.
//
// Modes:
//   --once       Run one pass and exit (default in non-watch contexts).
//   --watch      Run continuously, sleeping between passes.
//   --live       Use live mode (write files + open PRs). Otherwise dry-run.
//
// Env:
//   AI_INTEGRATIONS_ANTHROPIC_API_KEY / _BASE_URL  (auto-set by Replit)
//   DATABASE_URL                                    (for live column lookups)

import fs from "node:fs";
import path from "node:path";
import { collect as collectSchemaDrift } from "./self-heal/collectors/schemaDrift.mjs";
import { gather } from "./self-heal/gatherContext.mjs";
import { validateProposal } from "./self-heal/safetyChecks.mjs";
import { dryRunApply, liveApply } from "./self-heal/applyFix.mjs";
import { ensureDirs, isInCooldown, recordCooldown, appendFixLog, fixesInWindow } from "./self-heal/lib/state.mjs";
import { ask, extractJson } from "./self-heal/lib/anthropic.mjs";

const REPO_ROOT = new URL("../", import.meta.url).pathname;
const CONFIG_PATH = path.join(REPO_ROOT, "scripts/self-heal/config.json");

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const LIVE = args.has("--live");

const log = (...a) => {
  const s = `[self-heal ${new Date().toISOString().slice(11, 19)}] ${a.join(" ")}`;
  console.log(s);
};

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw);
  cfg.mode = LIVE ? "live" : (cfg.mode || "dry-run");
  return cfg;
}

const SYSTEM_PROMPT = `You are a senior backend engineer fixing schema-drift bugs in a TypeScript Express API
(Drizzle ORM + raw pg). You will receive: (1) a drift finding, (2) the route file
that references the missing identifier, (3) the relevant slice of the Drizzle schema,
(4) the live DB columns of the affected table (if any), (5) the recent migration filenames.

Your job: produce a minimal, surgical fix. Two valid strategies:

  A) ADD the missing column/table via a new SQL migration in
     artifacts/api-server/src/migrations/. The migration runner applies new files
     on api-server boot. Migration filenames must match \`\\d{4}_[a-z0-9_]+\\.sql\`
     and use a number HIGHER than any existing one. Idempotent DDL preferred:
     ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, etc.
     If you add a column, ALSO add it to lib/db/src/schema/index.ts on the
     matching pgTable() so Drizzle's typed builder agrees.

  B) RENAME / FIX the route code if the identifier is a typo or stale name —
     update the rawQuery/Drizzle call to use an existing column.

Hard rules:
  - NEVER produce DROP, TRUNCATE, DELETE-without-WHERE, or ALTER SYSTEM.
  - NEVER edit package.json, pnpm-lock.yaml, .github/workflows/, or .replit.
  - Only edit files matching one of:
      artifacts/api-server/src/routes/<file>.ts
      artifacts/api-server/src/migrations/<NNNN>_<slug>.sql
      lib/db/src/schema/index.ts
  - Output the FULL new content of each edited file (not a diff).
  - Keep changes minimal — do not refactor unrelated code.

Respond with a single JSON object ONLY (no prose, no markdown), shape:
{
  "rootCause": "1-2 sentence explanation of why this drift exists",
  "summary": "<70 char summary suitable for a PR title body",
  "riskLevel": "low" | "medium" | "high",
  "strategy": "add-migration" | "fix-route-typo" | "add-schema-only" | "other",
  "prTitle": "fix(<scope>): <description>",
  "files": [
    { "path": "<repo-relative path>", "content": "<full new file content>" }
  ]
}

If you cannot produce a confident fix, return riskLevel:"high" and an empty files array.`;

async function processFinding(finding, cfg) {
  log(`finding ${finding.key}: ${finding.id} in ${finding.file}${finding.table ? ` (table=${finding.table})` : ""}`);

  if (isInCooldown(finding.key, cfg.cooldown.perErrorMinHours, cfg.cooldown.maxRetriesPerError, cfg.mode)) {
    log(`  ⊘ in cooldown (${cfg.mode}) — skipping`);
    return;
  }

  const fixesLastDay = fixesInWindow(24 * 60 * 60 * 1000);
  const fixesLastHour = fixesInWindow(60 * 60 * 1000);
  if (fixesLastDay >= cfg.rateLimit.maxFixesPerDay) { log(`  ⊘ rate-limit (24h)`); return; }
  if (fixesLastHour >= cfg.rateLimit.maxFixesPerHour) { log(`  ⊘ rate-limit (1h)`); return; }

  let context;
  try { context = await gather(finding); }
  catch (e) { log(`  ✗ gather failed: ${e.message}`); recordCooldown(finding.key, "gather-failed"); return; }

  let proposal;
  try {
    const userPayload = JSON.stringify({
      finding,
      route_file: context.files.route,
      drizzle_schema: context.files.drizzleSchema,
      live_db: context.liveDb,
      migrations_dir: context.migrationsDir,
      recent_migrations: context.recentMigrations,
    }, null, 2);
    const { text, usage } = await ask({
      model: cfg.model, system: SYSTEM_PROMPT, user: userPayload, maxTokens: cfg.maxTokens,
    });
    proposal = extractJson(text);
    log(`  ✓ model proposal: strategy=${proposal.strategy} risk=${proposal.riskLevel} files=${proposal.files?.length || 0} tokens=${usage?.input_tokens}/${usage?.output_tokens}`);
  } catch (e) {
    log(`  ✗ model failed: ${e.message}`);
    recordCooldown(finding.key, "model-failed");
    appendFixLog({ action: "model-failed", errorKey: finding.key, error: e.message });
    return;
  }

  const v = validateProposal({
    proposal, config: cfg, fixesLastDay, fixesLastHour,
  });
  if (!v.ok) {
    log(`  ✗ validation failed:\n    ${v.errors.join("\n    ")}`);
    recordCooldown(finding.key, "validation-failed");
    appendFixLog({ action: "validation-failed", errorKey: finding.key, errors: v.errors });
    return;
  }
  if (v.warnings.length) log(`  ⚠ warnings: ${v.warnings.join("; ")}`);

  if (cfg.mode === "dry-run") {
    const r = dryRunApply({ finding, context, proposal });
    log(`  ✓ DRY-RUN proposed → ${r.proposedFile}`);
    recordCooldown(finding.key, "dry-run-proposed");
    return;
  }

  const r = liveApply({ finding, proposal, branchPrefix: cfg.branchPrefix });
  if (!r.success) {
    log(`  ✗ live apply failed: ${r.reason}`);
    recordCooldown(finding.key, `live-failed-${r.reason}`);
    return;
  }
  log(`  ✓ LIVE: wrote pr-push state for branch ${r.branch}`);
  appendFixLog({ action: "pr-opened", errorKey: finding.key, branch: r.branch });
  recordCooldown(finding.key, "pr-opened");
}

async function runOnce(cfg) {
  log(`pass start (mode=${cfg.mode})`);
  let total = 0;
  if (cfg.collectors.schemaDrift?.enabled) {
    let findings = [];
    try { findings = collectSchemaDrift(); } catch (e) { log(`schema-drift collector error: ${e.message}`); }
    log(`schema-drift collector: ${findings.length} finding(s)`);
    for (const f of findings) {
      total++;
      try { await processFinding(f, cfg); }
      catch (e) { log(`finding ${f.key}: orchestrator error: ${e.message}`); }
    }
  }
  log(`pass complete: ${total} finding(s) processed`);
}

async function main() {
  ensureDirs();
  const cfg = loadConfig();
  log(`starting self-heal loop · mode=${cfg.mode} watch=${WATCH} model=${cfg.model}`);
  do {
    try { await runOnce(cfg); } catch (e) { log(`pass ERROR: ${e.stack || e.message}`); }
    if (WATCH) {
      log(`sleep ${Math.round(cfg.intervalMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, cfg.intervalMs));
    }
  } while (WATCH);
}

main().catch((e) => { console.error(`[self-heal] FATAL: ${e.stack || e.message}`); process.exit(1); });
