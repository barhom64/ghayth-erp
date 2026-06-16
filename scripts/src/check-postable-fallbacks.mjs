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

// Baselined known offenders. Key = `<relpath-from-SRC>:<purpose>:<fallbackCode>`.
// Empty — the original 6 were repointed to postable leaves in this PR, so the
// guard now enforces a clean baseline (any reappearance fails CI).
const ALLOWLIST = new Set([]);

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

const reCall =
  /resolveAccountCode\(\s*[^,]+,\s*"([a-z_]+)"\s*,\s*"(?:debit|credit)"\s*,\s*"(\d{3,4})"/g;

function main() {
  // Non-postable account codes from the default chart of accounts.
  const boot = readFileSync(BOOTSTRAP, "utf8");
  const nonPostable = new Set();
  const reChart = /code:\s*"(\d{3,4})"[^}\n]*?allowPosting:\s*false/g;
  for (let m; (m = reChart.exec(boot)); ) nonPostable.add(m[1]);

  const offenders = [];
  const baselined = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    reCall.lastIndex = 0;
    for (let m; (m = reCall.exec(text)); ) {
      const [, purpose, code] = m;
      if (!nonPostable.has(code)) continue;
      const lineNo = text.slice(0, m.index).split("\n").length;
      const key = `${relative(SRC, file)}:${purpose}:${code}`;
      const rec = { file: `${file}:${lineNo}`, purpose, code, line: lines[lineNo - 1]?.trim() };
      (ALLOWLIST.has(key) ? baselined : offenders).push(rec);
    }
  }

  if (baselined.length) {
    console.warn(`⚠️  check-postable-fallbacks: ${baselined.length} baselined offender(s) (#2325 — fix in owning track):`);
    for (const o of baselined) console.warn(`    ${o.file}  ${o.purpose} → ${o.code} (non-postable parent)`);
  }

  if (offenders.length) {
    console.error(`\n✗ check-postable-fallbacks: ${offenders.length} NEW fallback(s) point at a non-postable parent account.`);
    console.error(`  A fallback must be a postable leaf (the chart marks these allowPosting:false).`);
    for (const o of offenders) console.error(`    ${o.file}\n      ${o.line}\n      → ${o.purpose} falls back to non-postable ${o.code}`);
    process.exit(1);
  }

  console.log(`✓ check-postable-fallbacks: clean — no new non-postable fallbacks (${baselined.length} baselined).`);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "\0");
if (isDirectRun) main();
