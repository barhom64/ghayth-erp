import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const OWNER = "barhom64";
const REPO = "ghayth-erp";
const BASE = "/home/runner/workspace";
const CONCURRENCY = 5;
const DELAY_MS = 600;

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".cache", ".config", ".local", ".agents",
  ".upm", "dist", "tmp", "out-tsc", ".expo", ".expo-shared",
  ".vscode", ".idea", "coverage", "attached_assets", "snippets",
  ".replit-artifact",
]);

const IGNORE_FILES = new Set([".replit", "replit.nix", "generated-icon.png"]);
const IGNORE_EXTS = new Set([".zip", ".gz", ".tar", ".tsbuildinfo"]);

function walkDir(dir, basePath) {
  let results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (IGNORE_FILES.has(entry.name) && dir === basePath) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath, basePath));
    } else if (entry.isFile()) {
      if (IGNORE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 50 * 1024 * 1024 || stat.size === 0) continue;
        results.push({ rel: path.relative(basePath, fullPath), full: fullPath });
      } catch {}
    }
  }
  return results;
}

async function ghApi(connectors, endpoint, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await connectors.proxy("github", endpoint, opts);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { _raw: text, _status: res.status }; }
}

async function createBlob(connectors, filePath) {
  const content = fs.readFileSync(filePath).toString("base64");
  for (let retry = 0; retry < 4; retry++) {
    const data = await ghApi(connectors, `/repos/${OWNER}/${REPO}/git/blobs`, "POST", {
      content, encoding: "base64",
    });
    if (data.sha) return data.sha;
    if (data.error?.message?.includes("Rate limit") || data._status === 429) {
      await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
      continue;
    }
    if (retry < 3) { await new Promise(r => setTimeout(r, 1500)); continue; }
    return null;
  }
  return null;
}

async function main() {
  console.log("[sync] Starting GitHub sync...");
  const connectors = new ReplitConnectors();
  const files = walkDir(BASE, BASE);
  console.log(`[sync] ${files.length} files`);

  const refData = await ghApi(connectors, `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  const latestSha = refData.object?.sha;
  if (!latestSha) { console.error("[sync] No ref"); process.exit(1); }
  const commitData = await ghApi(connectors, `/repos/${OWNER}/${REPO}/git/commits/${latestSha}`);
  const baseTree = commitData.tree?.sha;
  console.log(`[sync] Base: ${latestSha.substring(0, 8)}`);

  const treeEntries = [];
  let done = 0;

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async f => {
      const sha = await createBlob(connectors, f.full);
      return sha ? { path: f.rel, mode: "100644", type: "blob", sha } : null;
    }));
    for (const r of results) if (r) treeEntries.push(r);
    done += batch.length;
    if (done % 100 === 0 || done >= files.length) console.log(`[sync] ${done}/${files.length}`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`[sync] ${treeEntries.length} blobs`);
  if (treeEntries.length === 0) { console.error("[sync] No blobs"); process.exit(1); }

  let currentTree = baseTree;
  for (let i = 0; i < treeEntries.length; i += 500) {
    const batch = treeEntries.slice(i, i + 500);
    const tree = await ghApi(connectors, `/repos/${OWNER}/${REPO}/git/trees`, "POST", {
      base_tree: currentTree, tree: batch,
    });
    if (!tree.sha) { console.error("[sync] Tree failed"); process.exit(1); }
    currentTree = tree.sha;
    await new Promise(r => setTimeout(r, 1000));
  }

  const now = new Date().toISOString().replace("T", " ").substring(0, 16);
  const newCommit = await ghApi(connectors, `/repos/${OWNER}/${REPO}/git/commits`, "POST", {
    message: `مزامنة تلقائية — ${now}`,
    tree: currentTree,
    parents: [latestSha],
  });

  await ghApi(connectors, `/repos/${OWNER}/${REPO}/git/refs/heads/main`, "PATCH", {
    sha: newCommit.sha, force: true,
  });

  console.log(`[sync] Done! ${newCommit.sha?.substring(0, 8)}`);
}

main().catch(e => { console.error("[sync]", e.message); process.exit(1); });
