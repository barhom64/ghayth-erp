import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const OWNER = "barhom64";
const REPO = "ghayth-erp";
const BASE = "/home/runner/workspace";
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".cache", ".config", ".local", ".agents", ".upm",
  "dist", "build", ".vite", ".vite-temp", "deliverables", "attached_assets",
]);
const SKIP_EXT = new Set([".zip", ".tar", ".tgz", ".gz"]);

function walkDir(dir) {
  let results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (entry.isFile()) {
      try {
        if (SKIP_EXT.has(path.extname(entry.name).toLowerCase())) continue;
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 * 1024 || stat.size === 0) continue;
        results.push({ rel: path.relative(BASE, fullPath), full: fullPath, size: stat.size });
      } catch {}
    }
  }
  return results;
}

function gitBlobSha(filePath) {
  const content = fs.readFileSync(filePath);
  const header = `blob ${content.length}\0`;
  return crypto.createHash("sha1").update(header).update(content).digest("hex");
}

const c = new ReplitConnectors();

async function gh(endpoint, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  for (let r = 0; r < 5; r++) {
    try {
      const res = await c.proxy("github", endpoint, opts);
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

async function main() {
  const t0 = Date.now();
  console.log("[smart-sync] start");

  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  const baseCommit = ref.data.object?.sha;
  if (!baseCommit) { console.error("no ref:", ref); process.exit(1); }
  console.log("[smart-sync] base:", baseCommit.substring(0, 8));

  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${baseCommit}`);
  const baseTree = commit.data.tree?.sha;
  console.log("[smart-sync] base tree:", baseTree?.substring(0, 8));

  console.log("[smart-sync] fetching remote tree (recursive)...");
  const remote = await gh(`/repos/${OWNER}/${REPO}/git/trees/${baseTree}?recursive=1`);
  if (!remote.data.tree) { console.error("tree fetch failed:", remote); process.exit(1); }
  const remoteMap = new Map();
  for (const t of remote.data.tree) {
    if (t.type === "blob") remoteMap.set(t.path, t.sha);
  }
  console.log("[smart-sync] remote blobs:", remoteMap.size, "truncated:", remote.data.truncated);

  console.log("[smart-sync] scanning local files + computing SHAs...");
  const local = walkDir(BASE);
  console.log("[smart-sync] local files:", local.length);

  const toUpload = [];
  const localPaths = new Set();
  let unchanged = 0;
  for (const f of local) {
    localPaths.add(f.rel);
    const sha = gitBlobSha(f.full);
    if (remoteMap.get(f.rel) === sha) {
      unchanged++;
    } else {
      toUpload.push({ ...f, sha });
    }
  }
  const toDelete = [];
  for (const remotePath of remoteMap.keys()) {
    if (!localPaths.has(remotePath)) toDelete.push(remotePath);
  }
  console.log("[smart-sync] unchanged:", unchanged, "to upload:", toUpload.length, "to delete:", toDelete.length);
  const treeEntries = [];

  if (toUpload.length === 0) {
    console.log("[smart-sync] nothing to do, exiting");
    return;
  }

  let uploaded = 0, failed = 0;
  for (const f of toUpload) {
    const content = fs.readFileSync(f.full).toString("base64");
    let sha = null;
    for (let r = 0; r < 4; r++) {
      const res = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", { content, encoding: "base64" });
      if (res.data?.sha) { sha = res.data.sha; break; }
      if (res.data?.message?.includes("rate limit")) await new Promise(s => setTimeout(s, 5000 * (r + 1)));
      else await new Promise(s => setTimeout(s, 1500));
    }
    if (sha) {
      treeEntries.push({ path: f.rel, mode: "100644", type: "blob", sha });
      uploaded++;
      if (uploaded % 10 === 0) console.log(`[smart-sync] uploaded ${uploaded}/${toUpload.length}`);
    } else {
      failed++;
      console.log(`[smart-sync]   FAIL: ${f.rel} (${f.size}b)`);
    }
  }
  console.log(`[smart-sync] uploaded ${uploaded}, failed ${failed}, total tree entries ${treeEntries.length}`);

  console.log("[smart-sync] creating tree (single shot, no base_tree)...");
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, "POST", { tree: treeEntries });
  if (!tree.data.sha) {
    console.error("[smart-sync] TREE FAILED:", tree.status, JSON.stringify(tree.data).substring(0, 600));
    process.exit(1);
  }
  console.log("[smart-sync] tree:", tree.data.sha.substring(0, 8));

  const now = new Date().toISOString().replace("T", " ").substring(0, 16);
  const newCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, "POST", {
    message: `مزامنة ذكية — ${now} (+${uploaded} ملف)`,
    tree: tree.data.sha,
    parents: [baseCommit],
  });
  if (!newCommit.data.sha) {
    console.error("[smart-sync] COMMIT FAILED:", JSON.stringify(newCommit.data).substring(0, 600));
    process.exit(1);
  }
  console.log("[smart-sync] commit:", newCommit.data.sha.substring(0, 8));

  const refUpd = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, "PATCH", {
    sha: newCommit.data.sha, force: false,
  });
  if (refUpd.status >= 400) {
    console.error("[smart-sync] REF UPDATE FAILED:", JSON.stringify(refUpd.data).substring(0, 600));
    process.exit(1);
  }
  console.log(`[smart-sync] DONE — ${newCommit.data.sha.substring(0, 8)} on main, ${uploaded} files in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch(e => { console.error("[smart-sync] FATAL:", e.message); console.error(e.stack); process.exit(1); });
