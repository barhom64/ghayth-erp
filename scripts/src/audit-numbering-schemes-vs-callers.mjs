#!/usr/bin/env node
//
// scripts/src/audit-numbering-schemes-vs-callers.mjs
//
// Cross-check between WHAT IS SEEDED (numbering_schemes) and WHAT IS
// ACTUALLY CALLED (issueNumber({ moduleKey, entityKey, ... })) across
// every route + non-route file.
//
// Two ways the system can drift silently:
//
//   1. A scheme is seeded in a migration (e.g. via 213_/214_/215_) but
//      no route ever calls `issueNumber({ moduleKey: <X>, entityKey: <Y> })`
//      with that (X,Y). The scheme rows sit in the DB unused, the UI
//      shows them in settings, operators tweak them — but nothing reads
//      them. Dead config = misleading config.
//
//   2. A route calls `issueNumber({ moduleKey: <X>, entityKey: <Y> })`
//      but no migration ever seeded that (X,Y) combination. On a fresh
//      tenant the service throws "scheme not found" the first time the
//      route runs.
//
// Both are hard to detect by eye. This audit cross-references the two
// sets and exits 1 on either kind of mismatch.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, "artifacts/api-server/src/migrations");
const SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");

// ─── 1. Extract seeded (moduleKey, entityKey) tuples from migrations
async function extractSeededSchemes() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));
  const seeded = new Map(); // "module.entity" → migration filename
  for (const f of files) {
    const src = await readFile(join(MIGRATIONS_DIR, f), "utf8");
    if (!/numbering_schemes/i.test(src)) continue;

    // Seed shape (migration 213 and friends): a CROSS JOIN VALUES with
    // many tuples like:
    //   ('module','entity','displayNameAr','PREFIX', pattern, padLength, ...)
    // and stand-alone INSERTs use the same first-two-columns shape.
    //
    // Parse by walking parenthesis tuples that look like the scheme
    // shape: the first token is module_key snake_case, the second is
    // entity_key snake_case, the third is a display-name string.
    //
    // Skip tuples that don't have those three tokens in that order
    // (so unrelated VALUES tuples in the same migration don't get
    // picked up).
    // (Variant A) Comma-separated tuple: ('mod','ent','display', …)
    // (Variant B) SELECT projection: SELECT c.id, 'mod', 'ent','display', …
    //             — migration 215 uses this shape per-tenant.
    // The regex below covers both: an opening bracket or comma is
    // optional before the leading quote, and a (column or anything) prefix
    // can precede it. We just look for three consecutive quoted tokens
    // where the first two are snake_case and the third is a display name.
    const tupleRe = /(?:\(|,)\s*'([a-z][a-z0-9_]*)'\s*,\s*'([a-z][a-z0-9_]*)'\s*,\s*'([^']*)'/g;
    let mTuple;
    while ((mTuple = tupleRe.exec(src)) !== null) {
      const [, moduleKey, entityKey, third] = mTuple;
      // The third token must look like a display name — either a
      // non-empty string with Arabic letters OR a long-ish English
      // label. Reject obvious non-display tokens like prefixes
      // ('REQ', 'CTR', 'INV') that are 3-letter ALLCAPS.
      if (!third || third.length < 3) continue;
      if (/^[A-Z]{2,8}$/.test(third)) continue;  // looks like a prefix, not a name
      // Filter out CHECK constraint patterns: when the migration
      // defines CHECK ("col" IN ('a','b','c',...)) the regex captures
      // ('a','b','c') as a tuple. The display-name slot would be a
      // bare lowercase token like 'never' / 'yearly' / 'on_submit' —
      // not a real Arabic/English description. Require the display
      // name to contain a non-ASCII character (Arabic) OR a space
      // (multi-word English label).
      const isArabic = /[؀-ۿ]/.test(third);
      const hasSpace = /\s/.test(third);
      if (!isArabic && !hasSpace) continue;
      const key = `${moduleKey}.${entityKey}`;
      if (!seeded.has(key)) seeded.set(key, f);
    }
  }
  return seeded;
}

