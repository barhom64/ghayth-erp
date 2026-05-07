import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const OWNER = "barhom64";
const REPO = "ghayth-erp";
const BASE = "/home/runner/workspace";
const STATE = "/tmp/_push2_state.json";

const c = new ReplitConnectors();
async function gh(ep, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  for (let r = 0; r < 5; r++) {
    try {
      const res = await c.proxy("github", ep, opts);
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
      if (res.status >= 200 && res.status < 300) return { status: res.status, data };
      if (res.status === 404 && method === "GET") return { status: 404, data };
      const m = data?.message || "";
      console.log(`  retry ${r+1}/5 ${method} ${ep.substring(0, 80)}: ${res.status} ${m.substring(0, 80)}`);
      // 422 = sha mismatch (concurrent edit) — refetch SHA
      if (res.status === 422) return { status: 422, data };
      await new Promise(s => setTimeout(s, 1500 * (r + 1)));
    } catch (e) {
      console.log(`  retry ${r+1}/5 err: ${e.message}`);
      await new Promise(s => setTimeout(s, 1500 * (r + 1)));
    }
  }
  return null;
}

const state = JSON.parse(fs.readFileSync(STATE, "utf-8"));
const remaining = state.remaining || state.toUpload;
console.log(`[push2] start: ${remaining.length} files remaining`);

let done = 0, failed = 0;
const failures = state.failures || [];
const startIdx = state.startIdx || 0;

async function uploadOne(rel, msgPrefix) {
  const full = path.join(BASE, rel);
  if (!fs.existsSync(full)) return { skipped: true };
  const content = fs.readFileSync(full).toString("base64");
  // get current sha (if file exists on remote)
  const ge = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel).replace(/%2F/g, "/")}?ref=main`, "GET");
  const sha = ge?.status === 200 ? ge.data.sha : undefined;
  const body = { message: `${msgPrefix}: ${rel}`, content, branch: "main" };
  if (sha) body.sha = sha;
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel).replace(/%2F/g, "/")}`, "PUT", body);
  return r;
}

for (let i = startIdx; i < remaining.length; i++) {
  const rel = remaining[i];
  const r = await uploadOne(rel, "sync");
  if (r?.status >= 200 && r?.status < 300) {
    done++;
  } else if (r?.skipped) {
    // file no longer exists locally
    done++;
  } else {
    failed++;
    failures.push(rel);
  }
  // Persist progress every 5 files
  if ((done + failed) % 5 === 0) {
    fs.writeFileSync(STATE, JSON.stringify({ remaining, startIdx: i + 1, failures }));
    console.log(`[push2] ${done + failed}/${remaining.length} (ok=${done} fail=${failed})`);
  }
  // Brief delay to avoid secondary rate limit
  await new Promise(s => setTimeout(s, 250));
}
fs.writeFileSync(STATE, JSON.stringify({ remaining, startIdx: remaining.length, failures, done: true }));
console.log(`[push2] DONE: ${done} ok, ${failed} failed`);
if (failures.length) console.log("[push2] failures:", failures.slice(0, 10).join("\n  "));
