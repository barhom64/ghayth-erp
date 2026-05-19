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

if (failed > 0) {
  console.log(`\nFAIL — ${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll instrumentation aggregator fixtures passed.");