// ─── 2. Extract called (moduleKey, entityKey) tuples from source code
async function walk(dir, acc = []) {
  const entries = await readdir(dir);
  for (const e of entries) {
    const full = join(dir, e);
    const s = await stat(full);
    if (s.isDirectory()) await walk(full, acc);
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

async function extractCalledSchemes() {
  const files = await walk(SRC_DIR);
  const called = new Map(); // "module.entity" → set of file paths

  // Match issueNumber({ ... }) and pull moduleKey + entityKey from the
  // body. The body is a JS object literal with string-valued keys.
  // Brace-counted to handle nested objects in `metadata`.
  for (const file of files) {
    if (file.includes("/__tests__/") || file.endsWith(".test.ts") || file.endsWith(".spec.ts")) continue;
    const src = await readFile(file, "utf8");
    const rel = file.replace(SRC_DIR + "/", "");
    let i = 0;
    while (true) {
      const needle = "issueNumber({";
      const idx = src.indexOf(needle, i);
      if (idx === -1) break;
      let depth = 1;
      let j = idx + needle.length;
      while (j < src.length && depth > 0) {
        const ch = src[j];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        j++;
      }
      const block = src.slice(idx, j);
      const mModule = block.match(/moduleKey:\s*["']([^"']+)["']/);
      if (mModule) {
        // Literal entityKey case.
        const mEntity = block.match(/entityKey:\s*["']([^"']+)["']/);
        if (mEntity) {
          const key = `${mModule[1]}.${mEntity[1]}`;
          if (!called.has(key)) called.set(key, new Set());
          called.get(key).add(rel);
        } else {
          // Dynamic entityKey case — e.g.
          //   entityKey: direction === "outgoing" ? "outgoing_letter" : "incoming_letter"
          // OR a previously-computed local var. Extract every quoted
          // snake_case token in the block that looks like an entity key
          // and treat each as a potential call. Bounded to the block so
          // unrelated string literals in surrounding code don't pollute.
          const entityKeyLine = block.match(/entityKey:\s*([^,]+),/);
          if (entityKeyLine) {
            const expr = entityKeyLine[1];
            const candidates = [...expr.matchAll(/["']([a-z][a-z0-9_]+)["']/g)].map((m) => m[1]);
            for (const ek of candidates) {
              const key = `${mModule[1]}.${ek}`;
              if (!called.has(key)) called.set(key, new Set());
              called.get(key).add(rel);
            }
          }
          // Helper wrapper case — e.g. issueCorrespondenceNumber that
          // calls issueNumber internally and computes entityKey
          // dynamically. Scan the surrounding file for any string
          // literal matching the *_letter / *_voucher / *_memo / etc
          // patterns used as entity keys. We only do this if the
          // issueNumber call has moduleKey but no entityKey at all
          // (i.e. the dynamic value comes from a parameter).
          if (!entityKeyLine) {
            // Pull entity-key-like string literals from THIS file.
            const fileScoped = [...src.matchAll(/["']([a-z][a-z0-9_]*_(?:letter|voucher|memo|invoice|ticket|case|contract|trip|order|request|receipt|run|group|code))["']/g)].map((m) => m[1]);
            for (const ek of fileScoped) {
              const key = `${mModule[1]}.${ek}`;
              if (!called.has(key)) called.set(key, new Set());
              called.get(key).add(rel);
            }
          }
        }
      }
      i = j;
    }
  }
  return called;
}

async function main() {
  const seeded = await extractSeededSchemes();
  const called = await extractCalledSchemes();

  console.log("");
  console.log("Numbering schemes vs callers cross-check — Issue #1141 stronger guard");
  console.log("");

  // Side A: seeded but never called → dead config.
  const seededOnly = [];
  for (const [key, mig] of seeded.entries()) {
    if (!called.has(key)) seededOnly.push({ key, mig });
  }

  // Side B: called but never seeded → runtime throw on fresh tenant.
  const calledOnly = [];
  for (const [key, files] of called.entries()) {
    if (!seeded.has(key)) calledOnly.push({ key, files: [...files] });
  }

  console.log(`Seeded scheme tuples (moduleKey.entityKey): ${seeded.size}`);
  console.log(`Called scheme tuples in source code:        ${called.size}`);
  console.log(`Overlap:                                    ${seeded.size - seededOnly.length}`);
  console.log("");

  let fail = false;

  if (calledOnly.length > 0) {
    fail = true;
    console.error(`✗ ${calledOnly.length} scheme tuple(s) called by source code with NO seed migration — runtime "scheme not found" on fresh tenants:`);
    for (const x of calledOnly) {
      console.error(`  • ${x.key}`);
      for (const f of x.files) console.error(`      ↳ ${f}`);
    }
    console.error("");
    console.error("  Fix: add the seed to migrations/213_unified_numbering_center.sql, 214_*, or a new migration.");
    console.error("");
  }

  if (seededOnly.length > 0) {
    // Soft warning — seeded-but-uncalled is misleading UX, not broken
    // runtime, so it warns but does not fail CI. Each entry should
    // either get a caller or be removed.
    console.log(`⚠ ${seededOnly.length} scheme tuple(s) seeded but never called by source code (dead config):`);
    for (const x of seededOnly) {
      console.log(`  • ${x.key} (seeded in ${x.mig})`);
    }
    console.log("");
    console.log("  These rows live in numbering_schemes and appear in the settings UI but no");
    console.log("  route actually issues them. Either wire a route or drop the seed.");
    console.log("");
  }

  if (fail) {
    process.exit(1);
  }
  console.log("✓ audit-numbering-schemes-vs-callers: every called (moduleKey,entityKey) has a seed migration.");
  process.exit(0);
}

main().catch((err) => {
  console.error("audit-numbering-schemes-vs-callers: fatal error", err);
  process.exit(2);
});
