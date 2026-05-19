#!/usr/bin/env node
// runtime-audit-instrumentation.test.cjs
//
// Phase 1 instrumentation aggregator behaviour. Tests the pure logic
// (memory/fd/health rollup) without spinning up chromium or polling
// /healthz — those need a live server and are exercised by the full
// audit pipeline.
//
// Run:  node scripts/src/runtime-audit-instrumentation.test.cjs
// Exits 0 on pass, 1 on any assertion failure.

"use strict";

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

// Re-implements the aggregator from runtime-audit.cjs verbatim, with
// firstFailureIdx/Route lifted to function args for testability.
function aggregate(samples, firstFailureIdx, firstFailureRoute) {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      firstFailureIdx, firstFailureRoute,
      memoryPeakRss: 0, memoryPeakHeapUsed: 0, memoryDeltaRss: 0,
      fdPeak: null, fdDelta: null,
      browserPagesPeak: 0, browserPagesFinal: 0,
      healthOkSamples: 0, healthFailSamples: 0,
      healthLatencyAvgMs: 0, healthLatencyP95Ms: 0,
      frontendSampleCount: 0, frontendOkSamples: 0, frontendFailSamples: 0,
      frontendLatencyAvgMs: 0, frontendLatencyP95Ms: 0,
    };
  }
  const boot = samples[0];
  const last = samples[samples.length - 1];
  const memRss = samples.map((s) => s.memory.rss);
  const memHeap = samples.map((s) => s.memory.heapUsed);
  const fdVals = samples.map((s) => s.fd).filter((v) => Number.isFinite(v));
  const pages = samples.map((s) => s.browser.pageCount);
  const healthOk = samples.filter((s) => s.health && s.health.ok).length;
  const healthFail = samples.length - healthOk;
  const latencies = samples.map((s) => (s.health && s.health.latencyMs) || 0).sort((a, b) => a - b);
  const lp = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : 0;
  const frontendSamples = samples.filter((s) => s.frontend);
  const frontendOk = frontendSamples.filter((s) => s.frontend.ok).length;
  const frontendFail = frontendSamples.length - frontendOk;
  const frontendLat = frontendSamples.map((s) => s.frontend.latencyMs || 0).sort((a, b) => a - b);
  const flp = (p) => frontendLat.length ? frontendLat[Math.min(frontendLat.length - 1, Math.floor((p / 100) * frontendLat.length))] : 0;
  return {
    sampleCount: samples.length,
    firstFailureIdx, firstFailureRoute,
    memoryPeakRss: Math.max(...memRss),
    memoryPeakHeapUsed: Math.max(...memHeap),
    memoryDeltaRss: last.memory.rss - boot.memory.rss,
    fdPeak: fdVals.length ? Math.max(...fdVals) : null,
    fdDelta: fdVals.length >= 2 ? fdVals[fdVals.length - 1] - fdVals[0] : null,
    browserPagesPeak: Math.max(...pages),
    browserPagesFinal: last.browser.pageCount,
    healthOkSamples: healthOk,
    healthFailSamples: healthFail,
    healthLatencyAvgMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    healthLatencyP95Ms: lp(95),
    frontendSampleCount: frontendSamples.length,
    frontendOkSamples: frontendOk,
    frontendFailSamples: frontendFail,
    frontendLatencyAvgMs: frontendLat.length ? Math.round(frontendLat.reduce((a, b) => a + b, 0) / frontendLat.length) : 0,
    frontendLatencyP95Ms: flp(95),
  };
}

function mkSample(opts) {
  return {
    label: opts.label || "tick",
    atMs: opts.atMs || 0,
    routeIdx: opts.routeIdx ?? 0,
    memory: { rss: opts.rss || 0, heapUsed: opts.heap || 0, heapTotal: 0, external: 0 },
    fd: opts.fd === undefined ? null : opts.fd,
    browser: { contextCount: opts.ctx || 0, pageCount: opts.pages || 0 },
    health: opts.health || null,
  };
}

console.log("aggregate(samples, firstFailureIdx, firstFailureRoute)");

// 1. Empty sample set degrades cleanly
{
  const out = aggregate([], -1, null);
  assert(out.sampleCount === 0, "empty: sampleCount=0");
  assert(out.memoryPeakRss === 0, "empty: memoryPeakRss=0");
  assert(out.firstFailureIdx === -1, "empty: firstFailureIdx passthrough");
  assert(out.fdPeak === null, "empty: fdPeak=null");
}

