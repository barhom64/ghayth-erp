#!/usr/bin/env node
/**
 * audit-print-templates — verifies that every manifest in /templates
 * agrees with the runtime implementation in lib/print/templateResolver.ts.
 *
 * Checks:
 *   1. Every manifest parses as JSON and has the required fields.
 *   2. Every manifest with implementation.kind === "bespoke-preset" has a
 *      matching BESPOKE_PRESETS[implementation.key] in templateResolver.ts.
 *   3. Every manifest with entityType matching a registered entity uses an
 *      allowed format (a4 / thermal_80 / etc).
 *
 * Phase 3 of the Print Platform. Wire into guard.sh as `pnpm print:audit`
 * once the registry covers all production entityTypes (currently 15 of 30).
 *
 * Usage:
 *   node scripts/src/audit-print-templates.mjs            # exit 0 if clean
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TEMPLATES_DIR = join(REPO_ROOT, "templates");
const RESOLVER_PATH = join(REPO_ROOT, "artifacts/api-server/src/lib/print/templateResolver.ts");

const REQUIRED_FIELDS = ["code", "version", "locale", "entityType", "layout", "implementation"];
const ALLOWED_KINDS = ["bespoke-preset", "db-template", "universal-fallback"];
const ALLOWED_LAYOUTS = ["a4", "thermal_80", "thermal_58", "label", "excel"];
const ALLOWED_STATUSES = ["draft", "review", "approved", "published", "archived"];

async function walkJson(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkJson(p)));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

async function main() {
  const manifestPaths = await walkJson(TEMPLATES_DIR);
  const resolverSrc = await readFile(RESOLVER_PATH, "utf8");
  // Extract every key registered in the BESPOKE_PRESETS object.
  // We allow both `key:` and `"key":` styles and treat snake_case identifiers.
  // Find the BESPOKE_PRESETS object literal (multi-line, ends with the
  // matching `\n};` on its own line) and pull every snake_case identifier
  // on its left side. The type annotation contains `=>` so we can't use
  // [^=] — anchor on the `= {` opener instead.
  const presetMatch = resolverSrc.match(/const\s+BESPOKE_PRESETS[^{]*=\s*\{([\s\S]*?)\n\};/);
  const presetBody = presetMatch ? presetMatch[1] : "";
  const presetKeys = new Set(
    Array.from(presetBody.matchAll(/^\s*([a-z_]+):\s*\(/gm)).map((m) => m[1]),
  );
  // Also collect every implementation.key referenced from manifests so we
  // can spot the inverse case (a manifest with a typo'd key).
  const implementationKeysSeen = new Set();
  let errors = 0;

  for (const file of manifestPaths) {
    const rel = file.replace(REPO_ROOT, "");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      console.error(`  ❌ ${rel}: invalid JSON — ${err.message}`);
      errors++;
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      if (manifest[f] === undefined) {
        console.error(`  ❌ ${rel}: missing required field "${f}"`);
        errors++;
      }
    }
    if (manifest.layout && !ALLOWED_LAYOUTS.includes(manifest.layout)) {
      console.error(`  ❌ ${rel}: layout "${manifest.layout}" not in ${ALLOWED_LAYOUTS.join(",")}`);
      errors++;
    }
    if (manifest.status && !ALLOWED_STATUSES.includes(manifest.status)) {
      console.error(`  ❌ ${rel}: status "${manifest.status}" not in ${ALLOWED_STATUSES.join(",")}`);
      errors++;
    }
    const impl = manifest.implementation;
    if (impl) {
      if (!ALLOWED_KINDS.includes(impl.kind)) {
        console.error(`  ❌ ${rel}: implementation.kind "${impl.kind}" not in ${ALLOWED_KINDS.join(",")}`);
        errors++;
      }
      if (impl.kind === "bespoke-preset" && impl.key !== "—") {
        implementationKeysSeen.add(impl.key);
        if (!presetKeys.has(impl.key)) {
          console.error(
            `  ❌ ${rel}: implementation.key "${impl.key}" not found in BESPOKE_PRESETS (templateResolver.ts).`
            + `\n     Either add the preset to templateResolver.ts, or set implementation.kind = "universal-fallback".`,
          );
          errors++;
        }
      }
    }
  }

  console.log(`\nScanned ${manifestPaths.length} manifest(s).`);
  console.log(`BESPOKE_PRESETS keys in code: ${[...presetKeys].sort().join(", ") || "(none)"}`);
  if (presetKeys.size > 0) {
    const orphans = [...presetKeys].filter((k) => !implementationKeysSeen.has(k));
    if (orphans.length) {
      console.log(`Presets in code without a manifest: ${orphans.join(", ")}`);
      console.log("  (these are still served by the resolver — manifests are documentation, not gating)");
    }
  }

  if (errors > 0) {
    console.error(`\n✗ audit-print-templates: ${errors} issue(s) found.`);
    process.exit(1);
  }
  console.log("\n✓ audit-print-templates: all manifests agree with the implementation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
