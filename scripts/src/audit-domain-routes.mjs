#!/usr/bin/env node
//
// scripts/src/audit-domain-routes.mjs — Guard #6 (domain route coverage).
//
// Ensures every domain declared in domainRegistry.ts has its routeFile
// imported and mounted in routes/index.ts. Catches the class of bug
// where a new domain is added to the registry but its routes are never
// wired up — meaning the API surface is silently missing.
//
// Algorithm:
//
//   1. Parse DOMAIN_REGISTRY to extract { id, routeFile } for each domain.
//   2. Read routes/index.ts and check that each routeFile is referenced
//      via a `from "./<file>"` import.
//   3. Report any domains whose route file is missing from index.ts.
//
// Usage:
//
//   node scripts/src/audit-domain-routes.mjs
//   pnpm audit:domain-routes
//

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REGISTRY_PATH = join(REPO_ROOT, "artifacts/api-server/src/lib/domainRegistry.ts");
const ROUTES_INDEX_PATH = join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts");

const registrySource = await readFile(REGISTRY_PATH, "utf8");
const indexSource = await readFile(ROUTES_INDEX_PATH, "utf8");

// Extract { id, routeFile } pairs from the registry.
const blockRegex = /id:\s*"([^"]+)"[\s\S]*?routeFile:\s*"([^"]+)"/g;
const domains = [];
let match;
while ((match = blockRegex.exec(registrySource)) !== null) {
  domains.push({ id: match[1], routeFile: match[2] });
}

if (domains.length === 0) {
  console.error("✗ audit:domain-routes: failed to parse DOMAIN_REGISTRY entries");
  process.exit(1);
}

const failures = [];
const seen = new Set();
for (const { id, routeFile } of domains) {
  // Multiple domains may share a routeFile (e.g. recruitment + training share hr.ts).
  if (seen.has(routeFile)) continue;
  seen.add(routeFile);

  const baseName = routeFile.replace(/\.ts$/, "");
  const importPattern = new RegExp(`from\\s+["']\\./${baseName}\\.js["']`);
  if (!importPattern.test(indexSource)) {
    failures.push({ domain: id, routeFile });
  }
}

if (failures.length === 0) {
  console.log(
    `[audit-domain-routes] OK — ${domains.length} domains, ${seen.size} unique route files all mounted in routes/index.ts.`
  );
  process.exit(0);
}

console.error(
  `✗ audit:domain-routes: ${failures.length} domain(s) declare a routeFile that is not imported in routes/index.ts:\n`
);
for (const f of failures) {
  console.error(`   • domain "${f.domain}" → routes/${f.routeFile}`);
}
console.error("");
console.error(
  "   Fix: add `import xxxRouter from \"./<file>.js\";` and `router.use(...)` in routes/index.ts,"
);
console.error("   or remove the routeFile entry from domainRegistry.ts.");
process.exit(1);
