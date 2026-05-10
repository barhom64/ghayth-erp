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
  ".pnpm-store", ".replit-vite-cache", "tmp",
]);
const SKIP_EXT = new Set([".zip", ".tar", ".tgz", ".gz", ".log"]);

function walkDir(dir) {
  let results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) results = results.concat(walkDir(full));
    else if (e.isFile()) {
      try {
        if (SKIP_EXT.has(path.extname(e.name).toLowerCase())) continue;
        const st = fs.statSync(full);
        if (st.size > 1024 * 1024 || st.size === 0) continue;
        results.push({ rel: path.relative(BASE, full), full, size: st.size });
      } catch {}
    }
  }
  return results;
}

function gitBlobSha(p) {
  const c = fs.readFileSync(p);
  const h = `blob ${c.length}\0`;
  return crypto.createHash("sha1").update(h).update(c).digest("hex");
}

const c = new ReplitConnectors();
async function gh(ep, method = "GET", body = null, timeoutMs = 30000) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  opts.signal = ctrl.signal;
  try {
    const res = await c.proxy("github", ep, opts);
    const text = await res.text();
    clearTimeout(t);
    let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    return { status: res.status, data };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, data: { _err: e.message } };
  }
}

async function ghRetry(ep, method, body, label) {
  for (let r = 0; r < 5; r++) {
    const res = await gh(ep, method, body);
    if (res.status >= 200 && res.status < 300) return res;
    const msg = res.data?.message || res.data?._err || "";
    process.stdout.write(`  retry ${r+1}/5 ${label}: ${res.status} ${msg.substring(0, 80)}\n`);
    await new Promise(s => setTimeout(s, 3000 * (r + 1)));
  }
  return null;
}

async function main() {
  const t0 = Date.now();
  const STATE = "/tmp/_push_state.json";
  console.log("[push] start");

  // 1. Get base ref
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  const baseCommit = ref.data.object?.sha;
  if (!baseCommit) { console.error("no ref:", ref); process.exit(1); }
  console.log("[push] base commit:", baseCommit.substring(0, 8));

  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${baseCommit}`);
  const baseTree = commit.data.tree?.sha;
  console.log("[push] base tree:", baseTree?.substring(0, 8));

  // 2. Fetch remote tree (recursive) with longer timeout
  console.log("[push] fetching remote tree (60s timeout)...");
  const remote = await gh(`/repos/${OWNER}/${REPO}/git/trees/${baseTree}?recursive=1`, "GET", null, 60000);
  if (!remote.data.tree) { console.error("[push] tree fetch FAIL:", JSON.stringify(remote).substring(0, 300)); process.exit(1); }
  const remoteMap = new Map();
  for (const t of remote.data.tree) if (t.type === "blob") remoteMap.set(t.path, t.sha);
  console.log("[push] remote blobs:", remoteMap.size);

  // 3. Walk local
  const local = walkDir(BASE);
  console.log("[push] local files:", local.length);

  // 4. Diff
  const toUpload = [];
  const localPaths = new Set();
  let unchanged = 0;
  for (const f of local) {
    localPaths.add(f.rel);
    const sha = gitBlobSha(f.full);
    if (remoteMap.get(f.rel) === sha) unchanged++;
    else toUpload.push({ ...f, sha });
  }
  const toDelete = [];
  for (const p of remoteMap.keys()) if (!localPaths.has(p)) toDelete.push(p);
  console.log("[push] unchanged:", unchanged, "to upload:", toUpload.length, "to delete:", toDelete.length);

  // 5. Resume from saved state
  let savedState = {};
  try { savedState = JSON.parse(fs.readFileSync(STATE, "utf-8")); } catch {}
  const treeEntries = savedState.treeEntries || [];
  const completedSet = new Set(treeEntries.map(t => t.path));
  console.log("[push] resuming with", treeEntries.length, "already-uploaded blobs");

  // 6. Upload blobs
  let uploaded = 0, failed = 0;
  for (const f of toUpload) {
    if (completedSet.has(f.rel)) continue;
    const content = fs.readFileSync(f.full).toString("base64");
    const res = await ghRetry(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", { content, encoding: "base64" }, `blob ${f.rel}`);
    if (res?.data?.sha) {
      treeEntries.push({ path: f.rel, mode: "100644", type: "blob", sha: res.data.sha });
      uploaded++;
      if (uploaded % 5 === 0) {
        fs.writeFileSync(STATE, JSON.stringify({ treeEntries }));
        console.log(`[push] uploaded ${uploaded}/${toUpload.length - completedSet.size}`);
      }
    } else {
      failed++;
      console.log(`[push] FAIL ${f.rel}`);
    }
  }
  fs.writeFileSync(STATE, JSON.stringify({ treeEntries }));
  console.log(`[push] uploads done: +${uploaded} blobs, ${failed} failed`);

  // 7. Add deletes (sha:null)
  for (const p of toDelete) {
    treeEntries.push({ path: p, mode: "100644", type: "blob", sha: null });
  }
  console.log("[push] tree entries (incl deletes):", treeEntries.length);

  // 8. Create tree (incremental from base_tree)
  console.log("[push] creating tree...");
  const tree = await ghRetry(`/repos/${OWNER}/${REPO}/git/trees`, "POST", { base_tree: baseTree, tree: treeEntries }, "tree");
  if (!tree?.data?.sha) { console.error("[push] tree FAIL"); process.exit(1); }
  console.log("[push] new tree:", tree.data.sha.substring(0, 8));

  // 9. Commit
  const now = new Date().toISOString().replace("T", " ").substring(0, 16);
  const msg = `مزامنة شاملة — ${now} (+${uploaded} ملف، -${toDelete.length} ملف محذوف)\n\nبعد سحب باتش 2 (PRs #100-#102) وإصلاح:\n- ترحيلات 105/106/107/108\n- routes/correspondence.ts (users.name → COALESCE(employees.name, users.email))\n- routes/finance-custodies.ts (نفس الإصلاح)\n- lib/obligationsEngine.ts (pool.query للـ DDL)\n- migrations/106 (payroll_lines runId/payrollRunId fallback)`;
  const newCommit = await ghRetry(`/repos/${OWNER}/${REPO}/git/commits`, "POST", {
    message: msg, tree: tree.data.sha, parents: [baseCommit],
  }, "commit");
  if (!newCommit?.data?.sha) { console.error("[push] commit FAIL"); process.exit(1); }
  console.log("[push] new commit:", newCommit.data.sha.substring(0, 8));

  // 10. Update ref
  const refUpd = await ghRetry(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, "PATCH", {
    sha: newCommit.data.sha, force: false,
  }, "ref-update");
  if (!refUpd) { console.error("[push] ref FAIL"); process.exit(1); }

  // Cleanup state file
  try { fs.unlinkSync(STATE); } catch {}
  console.log(`[push] DONE: commit ${newCommit.data.sha.substring(0, 8)} on main, +${uploaded} -${toDelete.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

main().catch(e => { console.error("[push] FATAL:", e.message); console.error(e.stack); process.exit(1); });
