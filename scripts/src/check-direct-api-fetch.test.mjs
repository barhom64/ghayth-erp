#!/usr/bin/env node
// Fixtures for the direct-API-fetch detector.
// Run: node scripts/src/check-direct-api-fetch.test.mjs
import { fileHasDirectApiFetch } from "./check-direct-api-fetch.mjs";

let failed = 0;
const assert = (c, l) => { if (c) console.log(`  ✓ ${l}`); else { console.error(`  ✗ ${l}`); failed++; } };

console.log("positives — must FLAG");
assert(fileHasDirectApiFetch("await fetch(`${BASE}/api/documents/${id}/download`, {})"), "raw fetch ${BASE}/api");
assert(fileHasDirectApiFetch("const r = await fetch(`${API_BASE}/api/metrics`, { credentials: 'include' })"), "raw fetch ${API_BASE}/api");

console.log("negatives — must NOT flag");
assert(!fileHasDirectApiFetch('await apiFetch("/documents/x/download")'), "apiFetch call");
assert(!fileHasDirectApiFetch("await fetch(uploadURL, { method: 'PUT' })"), "presigned absolute upload (not /api)");
assert(!fileHasDirectApiFetch("await fetch(`${BASE}/sw.js`)"), "non-/api asset fetch");

if (failed) { console.error(`\n[check:direct-api-fetch:test] ${failed} failed.`); process.exit(1); }
console.log("\n[check:direct-api-fetch:test] all assertions passed.");
