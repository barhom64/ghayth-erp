import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const OWNER = "barhom64";
const REPO = "ghayth-erp";
const BASE = "/home/runner/workspace";
const CONCURRENCY = 8;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".cache", ".config", ".local", ".agents", ".upm",
  "deliverables", "attached_assets",
]);

function walkDir(dir, basePath) {
  let results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath, basePath));
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 50 * 1024 * 1024 || stat.size === 0) continue;
        results.push({ rel: path.relative(basePath, fullPath), full: fullPath, size: stat.size });
      } catch {}
    }
  }
  return results;
}

const connectors = new ReplitConnectors();

process.on("unhandledRejection", (e) => { console.error("UNHANDLED REJ:", e?.message || e); });
process.on("uncaughtException", (e) => { console.error("UNCAUGHT:", e?.message || e); });

async function gh(endpoint, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  for (let r = 0; r < 5; r++) {
    try {
      const res = await connectors.proxy("github", endpoint, opts);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { _raw: text }; }
      return { status: res.status, data };
    } catch (e) {
      if (r < 4) { await new Promise(s => setTimeout(s, 2000 * (r + 1))); continue; }
      return { status: 0, data: { _err: e.message } };
    }
  }
}

async function createBlob(filePath) {
  let content;
  try { content = fs.readFileSync(filePath).toString("base64"); }
  catch (e) { return null; }
  for (let r = 0; r < 4; r++) {
    const { status, data } = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", { content, encoding: "base64" });
    if (data?.sha) return data.sha;
    if (status === 429 || data?.message?.includes("rate limit")) {
      await new Promise(s => setTimeout(s, 5000 * (r + 1)));
      continue;
    }
    if (r < 3) { await new Promise(s => setTimeout(s, 2000)); continue; }
    return null;
  }
  return null;
}

async function main() {
  console.log("=== Replit→GitHub sync (debug) ===");
  const t0 = Date.now();

  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  if (!ref.data.object?.sha) { console.error("no ref:", ref); process.exit(1); }
  const baseCommit = ref.data.object.sha;
  console.log("base commit:", baseCommit.substring(0, 8));

  const files = walkDir(BASE, BASE);
  const totalMB = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
  console.log(`files: ${files.length}, total: ${totalMB.toFixed(1)}MB`);

  const entries = [];
  let done = 0, failed = 0;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const shas = await Promise.all(batch.map(f => createBlob(f.full)));
    shas.forEach((sha, j) => {
      if (sha) entries.push({ path: batch[j].rel, mode: "100644", type: "blob", sha });
      else { failed++; if (failed < 5) console.log("  FAIL:", batch[j].rel); }
    });
    done += batch.length;
    if (done % 200 === 0) {
      const eta = ((Date.now() - t0) / done) * (files.length - done) / 1000;
      console.log(`blobs: ${done}/${files.length} (${entries.length} ok, ${failed} fail, eta ${eta.toFixed(0)}s)`);
    }
  }
  console.log(`blobs done: ${entries.length} ok, ${failed} failed`);
  if (entries.length === 0) process.exit(1);

  console.log("creating tree (single shot, no base) ...");
  const treeRes = await gh(`/repos/${OWNER}/${REPO}/git/trees`, "POST", { tree: entries });
  if (!treeRes.data.sha) {
    console.error("TREE FAILED — status:", treeRes.status);
    console.error("response body:", JSON.stringify(treeRes.data).substring(0, 800));
    process.exit(1);
  }
  console.log("tree:", treeRes.data.sha.substring(0, 8));

  const now = new Date().toISOString().replace("T", " ").substring(0, 16);
  const taskMsg = `Sync from Replit — ${now} (${entries.length} files)`;
  const commitRes = await gh(`/repos/${OWNER}/${REPO}/git/commits`, "POST", {
    message: taskMsg, tree: treeRes.data.sha, parents: [baseCommit],
  });
  if (!commitRes.data.sha) {
    console.error("COMMIT FAILED — status:", commitRes.status);
    console.error("body:", JSON.stringify(commitRes.data).substring(0, 800));
    process.exit(1);
  }
  console.log("commit:", commitRes.data.sha.substring(0, 8));

  const refUpd = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, "PATCH", {
    sha: commitRes.data.sha, force: false,
  });
  if (refUpd.status >= 400) {
    console.error("REF UPDATE FAILED — status:", refUpd.status);
    console.error("body:", JSON.stringify(refUpd.data).substring(0, 800));
    process.exit(1);
  }
  console.log(`SUCCESS — pushed ${entries.length} files as ${commitRes.data.sha.substring(0, 8)} on main`);
  console.log(`took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
