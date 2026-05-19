#!/usr/bin/env node
// workflow-audit.mjs — Read-only static workflow integrity audit.
//
// Cross-references three independent declarations of "what state
// transitions are legal" that live in the codebase and surfaces every
// place they disagree:
//
//   1. STATE_MACHINES in artifacts/api-server/src/lib/lifecycleEngine.ts
//      — the engine's authoritative transition graph; consulted by
//      `isValidTransition` inside `applyTransition`.
//
//   2. lifecycle.{states, initialState, terminalStates} in
//      artifacts/api-server/src/lib/entityRegistry.ts
//      — the descriptive "documented states" per entity. Not directly
//      read at runtime by `applyTransition` (PR #654 makes
//      `isValidTransition` the single runtime gate), but the registry
//      is what BI / audit reporting / governance docs reference.
//
//   3. `applyTransition({ entity, fromStates, toState, ... })` call
//      sites across artifacts/api-server/src/routes/**.ts
//      — the operational truth: what transitions the routes actually
//      attempt at runtime.
//
// Output:
//   audit/system-review/_workflow-audit.json   (machine-readable)
//   docs/audit/WORKFLOW_AUDIT.md               (human-readable)
//
// Findings categories:
//   - registered-but-unused       — STATE_MACHINES entry with zero
//     `applyTransition` call sites mentioning that entity.
//   - used-but-unregistered       — route does `applyTransition({
//     entity: "X" })` for an entity not in STATE_MACHINES. After
//     PR #654 this is intentional for some entities (warehouse_*,
//     inventory_counts) — the engine trusts the route's `fromStates`
//     whitelist — but each one should be a conscious decision, not
//     drift.
//   - fromState-graph-mismatch    — a route declares `fromStates: [X]`
//     for an entity that IS registered, but the engine's transition
//     graph for X does not list `toState` as reachable from X.
//   - registry-engine-mismatch    — entity registry's `lifecycle.states`
//     and the engine's `STATE_MACHINES` keys disagree on which states
//     exist for the same entity.
//   - direct-status-update        — route does `UPDATE <table> SET
//     "status" = ...` without going through `applyTransition`, which
//     skips the engine gate, audit log, event emission, and lifecycle
//     side-effects.
//   - inconsistent-fromStates     — multiple routes target the same
//     entity with overlapping `toState`s but disjoint `fromStates`
//     whitelists.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const LIFECYCLE_FILE = join(REPO, "artifacts/api-server/src/lib/lifecycleEngine.ts");
const REGISTRY_FILE = join(REPO, "artifacts/api-server/src/lib/entityRegistry.ts");
const ROUTES_DIR = join(REPO, "artifacts/api-server/src/routes");
const OUT_JSON = join(__dirname, "_workflow-audit.json");
const OUT_MD = join(REPO, "docs/audit/WORKFLOW_AUDIT.md");

// ─── 1. Parse STATE_MACHINES from lifecycleEngine.ts ──────────────────

function parseStateMachines() {
  const src = readFileSync(LIFECYCLE_FILE, "utf8");
  const machines = [];
  const entityRe = /entity:\s*"([^"]+)"/g;
  let m;
  while ((m = entityRe.exec(src)) !== null) {
    // Filter out non-STATE_MACHINES references: doc comments, the
    // `entity` field of `ApplyTransitionOptions`, etc. The signal we
    // want is "this `entity:` lives inside an object that also has a
    // `transitions:` field within ~600 chars forward". Without this
    // we false-positive on every interface/comment mention.
    const window = src.slice(m.index, m.index + 1200);
    const transIdx = window.indexOf("transitions:");
    if (transIdx === -1) continue;
    const entity = m[1];
    // Statuscolumn appears BEFORE `transitions:` in the same object.
    const head = window.slice(0, transIdx);
    const statusColMatch = head.match(/statusColumn:\s*"([^"]+)"/);
    // Walk depth-matched braces from `transitions: {` to find the body.
    const tStart = m.index + transIdx + "transitions:".length;
    const openBrace = src.indexOf("{", tStart);
    if (openBrace === -1) continue;
    let depth = 0;
    let close = -1;
    let inStr = false;
    let strCh = "";
    for (let i = openBrace; i < src.length; i++) {
      const c = src[i];
      if (inStr) {
        if (c === strCh && src[i - 1] !== "\\") inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = true; strCh = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close === -1) continue;
    const tBody = src.slice(openBrace + 1, close);
    const transitions = {};
    // Match `<state>: [...]` lines. State key can be bare ident, quoted
    // string, or `"*"`.
    const lineRe = /(?:"([^"]+)"|(\w+)):\s*\[([^\]]*)\]/g;
    let lm;
    while ((lm = lineRe.exec(tBody)) !== null) {
      const from = lm[1] || lm[2];
      const targets = [];
      const inner = lm[3];
      const tRe = /"([^"]+)"/g;
      let tm;
      while ((tm = tRe.exec(inner)) !== null) targets.push(tm[1]);
      transitions[from] = targets;
    }
    machines.push({
      entity,
      statusColumn: statusColMatch ? statusColMatch[1] : "status",
      transitions,
    });
  }
  // The lifecycle file mentions `entity: "..."` in a JSDoc example near
  // the top of the file (line ~22). Drop machines whose transitions map
  // is empty — those are doc artifacts, not real registrations.
  return machines.filter((m) => Object.keys(m.transitions).length > 0);
}

