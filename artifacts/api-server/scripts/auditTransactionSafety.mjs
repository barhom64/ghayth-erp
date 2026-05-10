#!/usr/bin/env node
/**
 * auditTransactionSafety.mjs — find route handlers that perform multiple
 * write operations (INSERT / UPDATE / DELETE / rawExecute) WITHOUT wrapping
 * them in a `withTransaction()` block. These are atomicity hazards: if the
 * second write fails, the first stays committed and the data is left in an
 * inconsistent state.
 *
 * Heuristic — flag a handler when it contains:
 *   2+ rawExecute() / rawQuery (with INSERT/UPDATE/DELETE keyword) calls
 *   AND no surrounding `withTransaction(`
 *
 * Soft signals we DON'T flag (intentional patterns):
 *   - read-then-write (1 SELECT + 1 INSERT) — common, single DML is atomic
 *   - emitEvent / createAuditLog after the write — those run async
 *     fire-and-forget, separate from the request transaction by design
 *   - createNotification / createAuditLog called via background helpers
 *
 * Usage:
 *   node scripts/auditTransactionSafety.mjs           # console table
 *   node scripts/auditTransactionSafety.mjs --json    # JSON report
 *
 * Exit code: 0 always — visibility tool, not a gate.
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..");
const ROUTES_DIR = join(API_ROOT, "src", "routes");

// Match each top-level `router.<verb>("/path", ..., handler)` call so we can
// scope DML detection to one handler at a time.
function* findRouteHandlers(src) {
  const re = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const callStart = re.lastIndex;
    let i = callStart;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      // Skip over string literals so braces/parens inside a string don't
      // confuse the depth counter.
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        i++;
        while (i < src.length) {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === quote) { i++; break; }
          // Template-string interpolation has its own `${...}` braces — we
          // recurse via the outer brace counter by treating `${` as a brace.
          if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
            i += 2;
            let braces = 1;
            while (i < src.length && braces > 0) {
              if (src[i] === "{") braces++;
              else if (src[i] === "}") braces--;
              i++;
            }
            continue;
          }
          i++;
        }
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    const body = src.slice(start, i);
    yield { method: m[1].toUpperCase(), body };
  }
}

function pathOf(body) {
  const m = body.match(/router\.\w+\s*\(\s*["'`]([^"'`]+)["'`]/);
  return m ? m[1] : null;
}

// Count DML operations inside a body. We look for:
//   - rawExecute( + a SQL keyword (INSERT / UPDATE / DELETE) in the call
//   - rawQuery( + INSERT / UPDATE / DELETE (rare but exists)
//   - client.query( with the same — used inside an existing withTransaction
function countDml(body) {
  // Strip out any nested `withTransaction(...)` block — those are already
  // safe and their inner DMLs shouldn't be counted against the outer
  // handler.
  const stripped = removeTransactionBlocks(body);
  const dmlRe = /(rawExecute|rawQuery|client\.query)\s*(?:<[^>]*>)?\s*\(\s*[^)]*?\b(INSERT INTO|UPDATE\s+\w+|DELETE FROM)\b/gi;
  let count = 0;
  let m;
  while ((m = dmlRe.exec(stripped)) !== null) count++;
  return count;
}

function removeTransactionBlocks(body) {
  // Crude but effective: walk through and excise everything between
  // `withTransaction(` and its matching `)`. We don't need this to be
  // perfect — false positives in the DML count are fine because we only
  // flag handlers that have >1 DML AND no withTransaction at all.
  let out = "";
  let i = 0;
  while (i < body.length) {
    const idx = body.indexOf("withTransaction(", i);
    if (idx === -1) { out += body.slice(i); break; }
    out += body.slice(i, idx);
    // Skip past the matching `)`.
    let j = idx + "withTransaction(".length;
    let depth = 1;
    while (j < body.length && depth > 0) {
      const c = body[j];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      j++;
    }
    i = j;
  }
  return out;
}

function hasTransaction(body) {
  return /\bwithTransaction\s*\(/.test(body);
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile() && e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

async function main() {
  const wantJson = process.argv.includes("--json");
  const files = await walk(ROUTES_DIR);
  const findings = [];
  let totalHandlers = 0;
  let totalWithTx = 0;

  for (const f of files) {
    const src = await readFile(f, "utf8");
    const fileName = relative(ROUTES_DIR, f);
    for (const h of findRouteHandlers(src)) {
      totalHandlers++;
      if (hasTransaction(h.body)) totalWithTx++;
      const dmlCount = countDml(h.body);
      if (dmlCount >= 2 && !hasTransaction(h.body)) {
        findings.push({
          file: fileName,
          method: h.method,
          path: pathOf(h.body) ?? "?",
          dmlCount,
        });
      }
    }
  }

  // Sort by DML count desc — highest-risk first.
  findings.sort((a, b) => b.dmlCount - a.dmlCount);

  console.log("\n=== Transaction Safety Audit ===");
  console.log(`Total route handlers:      ${totalHandlers}`);
  console.log(`Use withTransaction():     ${totalWithTx} (${Math.round((totalWithTx * 100) / totalHandlers)}%)`);
  console.log(`Multi-DML w/o transaction: ${findings.length}`);

  if (findings.length === 0) {
    console.log("\n✅ No multi-DML handlers without transaction — clean.");
    process.exit(0);
  }

  // Per-file rollup.
  const byFile = {};
  for (const f of findings) {
    byFile[f.file] = (byFile[f.file] || 0) + 1;
  }
  console.log("\nFiles with most findings:");
  Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([f, n]) => console.log(`  ${String(n).padStart(3)} × ${f}`));

  if (findings.length <= 30) {
    console.log("\nAll findings (DML count · method · path · file):");
    for (const f of findings) {
      console.log(`  ${String(f.dmlCount).padStart(2)}  ${f.method.padEnd(6)} ${f.path.padEnd(50)} (${f.file})`);
    }
  } else {
    console.log("\nTop 30 by DML count:");
    for (const f of findings.slice(0, 30)) {
      console.log(`  ${String(f.dmlCount).padStart(2)}  ${f.method.padEnd(6)} ${f.path.padEnd(50)} (${f.file})`);
    }
    console.log(`\n(...${findings.length - 30} more — see JSON report.)`);
  }

  if (wantJson) {
    const out = join(API_ROOT, "..", "..", "audit", "report", "transaction_safety.json");
    await mkdir(dirname(out), { recursive: true }).catch(() => {});
    await writeFile(
      out,
      JSON.stringify({ generatedAt: new Date().toISOString(), totalHandlers, totalWithTx, findings, byFile }, null, 2),
    );
    console.log(`\nJSON: ${out}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("auditTransactionSafety crashed:", err);
  process.exit(2);
});
