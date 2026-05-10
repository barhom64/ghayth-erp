#!/usr/bin/env node
// Bundle-size report — walks the Vite build output and reports raw / gzipped
// / brotli sizes per file plus totals. Use this to track JS payload growth
// across PRs and to compare against Odoo / ERPNext / Dolibarr defaults
// (numbers in benchmarks/COMPARISON.md §3).
//
// Usage:
//   pnpm --filter @workspace/ghayth-erp build
//   node benchmarks/frontend/bundle-size.mjs
//
// Set BUILD_DIR to override the default (artifacts/ghayth-erp/dist).

import { readdir, stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync, brotliCompressSync, constants as zlibConst } from "node:zlib";
import path from "node:path";

const BUILD_DIR = process.env.BUILD_DIR
  ? path.resolve(process.env.BUILD_DIR)
  : path.resolve("artifacts/ghayth-erp/dist");

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function classify(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "js";
  if (ext === ".css") return "css";
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"].includes(ext)) return "img";
  if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(ext)) return "font";
  if (ext === ".html") return "html";
  if (ext === ".map") return "map";
  return "other";
}

function fmtKB(n) {
  return (n / 1024).toFixed(1) + " KB";
}

async function main() {
  const files = await walk(BUILD_DIR);
  if (files.length === 0) {
    console.error(`No build output at ${BUILD_DIR}. Run \`pnpm --filter @workspace/ghayth-erp build\` first.`);
    process.exit(1);
  }

  const rows = [];
  const totals = { raw: 0, gzip: 0, brotli: 0 };
  const byKind = {};

  for (const f of files) {
    const s = await stat(f);
    if (!s.isFile()) continue;
    const kind = classify(f);
    const buf = await readFile(f);
    const gz = kind === "img" || kind === "font" ? buf.length : gzipSync(buf).length;
    const br =
      kind === "img" || kind === "font"
        ? buf.length
        : brotliCompressSync(buf, {
            params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 },
          }).length;
    if (kind === "map") continue; // skip source maps
    rows.push({
      file: path.relative(BUILD_DIR, f),
      kind,
      raw: buf.length,
      gzip: gz,
      brotli: br,
    });
    totals.raw += buf.length;
    totals.gzip += gz;
    totals.brotli += br;
    byKind[kind] = byKind[kind] || { raw: 0, gzip: 0, brotli: 0, count: 0 };
    byKind[kind].raw += buf.length;
    byKind[kind].gzip += gz;
    byKind[kind].brotli += br;
    byKind[kind].count++;
  }

  // Top 10 biggest files (by raw size).
  rows.sort((a, b) => b.raw - a.raw);
  console.log(`Top 10 largest files in ${BUILD_DIR}:\n`);
  console.table(
    rows.slice(0, 10).map(r => ({
      file: r.file,
      kind: r.kind,
      raw: fmtKB(r.raw),
      gzip: fmtKB(r.gzip),
      brotli: fmtKB(r.brotli),
    })),
  );

  console.log("\nBy kind:");
  console.table(
    Object.entries(byKind).map(([k, v]) => ({
      kind: k,
      files: v.count,
      raw: fmtKB(v.raw),
      gzip: fmtKB(v.gzip),
      brotli: fmtKB(v.brotli),
    })),
  );

  console.log("\nTotals:");
  console.log(`  raw:    ${fmtKB(totals.raw)}`);
  console.log(`  gzip:   ${fmtKB(totals.gzip)}`);
  console.log(`  brotli: ${fmtKB(totals.brotli)}`);

  const out = path.resolve("benchmarks/results", `bundle-size-${Date.now()}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ buildDir: BUILD_DIR, totals, byKind, rows }, null, 2));
  console.log(`\nResults: ${out}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