// ─── 2. Parse entityRegistry.ts lifecycle declarations ────────────────

function parseRegistry() {
  const src = readFileSync(REGISTRY_FILE, "utf8");
  // Each entity entry: `{ id: "...", ..., table: "...", lifecycle: { ... } }`
  // Pull (table, lifecycle.{states, initialState, terminalStates}).
  const entries = [];
  const tableRe = /table:\s*"([^"]+)"/g;
  let m;
  while ((m = tableRe.exec(src)) !== null) {
    const table = m[1];
    // Window of 80 lines around this table declaration to extract
    // lifecycle block.
    const start = src.lastIndexOf("\n", m.index);
    const end = src.indexOf("\n  },", m.index);
    if (end === -1) continue;
    const block = src.slice(start, end);
    const lcMatch = block.match(/lifecycle:\s*\{([\s\S]*?)\n\s*\},/);
    if (!lcMatch) continue;
    const lc = lcMatch[1];
    const statusCol = (lc.match(/statusColumn:\s*"([^"]+)"/) || [])[1] || "status";
    const states = [];
    const statesMatch = lc.match(/states:\s*\[([^\]]*)\]/);
    if (statesMatch) {
      const sRe = /"([^"]+)"/g;
      let sm;
      while ((sm = sRe.exec(statesMatch[1])) !== null) states.push(sm[1]);
    }
    const initial = (lc.match(/initialState:\s*"([^"]+)"/) || [])[1] || null;
    const terminals = [];
    const tMatch = lc.match(/terminalStates:\s*\[([^\]]*)\]/);
    if (tMatch) {
      const tRe = /"([^"]+)"/g;
      let tm;
      while ((tm = tRe.exec(tMatch[1])) !== null) terminals.push(tm[1]);
    }
    entries.push({ table, statusColumn: statusCol, states, initialState: initial, terminalStates: terminals });
  }
  return entries;
}

// ─── 3. Scan applyTransition call sites across routes/ ────────────────

function scanApplyTransitionSites() {
  const sites = [];
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const full = join(ROUTES_DIR, f);
    const src = readFileSync(full, "utf8");
    const lines = src.split(/\r?\n/);
    // Find every `applyTransition({` and walk forward to its matching brace.
    const startRe = /applyTransition\(\{/g;
    let sm;
    while ((sm = startRe.exec(src)) !== null) {
      const startIdx = sm.index + "applyTransition(".length;
      // Find matching closing brace+paren.
      let depth = 0;
      let end = -1;
      for (let i = startIdx; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end === -1) continue;
      const block = src.slice(startIdx, end + 1);
      const lineNum = src.slice(0, sm.index).split(/\r?\n/).length;
      const entity = (block.match(/entity:\s*"([^"]+)"/) || [])[1] || null;
      const action = (block.match(/action:\s*"([^"]+)"/) || [])[1] || null;
      const statusCol = (block.match(/statusColumn:\s*"([^"]+)"/) || [])[1] || "status";
      // fromStates: ["a","b"]  OR  fromStates: someConst
      const fromStates = [];
      const fsMatch = block.match(/fromStates:\s*\[([\s\S]*?)\]/);
      const fromStatesDynamic = !fsMatch && /fromStates:\s*\w/.test(block);
      if (fsMatch) {
        const re = /"([^"]+)"/g;
        let mm;
        while ((mm = re.exec(fsMatch[1])) !== null) fromStates.push(mm[1]);
      }
      const toState = (block.match(/toState:\s*"([^"]+)"/) || [])[1] || null;
      const toStateDynamic = !toState && /toState:\s*[a-zA-Z]/.test(block);
      sites.push({
        file: `artifacts/api-server/src/routes/${f}`,
        line: lineNum,
        entity,
        action,
        statusColumn: statusCol,
        fromStates,
        fromStatesDynamic,
        toState,
        toStateDynamic,
      });
    }
  }
  return sites;
}

