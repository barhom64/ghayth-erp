#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// audit-route-doubling — scan for URL-doubling bugs across mounted routers.
//
// Bug pattern this catches:
//   routes/index.ts:    router.use("/webhooks/cmsv6", fooRouter);
//   routes/foo.ts:      router.post("/cmsv6/:id", ...);
//   Effective path:     /api/webhooks/cmsv6/cmsv6/:id   ← doubled!
//
// This was introduced in #1354 (telematics webhook) and not caught until
// manual review because pure unit tests don't exercise the Express
// routing layer. This script + the supertest in
// tests/unit/cmsv6WebhookHttpSmoke.test.ts together close that gap.
//
// Returns exit code 1 on detection so it can run in CI/pre-push.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = resolve(__dirname, "..", "..", "artifacts", "api-server", "src", "routes");

const indexContent = readFileSync(resolve(ROUTES_DIR, "index.ts"), "utf8");

// Parse mounts of the shape `router.use("/x[/y]", [middlewares...], routerVar)`.
const mountRe = /router\.use\(\s*"(\/[a-z0-9/_-]+)"[^,]*,(?:[^,]*,)*\s*(\w+Router)\b/gi;
const mounts = new Map();
let m;
while ((m = mountRe.exec(indexContent))) {
  const [, path, name] = m;
  if (!mounts.has(name)) mounts.set(name, []);
  mounts.get(name).push(path);
}

// Parse imports of the shape `import X from "./y.js"`.
const importRe = /import\s+(?:\{[^}]+\}\s+from\s+|(\w+)\s+from\s+)"\.\/([a-z0-9-]+)\.js"/gi;
const imports = new Map();
let im;
while ((im = importRe.exec(indexContent))) {
  if (im[1]) imports.set(im[1], im[2]);
}

const issues = [];

for (const [routerVar, mountPaths] of mounts) {
  const file = imports.get(routerVar);
  if (!file) continue;
  const filePath = resolve(ROUTES_DIR, `${file}.ts`);
  if (!existsSync(filePath)) continue;
  const content = readFileSync(filePath, "utf8");

  const innerRe = /router\.(get|post|patch|put|delete)\(\s*"(\/[^"]+)"/g;
  let r;
  while ((r = innerRe.exec(content))) {
    const innerPath = r[2];
    for (const mountPath of mountPaths) {
      const mountTail = mountPath.split("/").filter(Boolean).pop();
      if (!mountTail) continue;
      // Tail is genuinely doubled if inner starts with /tail/ or equals /tail.
      if (innerPath === `/${mountTail}` || innerPath.startsWith(`/${mountTail}/`)) {
        issues.push({
          file: `${file}.ts`,
          mountPath,
          innerPath,
          effective: `${mountPath}${innerPath}`,
        });
      }
    }
  }
}

if (issues.length === 0) {
  console.log("✓ audit-route-doubling: no URL-doubling issues detected across all mounted routers.");
  process.exit(0);
}

console.log(`✗ audit-route-doubling: ${issues.length} potential URL-doubling issue(s):`);
for (const i of issues) {
  console.log(`  ${i.file}: mount=${i.mountPath} + inner=${i.innerPath} → effective=${i.effective}`);
}
console.log("");
console.log("Fix: either change the mount path or the inner route path so the");
console.log("trailing segment of the mount does not repeat at the start of the");
console.log("inner path. See #1354 for the canonical example.");
process.exit(1);
