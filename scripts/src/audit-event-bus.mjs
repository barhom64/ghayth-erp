#!/usr/bin/env node
//
// scripts/src/audit-event-bus.mjs
//
// Event-bus reconciliation. The bus is wired as:
//   emitEvent({ action: "x" })  ->  eventBus.emit("x")  ->  eventBus.on("x", …)
// with many DYNAMIC emit forms that defeat naive matching:
//   - inline ternary:   action: cond ? "a.b" : "c.d"
//   - hoisted variable:  const action = cond ? "a.b" : "c.d"; emitEvent({action})
//   - template literal:  emitEvent({ action: `hr.memo.${verb}` })
//   - engine configs:    rulesEngine / entityRegistry dispatch events named in arrays
//
// Because template literals + config-driven dispatch cannot be resolved
// statically, this audit is deliberately CONSERVATIVE about calling a handler
// dead — a false "dead" claim is worse than a missed one:
//
//   DEAD (FAIL)  — subscribed via eventBus.on("x") AND the event name "x"
//                  appears in NO source file other than eventListeners.ts /
//                  eventCatalog.ts. Nothing anywhere can dispatch it, so the
//                  handler can never fire. This is provable and actionable.
//
//   NO-EXPLICIT-EMIT (WARN, non-failing) — subscribed, name appears elsewhere
//                  but not inside any emitEvent()/eventBus.emit()/`action(=|:)`
//                  span we can resolve. Almost always a template-literal or
//                  config-driven emit; listed so a human can confirm dispatch.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(ROOT, "artifacts/api-server/src");
const LISTENER_RE = /eventListeners\.ts$|eventCatalog\.ts$/;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const files = await walk(SRC);
const eventShapeRe = /["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g;
const onRe = /eventBus\.on\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
const emitDirectRe = /eventBus\.emit\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;

const subscribed = new Map();   // event -> first loc
const explicitEmit = new Set(); // events found in a resolvable emit span
const nameSeenOutside = new Set(); // event names appearing anywhere outside listener/catalog

for (const f of files) {
  const txt = await readFile(f, "utf8");
  const rel = relative(ROOT, f);
  const lineAt = (idx) => txt.slice(0, idx).split("\n").length;
  for (const m of txt.matchAll(onRe)) if (!subscribed.has(m[1])) subscribed.set(m[1], `${rel}:${lineAt(m.index)}`);

  if (LISTENER_RE.test(rel)) continue;

  // Any event-shaped literal anywhere outside listener/catalog (covers config
  // arrays, type unions, template-literal *prefixes* won't match but the base
  // const often appears as a literal elsewhere).
  for (const m of txt.matchAll(eventShapeRe)) nameSeenOutside.add(m[1]);

  // Resolvable explicit emits: eventBus.emit("x"); any `action: "x"` literal
  // (covers emits not wrapped in a literal emitEvent( … ) call, e.g. via DLQ
  // helpers); emitEvent( … ) call spans; and `const action|*Event* = … ;`
  // assignment spans (multi-line ternaries).
  for (const m of txt.matchAll(emitDirectRe)) explicitEmit.add(m[1]);
  for (const m of txt.matchAll(/\baction:\s*["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g)) explicitEmit.add(m[1]);
  const harvest = (span) => { for (const m of span.matchAll(eventShapeRe)) explicitEmit.add(m[1]); };
  for (const m of txt.matchAll(/emitEvent\s*\(/g)) {
    let i = m.index + m[0].length - 1, depth = 0; const start = i;
    for (; i < txt.length; i++) { if (txt[i] === "(") depth++; else if (txt[i] === ")") { if (--depth === 0) break; } }
    harvest(txt.slice(start, i + 1));
  }
  for (const m of txt.matchAll(/\b(?:const|let|var)\s+(?:action|eventName|[\w]*[eE]vent[\w]*)\s*=/g)) {
    const semi = txt.indexOf(";", m.index);
    harvest(txt.slice(m.index, semi === -1 ? m.index + 240 : semi));
  }
}

const subs = [...subscribed.keys()];
const dead = subs.filter((e) => !nameSeenOutside.has(e)).sort();
const noExplicit = subs
  .filter((e) => nameSeenOutside.has(e) && !explicitEmit.has(e))
  .sort();

console.log(`[audit-event-bus] subscribed=${subs.length} · explicit-emit=${explicitEmit.size} · names-seen-outside=${nameSeenOutside.size}`);
console.log(`[audit-event-bus] DEAD (name appears nowhere but listeners/catalog): ${dead.length}`);
for (const e of dead) console.log(`   ✗ ${e}   ⟵ ${subscribed.get(e)}`);
console.log(`[audit-event-bus] NO-EXPLICIT-EMIT (verify dynamic/template/config dispatch): ${noExplicit.length}`);
for (const e of noExplicit) console.log(`   • ${e}   ⟵ ${subscribed.get(e)}`);

if (dead.length > 0) {
  console.error(`\n[audit-event-bus] FAIL — ${dead.length} provably-dead handler(s): wire an emitter or remove the eventBus.on().`);
  process.exit(1);
}
console.log(`\n[audit-event-bus] OK — no provably-dead handlers (${noExplicit.length} flagged for dynamic-dispatch verification).`);
