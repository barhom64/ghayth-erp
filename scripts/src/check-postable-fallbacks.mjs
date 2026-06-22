#!/usr/bin/env node
/**
 * check-postable-fallbacks.mjs — guards FIN-NONPOSTABLE-FALLBACK (#2325).
 *
 * Every `resolveAccountCode(company, purpose, side, FALLBACK)` 4th-arg fallback
 * MUST point at a POSTABLE leaf account, never a non-postable parent
 * (`allowPosting: false` in the default chart). When `account_mappings` is
 * empty (the default tenant state) the fallback is what actually posts; a
 * parent code makes `assertPostableAccount` throw — a hard GL failure (silent
 * in the umrah swallow paths).
 *
 * History: #2181 fixed every fallback once, by hand. Then #2044 added
 * `postMaintenanceOwnerBillingGL` with `vat_output → 2200` and re-introduced
 * the bug. A one-time manual pass cannot hold; this lint makes the invariant
 * permanent and fails CI on any NEW offender.
 *
 * The ALLOWLIST baselines offenders that live in other in-flight tracks' files;
 * fix them there, then delete the line. Keys are repo-relative paths (NOT
 * basenames) so a baseline can't accidentally suppress a same-named file
 * elsewhere. Do NOT add new entries.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "artifacts/api-server/src";
const BOOTSTRAP = join(SRC, "lib/companyBootstrap.ts");

// Baselined known offenders. Key = `<relpath-from-SRC>:<fallbackCode>`.
// Legacy fallbacks (other in-flight tracks / old chart numbering) that resolve
// to a non-postable parent OR a code absent from the default chart. Tracked +
// fixed per docs/side-issues/finance-phantom-account-fallbacks.md; delete each
// line as its owning flow repoints it to a postable leaf. Do NOT add NEW entries
// — repoint to a postable leaf instead.
const ALLOWLIST = new Set([
  // CIP capitalization target accounts — fixed-asset module owner decision.
  "routes/finance-algorithms.ts:1530", "routes/finance-algorithms.ts:1500",
  "lib/eventListeners.ts:5200", "lib/eventListeners.ts:6200",
  "lib/umrahCommissionEngine.ts:6200",
  "lib/finance/datafixInventory.ts:1130", "lib/finance/datafixInventory.ts:1140",
  "lib/finance/datafixInventory.ts:2110",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// Every way code injects a DEFAULT account code (4-digit account range [1-6]xxx
// — excludes ZATCA invoice types «388» and thresholds «45000»). #2325 originally
// covered only the resolveAccountCode 4th arg, which let `|| / ?? / default() /
// fallbackCode: / getAccountCodeFromMapping` slip through; this widens the net.
const FALLBACK_PATTERNS = [
  /resolveAccountCode\([^)]*?,\s*"([1-6]\d{3})"\s*\)/g,
  /getAccountCodeFromMapping\([^)]*?,\s*"([1-6]\d{3})"\s*\)/g,
  /fallbackCode:\s*"([1-6]\d{3})"/g,
  /\|\|\s*"([1-6]\d{3})"/g,
  /\?\?\s*"([1-6]\d{3})"/g,
  /default\("([1-6]\d{3})"\)/g,
];

function main() {
  // Postable leaves vs non-postable parents from the default chart of accounts.
  const boot = readFileSync(BOOTSTRAP, "utf8");
  const postable = new Map(); // code → true(leaf) | false(parent)
  for (const line of boot.split("\n")) {
    const m = line.match(/code:\s*"(\d{3,5})"/);
    if (!m || !/name:/.test(line)) continue;
    postable.set(m[1], !/allowPosting:\s*false/.test(line));
  }

  const offenders = [];
  const baselined = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(SRC, file);
    const seen = new Set();
    for (const re of FALLBACK_PATTERNS) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(text)); ) {
        const code = m[1];
        const p = postable.get(code);
        const verdict = p === false ? "non-postable parent" : p === undefined ? "absent from chart" : null;
        if (!verdict) continue;
        const key = `${rel}:${code}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const lineNo = text.slice(0, m.index).split("\n").length;
        const rec = { file: `${file}:${lineNo}`, code, verdict, line: text.split("\n")[lineNo - 1]?.trim() };
        (ALLOWLIST.has(key) ? baselined : offenders).push(rec);
      }
    }
  }

  if (baselined.length) {
    console.warn(`⚠️  check-postable-fallbacks: ${baselined.length} baselined offender(s) (tracked — docs/side-issues/finance-phantom-account-fallbacks.md):`);
    for (const o of baselined) console.warn(`    ${o.file}  → ${o.code} (${o.verdict})`);
  }

  if (offenders.length) {
    console.error(`\n✗ check-postable-fallbacks: ${offenders.length} NEW account fallback(s) point at a non-postable parent or a code absent from the chart.`);
    console.error(`  A fallback must be a POSTABLE leaf (else the journal can't post → user blocked).`);
    for (const o of offenders) console.error(`    ${o.file}\n      ${o.line}\n      → fallback ${o.code} (${o.verdict})`);
    process.exit(1);
  }

  console.log(`✓ check-postable-fallbacks: clean — no new non-postable/phantom fallbacks (${baselined.length} baselined).`);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "\0");
if (isDirectRun) main();
