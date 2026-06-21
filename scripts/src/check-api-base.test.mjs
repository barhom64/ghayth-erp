#!/usr/bin/env node
//
// Pure-logic fixtures for the native-API-origin detector.
// Run:  node scripts/src/check-api-base.test.mjs
//
import { fileHasNativeBreakingApi } from "./check-api-base.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}`); failed++; }
}

console.log("positives — must FLAG");
assert(
  fileHasNativeBreakingApi(`const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");`, false),
  "local relative BASE redefinition (non-resolver file)",
);
assert(
  fileHasNativeBreakingApi("const r = await fetch(`/api/metrics`, {});", false),
  "hardcoded template-literal fetch(`/api…`)",
);
assert(
  fileHasNativeBreakingApi('const r = await fetch("/api/print/preview");', false),
  'hardcoded string fetch("/api…")',
);

console.log("negatives — must NOT flag");
assert(
  !fileHasNativeBreakingApi(`const BASE = import.meta.env.BASE_URL.replace(/\\/$/, "");`, true),
  "BASE_URL allowed inside the resolver file (api.ts)",
);
assert(
  !fileHasNativeBreakingApi("const r = await fetch(`${API_BASE}/api/metrics`, {});", false),
  "fetch built from API_BASE (native-aware)",
);
assert(
  !fileHasNativeBreakingApi('apiFetch("/print/preview", { method: "POST" });', false),
  "apiFetch call (already native-aware)",
);
assert(
  !fileHasNativeBreakingApi("const r = await fetch(uploadURL, { method: 'PUT' });", false),
  "fetch to a presigned absolute URL (not /api)",
);

if (failed) {
  console.error(`\n[check:api-base:test] ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n[check:api-base:test] all assertions passed.");