// ─── 4. Scan direct UPDATE … SET "status" = … bypasses ────────────────

function scanDirectStatusUpdates() {
  const hits = [];
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const full = join(ROUTES_DIR, f);
    const src = readFileSync(full, "utf8");
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for raw SQL UPDATE statements that set a status-like column.
      // Examples we care about:
      //   UPDATE warehouse_products SET status = ...
      //   UPDATE foo SET "status" = ...
      //   UPDATE bar SET "approvalStatus" = ...
      if (!/UPDATE\s+\w+/i.test(line)) continue;
      if (!/\bSET\b[\s\S]{0,160}(?:"?status"?|"?approvalStatus"?|"?lifecycle_state"?)\s*=/i.test(line + " " + (lines[i + 1] || ""))) continue;
      // Skip the lifecycleEngine itself (legitimate engine-internal SET).
      if (/applyTransition/.test(lines.slice(Math.max(0, i - 8), i).join(" "))) continue;
      const tableMatch = line.match(/UPDATE\s+(\w+)/i);
      const table = tableMatch ? tableMatch[1] : "<unknown>";
      hits.push({
        file: `artifacts/api-server/src/routes/${f}`,
        line: i + 1,
        table,
        snippet: line.trim().slice(0, 140),
      });
    }
  }
  return hits;
}

// ─── 5. Classify findings ─────────────────────────────────────────────

function buildFindings({ machines, registry, sites, directUpdates }) {
  const machineByEntity = new Map();
  for (const m of machines) {
    const key = m.statusColumn !== "status" ? `${m.entity}::${m.statusColumn}` : m.entity;
    machineByEntity.set(key, m);
    if (!machineByEntity.has(m.entity)) machineByEntity.set(m.entity, m);
  }
  const registryByTable = new Map(registry.map((r) => [r.table, r]));
  const siteEntities = new Set(sites.map((s) => s.entity).filter(Boolean));

  const findings = {
    registeredButUnused: [],
    usedButUnregistered: [],
    fromStateGraphMismatch: [],
    registryEngineMismatch: [],
    directStatusUpdate: directUpdates,
    inconsistentFromStates: [],
  };

  // registeredButUnused: STATE_MACHINES entity has zero applyTransition sites.
  for (const m of machines) {
    if (!siteEntities.has(m.entity)) {
      findings.registeredButUnused.push({
        entity: m.entity,
        statusColumn: m.statusColumn,
        transitions: m.transitions,
      });
    }
  }

  // usedButUnregistered: applyTransition references entity not in STATE_MACHINES.
  const seenUnreg = new Set();
  for (const s of sites) {
    if (!s.entity) continue;
    const key = s.statusColumn !== "status" ? `${s.entity}::${s.statusColumn}` : s.entity;
    if (!machineByEntity.has(key) && !machineByEntity.has(s.entity)) {
      const trackKey = `${s.entity}::${s.statusColumn}`;
      if (seenUnreg.has(trackKey)) continue;
      seenUnreg.add(trackKey);
      findings.usedButUnregistered.push({
        entity: s.entity,
        statusColumn: s.statusColumn,
        sampleSite: `${s.file}:${s.line}`,
      });
    }
  }

  // fromStateGraphMismatch: route's (fromStates × toState) isn't allowed by
  // the engine's transition graph for a REGISTERED entity.
  for (const s of sites) {
    if (!s.entity || s.fromStatesDynamic || s.toStateDynamic) continue;
    if (s.fromStates.length === 0 || !s.toState) continue;
    const machine = machineByEntity.get(`${s.entity}::${s.statusColumn}`) || machineByEntity.get(s.entity);
    if (!machine) continue; // unregistered → handled by usedButUnregistered
    for (const from of s.fromStates) {
      const allowed = machine.transitions[from] || machine.transitions["*"];
      if (!allowed || !allowed.includes(s.toState)) {
        findings.fromStateGraphMismatch.push({
          file: s.file,
          line: s.line,
          entity: s.entity,
          action: s.action,
          attempted: `${from} → ${s.toState}`,
          engineAllowsFrom: allowed || [],
        });
      }
    }
  }

  // registryEngineMismatch: registry states vs engine state-graph keys for same entity.
  for (const r of registry) {
    const machine = machineByEntity.get(`${r.table}::${r.statusColumn}`) || machineByEntity.get(r.table);
    if (!machine) {
      // Registry has lifecycle but engine has no state machine — this is
      // intentional for some entities (engine trusts route fromStates),
      // but it's still worth flagging so governance can audit each.
      findings.registryEngineMismatch.push({
        table: r.table,
        kind: "registry-only",
        registryStates: r.states,
        registryInitial: r.initialState,
        registryTerminals: r.terminalStates,
      });
      continue;
    }
    const engineStates = new Set(Object.keys(machine.transitions));
    for (const t of Object.values(machine.transitions)) for (const tt of t) engineStates.add(tt);
    const registryStates = new Set(r.states);
    const inRegistryNotEngine = [...registryStates].filter((s) => !engineStates.has(s) && s !== "*");
    const inEngineNotRegistry = [...engineStates].filter((s) => !registryStates.has(s) && s !== "*");
    if (inRegistryNotEngine.length > 0 || inEngineNotRegistry.length > 0) {
      findings.registryEngineMismatch.push({
        table: r.table,
        kind: "state-set-disagrees",
        registryOnlyStates: inRegistryNotEngine,
        engineOnlyStates: inEngineNotRegistry,
      });
    }
  }

  // inconsistentFromStates: two routes hit (entity, toState) with disjoint fromStates.
  const byEntityTo = new Map();
  for (const s of sites) {
    if (!s.entity || !s.toState || s.fromStatesDynamic) continue;
    const key = `${s.entity}::${s.toState}`;
    if (!byEntityTo.has(key)) byEntityTo.set(key, []);
    byEntityTo.get(key).push(s);
  }
  for (const [key, group] of byEntityTo.entries()) {
    if (group.length < 2) continue;
    const sets = group.map((g) => new Set(g.fromStates));
    const allEqual = sets.every((s) => s.size === sets[0].size && [...s].every((x) => sets[0].has(x)));
    if (!allEqual) {
      findings.inconsistentFromStates.push({
        key,
        sites: group.map((g) => ({
          file: g.file,
          line: g.line,
          action: g.action,
          fromStates: g.fromStates,
        })),
      });
    }
  }

  return findings;
}

