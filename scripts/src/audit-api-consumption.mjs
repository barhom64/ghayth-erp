#!/usr/bin/env node
//
// scripts/src/audit-api-consumption.mjs
//
// Reverse API audit (the inverse of check-frontend-backend-wiring.mjs):
// backend endpoints that NO frontend apiFetch() call consumes. The forward
// audit proves every frontend call resolves to a route; this one surfaces
// routes the SPA never calls — candidates for dead/legacy endpoints OR
// endpoints consumed only by non-SPA clients (portals, webhooks, mobile,
// cron, server-to-server), which are allowlisted by mount prefix.
//
// Method: extract router.METHOD("/sub") per route file, resolve mount
// prefix(es) from routes/index.ts, normalise path params (:id and ${…}) to a
// single ':p' token, then match against normalised frontend apiFetch URLs by
// (method, segment pattern). REPORTS ONLY — never fails the build (consumption
// is a signal, not a contract).
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API = join(ROOT, "artifacts/api-server/src/routes");
const FE = join(ROOT, "artifacts/ghayth-erp/src");

// Mount prefixes whose endpoints are consumed by NON-SPA clients (or are
// infra) — not expected to appear in the web frontend's apiFetch calls.
const NON_SPA_PREFIXES = [
  "/auth", "/portal", "/driver-portal", "/careers", "/public", "/print/verify",
  "/pdpl", "/webhooks", "/health", "/healthz", "/metrics", "/cron", "/internal",
  "/integrations", "/zatca", "/nusk", "/wps", "/.well-known",
];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const norm = (p) =>
  "/" + p.replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((s) => (s.startsWith(":") || s.includes("${") || s.includes("+") ? ":p" : s))
    .join("/");

// ---- mounts: localRouterName -> [prefixes] ----
const indexSrc = await readFile(join(API, "index.ts"), "utf8");
const importName = new Map(); // localName -> route file basename
for (const m of indexSrc.matchAll(/import\s+(\w+)\s+from\s+["']\.\/([\w-]+)\.js["']/g)) importName.set(m[1], m[2]);
const mounts = new Map(); // basename -> Set(prefix)
for (const m of indexSrc.matchAll(/router\.use\(\s*((?:[^()]|\([^()]*\))*)\)/g)) {
  const args = m[1];
  const pm = args.match(/["'`]([^"'`]+)["'`]/);
  const rm = [...args.matchAll(/\b(\w+)\b/g)].map((x) => x[1]).filter((n) => importName.has(n));
  if (!rm.length) continue;
  const prefix = pm ? pm[1] : "";
  for (const rn of rm) {
    const base = importName.get(rn);
    if (!mounts.has(base)) mounts.set(base, new Set());
    mounts.get(base).add(prefix);
  }
}

// ---- backend endpoints ----
const backend = []; // {method, path, loc}
for (const f of await walk(API)) {
  const base = relative(API, f).replace(/\.ts$/, "");
  const prefixes = mounts.get(base);
  if (!prefixes) continue; // unmounted file (index.ts itself, helpers)
  const txt = await readFile(f, "utf8");
  for (const m of txt.matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]*)["'`]/g)) {
    const method = m[1].toUpperCase();
    const sub = m[2];
    const line = txt.slice(0, m.index).split("\n").length;
    for (const pre of prefixes) {
      backend.push({ method, path: norm(`/api${pre}${sub === "/" ? "" : sub}`), loc: `routes/${base}.ts:${line}`, pre });
    }
  }
}

// ---- frontend consumed URLs ----
// The SPA calls the API through several wrappers (lib/api.ts):
//   apiFetch / apiGet / apiPost / apiPut / apiPatch / apiDelete  — URL is 1st arg
//   useApiQuery(["key"], "/url")  /  useApiMutation(["key"], "/url")  — URL is
//     usually the 2nd arg, and calls frequently span multiple lines.
// We capture every "/"-starting string/template literal that appears inside
// each wrapper's call span, so dynamic 2nd-arg URLs are not missed.
const WRAPPER = /\b(?:apiFetch|apiGet|apiPost|apiPut|apiPatch|apiDelete|useApiQuery|useApiMutation)\s*(?:<[^>]*>)?\s*\(/g;
const consumedPaths = new Set();
for (const f of await walk(FE)) {
  const txt = await readFile(f, "utf8");
  for (const w of txt.matchAll(WRAPPER)) {
    let i = w.index + w[0].length - 1, depth = 0; const start = i;
    for (; i < txt.length && i < start + 600; i++) {
      if (txt[i] === "(") depth++;
      else if (txt[i] === ")") { if (--depth === 0) break; }
    }
    const span = txt.slice(start, i + 1);
    for (const lm of span.matchAll(/[`"']([/][^`"'\s]*)[`"']/g)) {
      let url = lm[1].split("?")[0];
      if (!url.startsWith("/")) continue;
      consumedPaths.add(norm(url.startsWith("/api") ? url : `/api${url}`));
    }
  }
}

// ---- match ----
const isAllow = (pre) => NON_SPA_PREFIXES.some((a) => pre === a || pre.startsWith(a + "/") || pre.startsWith(a));
const unconsumed = [];
for (const b of backend) {
  if (isAllow(b.pre)) continue;
  if (consumedPaths.has(b.path)) continue;
  unconsumed.push(b);
}
// de-dup by method+path
const seen = new Set();
const uniq = unconsumed.filter((b) => { const k = `${b.method} ${b.path}`; if (seen.has(k)) return false; seen.add(k); return true; });

console.log(`[audit-api-consumption] backend endpoints (SPA-facing): ${backend.filter(b=>!isAllow(b.pre)).length} · frontend apiFetch URLs: ${consumedPaths.size}`);
console.log(`[audit-api-consumption] UNCONSUMED by SPA (candidates — verify not portal/mobile/legacy): ${uniq.length}`);
const byFile = {};
for (const b of uniq) (byFile[b.loc.split(":")[0]] ??= []).push(`${b.method} ${b.path}`);
for (const [file, eps] of Object.entries(byFile).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`  ${file}  (${eps.length})`);
  for (const e of eps.slice(0, 4)) console.log(`     ${e}`);
  if (eps.length > 4) console.log(`     … +${eps.length - 4} more`);
}
