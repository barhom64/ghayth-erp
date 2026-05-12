#!/usr/bin/env node
// api-to-audit-map.mjs — Read-only.
// Scans api-server routes for handlers and detects:
//   - emitEvent / createAuditLog / applyTransition / sendNotification / queueNotification
//   - permission/requireRole guards
// Emits per-route file a list of endpoints with the integration flags.
//
// Output: tooling/_api-audit.json

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const ROUTES = join(REPO, "artifacts/api-server/src/routes");

function scanFile(file) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const endpoints = [];
  // r.post('/x', ...), router.get('/y', ...)
  const re = /\b(?:router|r|app)\.(get|post|put|patch|delete)\(\s*[`"']([^`"']+)[`"']/i;
  // Pre-scan all blocks
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    // Window: next 120 lines or until next route
    const winStart = i;
    let winEnd = i + 1;
    while (winEnd < lines.length && winEnd - winStart < 200) {
      if (re.test(lines[winEnd])) break;
      winEnd++;
    }
    const win = lines.slice(winStart, winEnd).join("\n");
    endpoints.push({
      method: m[1].toUpperCase(),
      path: m[2],
      file: file.replace(REPO + "/", ""),
      line: i + 1,
      hasAudit: /createAuditLog\s*\(/.test(win),
      hasEmitEvent: /emitEvent\s*\(/.test(win),
      hasLifecycle: /applyTransition\s*\(|nextState\s*\(/.test(win),
      hasNotification: /sendNotification\s*\(|queueNotification\s*\(|notify\(/.test(win),
      hasPermission: /\bauthorize\s*\(|requirePermission\s*\(|requireRole\s*\(/.test(win),
      hasTenant: /tenantId|tenant_id|withTenantScope|companyId|assignmentId/.test(win),
      hasTransaction: /\bwithTransaction\s*\(|\bdb\.transaction\s*\(|\bwithTx\s*\(/.test(win),
    });
  }
  return endpoints;
}

const all = [];
for (const f of readdirSync(ROUTES)) {
  if (!f.endsWith(".ts")) continue;
  all.push(...scanFile(join(ROUTES, f)));
}

const OUT = join(__dirname, "_api-audit.json");
writeFileSync(OUT, JSON.stringify(all, null, 2));

const total = all.length;
const writes = all.filter((e) => e.method !== "GET");
const pct = (n) => `${((n / writes.length) * 100).toFixed(0)}%`;
console.log(`api-to-audit-map: ${total} endpoints (${writes.length} writes)`);
console.log(`  with audit       : ${writes.filter((e) => e.hasAudit).length} (${pct(writes.filter((e) => e.hasAudit).length)})`);
console.log(`  with emitEvent   : ${writes.filter((e) => e.hasEmitEvent).length} (${pct(writes.filter((e) => e.hasEmitEvent).length)})`);
console.log(`  with lifecycle   : ${writes.filter((e) => e.hasLifecycle).length} (${pct(writes.filter((e) => e.hasLifecycle).length)})`);
console.log(`  with notify      : ${writes.filter((e) => e.hasNotification).length} (${pct(writes.filter((e) => e.hasNotification).length)})`);
console.log(`  with permission  : ${writes.filter((e) => e.hasPermission).length} (${pct(writes.filter((e) => e.hasPermission).length)})`);
console.log(`  with tenant      : ${writes.filter((e) => e.hasTenant).length} (${pct(writes.filter((e) => e.hasTenant).length)})`);
console.log(`  with transaction : ${writes.filter((e) => e.hasTransaction).length} (${pct(writes.filter((e) => e.hasTransaction).length)})`);