// ─── 6. Render markdown ───────────────────────────────────────────────

function renderMarkdown({ machines, registry, sites, findings }) {
  const today = new Date().toISOString().slice(0, 10);
  const md = [];
  md.push(`# Workflow Integrity Audit — static`);
  md.push("");
  md.push(`Generated: ${today}`);
  md.push("");
  md.push(`> **Read-only.** This file is regenerated by`);
  md.push(`> \`node audit/system-review/tooling/workflow-audit.mjs\`. Do not`);
  md.push(`> hand-edit. Each finding here should turn into an issue or a`);
  md.push(`> small PR; the audit is the static evidence trail.`);
  md.push("");
  md.push(`## Inventory`);
  md.push("");
  md.push(`| Source | Count |`);
  md.push(`|---|---|`);
  md.push(`| \`STATE_MACHINES\` entries in \`lifecycleEngine.ts\` | **${machines.length}** |`);
  md.push(`| Entities with \`lifecycle\` block in \`entityRegistry.ts\` | **${registry.length}** |`);
  md.push(`| \`applyTransition({ ... })\` call sites across \`routes/\` | **${sites.length}** |`);
  md.push(`| Unique entities referenced from routes | **${new Set(sites.map((s) => s.entity).filter(Boolean)).size}** |`);
  md.push("");

  function section(title, items, render) {
    md.push(`## ${title}`);
    md.push("");
    md.push(`**${items.length}** finding${items.length === 1 ? "" : "s"}.`);
    md.push("");
    if (items.length === 0) {
      md.push("_None._");
      md.push("");
      return;
    }
    for (const it of items) {
      md.push(render(it));
      md.push("");
    }
  }

  section(
    "1. Registered but unused state machines",
    findings.registeredButUnused,
    (f) => `- **${f.entity}** (column \`${f.statusColumn}\`) — declared in \`STATE_MACHINES\` but zero route call-sites. Transitions: \`${JSON.stringify(f.transitions)}\`. Either dead, or the entity is mutated via direct SQL (cross-check section 5).`
  );

  section(
    "2. Used but unregistered (engine trusts route)",
    findings.usedButUnregistered,
    (f) => `- **${f.entity}** (column \`${f.statusColumn}\`) — \`applyTransition\` is called for this entity but \`STATE_MACHINES\` has no entry. After PR #654 this is supported (engine bypasses \`isValidTransition\` and trusts the route's \`fromStates\`), but each unregistered entity should be a conscious decision. Sample site: \`${f.sampleSite}\`.`
  );

  section(
    "3. Route-engine fromState graph mismatch",
    findings.fromStateGraphMismatch,
    (f) => `- \`${f.file}:${f.line}\` (\`${f.action ?? "?"}\`) — route declares \`${f.attempted}\` but engine graph for \`${f.entity}\` from \`${f.attempted.split(" → ")[0]}\` only allows \`${JSON.stringify(f.engineAllowsFrom)}\`. **Will throw \`LifecycleError\` at runtime.**`
  );

  section(
    "4. Registry ↔ engine state-set disagreement",
    findings.registryEngineMismatch,
    (f) => f.kind === "registry-only"
      ? `- **${f.table}** — has \`lifecycle\` in \`entityRegistry.ts\` (states: \`${JSON.stringify(f.registryStates)}\`, initial: \`${f.registryInitial}\`, terminals: \`${JSON.stringify(f.registryTerminals)}\`) but NO matching entry in \`STATE_MACHINES\`. Governance reports will reference states the runtime engine has no opinion on.`
      : `- **${f.table}** — registry-only states: \`${JSON.stringify(f.registryOnlyStates)}\` ; engine-only states: \`${JSON.stringify(f.engineOnlyStates)}\`. One of the two declarations is stale.`
  );

  section(
    "5. Direct status UPDATE bypassing the engine",
    findings.directStatusUpdate,
    (f) => `- \`${f.file}:${f.line}\` (table \`${f.table}\`): \`${f.snippet}\` — bypasses \`applyTransition\` ⇒ no engine state-validation, no audit log entry, no event emission, no lifecycle side-effects.`
  );

  section(
    "6. Inconsistent fromStates across routes",
    findings.inconsistentFromStates,
    (f) => {
      const [entity, toState] = f.key.split("::");
      const rows = f.sites.map((s) => `    - \`${s.file}:${s.line}\` (\`${s.action ?? "?"}\`) fromStates: \`${JSON.stringify(s.fromStates)}\``).join("\n");
      return `- **${entity} → ${toState}** has disjoint route-level whitelists:\n${rows}`;
    }
  );

  md.push(`## Reproducing this audit`);
  md.push("");
  md.push(`\`\`\`bash`);
  md.push(`node audit/system-review/tooling/workflow-audit.mjs`);
  md.push(`\`\`\``);
  md.push("");
  md.push(`Re-running regenerates both this file and`);
  md.push(`\`audit/system-review/tooling/_workflow-audit.json\`. The script is`);
  md.push(`read-only — it touches no application code.`);
  md.push("");

  return md.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  const machines = parseStateMachines();
  const registry = parseRegistry();
  const sites = scanApplyTransitionSites();
  const directUpdates = scanDirectStatusUpdates();
  const findings = buildFindings({ machines, registry, sites, directUpdates });

  if (!existsSync(dirname(OUT_MD))) mkdirSync(dirname(OUT_MD), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify({ machines, registry, sites, findings }, null, 2));
  writeFileSync(OUT_MD, renderMarkdown({ machines, registry, sites, findings }));

  const summary = {
    "STATE_MACHINES entries": machines.length,
    "entityRegistry lifecycles": registry.length,
    "applyTransition call sites": sites.length,
    "registered-but-unused": findings.registeredButUnused.length,
    "used-but-unregistered": findings.usedButUnregistered.length,
    "fromState graph mismatch": findings.fromStateGraphMismatch.length,
    "registry-engine mismatch": findings.registryEngineMismatch.length,
    "direct status UPDATE bypasses": findings.directStatusUpdate.length,
    "inconsistent fromStates": findings.inconsistentFromStates.length,
  };
  console.log("workflow-audit:");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${String(v).padStart(4)} × ${k}`);
  }
  console.log(`→ ${OUT_JSON}`);
  console.log(`→ ${OUT_MD}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();

export { parseStateMachines, parseRegistry, scanApplyTransitionSites, scanDirectStatusUpdates, buildFindings };