// 2. Memory peak + delta correctly reflect boot/shutdown
{
  const samples = [
    mkSample({ label: "boot", rss: 100, heap: 50, fd: 30, pages: 1, health: { ok: true, latencyMs: 5 } }),
    mkSample({ label: "tick:10", rss: 250, heap: 120, fd: 35, pages: 1, health: { ok: true, latencyMs: 8 } }),
    mkSample({ label: "tick:20", rss: 400, heap: 200, fd: 40, pages: 1, health: { ok: true, latencyMs: 12 } }),
    mkSample({ label: "shutdown", rss: 380, heap: 190, fd: 38, pages: 1, health: { ok: true, latencyMs: 10 } }),
  ];
  const out = aggregate(samples, -1, null);
  assert(out.sampleCount === 4, "memory: sampleCount=4");
  assert(out.memoryPeakRss === 400, "memory: peak rss = 400");
  assert(out.memoryDeltaRss === 280, "memory: delta = shutdown - boot = 380 - 100 = 280");
  assert(out.fdPeak === 40, "memory: fdPeak=40");
  assert(out.fdDelta === 8, "memory: fdDelta = 38 - 30 = 8");
}

// 3. Browser pages — peak vs final distinction
{
  const samples = [
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1 }),
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 5 }),  // peak
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 2 }),  // recovery
  ];
  const out = aggregate(samples, -1, null);
  assert(out.browserPagesPeak === 5, "pages: peak=5");
  assert(out.browserPagesFinal === 2, "pages: final=2 (recovery after peak)");
}

// 4. Health: ok/fail split + latency stats
{
  const samples = [
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 5 } }),
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: false, latencyMs: 5000, error: "timeout" } }),
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 8 } }),
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 10 } }),
  ];
  const out = aggregate(samples, -1, null);
  assert(out.healthOkSamples === 3, "health: 3 ok");
  assert(out.healthFailSamples === 1, "health: 1 fail");
  assert(out.healthLatencyAvgMs === Math.round((5 + 5000 + 8 + 10) / 4), "health: avg includes the 5s timeout sample");
  assert(out.healthLatencyP95Ms === 5000, "health: p95 reflects worst-case (5000ms outlier)");
}

// 5. First-failure passthrough
{
  const samples = [mkSample({ rss: 100, heap: 50 })];
  const out = aggregate(samples, 47, "/finance/invoices");
  assert(out.firstFailureIdx === 47, "first failure: idx passes through");
  assert(out.firstFailureRoute === "/finance/invoices", "first failure: route passes through");
}

// 6. FD is null on platforms without /proc/self/fd
{
  const samples = [
    mkSample({ rss: 100, heap: 50, fd: null, pages: 0 }),
    mkSample({ rss: 100, heap: 50, fd: null, pages: 0 }),
  ];
  const out = aggregate(samples, -1, null);
  assert(out.fdPeak === null, "no-fd: fdPeak=null");
  assert(out.fdDelta === null, "no-fd: fdDelta=null");
}

// 7. Frontend latency rollup is independent of /healthz rollup
{
  const samples = [
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 5 } }),
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 8 } }),
  ];
  // Mutate to add frontend data on one of the two samples.
  samples[0].frontend = { ok: true, latencyMs: 120, status: 200 };
  samples[1].frontend = { ok: false, latencyMs: 5000, error: "timeout" };
  const out = aggregate(samples, -1, null);
  assert(out.frontendSampleCount === 2, "frontend: counts samples that carry .frontend");
  assert(out.frontendOkSamples === 1, "frontend: ok count");
  assert(out.frontendFailSamples === 1, "frontend: fail count");
  assert(out.frontendLatencyAvgMs === Math.round((120 + 5000) / 2), "frontend: avg includes timeout");
  assert(out.frontendLatencyP95Ms === 5000, "frontend: p95 reflects timeout outlier");
  // /healthz aggregates are unchanged by frontend data.
  assert(out.healthOkSamples === 2, "health unchanged: still 2 ok");
}

// 8. Old samples without `.frontend` field are filtered out gracefully
//    (re-running the aggregator on a pre-PR pack still works).
{
  const samples = [
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 5 } }),
    mkSample({ rss: 100, heap: 50, fd: 10, pages: 1, health: { ok: true, latencyMs: 5 } }),
  ];
  // No .frontend field on any sample.
  const out = aggregate(samples, -1, null);
  assert(out.frontendSampleCount === 0, "no-frontend: count=0");
  assert(out.frontendOkSamples === 0, "no-frontend: ok=0");
  assert(out.frontendLatencyAvgMs === 0, "no-frontend: avg=0");
  assert(out.frontendLatencyP95Ms === 0, "no-frontend: p95=0");
}

