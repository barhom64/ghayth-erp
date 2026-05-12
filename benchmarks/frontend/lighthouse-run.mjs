#!/usr/bin/env node
// Lighthouse runner — drives Chrome through a few key Ghayth ERP pages and
// captures Performance/Accessibility/Best-Practices/SEO scores plus Core
// Web Vitals (FCP, LCP, TBT, CLS, Speed Index).
//
// Usage:
//   FRONTEND_URL=http://localhost:5173 node benchmarks/frontend/lighthouse-run.mjs
//
// Requires: a Chromium-based browser available locally and `lighthouse`
// installed (use `pnpm dlx lighthouse@latest` or `npx lighthouse`). This
// script invokes the Lighthouse Node API rather than the CLI so we can
// process structured JSON.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const PAGES = (process.env.LH_PAGES || "/,/dashboard,/employees,/clients").split(",");

async function loadDeps() {
  // These are dynamic imports so the script doesn't fail at parse time when
  // the optional deps aren't installed yet — the user can install on demand.
  const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
    import("lighthouse").catch(() => {
      throw new Error('Missing "lighthouse". Install with: pnpm add -D lighthouse chrome-launcher');
    }),
    import("chrome-launcher").catch(() => {
      throw new Error('Missing "chrome-launcher". Install with: pnpm add -D chrome-launcher');
    }),
  ]);
  return { lighthouse, chromeLauncher };
}

async function run() {
  const { lighthouse, chromeLauncher } = await loadDeps();

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
  });

  const opts = {
    logLevel: "error",
    output: "json",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    port: chrome.port,
  };

  const config = {
    extends: "lighthouse:default",
    settings: {
      formFactor: "desktop",
      throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
      screenEmulation: { mobile: false, width: 1366, height: 768, deviceScaleFactor: 1 },
    },
  };

  const results = [];
  for (const p of PAGES) {
    const url = `${FRONTEND_URL}${p.startsWith("/") ? "" : "/"}${p}`;
    process.stdout.write(`▶ ${url} … `);
    const r = await lighthouse(url, opts, config);
    const lhr = r.lhr;
    const cat = lhr.categories;
    const audits = lhr.audits;
    const summary = {
      url,
      performance: cat.performance?.score,
      accessibility: cat.accessibility?.score,
      bestPractices: cat["best-practices"]?.score,
      seo: cat.seo?.score,
      fcp_ms: audits["first-contentful-paint"]?.numericValue,
      lcp_ms: audits["largest-contentful-paint"]?.numericValue,
      tbt_ms: audits["total-blocking-time"]?.numericValue,
      cls: audits["cumulative-layout-shift"]?.numericValue,
      speedIndex_ms: audits["speed-index"]?.numericValue,
      tti_ms: audits["interactive"]?.numericValue,
      transferSize_kb: Math.round((audits["total-byte-weight"]?.numericValue ?? 0) / 1024),
    };
    results.push(summary);
    console.log(`perf=${(summary.performance ?? 0) * 100} | LCP=${Math.round(summary.lcp_ms)}ms | TBT=${Math.round(summary.tbt_ms)}ms`);
  }

  await chrome.kill();

  console.table(results);
  const out = path.resolve("benchmarks/results", `lighthouse-${Date.now()}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ frontendUrl: FRONTEND_URL, results }, null, 2));
  console.log(`\nResults: ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