// 9. Static guard against the exact bug that produced the DEGRADED
//    verdict: a `key: identifier` line in the metrics block whose
//    identifier has no declaration in the same file. ReferenceError
//    at the metrics-assembly step kills the audit before summary.json
//    is written. node --check doesn't catch this (parser is happy with
//    a reference to a not-yet-declared symbol). This test does.
{
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "runtime-audit.cjs"), "utf8");

  // Walk all `const metrics = { ... };` regions. We do this without a
  // full parser by counting braces from the open of the literal.
  function extractMetricsBlocks(source) {
    const blocks = [];
    const startRe = /\bconst\s+metrics\s*=\s*\{/g;
    let m;
    while ((m = startRe.exec(source)) !== null) {
      const openBraceIdx = source.indexOf("{", m.index);
      let depth = 0;
      let inStr = false;
      let strCh = "";
      let closeIdx = -1;
      for (let i = openBraceIdx; i < source.length; i++) {
        const c = source[i];
        if (inStr) {
          if (c === strCh && source[i - 1] !== "\\") inStr = false;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") { inStr = true; strCh = c; continue; }
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) { closeIdx = i; break; }
        }
      }
      if (closeIdx !== -1) blocks.push(source.slice(openBraceIdx + 1, closeIdx));
    }
    return blocks;
  }

  function extractValueIdentifiers(block) {
    // Match `key: <ident>` where <ident> is a bare identifier (not a
    // call, not a literal, not a template, not a member access). Skip
    // common falsy literals and obvious in-place expressions.
    const out = new Set();
    const lineRe = /^\s*(?:\w+|"[^"]+")\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/gm;
    let m;
    while ((m = lineRe.exec(block)) !== null) {
      const id = m[1];
      // Filter out obvious literals + native globals that don't need
      // a local declaration.
      if (["true", "false", "null", "undefined", "Infinity", "NaN"].includes(id)) continue;
      if (["Math", "Number", "String", "Array", "Object", "JSON", "Date", "process"].includes(id)) continue;
      out.add(id);
    }
    return out;
  }

  function hasDeclaration(source, id, beforeIdx) {
    // True if a `(let|const|var) <id>` declaration exists in `source`
    // BEFORE `beforeIdx`. This is the same scoping rule the metrics
    // block honours at runtime.
    const re = new RegExp(`\\b(?:let|const|var|function)\\s+${id}\\b`);
    const haystack = source.slice(0, beforeIdx);
    return re.test(haystack);
  }

  const blocks = extractMetricsBlocks(src);
  assert(blocks.length >= 1, `static-guard: found ${blocks.length} metrics block(s) — at least one expected`);

  let allDeclared = true;
  for (const block of blocks) {
    const blockStart = src.indexOf(block);
    const ids = extractValueIdentifiers(block);
    for (const id of ids) {
      if (!hasDeclaration(src, id, blockStart)) {
        console.log(`  ✗ static-guard: identifier "${id}" referenced in metrics block but has no declaration above`);
        allDeclared = false;
      }
    }
  }
  assert(allDeclared, "static-guard: every metrics-block value identifier has a backing declaration (prevents apiRestartCount-class ReferenceError)");

  // Negative self-test: ensure the guard would have caught the
  // original DEGRADED bug. Simulate the pre-PR-#693 state by removing
  // the `let apiRestartCount = 0;` declaration from a working copy,
  // re-running just the static check, and expecting it to FAIL.
  const stripped = src.replace(/\n\s*let apiRestartCount\s*=\s*0;.*?\n/, "\n");
  const removed = stripped.length < src.length;
  assert(removed, "self-test: simulated removal of `let apiRestartCount = 0;` works");
  const strippedBlocks = extractMetricsBlocks(stripped);
  let strippedCaught = false;
  for (const block of strippedBlocks) {
    const blockStart = stripped.indexOf(block);
    for (const id of extractValueIdentifiers(block)) {
      if (!hasDeclaration(stripped, id, blockStart)) {
        if (id === "apiRestartCount") strippedCaught = true;
      }
    }
  }
  assert(strippedCaught, "self-test: guard catches apiRestartCount missing — would have prevented the original DEGRADED ReferenceError");
}

if (failed > 0) {
  console.log(`\nFAIL — ${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll instrumentation aggregator fixtures passed.");
